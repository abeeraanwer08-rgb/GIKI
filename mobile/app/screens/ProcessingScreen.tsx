import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { uploadDocument } from '../services/documentService';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { colors, gradients, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

const STEPS = [
  'Uploading your photo',
  'Checking image quality',
  'Reading the receipt with AI',
  'Organising items and totals',
] as const;

const STEP_INTERVAL_MS = 1600;

export default function ProcessingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { capturedImages } = route.params;
  const imageUri = capturedImages[0];

  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Advance through the steps, holding on the last one until the upload finishes.
  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [error, attempt]);

  // Upload document and navigate to Review on success.
  useEffect(() => {
    let cancelled = false;

    uploadDocument(capturedImages)
      .then((ufr) => {
        if (cancelled || !mountedRef.current) return;
        navigation.replace('Review', { imageUri, capturedImages, ufr });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setError('We couldn’t read this document. Check your connection, or retake the photo with better lighting.');
      });

    return () => {
      cancelled = true;
    };
  }, [capturedImages, imageUri, navigation, attempt]);

  const retry = () => {
    setError(null);
    setActiveStep(0);
    setAttempt((n) => n + 1);
  };

  if (error) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Card style={styles.errorCard}>
          <EmptyState icon="alert-circle" tone="danger" title="Processing failed" body={error} />
          <Button title="Try again" icon="refresh" onPress={retry} />
          <Button
            title="Retake photo"
            variant="ghost"
            onPress={() => navigation.goBack()}
            style={styles.secondaryAction}
          />
        </Card>
      </View>
    );
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxxl }]}>
      <View style={styles.hero}>
        <View style={styles.orbWrap}>
          <Animated.View
            style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
          <LinearGradient colors={gradients.brandSoft} style={styles.orb}>
            <Ionicons name="scan" size={40} color={colors.inkInverse} />
          </LinearGradient>
        </View>
        <Txt variant="title" align="center" style={styles.title}>
          Analysing your receipt
        </Txt>
        <Txt variant="body" color={colors.inkSecondary} align="center">
          This usually takes a few seconds
        </Txt>
      </View>

      <Card style={styles.steps}>
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          return (
            <View key={step} style={[styles.step, i > 0 && styles.stepGap]}>
              <View style={styles.stepIcon}>
                {done ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : active ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={20} color={colors.border} />
                )}
              </View>
              <Txt
                variant={active ? 'bodyStrong' : 'body'}
                color={active ? colors.ink : done ? colors.inkSecondary : colors.inkMuted}
              >
                {step}
              </Txt>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const ORB = 104;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  centered: { justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xxxl },
  orbWrap: {
    width: ORB * 1.6,
    height: ORB * 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: colors.primary,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginBottom: spacing.sm },
  steps: { paddingVertical: spacing.xl },
  step: { flexDirection: 'row', alignItems: 'center' },
  stepGap: { marginTop: spacing.lg },
  stepIcon: { width: 28, alignItems: 'center', marginRight: spacing.md },
  errorCard: { paddingTop: 0 },
  secondaryAction: { marginTop: spacing.sm },
});
