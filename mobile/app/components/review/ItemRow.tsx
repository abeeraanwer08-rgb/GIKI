import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Txt from '../../ui/Txt';
import { colors, fonts, radius, spacing } from '../../ui/theme';

type Props = {
  index: number;
  name: string;
  amount: string;
  onChangeName: (text: string) => void;
  onChangeAmount: (text: string) => void;
};

export default function ItemRow({ index, name, amount, onChangeName, onChangeAmount }: Props) {
  return (
    <View style={[styles.row, index > 0 && styles.divider]}>
      <View style={styles.index}>
        <Txt variant="caption" color={colors.inkSecondary} style={styles.indexText}>
          {index + 1}
        </Txt>
      </View>
      <TextInput
        style={[styles.input, styles.name]}
        value={name}
        onChangeText={onChangeName}
        placeholder="Item"
        placeholderTextColor={colors.inkMuted}
        underlineColorAndroid="transparent"
      />
      <TextInput
        style={[styles.input, styles.amount]}
        value={amount}
        onChangeText={onChangeAmount}
        placeholder="Amount"
        placeholderTextColor={colors.inkMuted}
        underlineColorAndroid="transparent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  index: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  indexText: { fontFamily: fonts.semibold, fontSize: 11 },
  input: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    fontSize: 14,
    color: colors.ink,
  },
  name: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
    fontFamily: fonts.medium,
  },
  amount: {
    width: 118,
    textAlign: 'right',
    fontFamily: fonts.semibold,
  },
});
