import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CategoryTotal } from '../../types/insights';

type Props = {
  category: CategoryTotal;
  maxAmount: number;
  currency: string | null;
};

export default function CategoryBar({ category, maxAmount, currency }: Props) {
  const widthPercent = maxAmount > 0 ? (category.total_amount / maxAmount) * 100 : 0;

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.category} numberOfLines={1}>
          {category.category}
        </Text>
        <Text style={styles.amount}>
          {currency ? `${currency} ` : ''}
          {category.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(widthPercent, 4)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  category: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A2E',
    textTransform: 'capitalize',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8EDF2',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#1B5E3B',
  },
});
