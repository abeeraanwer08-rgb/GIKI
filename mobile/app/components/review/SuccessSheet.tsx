import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getCategoryStyle } from '../../utils/categoryStyle';
import { capitalize } from '../../utils/format';
import IconBadge from '../../ui/IconBadge';
import Txt from '../../ui/Txt';
import Button from '../../ui/Button';
import { haptics } from '../../ui/haptics';
import { colors, gradients, radius, spacing } from '../../ui/theme';

type Props = {
  visible: boolean;
  merchant: string;
  total: string;
  category: string;
  onDone: () => void;
  onScanAnother: () => void;
};

/** Confirmation after a record is saved: a springing check, where it went, and what to do next. */
export default function SuccessSheet({ visible, merchant, total, category, onDone, onScanAnother }: Props) {
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(0)).current;
  const style = getCategoryStyle(category);

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      content.setValue(0);
      return;
    }
    haptics.success();
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(content, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, pop, content]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }}>
            <LinearGradient colors={gradients.brandSoft} style={styles.check}>
              <Ionicons name="checkmark" size={46} color={colors.inkInverse} />
            </LinearGradient>
          </Animated.View>

          <Animated.View
            style={[
              styles.body,
              {
                opacity: content,
                transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
            ]}
          >
            <Txt variant="title" align="center">
              Expense saved
            </Txt>
            <Txt variant="body" color={colors.inkSecondary} align="center" style={styles.subtitle}>
              {merchant ? `${merchant} · ${total}` : total}
            </Txt>

            <View style={styles.categoryRow}>
              <IconBadge icon={style.icon} color={style.color} tint={style.tint} size={34} />
              <Txt variant="label" style={styles.categoryText}>
                Filed under <Txt variant="bodyStrong">{capitalize(category)}</Txt>
              </Txt>
            </View>

            <Button title="Done" icon="checkmark" onPress={onDone} />
            <Button title="Scan another receipt" variant="ghost" icon="scan" onPress={onScanAnother} style={styles.again} />
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  check: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { alignSelf: 'stretch', marginTop: spacing.xl },
  subtitle: { marginTop: spacing.xs },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  categoryText: { marginLeft: spacing.sm },
  again: { marginTop: spacing.xs },
});
