import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, typography } from '../../lib/theme';

function TabIcon({ name, focused }) {
  const icons = {
    home: '🌸',
    zones: '🗺️',
    bloom: '📅',
    library: '📚',
  };
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[name] || '•'}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.dark.accent,
        tabBarInactiveTintColor: colors.dark.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
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
});
