// Créer un compte (ticket 101). Checks the passwords before calling the
// server; on web it also carries the hidden "website" honeypot.
import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Field, PasswordField, PrimaryButton, StickyFooter } from '../../components/form';
import { Honeypot } from '../../components/Honeypot';
import { useAccount } from '../../components/AccountProvider';
import { colors, typography } from '../../lib/theme';

const MIN_PASSWORD_LENGTH = 12;

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signup } = useAccount();
  const isWeb = Platform.OS === 'web';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async () => {
    if (busy) return;
    const address = email.trim();
    const next = {};
    if (!address) next.email = 'Saisissez votre adresse e-mail.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Le mot de passe doit faire ${MIN_PASSWORD_LENGTH} caractères minimum.`;
    }
    if (confirmation !== password) {
      next.confirmation = 'Les mots de passe ne correspondent pas.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const res = await signup({ email: address, password, website });
      if (res.ok) {
        router.replace({ pathname: '/account/sent', params: { email: address } });
      } else {
        setErrors({ form: res.error });
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
        <ScreenHeader
          title="Créer un compte"
          backFallback={isWeb ? '/account/login' : '/settings'}
        />
        <Text style={styles.intro}>
          Chaque compte est validé à la main avant sa première connexion.
        </Text>
        {errors.form ? (
          <Text style={styles.formError} accessibilityRole="alert">
            {errors.form}
          </Text>
        ) : null}
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          error={errors.email}
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          hint="12 caractères minimum."
          error={errors.password}
        />
        <PasswordField
          label="Confirmer le mot de passe"
          value={confirmation}
          onChangeText={setConfirmation}
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
          returnKeyType="go"
          error={errors.confirmation}
        />
        <Honeypot value={website} onChange={setWebsite} />
      </ScrollView>
      <StickyFooter>
        <View>
          <PrimaryButton
            label="Envoyer la demande"
            loadingLabel="Envoi…"
            loading={busy}
            onPress={submit}
          />
        </View>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  intro: { ...typography.body, fontSize: 15, color: colors.textSecondary },
  formError: { ...typography.bodySmall, color: colors.danger },
});
