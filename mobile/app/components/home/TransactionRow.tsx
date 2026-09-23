import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FinancialRecordSummary } from '../../types/insights';

const DOCUMENT_ICONS: Record<string, string> = {
  receipt: '🧾',
  utility_bill: '💡',
  wallet_screenshot: '📱',
};

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
  const icon = DOCUMENT_ICONS[record.document_type] ?? '💳';

  return (
    <View style={styles.row}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>{icon}</Text>
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
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
    color: '#888888',
    textTransform: 'capitalize',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E3B',
  },
});
