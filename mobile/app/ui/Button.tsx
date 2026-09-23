import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Txt from './Txt';
import { colors, gradients, radius, shadow } from './theme';

type Variant = 'primary' | 'secondary' | 'outlineLight' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const FOREGROUND: Record<Variant, string> = {
  primary: colors.inkInverse,
  secondary: colors.primary,
  outlineLight: colors.inkInverse,
  ghost: colors.inkSecondary,
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  style,
}: Props) {
  const fg = FOREGROUND[variant];
  const inactive = disabled || loading;

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} style={styles.iconLeft} />}
          <Txt variant="bodyStrong" color={fg}>
            {title}
          </Txt>
          {iconRight && <Ionicons name={iconRight} size={18} color={fg} style={styles.iconRight} />}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && !inactive && shadow.raised,
        variant === 'secondary' && styles.secondary,
        variant === 'outlineLight' && styles.outlineLight,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={gradients.brandSoft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'visible',
  },
  fill: {
    minHeight: 54,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  outlineLight: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});
