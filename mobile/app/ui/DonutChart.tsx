import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useCountUp } from './motion';
import { colors } from './theme';

export type DonutSegment = { key: string; value: number; color: string };

type Props = {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  children?: React.ReactNode;
};

const GAP = 3;

export default function DonutChart({ segments, size = 180, thickness = 20, children }: Props) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const gap = segments.length > 1 ? GAP : 0;
  // 0 → 1 over ~1s; scales every arc so the ring draws itself in.
  const sweep = useCountUp(1, 1000);

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = total > 0 ? (s.value / total) * c : 0;
      const arc = {
        key: s.key,
        color: s.color,
        dash: `${Math.max((length - gap) * sweep, 0.01)} ${c}`,
        offset: -offset * sweep,
      };
      offset += length;
      return arc;
    });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.surfaceMuted}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
