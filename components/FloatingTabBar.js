// Custom tabBar for the (tabs) Stack (ticket 064): a floating dark pill
// instead of the platform default bar, with a round camera button in the
// middle. Follows React Navigation's documented custom-tab-bar pattern
// (emit tabPress/tabLongPress, navigate unless prevented) for every route
// except "camera-tab", which never navigates in place -- it always pushes
// the full-screen /capture route, same as the tabPress listener it replaces.
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { colors, spacing, typography, radius, shadow } from '../lib/theme';

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = options.title || route.name;

          if (route.name === 'camera-tab') {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={() => router.push('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Prendre une photo"
                style={styles.cameraButton}>
                <Icon name="camera-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            );
          }

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          // Matches React Navigation's own default accessibilityLabel format
          // ("<title>, tab, N of M") so the iOS Maestro flows' "Accueil,
          // tab.*"-style selectors keep matching this custom bar unchanged.
          const accessibilityLabel = `${label}, tab, ${index + 1} of ${state.routes.length}`;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={accessibilityLabel}
              style={focused ? styles.activeItem : styles.inactiveItem}>
              <Icon
                name={options.tabBarIconName}
                size={focused ? 20 : 22}
                color={focused ? colors.text : colors.onInkMuted}
              />
              {focused && <Text style={styles.activeLabel}>{label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    ...shadow.card,
  },
  activeItem: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.highlight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: spacing.xs,
  },
  activeLabel: { ...typography.label, color: colors.text },
  inactiveItem: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
