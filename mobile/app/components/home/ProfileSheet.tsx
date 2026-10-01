import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SessionUser } from '../../auth/session';
import Txt from '../../ui/Txt';
import Button from '../../ui/Button';
import { colors, gradients, radius, spacing } from '../../ui/theme';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <LinearGradient
      colors={gradients.brandSoft}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt variant="label" color={colors.inkInverse} style={{ fontSize: size * 0.38 }}>
        {initialsOf(name)}
      </Txt>
    </LinearGradient>
  );
}

type Props = { user: SessionUser | null; visible: boolean; onClose: () => void; onSignOut: () => void };

export default function ProfileSheet({ user, visible, onClose, onSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);

  // Always reopen in the safe state, never mid-confirmation.
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close profile" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.handle} />
          {user && (
            <View style={styles.identity}>
              <Avatar name={user.name} size={72} />
              <Txt variant="heading" style={styles.name}>
                {user.name}
              </Txt>
              <Txt variant="body" color={colors.inkSecondary}>
                {user.email}
              </Txt>
            </View>
          )}
          <Txt variant="caption" color={colors.inkMuted} align="center" style={styles.privacy}>
            Your expenses and budgets are private to this account.
          </Txt>
          {confirming ? (
            <>
              <Button title="Yes, sign out" icon="log-out-outline" onPress={onSignOut} style={styles.danger} />
              <Button title="Stay signed in" variant="ghost" onPress={() => setConfirming(false)} />
            </>
          ) : (
            <>
              <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={() => setConfirming(true)} />
              <Button title="Close" variant="ghost" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xl,
  },
  identity: { alignItems: 'center' },
  name: { marginTop: spacing.md, marginBottom: 2 },
  privacy: { marginTop: spacing.xl, marginBottom: spacing.xl },
  danger: { backgroundColor: colors.danger, borderRadius: radius.lg },
});
