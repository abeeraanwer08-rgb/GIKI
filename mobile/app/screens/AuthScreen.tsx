import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AuthError } from '../auth/authApi';
import Txt from '../ui/Txt';
import Button from '../ui/Button';
import Logo from '../ui/Logo';
import TextField from '../ui/TextField';
import { haptics } from '../ui/haptics';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type Mode = 'signIn' | 'signUp';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

type FieldErrors = { name?: string; email?: string; password?: string };

function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'signUp' && !name.trim()) errors.name = 'Enter your name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (mode === 'signUp' && password.length < MIN_PASSWORD) {
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    haptics.tap();
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const submit = async () => {
    if (busy) return;
    const found = validate(mode, name, email, password);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      haptics.warning();
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else await signUp(name.trim(), email.trim(), password);
      // On success the navigator swaps to the app; nothing more to do here.
    } catch (error) {
      haptics.warning();
      setFormError(error instanceof AuthError ? error.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const signUpMode = mode === 'signUp';

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
          <TextField
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            secret
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            autoCapitalize="none"
            autoComplete={signUpMode ? 'new-password' : 'current-password'}
            textContentType={signUpMode ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            placeholder={signUpMode ? 'At least 8 characters' : 'Your password'}
          />

          <Button
            title={signUpMode ? 'Create account' : 'Sign in'}
            iconRight="arrow-forward"
            onPress={submit}
            loading={busy}
            style={styles.submit}
          />

          <Txt variant="caption" color={colors.inkMuted} align="center" style={styles.note}>
            {signUpMode
              ? 'Your expenses stay private to your account.'
              : 'New here? Choose “Create account” above.'}
          </Txt>
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
  note: { marginTop: spacing.lg },
});
