import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from './Logo';
import Txt from './Txt';
import { colors, gradients } from './theme';

type Props = { onDone: () => void };

const HOLD_MS = 900;

/** Brand intro: the mark springs in, the wordmark fades up, then the whole screen dissolves. */
export default function Splash({ onDone }: Props) {
  const logo = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logo, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(word, {
          toValue: 1,
          duration: 500,
          delay: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(exit, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [logo, word, exit, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: exit }]} pointerEvents="none">
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <Animated.View
          style={{
            opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        >
          <View style={styles.logoShadow}>
            <Logo size={104} />
          </View>
        </Animated.View>
        <Animated.View
          style={{
            opacity: word,
            transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}
        >
          <Txt variant="display" color={colors.inkInverse} align="center" style={styles.wordmark}>
            HissabAI
          </Txt>
          <Txt variant="body" color={colors.inkInverseMuted} align="center">
            حساب · Your AI money copilot
          </Txt>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoShadow: {
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    marginBottom: 28,
  },
  wordmark: { marginBottom: 6 },
});
