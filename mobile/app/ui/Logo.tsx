import React from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

type Props = {
  size?: number;
  /** "tile" is the full-colour app icon; "mono" draws only the glyph, for use on coloured backgrounds. */
  variant?: 'tile' | 'mono';
};

/** HissabAI mark: rising bars with a gold trend line on a rounded tile. */
export default function Logo({ size = 64, variant = 'tile' }: Props) {
  const glyph = '#FFFFFF';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#15A06A" />
          <Stop offset="1" stopColor="#063A26" />
        </LinearGradient>
      </Defs>
      {variant === 'tile' && <Rect width="64" height="64" rx="18" fill="url(#tile)" />}
      {/* bars */}
      <Rect x="16" y="34" width="8" height="14" rx="3" fill={glyph} opacity={0.55} />
      <Rect x="28" y="26" width="8" height="22" rx="3" fill={glyph} opacity={0.8} />
      <Rect x="40" y="16" width="8" height="32" rx="3" fill={glyph} />
      {/* rising trend */}
      <Path
        d="M16 28 L29 19 L38 23 L50 11"
        stroke="#F5C451"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
