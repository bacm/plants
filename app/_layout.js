import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb, migratePhotosToAppStorage } from '../lib/db';
import { showMessage } from '../lib/dialogs';
import { colors } from '../lib/theme';

export default function RootLayout() {
  useEffect(() => {
    initDb();
    (async () => {
      try {
        const { missing } = await migratePhotosToAppStorage();
        if (missing > 0) {
          showMessage(
            'Photos introuvables',
            `${missing} photo${missing > 1 ? 's' : ''} n'ont pas pu être retrouvées et resteront affichées comme manquantes.`
          );
        }
      } catch {
        // Best-effort migration; do not block app startup on it.
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.dark.background },
          animation: 'slide_from_right',
        }}
      />
    </GestureHandlerRootView>
  );
}
