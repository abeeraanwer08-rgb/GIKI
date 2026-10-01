import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

type FadeInProps = {
  children: React.ReactNode;
  /** Stagger index; each step delays the entrance by 60ms. */
  index?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades and slides its children up on mount. Native-driven, so it never janks scrolling. */
export function FadeIn({ children, index = 0, delay = 0, style }: FadeInProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay: delay + index * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Eases a number from 0 (or its previous value) to `target`, for headline amounts. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    // Monotonic clock: unaffected by the device clock being adjusted mid-animation.
    const startedAt = performance.now();
    let frame: ReturnType<typeof requestAnimationFrame>;

    const tick = () => {
      const t = Math.min((performance.now() - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (target - start) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

type BarProps = {
  /** 0–100. */
  percent: number;
  color: string;
  height?: number;
  trackColor: string;
  delay?: number;
};

/** A progress bar whose fill grows into place. */
export function AnimatedBar({ percent, color, height = 8, trackColor, delay = 0 }: BarProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const clamped = Math.min(Math.max(percent, 2), 100);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clamped,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width cannot be driven natively
    }).start();
  }, [progress, clamped, delay]);

  return (
    <Animated.View
      style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
          width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </Animated.View>
  );
}
