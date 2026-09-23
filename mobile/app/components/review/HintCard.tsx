import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../../ui/Txt';
import { colors, spacing } from '../../ui/theme';

export default function HintCard({ hint, isFirst }: { hint: string; isFirst: boolean }) {
  return (
    <View style={[styles.row, !isFirst && styles.gap]}>
      <Ionicons name="alert-circle" size={18} color={colors.warning} style={styles.icon} />
      <Txt variant="label" color={colors.inkSecondary} style={styles.text}>
        {hint}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  gap: { marginTop: spacing.md },
  icon: { marginTop: 1, marginRight: spacing.sm },
  text: { flex: 1 },
});
