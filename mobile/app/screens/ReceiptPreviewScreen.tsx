import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import Txt from '../ui/Txt';
import Button from '../ui/Button';
import FocusStatusBar from '../ui/FocusStatusBar';
import { colors, radius, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiptPreview'>;

type Check = { icon: keyof typeof Ionicons.glyphMap; label: string };

const RECEIPT_CHECKS: Check[] = [
  { icon: 'storefront-outline', label: 'Store name is visible' },
  { icon: 'list-outline', label: 'Items and prices are sharp' },
  { icon: 'cash-outline', label: 'Grand total is in frame' },
];

const STATEMENT_CHECKS: Check[] = [
  { icon: 'business-outline', label: 'Bank name and period are visible' },
  { icon: 'list-outline', label: 'Every row is sharp and readable' },
  { icon: 'cash-outline', label: 'Debit, credit and balance columns are in frame' },
];

export default function ReceiptPreviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { capturedImages, documentType } = route.params;

  // Display the most recently captured image (last in array).
  // The array structure is intentional — a future milestone will allow
  // adding more pages to the same receipt session.
  const previewUri = capturedImages[capturedImages.length - 1];

  return (
    <View style={styles.screen}>
      <FocusStatusBar style="light" />
      <View style={styles.imageArea}>
        <Image source={{ uri: previewUri }} style={styles.image} resizeMode="contain" />
        {capturedImages.length > 1 && (
          <View style={styles.badge}>
            <Txt variant="caption" color={colors.inkInverse}>
              {capturedImages.length} pages captured
            </Txt>
          </View>
        )}
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
        <View style={styles.handle} />
        <Txt variant="heading">Is everything readable?</Txt>
        <Txt variant="caption" color={colors.inkSecondary} style={styles.sheetBody}>
          Clear photos give the AI the best chance of reading every line.
        </Txt>
        <View style={styles.checks}>
          {(documentType === 'bank_statement' ? STATEMENT_CHECKS : RECEIPT_CHECKS).map((c) => (
            <View key={c.label} style={styles.check}>
              <Ionicons name={c.icon} size={16} color={colors.primary} />
              <Txt variant="caption" color={colors.inkSecondary} style={styles.checkText}>
                {c.label}
              </Txt>
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            title="Retake"
            icon="camera-reverse-outline"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.retake}
          />
          <Button
            title="Use photo"
            iconRight="arrow-forward"
            onPress={() => navigation.navigate('Processing', { capturedImages, documentType })}
            style={styles.continue}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1220' },
  imageArea: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  badge: {
    position: 'absolute',
    top: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  sheetBody: { marginTop: spacing.xs },
  checks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  checkText: { marginLeft: 6 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  retake: { flex: 1 },
  continue: { flex: 1.4 },
});
