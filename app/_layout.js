import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb } from '../lib/db';

export default function RootLayout() {
  useEffect(() => {
    initDb();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1C1917' },
          animation: 'slide_from_right',
        }}
      />
    </GestureHandlerRootView>
  );
}
