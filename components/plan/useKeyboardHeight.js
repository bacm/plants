// The height the soft keyboard covers at the bottom of the screen, for the plan's
// sheets and bubble (ticket 111). They are pinned to the bottom of an absolute
// layer, where KeyboardAvoidingView cannot tell how far the keyboard overlaps
// (it reads a frame relative to its parent), so they lift themselves.
// iOS only: Android resizes the window, and the web has no soft keyboard.
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      change.remove();
      hide.remove();
    };
  }, []);
  return height;
}
