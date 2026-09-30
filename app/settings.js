import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton } from '../components/form';
import { useAccount } from '../components/AccountProvider';
import { useSync } from '../components/SyncProvider';
import { AdminEntry } from '../components/AdminEntry';
import { relativeTimeFr } from '../lib/relativeTime';
import { firstSyncView } from '../lib/firstSync';
import Icon from '../components/Icon';
import { colors, typography, radius } from '../lib/theme';
import { showMessage, confirm } from '../lib/dialogs';
import { unsyncedLogoutMessage } from '../lib/logoutGuard';
import {
  exportGardenToFile,
  isGardenEmpty,
  previewBackupFile,
  importGardenFromFile,
} from '../lib/db';

function todayFileName() {
  const iso = new Date().toISOString().slice(0, 10);
  return `jardin-${iso}.json`;
}

const IMPORT_BLOCKED_MESSAGE =
  'Déconnectez-vous pour importer une sauvegarde : l’import remplacerait votre jardin sans le synchroniser.';
const IMPORT_WEB_MESSAGE =
  'Sur le web, votre jardin vient du serveur : importez une sauvegarde depuis le téléphone, déconnecté.';

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
  const router = useRouter();
  const { status, account, logout } = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  const sync = useSync();
  const onPhone = Platform.OS !== 'web';
  // Ticket 094: an import would replace the garden without syncing it.
  // Ticket 095: on the web the garden comes from the server; an import would
  // only touch the cache and never delete server rows.
  const importBlocked = !onPhone || status === 'signedIn';
  const importBlockedMessage = onPhone ? IMPORT_BLOCKED_MESSAGE : IMPORT_WEB_MESSAGE;

  const syncLine = sync.running
    ? 'Synchronisation…'
    : sync.error
      ? sync.error
      : sync.lastSyncAt
        ? `Synchronisé ${relativeTimeFr(sync.lastSyncAt)}`
        : 'Jamais synchronisé';

  const first = sync.first;
  const showFirstSync = onPhone && first.loaded && !first.completedAt;
  const firstView = firstSyncView(first);

  const handleLogout = async () => {
    const proceed = await confirm({
      title: 'Se déconnecter ?',
      message: onPhone
        ? 'Votre jardin reste sur cet appareil.'
        : 'Votre jardin reste sur le serveur.',
      confirmLabel: 'Se déconnecter',
      destructive: true,
    });
    if (!proceed) return;
    setSigningOut(true);
    try {
      // Ticket 095: sync first; ask only if something would be left unsent.
      if (await sync.unsyncedBeforeLogout()) {
        const leave = await confirm({
          title: 'Modifications non envoyées',
          message: unsyncedLogoutMessage(Platform.OS),
          confirmLabel: 'Se déconnecter quand même',
          destructive: true,
        });
        if (!leave) return;
      }
      await logout();
    } catch (e) {
      showMessage('Erreur', `Impossible de se déconnecter : ${e.message}`);
    } finally {
      setSigningOut(false);
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
    if (importBlocked) {
      showMessage('Import impossible', importBlockedMessage);
      return;
    }
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

      {status === 'signedOut' ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Compte</Text>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconSquare, { backgroundColor: colors.softGreen }]}>
                <Icon name="account-outline" size={20} color={colors.text} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Pas connecté</Text>
                <Text style={styles.cardHint}>
                  Votre jardin reste sur ce téléphone. Connectez-vous pour le retrouver sur le web.
                </Text>
              </View>
            </View>
            <PrimaryButton label="Se connecter" onPress={() => router.push('/account/login')} />
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => router.push('/account/signup')}
              accessibilityRole="button">
              <Text style={styles.outlineBtnText}>Créer un compte</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {status === 'signedIn' ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Compte</Text>

          <View style={styles.card}>
            <View style={[styles.cardHeader, styles.cardHeaderCentered]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(account?.email?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {account?.email || 'Compte connecté'}
                </Text>
                <Text style={styles.cardHint}>
                  {Platform.OS === 'web' ? 'Connecté sur ce navigateur' : 'Connecté sur cet iPhone'}
                </Text>
              </View>
            </View>
            <AdminEntry />
            {showFirstSync ? (
              <View style={styles.firstSync}>
                <Text style={styles.cardTitle}>{firstView.title}</Text>
                <Text style={styles.cardHint} accessibilityLiveRegion="polite">
                  {firstView.text}
                </Text>
                {firstView.lines.map((line, index) => (
                  <Text
                    key={line}
                    style={[styles.cardHint, index === 0 && styles.syncLineError]}
                    accessibilityLiveRegion="polite">
                    {line}
                  </Text>
                ))}
                {firstView.showActions ? (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.outlineBtn,
                        (exporting || importing) && styles.outlineBtnDisabled,
                      ]}
                      onPress={handleExport}
                      disabled={exporting || importing}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: exporting || importing, busy: exporting }}>
                      <Text style={styles.outlineBtnText}>
                        {exporting
                          ? exportProgress
                            ? `Export… ${exportProgress}`
                            : 'Export en cours…'
                          : 'Exporter d’abord une sauvegarde'}
                      </Text>
                    </TouchableOpacity>
                    <PrimaryButton
                      label={firstView.primaryLabel}
                      disabled={exporting}
                      onPress={() => sync.startFirstSync()}
                    />
                    {firstView.hint ? (
                      <Text style={styles.limitsHint}>{firstView.hint}</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
            {onPhone && first.loaded && first.completedAt ? (
              <>
                {first.result?.status === 'done' ? (
                  <Text style={styles.syncLine} accessibilityLiveRegion="polite">
                    {first.result.message}
                  </Text>
                ) : null}
                <Text
                  style={[styles.syncLine, sync.error && !sync.running && styles.syncLineError]}
                  accessibilityLiveRegion="polite">
                  {syncLine}
                </Text>
                <TouchableOpacity
                  style={[styles.outlineBtn, sync.running && styles.outlineBtnDisabled]}
                  onPress={() => sync.syncNow()}
                  disabled={sync.running}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: sync.running, busy: sync.running }}>
                  <Text style={styles.outlineBtnText}>Synchroniser maintenant</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.outlineBtn, signingOut && styles.outlineBtnDisabled]}
              onPress={handleLogout}
              disabled={signingOut}
              accessibilityRole="button">
              <Text style={[styles.outlineBtnText, styles.logoutText]}>
                {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.limitsHint}>
              {Platform.OS === 'web'
                ? 'Se déconnecter ne supprime rien de votre jardin.'
                : 'Se déconnecter ne supprime rien de ce téléphone.'}
            </Text>
          </View>
        </View>
      ) : null}

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
              {importBlocked ? <Text style={styles.cardHint}>{importBlockedMessage}</Text> : null}
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.outlineBtn,
              (exporting || importing || importBlocked) && styles.outlineBtnDisabled,
            ]}
            onPress={handleImport}
            disabled={exporting || importing || importBlocked}
            accessibilityRole="button"
            accessibilityLabel={importing ? 'Import en cours…' : 'Importer une sauvegarde'}
            accessibilityState={{
              disabled: exporting || importing || importBlocked,
              busy: importing,
            }}>
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

  firstSync: { gap: 12 },
  cardHeaderCentered: { alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Fraunces_400Regular', fontSize: 20, color: '#fff' },
  accountEmail: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 17, color: colors.text },
  logoutText: { color: colors.danger },
  syncLine: { ...typography.bodySmall, color: colors.textSecondary },
  syncLineError: { color: colors.danger },

  spacer: { flex: 1 },
  footer: { alignItems: 'center', gap: 2 },
  footerBrand: { fontFamily: 'Fraunces_400Regular_Italic', fontSize: 18, color: colors.text },
  footerVersion: { fontSize: 13, color: colors.textSecondary },
});
