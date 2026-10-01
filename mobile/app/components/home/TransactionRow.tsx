import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FinancialRecordSummary } from '../../types/insights';
import { documentTypeLabel, getCategoryStyle } from '../../utils/categoryStyle';
import { capitalize, formatMoney } from '../../utils/format';
import IconBadge from '../../ui/IconBadge';
import Txt from '../../ui/Txt';
import { haptics } from '../../ui/haptics';
import { colors, radius, spacing } from '../../ui/theme';

type Props = {
  record: FinancialRecordSummary;
  isFirst: boolean;
  isLast: boolean;
  onPress: (record: FinancialRecordSummary) => void;
};

export default function TransactionRow({ record, isFirst, isLast, onPress }: Props) {
  const style = getCategoryStyle(record.category, record.document_type);
  const subtitle = [
    record.category ? capitalize(record.category) : null,
    documentTypeLabel(record.document_type),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress(record);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${record.merchant ?? 'Transaction'}, ${formatMoney(record.amount, record.currency)}`}
      style={({ pressed }) => [
        styles.row,
        isFirst && styles.first,
        isLast && styles.last,
        pressed && styles.pressed,
      ]}
    >
      <IconBadge icon={style.icon} color={style.color} tint={style.tint} size={42} />
      <View style={styles.details}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {record.merchant || 'Unknown merchant'}
        </Txt>
        <Txt variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      <Txt variant="bodyStrong">{formatMoney(record.amount, record.currency)}</Txt>
      <Ionicons name="chevron-forward" size={16} color={colors.border} style={styles.chevron} />
      {!isLast && <View style={styles.divider} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  first: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  last: {
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  chevron: { marginLeft: spacing.sm },
  details: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  divider: {
    position: 'absolute',
    left: 70,
    right: spacing.lg,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
