import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, PrimaryButton } from '../components/form';
import Icon from '../components/Icon';
import { colors, typography, radius } from '../lib/theme';
import { showMessage, confirm } from '../lib/dialogs';
import {
  exportGardenToFile,
  isGardenEmpty,
  previewBackupFile,
  importGardenFromFile,
  getApiToken,
  setApiToken,
} from '../lib/db';

function todayFileName() {
  const iso = new Date().toISOString().slice(0, 10);
  return `jardin-${iso}.json`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count > 1 ? plural : singular}`;
}

async function shareOnNative(uri) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Le partage de fichiers n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/json' });
}

function downloadOnWeb(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// What lib/db reads the backup from: the picked File on web, the file uri
// on native. It is read in chunks there, never as one string.
async function pickedSource(asset) {
  if (Platform.OS !== 'web') return asset.uri;
  if (asset.file) return asset.file;
  const response = await fetch(asset.uri);
  return response.blob();
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [importing, setImporting] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getApiToken().then((token) => setHasToken(!!token));
    }, [])
  );

  const handleSaveToken = async () => {
    setSavingToken(true);
    try {
      await setApiToken(tokenInput);
      setTokenInput('');
      const token = await getApiToken();
      setHasToken(!!token);
      showMessage('Jeton enregistré', 'La recherche de plantes est activée.');
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer le jeton : ${e.message}`);
    } finally {
      setSavingToken(false);
    }
  };

  const handleDeleteToken = async () => {
    const proceed = await confirm({
      title: 'Supprimer le jeton ?',
      message:
        'La recherche de plantes ne fonctionnera plus tant qu’un nouveau jeton n’est pas ajouté.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!proceed) return;
    try {
      await setApiToken('');
      setHasToken(false);
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer le jeton : ${e.message}`);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const fileName = todayFileName();
      const { uri, blob } = await exportGardenToFile({
        fileName,
        onProgress: (done, total) => setExportProgress(`${done} / ${total} photos`),
      });
      if (Platform.OS === 'web') {
        downloadOnWeb(blob, fileName);
      } else {
        await shareOnNative(uri);
      }
    } catch (e) {
      showMessage('Erreur', `Impossible d'exporter le jardin : ${e.message}`);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const handleImport = async () => {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
    } catch (e) {
      showMessage('Erreur', `Impossible d'ouvrir le sélecteur de fichier : ${e.message}`);
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;

    setImporting(true);
    try {
      const source = await pickedSource(result.assets[0]);
      const parsed = await previewBackupFile(source);
      if (!parsed.ok) {
        showMessage('Sauvegarde invalide', parsed.error);
        return;
      }
      const { backup } = parsed;

      const empty = await isGardenEmpty();
      if (!empty) {
        const proceed = await confirm({
          title: 'Remplacer le jardin actuel ?',
          message: `Remplacer votre jardin actuel par cette sauvegarde (${pluralize(backup.counts.plants, 'plante')}, ${pluralize(backup.counts.photos, 'photo')}) ? Cette action est définitive.`,
          confirmLabel: 'Remplacer',
          destructive: true,
        });
        if (!proceed) return;
      }

      const { imported, skippedPhotos } = await importGardenFromFile(source, backup);
      const lines = [
        `${pluralize(imported.zones, 'zone')}, ${pluralize(imported.plants, 'plante')}, ${pluralize(imported.reminders, 'rappel')}, ${pluralize(imported.care_logs, 'soin')} et ${pluralize(imported.photos, 'photo')} restaurés.`,
      ];
      if (skippedPhotos > 0) {
        lines.push(
          `${pluralize(skippedPhotos, 'photo n’a pas pu être restaurée', 'photos n’ont pas pu être restaurées')}.`
        );
      }
      if (backup.warnings?.danglingZoneRefs > 0) {
        lines.push(
          `${pluralize(backup.warnings.danglingZoneRefs, 'plante a perdu sa zone (zone absente de la sauvegarde)', 'plantes ont perdu leur zone (zone absente de la sauvegarde)')}.`
        );
      }
      showMessage('Jardin restauré', lines.join(' '));
    } catch (e) {
      showMessage('Erreur', `Impossible d'importer la sauvegarde : ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <ScreenHeader title="Réglages" large />

      <View style={styles.section}>
        <Text style={styles.eyebrow}>Recherche de plantes</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconSquare, { backgroundColor: colors.sun }]}>
              <Icon name="key-outline" size={20} color={colors.text} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Jeton d’accès</Text>
              <Text style={styles.cardHint}>
                Fourni par votre serveur de recherche. Il reste sur cet appareil.
              </Text>
              <Text style={styles.tokenStatus}>
                {hasToken ? 'Jeton enregistré' : 'Aucun jeton'}
              </Text>
            </View>
          </View>
          <Field
            value={tokenInput}
            onChangeText={setTokenInput}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Collez le jeton ici"
            accessibilityLabel="Jeton d’accès"
          />
          <PrimaryButton
            label="Enregistrer le jeton"
            loadingLabel="Enregistrement…"
            loading={savingToken}
            disabled={!tokenInput.trim()}
            onPress={handleSaveToken}
          />
          {hasToken ? (
            <TouchableOpacity
              style={styles.deleteTokenBtn}
              onPress={handleDeleteToken}
              accessibilityRole="button">
              <Text style={styles.deleteTokenBtnText}>Supprimer le jeton</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.eyebrow}>Sauvegarde de votre jardin</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconSquare, { backgroundColor: colors.softGreen }]}>
              <Icon name="tray-arrow-up" size={20} color={colors.text} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Exporter</Text>
              <Text style={styles.cardHint}>
                Zones, plantes, rappels, historique de soins et photos, dans un seul fichier.
              </Text>
            </View>
          </View>
          <PrimaryButton
            label="Exporter mon jardin"
            loadingLabel={exportProgress ? `Export… ${exportProgress}` : 'Export en cours…'}
            loading={exporting}
            disabled={importing}
            onPress={handleExport}
          />
          <Text style={styles.limitsHint}>
            Tout tient dans un seul fichier : une grande photothèque produit un fichier volumineux.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconSquare, { backgroundColor: colors.water }]}>
              <Icon name="tray-arrow-down" size={20} color={colors.text} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Importer</Text>
              <Text style={styles.cardHint}>
                Remplace entièrement le jardin actuel par le contenu du fichier choisi.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.outlineBtn, (exporting || importing) && styles.outlineBtnDisabled]}
            onPress={handleImport}
            disabled={exporting || importing}
            accessibilityRole="button"
            accessibilityLabel={importing ? 'Import en cours…' : 'Importer une sauvegarde'}
            accessibilityState={{ disabled: exporting || importing, busy: importing }}>
            <Text style={styles.outlineBtnText}>
              {importing ? 'Import en cours…' : 'Importer une sauvegarde'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <Text style={styles.footerBrand}>Plants</Text>
        <Text style={styles.footerVersion}>Version {Constants.expoConfig?.version}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 24,
  },
  section: { gap: 12 },
  eyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: radius.xl,
    padding: 20,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  iconSquare: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1, flexBasis: 'auto', minWidth: 0, gap: 4 },
  cardTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 17, color: colors.text },
  cardHint: { ...typography.bodySmall, color: colors.textSecondary },
  limitsHint: {
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  outlineBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnDisabled: { opacity: 0.5 },
  outlineBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },

  tokenStatus: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, color: colors.accent },
  deleteTokenBtn: { alignItems: 'center', paddingVertical: 8 },
  deleteTokenBtnText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.danger,
  },

  spacer: { flex: 1 },
  footer: { alignItems: 'center', gap: 2 },
  footerBrand: { fontFamily: 'Fraunces_400Regular_Italic', fontSize: 18, color: colors.text },
  footerVersion: { fontSize: 13, color: colors.textSecondary },
});
