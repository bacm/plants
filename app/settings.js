import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton } from '../components/form';
import Icon from '../components/Icon';
import { colors, typography, radius } from '../lib/theme';
import { showMessage, confirm } from '../lib/dialogs';
import { exportGarden, isGardenEmpty, importGarden } from '../lib/db';
import { buildBackup, parseBackup } from '../lib/backupFormat';

function todayFileName() {
  const iso = new Date().toISOString().slice(0, 10);
  return `jardin-${iso}.json`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count > 1 ? plural : singular}`;
}

async function exportOnNative(json, fileName) {
  const file = new File(Paths.cache, fileName);
  file.write(json);
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Le partage de fichiers n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
}

function exportOnWeb(json, fileName) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function readPickedFileText(asset) {
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    return response.text();
  }
  return new File(asset.uri).text();
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { tables, photoData, unsortedPhotoData } = await exportGarden();
      const backup = buildBackup({ tables, photoData, unsortedPhotoData });
      const json = JSON.stringify(backup, null, 2);
      const fileName = todayFileName();
      if (Platform.OS === 'web') {
        exportOnWeb(json, fileName);
      } else {
        await exportOnNative(json, fileName);
      }
    } catch (e) {
      showMessage('Erreur', `Impossible d'exporter le jardin : ${e.message}`);
    } finally {
      setExporting(false);
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
      const text = await readPickedFileText(result.assets[0]);
      const parsed = parseBackup(text);
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

      const { imported, skippedPhotos } = await importGarden(backup);
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
            loadingLabel="Export en cours…"
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

  spacer: { flex: 1 },
  footer: { alignItems: 'center', gap: 2 },
  footerBrand: { fontFamily: 'Fraunces_400Regular_Italic', fontSize: 18, color: colors.text },
  footerVersion: { fontSize: 13, color: colors.textSecondary },
});
