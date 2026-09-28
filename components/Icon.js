// The single icon family for the app (ticket 052): every screen renders an
// icon through this wrapper instead of importing @expo/vector-icons
// directly, so no second icon family can creep back into app/, components/
// or lib/ unnoticed.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

export default function Icon({ name, size = 20, color = colors.text, style, accessibilityLabel }) {
  // No accessibilityLabel means the icon is purely decorative (its meaning
  // is already carried by an adjacent label, or by the control's own
  // accessibilityLabel) -- hide it from screen readers rather than reading
  // out a raw glyph name.
  const accessibilityProps = accessibilityLabel
    ? { accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no' };

  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      style={style}
      {...accessibilityProps}
    />
  );
}
