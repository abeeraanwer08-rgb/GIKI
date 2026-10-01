import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../../ui/Txt';
import Button from '../../ui/Button';
import { CATEGORIES, getCategoryStyle } from '../../utils/categoryStyle';
import { capitalize } from '../../utils/format';
import { colors, fonts, radius, spacing } from '../../ui/theme';

type Props = {
  visible: boolean;
  /** Category being edited, or null when creating a new budget. */
  editing: { category: string; monthlyLimit: number } | null;
  /** Categories that already have a budget (hidden when creating). */
  taken: string[];
  /** Category to pre-select when creating. */
  initialCategory?: string | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (category: string, monthlyLimit: number) => void;
  onDelete: (category: string) => void;
};

export default function BudgetSheet({
  visible,
  editing,
  taken,
  initialCategory,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const available = CATEGORIES.filter((c) => c !== 'other' && !taken.includes(c));
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const chipsRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});

  // Keep the selected chip visible: a preset category can sit past the right edge.
  // Wait a beat so the modal has mounted and its chips have reported their layout.
  useEffect(() => {
    if (!visible || !category) return;
    const timer = setTimeout(() => {
      const x = chipX.current[category];
      if (x !== undefined) chipsRef.current?.scrollTo({ x: Math.max(x - spacing.lg, 0), animated: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, category]);

  useEffect(() => {
    if (!visible) return;
    setCategory(
      editing?.category ??
        (initialCategory && available.includes(initialCategory as (typeof CATEGORIES)[number])
          ? initialCategory
          : available[0] ?? null),
    );
    setAmount(editing ? String(Math.round(editing.monthlyLimit)) : '');
    // Reset only when the sheet opens, not on every render of `available`.
  }, [visible, editing, initialCategory]);

  const parsed = Number(amount.replace(/[^0-9.]/g, ''));
  const valid = !!category && Number.isFinite(parsed) && parsed > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Txt variant="heading" style={styles.flex}>
              {editing ? `${capitalize(editing.category)} budget` : 'New budget'}
            </Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.inkSecondary} />
            </Pressable>
          </View>

          {!editing && (
            <>
              <Txt variant="caption" color={colors.inkSecondary} style={styles.label}>
                Category
              </Txt>
              <ScrollView
                ref={chipsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {available.map((c) => {
                  const style = getCategoryStyle(c);
                  const selected = c === category;
                  return (
                    <Pressable
                      key={c}
                      onLayout={(e) => {
                        chipX.current[c] = e.nativeEvent.layout.x;
                      }}
                      onPress={() => setCategory(c)}
                      style={[styles.chip, selected && { backgroundColor: style.color, borderColor: style.color }]}
                    >
                      <Ionicons name={style.icon} size={15} color={selected ? colors.inkInverse : style.color} />
                      <Txt
                        variant="label"
                        color={selected ? colors.inkInverse : colors.ink}
                        style={styles.chipText}
                      >
                        {capitalize(c)}
                      </Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          <Txt variant="caption" color={colors.inkSecondary} style={styles.label}>
            Monthly limit
          </Txt>
          <View style={styles.amountBox}>
            <Txt variant="bodyStrong" color={colors.inkMuted}>
              PKR
            </Txt>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="10,000"
              placeholderTextColor={colors.inkMuted}
              autoFocus={!!editing}
            />
          </View>

          {error && (
            <Txt variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </Txt>
          )}

          <Button
            title={editing ? 'Update budget' : 'Create budget'}
            icon="checkmark"
            onPress={() => category && onSave(category, parsed)}
            disabled={!valid}
            loading={saving}
            style={styles.save}
          />
          {editing && (
            <Button
              title="Remove budget"
              variant="ghost"
              icon="trash-outline"
              onPress={() => onDelete(editing.category)}
              disabled={saving}
            />
          )}
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  label: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: fonts.medium },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { marginLeft: 6 },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.sm,
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.ink,
  },
  error: { marginTop: spacing.sm },
  save: { marginTop: spacing.xl, marginBottom: spacing.sm },
});
