import { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb, migratePhotosToAppStorage } from '../lib/db';
import { showMessage } from '../lib/dialogs';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fonts);

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

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </GestureHandlerRootView>
  );
}
