import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AuthError, forgotPassword, resetPassword } from '../auth/authApi';
import Txt from '../ui/Txt';
import Button from '../ui/Button';
import Logo from '../ui/Logo';
import TextField from '../ui/TextField';
import { haptics } from '../ui/haptics';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type Mode = 'signIn' | 'signUp' | 'forgot' | 'reset';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

type FieldErrors = { name?: string; email?: string; password?: string; code?: string };

function validate(mode: Mode, name: string, email: string, password: string, code: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'signUp' && !name.trim()) errors.name = 'Enter your name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (mode === 'forgot') return errors;
  if (mode === 'reset' && !/^\d{6}$/.test(code.trim())) errors.code = 'Enter the 6-digit code from the email.';
  if ((mode === 'signUp' || mode === 'reset') && password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  } else if (!password) {
    errors.password = 'Enter your password.';
  }
  return errors;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode, keepNotice = false) => {
    if (next === mode) return;
    haptics.tap();
    setMode(next);
    setErrors({});
    setFormError(null);
    if (!keepNotice) setNotice(null);
  };

  const submit = async () => {
    if (busy) return;
    const found = validate(mode, name, email, password, code);
    setErrors(found);
    setFormError(null);
    setNotice(null);
    if (Object.keys(found).length > 0) {
      haptics.warning();
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else if (mode === 'signUp') await signUp(name.trim(), email.trim(), password);
      else if (mode === 'forgot') {
        await forgotPassword(email.trim());
        setNotice('If an account exists for that email, we’ve sent a 6-digit code.');
        setMode('reset');
        setBusy(false);
      } else {
        await resetPassword(email.trim(), code.trim(), password);
        setNotice('Password reset. Sign in with your new password.');
        setPassword('');
        setCode('');
        setMode('signIn');
        setBusy(false);
      }
      // Signing in or up swaps the navigator (to the app, or the verify-email screen).
    } catch (error) {
      haptics.warning();
      setFormError(error instanceof AuthError ? error.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const signUpMode = mode === 'signUp';
  const recovery = mode === 'forgot' || mode === 'reset';
  const needsNewPassword = signUpMode || mode === 'reset';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}
        >
          <Logo size={72} />
          <Txt variant="display" color={colors.inkInverse} style={styles.brand}>
            HissabAI
          </Txt>
          <Txt variant="body" color={colors.inkInverseMuted} align="center">
            Scan receipts. Track budgets. Ask in Urdu or English.
          </Txt>
        </LinearGradient>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xxl) }]}>
          {recovery && (
            <View style={styles.recoveryHead}>
              <Txt variant="title">{mode === 'forgot' ? 'Forgot your password?' : 'Enter your code'}</Txt>
              <Txt variant="body" color={colors.inkSecondary} style={styles.recoveryBody}>
                {mode === 'forgot'
                  ? 'Enter your email and we’ll send you a 6-digit code to reset it.'
                  : 'Enter the code we emailed you and choose a new password.'}
              </Txt>
            </View>
          )}
          {!recovery && (
          <View style={styles.segment} accessibilityRole="tablist">
            {(['signIn', 'signUp'] as const).map((m) => {
              const active = m === mode;
              return (
                <Pressable
                  key={m}
                  onPress={() => switchMode(m)}
                  style={[styles.segmentItem, active && styles.segmentActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Txt variant="label" color={active ? colors.ink : colors.inkSecondary} style={styles.segmentText}>
                    {m === 'signIn' ? 'Sign in' : 'Create account'}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          )}

          {!!notice && !formError && (
            <View style={[styles.banner, styles.bannerOk]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Txt variant="label" color={colors.primary} style={styles.bannerText}>
                {notice}
              </Txt>
            </View>
          )}

          {!!formError && (
            <View style={styles.banner} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Txt variant="label" color={colors.danger} style={styles.bannerText}>
                {formError}
              </Txt>
            </View>
          )}

          {signUpMode && (
            <TextField
              label="Your name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              error={errors.name}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              placeholder="Ali Khan"
            />
          )}
          <TextField
            ref={emailRef}
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="you@example.com"
          />
          {mode === 'reset' && (
            <TextField
              label="6-digit code"
              icon="keypad-outline"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              error={errors.code}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="123456"
            />
          )}
          {mode !== 'forgot' && (
            <TextField
              ref={passwordRef}
              label={mode === 'reset' ? 'New password' : 'Password'}
              icon="lock-closed-outline"
              secret
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              autoCapitalize="none"
              autoComplete={needsNewPassword ? 'new-password' : 'current-password'}
              textContentType={needsNewPassword ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={submit}
              placeholder={needsNewPassword ? 'At least 8 characters' : 'Your password'}
            />
          )}

          {mode === 'signIn' && (
            <Pressable
              onPress={() => switchMode('forgot')}
              style={styles.forgot}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Txt variant="label" color={colors.primary}>
                Forgot password?
              </Txt>
            </Pressable>
          )}

          <Button
            title={
              mode === 'forgot' ? 'Send code' : mode === 'reset' ? 'Reset password' : signUpMode ? 'Create account' : 'Sign in'
            }
            iconRight="arrow-forward"
            onPress={submit}
            loading={busy}
            style={styles.submit}
          />

          {recovery ? (
            <Pressable onPress={() => switchMode('signIn')} style={styles.back} accessibilityRole="button">
              <Txt variant="label" color={colors.inkSecondary}>
                ← Back to sign in
              </Txt>
            </Pressable>
          ) : (
            <Txt variant="caption" color={colors.inkMuted} align="center" style={styles.note}>
              {signUpMode
                ? 'Your expenses stay private to your account.'
                : 'New here? Choose “Create account” above.'}
            </Txt>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 72,
  },
  brand: { marginTop: spacing.lg, marginBottom: spacing.xs },
  sheet: {
    flex: 1,
    marginTop: -32,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.xl,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontFamily: fonts.semibold },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerText: { flex: 1, marginLeft: spacing.sm },
  submit: { marginTop: spacing.sm },
  bannerOk: { backgroundColor: colors.primarySoft },
  forgot: { alignSelf: 'flex-end', marginTop: -spacing.sm, marginBottom: spacing.sm },
  recoveryHead: { marginBottom: spacing.xl },
  recoveryBody: { marginTop: spacing.xs },
  back: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  note: { marginTop: spacing.lg },
});
