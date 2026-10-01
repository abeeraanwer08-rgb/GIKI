import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { pickReceiptFromGallery } from '../utils/pickReceipt';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import IconBadge from '../ui/IconBadge';
import SectionHeader from '../ui/SectionHeader';
import { colors, fonts, radius, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

const TIPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'sunny-outline', title: 'Use good lighting', body: 'Avoid shadows and glare on the paper.' },
  { icon: 'crop-outline', title: 'Fit the whole receipt', body: 'Keep all four edges inside the frame.' },
  { icon: 'hand-left-outline', title: 'Hold steady', body: 'HissabAI warns you if the photo is blurry.' },
];

export default function AddExpenseScreen({ navigation }: Props) {
  const chooseFromGallery = async () => {
    const uri = await pickReceiptFromGallery();
    if (uri) navigation.navigate('ReceiptPreview', { capturedImages: [uri] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Txt variant="title">How would you like to add it?</Txt>
      <Txt variant="body" color={colors.inkSecondary} style={styles.subtitle}>
        Scan a receipt and HissabAI’s AI fills in the merchant, items and total for you.
      </Txt>

      <Pressable
        onPress={() => navigation.navigate('Camera')}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={[styles.option, styles.optionPrimary]}>
          <IconBadge icon="scan" color={colors.primary} tint={colors.primarySoft} size={52} />
          <View style={styles.optionText}>
            <View style={styles.titleRow}>
              <Txt variant="heading">Scan receipt</Txt>
              <View style={styles.aiChip}>
                <Txt variant="overline" color={colors.primary} style={styles.chipText}>
                  AI
                </Txt>
              </View>
            </View>
            <Txt variant="caption" color={colors.inkSecondary}>
              Receipts, utility bills and wallet screenshots
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Card>
      </Pressable>

      <Pressable onPress={chooseFromGallery} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={styles.option}>
          <IconBadge icon="images" color={colors.info} tint={colors.infoSoft} size={52} />
          <View style={styles.optionText}>
            <Txt variant="heading">Choose from gallery</Txt>
            <Txt variant="caption" color={colors.inkSecondary}>
              Use a receipt photo you already have
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </Card>
      </Pressable>

      <Card style={[styles.option, styles.optionDisabled]}>
        <IconBadge icon="create-outline" color={colors.inkMuted} tint={colors.surfaceMuted} size={52} />
        <View style={styles.optionText}>
          <View style={styles.titleRow}>
            <Txt variant="heading" color={colors.inkMuted}>
              Enter manually
            </Txt>
            <View style={styles.soonChip}>
              <Txt variant="overline" color={colors.inkMuted} style={styles.chipText}>
                Soon
              </Txt>
            </View>
          </View>
          <Txt variant="caption" color={colors.inkMuted}>
            Type in your expense details
          </Txt>
        </View>
      </Card>

      <SectionHeader title="Tips for a perfect scan" />
      <Card>
        {TIPS.map((tip, i) => (
          <View key={tip.title} style={[styles.tip, i > 0 && styles.tipGap]}>
            <IconBadge icon={tip.icon} color={colors.primary} tint={colors.primarySoft} size={36} />
            <View style={styles.tipText}>
              <Txt variant="bodyStrong">{tip.title}</Txt>
              <Txt variant="caption" color={colors.inkSecondary}>
                {tip.body}
              </Txt>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.xxl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  optionPrimary: { borderWidth: 1.5, borderColor: colors.primaryTint },
  optionDisabled: { opacity: 0.7 },
  optionText: { flex: 1, marginHorizontal: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  aiChip: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  soonChip: {
    marginLeft: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: { fontFamily: fonts.bold, fontSize: 10 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  tip: { flexDirection: 'row', alignItems: 'center' },
  tipGap: { marginTop: spacing.lg },
  tipText: { flex: 1, marginLeft: spacing.md },
});
