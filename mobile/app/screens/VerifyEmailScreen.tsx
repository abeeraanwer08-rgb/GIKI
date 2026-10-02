import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AuthError } from '../auth/authApi';
import Txt from '../ui/Txt';
import Button from '../ui/Button';
import TextField from '../ui/TextField';
import { haptics } from '../ui/haptics';
import { colors, gradients, radius, spacing } from '../ui/theme';

const RESEND_SECONDS = 60;

/** Shown after sign-up (or sign-in) until the emailed 6-digit code has been entered. */
export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const { user, verifyEmail, resendVerification, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS); // a code was just emailed

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      haptics.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(code.trim());
      haptics.success();
    } catch (e) {
      haptics.warning();
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await resendVerification();
      setNotice('We’ve sent a new code.');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      if (e instanceof AuthError && e.retryAfter) setCooldown(e.retryAfter);
      setError(e instanceof AuthError ? e.message : 'Could not send a new code.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}
        >
          <View style={styles.badge}>
            <Ionicons name="mail-open" size={34} color={colors.inkInverse} />
          </View>
          <Txt variant="title" color={colors.inkInverse} align="center" style={styles.title}>
            Check your email
          </Txt>
          <Txt variant="body" color={colors.inkInverseMuted} align="center">
            We sent a 6-digit code to
          </Txt>
          <Txt variant="bodyStrong" color={colors.inkInverse} align="center">
            {user?.email}
          </Txt>
        </LinearGradient>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xxl) }]}>
          {!!error && (
            <View style={styles.banner} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Txt variant="label" color={colors.danger} style={styles.bannerText}>
                {error}
              </Txt>
            </View>
          )}
          {!!notice && !error && (
            <View style={[styles.banner, styles.bannerOk]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Txt variant="label" color={colors.primary} style={styles.bannerText}>
                {notice}
              </Txt>
            </View>
          )}

          <TextField
            label="Verification code"
            icon="keypad-outline"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="go"
            onSubmitEditing={submit}
            placeholder="123456"
          />
          <Button title="Verify email" iconRight="arrow-forward" onPress={submit} loading={busy} />

          <Pressable onPress={resend} disabled={cooldown > 0} style={styles.link} accessibilityRole="button">
            <Txt variant="label" color={cooldown > 0 ? colors.inkMuted : colors.primary}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Txt>
          </Pressable>
          <Txt variant="caption" color={colors.inkMuted} align="center" style={styles.hint}>
            The code expires in 15 minutes. Check your spam folder if you can’t find it.
          </Txt>
          <Pressable onPress={() => signOut()} style={styles.link} accessibilityRole="button">
            <Txt variant="label" color={colors.inkSecondary}>
              Use a different account
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingHorizontal: spacing.xxl, paddingBottom: 72 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.xs },
  sheet: {
    flex: 1,
    marginTop: -32,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerOk: { backgroundColor: colors.primarySoft },
  bannerText: { flex: 1, marginLeft: spacing.sm },
  link: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  hint: { marginTop: spacing.xs },
});
