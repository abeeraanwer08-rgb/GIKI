import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Txt from './Txt';
import { colors, spacing } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Txt variant="heading">{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" color={colors.inkMuted} style={styles.subtitle}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Txt variant="label" color={colors.primary}>
            {actionLabel}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  titles: { flex: 1 },
  subtitle: { marginTop: 2 },
});
