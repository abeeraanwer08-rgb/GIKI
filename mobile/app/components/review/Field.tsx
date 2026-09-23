import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../../ui/Txt';
import { colors, fonts, radius, spacing } from '../../ui/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder?: string;
  emphasize?: boolean;
};

export default function Field({ label, value, onChangeText, icon, placeholder, emphasize }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Txt variant="caption" color={colors.inkSecondary} style={styles.label}>
        {label}
      </Txt>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <Ionicons name={icon} size={18} color={focused ? colors.primary : colors.inkMuted} />
        <TextInput
          style={[styles.input, emphasize && styles.inputEmphasis]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          underlineColorAndroid="transparent"
        />
        <Ionicons name="create-outline" size={16} color={colors.inkMuted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: { marginBottom: 6, fontFamily: fonts.medium },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  boxFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  input: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  inputEmphasis: { fontFamily: fonts.bold, fontSize: 16 },
});
