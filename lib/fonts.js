// The font modules loaded by app/_layout.js with useFonts(fonts), and
// referenced by name in lib/theme.js's typography. Kept out of theme.js so
// Jest (which never touches native font loading) can still import theme.js.
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';

export const fonts = {
  Fraunces_400Regular,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
};
