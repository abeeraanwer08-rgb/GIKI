import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { pickPdfOrImageFile, pickPhotosFromGallery } from '../utils/pickReceipt';
import { MULTI_PAGE_TYPES, SCAN_TYPES, ScanDocumentType } from '../utils/scanType';
import { haptics } from '../ui/haptics';
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

const STATEMENT_TIPS = [
  { icon: 'document-text-outline' as const, title: 'One page at a time', body: 'Scan each statement page separately.' },
  { icon: 'contrast-outline' as const, title: 'Flat and evenly lit', body: 'Lay the page flat so no row is shadowed or curved.' },
  { icon: 'shield-checkmark-outline' as const, title: 'We check the maths', body: 'Totals and running balances are verified before you save.' },
];

export default function AddExpenseScreen({ navigation }: Props) {
  const [documentType, setDocumentType] = useState<ScanDocumentType>('auto');
  const selected = SCAN_TYPES.find((t) => t.key === documentType) ?? SCAN_TYPES[0];
  const isStatement = documentType === 'bank_statement';

  const multiPage = MULTI_PAGE_TYPES.includes(documentType);
  // A PDF is offered wherever it can make sense: statements, invoices, and auto-detect.
  const offersPdf = multiPage || documentType === 'auto';

  const chooseFromGallery = async () => {
    const uris = await pickPhotosFromGallery(multiPage);
    if (uris.length) navigation.navigate('ReceiptPreview', { capturedImages: uris, documentType });
  };

  const choosePdf = async () => {
    const uri = await pickPdfOrImageFile();
    if (uri) navigation.navigate('ReceiptPreview', { capturedImages: [uri], documentType });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Txt variant="title">How would you like to add it?</Txt>
      <Txt variant="body" color={colors.inkSecondary} style={styles.subtitle}>
        Scan a document and HissabAI’s AI fills in the details for you.
      </Txt>

      <Txt variant="overline" color={colors.inkMuted} style={styles.pickerLabel}>
        What are you adding?
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typeRow}
        style={styles.typeScroll}
      >
        {SCAN_TYPES.map((t) => {
          const active = t.key === documentType;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                haptics.tap();
                setDocumentType(t.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.typeChip, active && styles.typeChipActive]}
            >
              <Ionicons name={t.icon} size={15} color={active ? colors.inkInverse : colors.primary} />
              <Txt variant="label" color={active ? colors.inkInverse : colors.ink} style={styles.typeChipText}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      <Txt variant="caption" color={colors.inkSecondary} style={styles.typeHint}>
        {selected.hint}
      </Txt>

      <Pressable
        onPress={() => navigation.navigate('Camera', { documentType })}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={[styles.option, styles.optionPrimary]}>
          <IconBadge icon="scan" color={colors.primary} tint={colors.primarySoft} size={52} />
          <View style={styles.optionText}>
            <View style={styles.titleRow}>
              <Txt variant="heading">{isStatement ? 'Scan statement' : documentType === 'invoice' ? 'Scan invoice' : 'Scan document'}</Txt>
              <View style={styles.aiChip}>
                <Txt variant="overline" color={colors.primary} style={styles.chipText}>
                  AI
                </Txt>
              </View>
            </View>
            <Txt variant="caption" color={colors.inkSecondary}>
              {isStatement
                ? 'Photograph each page of the statement'
                : documentType === 'invoice'
                  ? 'Photograph each page of the invoice'
                  : 'Receipts, statements, invoices, bills and wallet screenshots'}
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
              {multiPage ? 'Pick one or more photos' : 'Use a photo you already have'}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </Card>
      </Pressable>

      {offersPdf && (
        <Pressable onPress={choosePdf} style={({ pressed }) => [pressed && styles.pressed]}>
          <Card style={styles.option}>
            <IconBadge icon="document-attach" color={colors.warning} tint={colors.warningSoft} size={52} />
            <View style={styles.optionText}>
              <Txt variant="heading">Upload a PDF</Txt>
              <Txt variant="caption" color={colors.inkSecondary}>
                Statements and invoices, any number of pages
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
          </Card>
        </Pressable>
      )}

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
        {(isStatement ? STATEMENT_TIPS : TIPS).map((tip, i) => (
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
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.xl },
  pickerLabel: { marginBottom: spacing.sm },
  typeScroll: { marginHorizontal: -spacing.xl },
  typeRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { marginLeft: 6 },
  typeHint: { marginTop: spacing.sm, marginBottom: spacing.xl },
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
