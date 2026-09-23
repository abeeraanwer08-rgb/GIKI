import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from './theme';

type Props = ViewProps & { padded?: boolean };

export default function Card({ padded = true, style, ...rest }: Props) {
  return <View {...rest} style={[styles.card, padded && styles.padded, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  padded: {
    padding: spacing.xl,
  },
});
