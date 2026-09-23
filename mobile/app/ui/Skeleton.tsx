import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, ViewStyle } from 'react-native';
import { colors, radius } from './theme';

type Props = {
  width?: DimensionValue;
  height: number;
  rounded?: number;
  style?: ViewStyle;
};

export default function Skeleton({ width = '100%', height, rounded = radius.md, style }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: rounded, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}
