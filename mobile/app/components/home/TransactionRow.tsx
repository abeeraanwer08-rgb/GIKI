import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FinancialRecordSummary } from '../../types/insights';
import { getCategoryStyle } from '../../utils/categoryStyle';

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  const formatted = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatDate(date: string | null): string {
  if (!date) return 'Date unknown';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Props = {
  record: FinancialRecordSummary;
};

export default function TransactionRow({ record }: Props) {
  const style = getCategoryStyle(record.category, record.document_type);

  return (
    <View style={styles.row}>
      <View style={[styles.iconBadge, { backgroundColor: style.tint }]}>
        <Ionicons name={style.icon} size={20} color={style.color} />
      </View>
      <View style={styles.details}>
        <Text style={styles.merchant} numberOfLines={1}>
          {record.merchant || 'Unknown merchant'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {record.category ? `${record.category} · ` : ''}
          {formatDate(record.transaction_date)}
        </Text>
      </View>
      <Text style={styles.amount}>{formatAmount(record.amount, record.currency)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  details: {
    flex: 1,
    marginRight: 8,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: '#8B94A0',
    textTransform: 'capitalize',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E3B',
  },
});
