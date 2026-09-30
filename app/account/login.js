// Se connecter (ticket 101). On the phone it is pushed from Réglages; on the
// web it is the gate itself (WebConnexion mock-up): brand header, no back
// button, and a successful login lands on the home screen.
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Field, PasswordField, PrimaryButton, StickyFooter } from '../../components/form';
import Icon from '../../components/Icon';
import { useAccount } from '../../components/AccountProvider';
import { colors, typography, radius } from '../../lib/theme';

const PENDING_BODY =
  'Vous pourrez vous connecter dès que l’administrateur aura validé votre demande.';

function Banner({ failure }) {
  const pending = failure.kind === 'pending';
  return (
    <View
      style={[styles.banner, { backgroundColor: pending ? colors.sun : colors.blush }]}
      accessibilityRole="alert">
      <Icon
        name={pending ? 'clock-outline' : 'alert-circle-outline'}
        size={20}
        color={pending ? colors.text : colors.danger}
      />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{failure.error}</Text>
        {pending ? <Text style={styles.bannerBody}>{PENDING_BODY}</Text> : null}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, login } = useAccount();
  const isWeb = Platform.OS === 'web';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  // The web gate: once signed in, leave the login screen.
  useEffect(() => {
    if (isWeb && status === 'signedIn') router.replace('/(tabs)');
  }, [isWeb, status, router]);

  const submit = async () => {
    if (busy) return;
    const address = email.trim();
    if (!address || !password) {
      setFailure({ kind: 'error', error: 'Saisissez votre adresse e-mail et votre mot de passe.' });
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const res = await login({ email: address, password });
      if (!res.ok) {
        setFailure(res);
      } else if (!isWeb) {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: isWeb ? 56 : insets.top + 12 }]}>
        {isWeb ? (
          <View style={styles.brandRow}>
            <View style={styles.brandTile}>
              <Icon name="leaf" size={22} color="#fff" />
            </View>
            <Text style={styles.brandTitle} accessibilityRole="header">
              Plants
            </Text>
          </View>
        ) : (
          <ScreenHeader title="Se connecter" backFallback="/settings" />
        )}
        {isWeb ? (
          <Text style={styles.intro}>Connectez-vous pour retrouver votre jardin.</Text>
        ) : null}
        {failure ? <Banner failure={failure} /> : null}
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="vous@exemple.fr"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
      </ScrollView>
      <StickyFooter>
        <View style={styles.footer}>
          <PrimaryButton
            label="Se connecter"
            loadingLabel="Connexion…"
            loading={busy}
            onPress={submit}
          />
          <TouchableOpacity
            style={styles.link}
            onPress={() => router.push('/account/signup')}
            accessibilityRole="link">
            <Text style={styles.linkText}>Pas encore de compte ? Créer un compte</Text>
          </TouchableOpacity>
        </View>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 28,
    letterSpacing: -0.5,
    color: colors.text,
  },
  intro: { ...typography.body, fontSize: 15, color: colors.textSecondary },
  banner: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  bannerText: { flex: 1, flexBasis: 'auto', minWidth: 0, gap: 2 },
  bannerTitle: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  bannerBody: { ...typography.bodySmall, color: colors.textSecondary },
  footer: { gap: 10 },
  link: { height: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.accent },
});
