import React from 'react';
import { StyleSheet, View } from 'react-native';
import Txt from '../../ui/Txt';
import { colors, spacing } from '../../ui/theme';

type Props = { label: string; value: string; total?: boolean };

export default function SummaryRow({ label, value, total = false }: Props) {
  return (
    <View style={[styles.row, total && styles.totalRow]}>
      <Txt variant={total ? 'bodyStrong' : 'label'} color={total ? colors.ink : colors.inkSecondary}>
        {label}
      </Txt>
      <Txt variant={total ? 'heading' : 'bodyStrong'} color={total ? colors.primary : colors.ink}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  totalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
  },
});
