import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../../ui/Txt';
import { colors, radius, spacing } from '../../ui/theme';

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant' | 'error' | 'pending';
  text: string;
};

export default function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <View style={[styles.bubble, styles.user]}>
        <Txt variant="label" color={colors.inkInverse}>
          {message.text}
        </Txt>
      </View>
    );
  }

  const isError = message.role === 'error';

  return (
    <View style={styles.assistantRow}>
      <View style={[styles.avatar, isError && styles.avatarError]}>
        <Ionicons
          name={isError ? 'alert' : 'sparkles'}
          size={13}
          color={isError ? colors.danger : colors.primary}
        />
      </View>
      <View style={[styles.bubble, styles.assistant, isError && styles.errorBubble]}>
        {message.role === 'pending' ? (
          <View style={styles.pending}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Txt variant="caption" color={colors.inkSecondary} style={styles.pendingText}>
              Thinking…
            </Txt>
          </View>
        ) : (
          <Txt variant="label" color={isError ? colors.danger : colors.ink}>
            {message.text}
          </Txt>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    maxWidth: '85%',
    marginBottom: spacing.sm,
  },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  avatarError: { backgroundColor: colors.dangerSoft },
  assistant: {
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: 4,
    flexShrink: 1,
  },
  errorBubble: { backgroundColor: colors.dangerSoft },
  pending: { flexDirection: 'row', alignItems: 'center' },
  pendingText: { marginLeft: spacing.sm },
});
