import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, type, TypeVariant } from './theme';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
};

export default function Txt({ variant = 'body', color = colors.ink, align, style, ...rest }: Props) {
  return <Text {...rest} style={[type[variant], { color, textAlign: align }, style]} />;
}
