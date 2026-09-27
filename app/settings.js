import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { GradientHero } from '../components/GradientHero';
import { GlassCard } from '../components/GlassCard';
import { colors, spacing, typography, radius } from '../lib/theme';
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
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { tables, photoData } = await exportGarden();
      const backup = buildBackup({ tables, photoData });
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
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Réglages</Text>
        </GradientHero>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sauvegarde de votre jardin</Text>
          <GlassCard>
            <Text style={styles.label}>Exporter</Text>
            <Text style={styles.hint}>
              Zones, plantes, rappels, historique de soins et photos, dans un seul fichier.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, exporting && styles.actionBtnDisabled]}
              onPress={handleExport}
              disabled={exporting || importing}>
              <Text style={styles.actionBtnText}>
                {exporting ? 'Export en cours…' : 'Exporter mon jardin'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.limitsHint}>
              Tout tient dans un seul fichier : une grande photothèque produit un fichier
              volumineux.
            </Text>
          </GlassCard>

          <GlassCard style={styles.card}>
            <Text style={styles.label}>Importer</Text>
            <Text style={styles.hint}>
              Remplace entièrement le jardin actuel par le contenu du fichier choisi.
            </Text>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.actionBtnSecondary,
                importing && styles.actionBtnDisabled,
              ]}
              onPress={handleImport}
              disabled={exporting || importing}>
              <Text style={styles.actionBtnText}>
                {importing ? 'Import en cours…' : 'Importer une sauvegarde'}
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.md },
  card: { marginTop: spacing.md },
  label: { ...typography.label, color: colors.dark.text, marginBottom: 4 },
  hint: { ...typography.bodySmall, color: colors.dark.textSecondary, marginBottom: spacing.md },
  limitsHint: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: colors.dark.accent,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: colors.dark.accentSoft },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { ...typography.label, color: '#fff' },
});
