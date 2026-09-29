// A bar pinned under a form's scroll view, holding the save button. Sits on
// `colors.background` with a top hairline so it reads as a distinct footer
// rather than another card, and pads for the device's bottom safe area.
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

export function StickyFooter({ children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
});
