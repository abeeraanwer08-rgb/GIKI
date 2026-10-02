import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../../ui/Txt';
import { colors, fonts, radius, spacing } from '../../ui/theme';

type Props = {
  index: number;
  name: string;
  amount: string;
  onChangeName: (text: string) => void;
  onChangeAmount: (text: string) => void;
  /** Small line above the row, e.g. a transaction date. */
  caption?: string;
  /** When set, shows a remove button (used to drop non-spending rows from a statement). */
  onRemove?: () => void;
};

export default function ItemRow({ index, name, amount, onChangeName, onChangeAmount, caption, onRemove }: Props) {
  return (
    <View style={[styles.wrap, index > 0 && styles.divider]}>
    {caption ? (
      <Txt variant="caption" color={colors.inkMuted} style={styles.caption}>
        {caption}
      </Txt>
    ) : null}
    <View style={styles.row}>
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
      {onRemove && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name || 'item'}`}
          style={styles.remove}
        >
          <Ionicons name="close-circle" size={20} color={colors.inkMuted} />
        </Pressable>
      )}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  caption: { marginLeft: 32, marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
  remove: { marginLeft: spacing.sm },
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
