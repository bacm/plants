/**
 * The one place allowed to import `Alert` from react-native (see ticket 042).
 *
 * react-native-web implements `Alert.alert` as an empty function, so every
 * screen that used it directly was a silent no-op on web. Screens call these
 * three helpers instead; eslint.config.js forbids importing `Alert` anywhere
 * else.
 */
import { Alert, Platform } from 'react-native';

/** An information alert with a single acknowledgement. */
export function showMessage(title, message) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/**
 * A yes/no confirmation. Resolves `true` if the user confirmed, `false`
 * otherwise (cancel, dismiss, or the web `window.confirm` being declined).
 */
export function confirm({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
}) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) }
    );
  });
}

/**
 * A choice among named options. Resolves the chosen `key`, or `null` if the
 * user cancelled. On web there is no native dialog with more than two
 * buttons, so `webKey` is used directly and no dialog is shown at all —
 * callers must supply it.
 */
export function choose({ title, message, options, cancelLabel = 'Annuler', webKey }) {
  if (Platform.OS === 'web') {
    if (webKey === undefined) {
      throw new Error(`choose('${title}'): webKey is required on web (no native option dialog).`);
    }
    return Promise.resolve(webKey);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(null) },
        ...options.map((opt) => ({ text: opt.label, onPress: () => resolve(opt.key) })),
      ],
      { onDismiss: () => resolve(null) }
    );
  });
}
