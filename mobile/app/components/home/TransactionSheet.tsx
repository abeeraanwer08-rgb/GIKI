import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FinancialRecordSummary } from '../../types/insights';
import { documentTypeLabel, getCategoryStyle } from '../../utils/categoryStyle';
import { capitalize, formatMoney } from '../../utils/format';
import IconBadge from '../../ui/IconBadge';
import Txt from '../../ui/Txt';
import Button from '../../ui/Button';
import { colors, radius, spacing } from '../../ui/theme';

type Props = {
  record: FinancialRecordSummary | null;
  /** Categories that already have a budget, so the action can say "Edit" instead of "Set". */
  budgetedCategories: string[];
  onClose: () => void;
  onSetBudget: (category: string) => void;
};

function longDate(date: string | null): string {
  if (!date) return 'No date';
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function DetailLine({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={18} color={colors.inkMuted} />
      <Txt variant="label" color={colors.inkSecondary} style={styles.lineLabel}>
        {label}
      </Txt>
      <Txt variant="label" style={styles.lineValue} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

export default function TransactionSheet({ record, budgetedCategories, onClose, onSetBudget }: Props) {
  const insets = useSafeAreaInsets();
  const style = getCategoryStyle(record?.category, record?.document_type);

  return (
    <Modal visible={!!record} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close details" />
        {record && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.handle} />
            <View style={styles.hero}>
              <IconBadge icon={style.icon} color={style.color} tint={style.tint} size={64} round />
              <Txt variant="heading" style={styles.merchant} align="center">
                {record.merchant || 'Unknown merchant'}
              </Txt>
              <Txt variant="display" style={styles.amount}>
                {formatMoney(record.amount, record.currency)}
              </Txt>
            </View>

            <View style={styles.details}>
              <DetailLine icon="calendar-outline" label="Date" value={longDate(record.transaction_date)} />
              <DetailLine
                icon="pricetag-outline"
                label="Category"
                value={record.category ? capitalize(record.category) : 'Uncategorised'}
              />
              <DetailLine icon="document-text-outline" label="Type" value={documentTypeLabel(record.document_type)} />
            </View>

            {record.category && (
              <Button
                title={`${budgetedCategories.includes(record.category) ? 'Edit' : 'Set a'} ${capitalize(record.category)} budget`}
                icon="pie-chart-outline"
                variant="secondary"
                onPress={() => onSetBudget(record.category as string)}
              />
            )}
            <Button title="Close" variant="ghost" onPress={onClose} style={styles.close} />
          </View>
        )}
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
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  merchant: { marginTop: spacing.md },
  amount: { marginTop: spacing.xs, fontSize: 38 },
  details: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  lineLabel: { marginLeft: spacing.md, width: 76 },
  lineValue: { flex: 1, textAlign: 'right' },
  close: { marginTop: spacing.xs },
});
