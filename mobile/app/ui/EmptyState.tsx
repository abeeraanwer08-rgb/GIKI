import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from './Txt';
import Button from './Button';
import IconBadge from './IconBadge';
import { colors, spacing } from './theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tone?: 'brand' | 'danger';
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, body, tone = 'brand', actionLabel, onAction }: Props) {
  const iconColor = tone === 'danger' ? colors.danger : colors.primary;
  const iconTint = tone === 'danger' ? colors.dangerSoft : colors.primarySoft;

  return (
    <View style={styles.container}>
      <IconBadge icon={icon} color={iconColor} tint={iconTint} size={76} round />
      <Txt variant="heading" align="center" style={styles.title}>
        {title}
      </Txt>
      <Txt variant="caption" color={colors.inkSecondary} align="center" style={styles.body}>
        {body}
      </Txt>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl,
  },
  title: { marginTop: spacing.xl },
  body: { marginTop: spacing.sm, maxWidth: 300 },
  action: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
