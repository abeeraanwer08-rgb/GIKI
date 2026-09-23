import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from './theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tint: string;
  size?: number;
  round?: boolean;
  style?: ViewStyle;
};

export default function IconBadge({ icon, color, tint, size = 44, round = false, style }: Props) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          backgroundColor: tint,
          borderRadius: round ? size / 2 : Math.round(size * 0.32),
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});
