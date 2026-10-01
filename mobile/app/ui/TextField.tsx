import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from './Txt';
import { colors, fonts, radius, spacing } from './theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  /** Adds a show/hide toggle and hides the text by default. */
  secret?: boolean;
};

const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, icon, error, secret = false, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Txt variant="caption" color={colors.inkSecondary} style={styles.label}>
        {label}
      </Txt>
      <View style={[styles.box, focused && styles.focused, !!error && styles.errored]}>
        <Ionicons name={icon} size={18} color={error ? colors.danger : focused ? colors.primary : colors.inkMuted} />
        <TextInput
          ref={ref}
          {...input}
          style={styles.input}
          placeholderTextColor={colors.inkMuted}
          secureTextEntry={secret && !revealed}
          accessibilityLabel={label}
          underlineColorAndroid="transparent"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {secret && (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Txt variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Txt>
      )}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: { marginBottom: 6, fontFamily: fonts.medium },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  focused: { backgroundColor: colors.surface, borderColor: colors.primary },
  errored: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  input: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  error: { marginTop: 6 },
});
