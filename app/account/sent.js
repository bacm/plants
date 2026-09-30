// Demande envoyée (ticket 101): shown after the server accepted a signup.
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/form';
import Icon from '../../components/Icon';
import { colors, typography } from '../../lib/theme';

export default function SentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const isWeb = Platform.OS === 'web';

  // On the gated web there are no réglages to return to before logging in.
  const finish = () => {
    if (isWeb) router.replace('/account/login');
    else if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: isWeb ? 56 : insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 12) + 16,
        },
      ]}>
      <ScreenHeader backFallback={isWeb ? '/account/login' : '/settings'} />
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="check" size={32} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Demande envoyée
        </Text>
        <Text style={styles.body}>
          Vous pourrez vous connecter{email ? ' avec ' : ''}
          {email ? <Text style={styles.email}>{email}</Text> : null} dès que votre compte sera
          approuvé.
        </Text>
      </View>
      <PrimaryButton
        label={isWeb ? 'Retour à la connexion' : 'Retour aux réglages'}
        onPress={finish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 12,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Fraunces_400Regular', fontSize: 32, color: colors.text },
  body: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  email: { fontFamily: 'InstrumentSans_600SemiBold', color: colors.text },
});
