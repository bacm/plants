import { Tabs, useRouter } from 'expo-router';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, typography, radius, shadow } from '../../lib/theme';

function TabIcon({ name, focused }) {
  const icons = {
    home: '🌸',
    zones: '🗺️',
    bloom: '📅',
    library: '📚',
  };
  return <Text style={[styles.icon, focused && styles.iconFocused]}>{icons[name] || '•'}</Text>;
}

// Central round button (ticket 056): opens the full-screen in-app camera
// from any tab in one tap. It renders in place of the "capture" tab's normal
// button; the actual navigation to /capture happens in the tabPress listener
// below, not here, so this stays a plain styled touchable.
function CaptureTabButton(props) {
  // React Navigation's BottomTabItem passes its own computed 'aria-label'
  // (the default "<title>, tab, N of M" format, empty here since this tab's
  // title is '') alongside whatever we set — and 'aria-label' wins over
  // accessibilityLabel on iOS, so both need overriding, not just the latter.
  return (
    <TouchableOpacity
      {...props}
      aria-label="Prendre une photo"
      accessibilityLabel="Prendre une photo"
      accessibilityRole="button"
      style={styles.captureButtonWrapper}>
      <Text style={styles.captureButtonIcon}>📷</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.dark.accent,
        tabBarInactiveTintColor: colors.dark.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="zones"
        options={{
          title: 'Zones',
          tabBarIcon: ({ focused }) => <TabIcon name="zones" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="camera-tab"
        options={{
          title: '',
          tabBarLabelStyle: { display: 'none' },
          tabBarButton: (props) => <CaptureTabButton {...props} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/capture');
          },
        }}
      />
      <Tabs.Screen
        name="bloom"
        options={{
          title: 'Floraison',
          tabBarIcon: ({ focused }) => <TabIcon name="bloom" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Bibliothèque',
          tabBarIcon: ({ focused }) => <TabIcon name="library" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.dark.surface,
    borderTopColor: colors.dark.border,
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 88 : 64,
  },
  tabLabel: { ...typography.caption },
  tabItem: { paddingVertical: 4 },
  icon: { fontSize: 22, opacity: 0.7 },
  iconFocused: { opacity: 1 },
  captureButtonWrapper: {
    top: -20,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.dark.accent,
    borderWidth: 3,
    borderColor: colors.dark.surface,
    ...shadow.card,
  },
  captureButtonIcon: { fontSize: 24 },
});
