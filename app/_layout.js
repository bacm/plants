import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb, migratePhotosToAppStorage } from '../lib/db';
import { AccountProvider, useAccount } from '../components/AccountProvider';
import { showMessage } from '../lib/dialogs';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';

SplashScreen.preventAutoHideAsync();

// Ticket 101: on the web the whole app needs a session, so until the account
// is known (and while signed out) a full-screen cover hides the routes and a
// signed-out visitor is sent to the login screen. The phone is never gated:
// it works offline without an account. The Stack stays mounted underneath so
// the redirect has a navigator to act on.
function WebGate({ children }) {
  const { status } = useAccount();
  const segments = useSegments();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const gated = Platform.OS === 'web';
  const onAccountRoute = segments[0] === 'account';
  const blocked = gated && (status === 'loading' || (status === 'signedOut' && !onAccountRoute));

  useEffect(() => {
    if (gated && navReady && status === 'signedOut' && !onAccountRoute) {
      router.replace('/account/login');
    }
  }, [gated, navReady, status, onAccountRoute, router]);

  return (
    <View style={styles.fill}>
      {children}
      {blocked ? (
        <View style={styles.cover} accessibilityLabel="Chargement">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
      <AccountProvider>
        <WebGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          />
        </WebGate>
      </AccountProvider>
    </GestureHandlerRootView>
  );
}
