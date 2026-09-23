import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryTotal } from '../../types/insights';
import { getCategoryStyle } from '../../utils/categoryStyle';

type Props = {
  category: CategoryTotal;
  maxAmount: number;
  currency: string | null;
};

export default function CategoryBar({ category, maxAmount, currency }: Props) {
  const widthPercent = maxAmount > 0 ? (category.total_amount / maxAmount) * 100 : 0;
  const style = getCategoryStyle(category.category);

  return (
    <View style={styles.row}>
      <View style={[styles.iconBadge, { backgroundColor: style.tint }]}>
        <Ionicons name={style.icon} size={15} color={style.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.category} numberOfLines={1}>
            {category.category}
          </Text>
          <Text style={[styles.amount, { color: style.color }]}>
            {currency ? `${currency} ` : ''}
            {category.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.max(widthPercent, 4)}%`, backgroundColor: style.color },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  body: {
    flex: 1,
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
  },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EEF1F4',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
