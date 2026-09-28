import { Tabs } from 'expo-router';
import FloatingTabBar from '../../components/FloatingTabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIconName: 'home-outline' }} />
      <Tabs.Screen name="zones" options={{ title: 'Zones', tabBarIconName: 'map-outline' }} />
      {/* FloatingTabBar renders this one as the central camera button and
          pushes /capture directly, never navigating to the route itself. */}
      <Tabs.Screen name="camera-tab" options={{ title: '' }} />
      <Tabs.Screen
        name="bloom"
        options={{ title: 'Floraison', tabBarIconName: 'flower-outline' }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Bibliothèque', tabBarIconName: 'book-open-variant' }}
      />
    </Tabs>
  );
}
