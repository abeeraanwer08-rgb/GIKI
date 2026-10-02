import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { UFRItem, UniversalFinancialRecord } from '../types/ufr';
import {
  saveFinancialRecord,
  SaveError,
  SaveRecordPayload,
} from '../services/documentService';
import Field from '../components/review/Field';
import ItemRow from '../components/review/ItemRow';
import HintCard from '../components/review/HintCard';
import SummaryRow from '../components/review/SummaryRow';
import SuccessSheet from '../components/review/SuccessSheet';
import { generateUUID } from '../utils/uuid';
import { CATEGORIES, documentTypeLabel, getCategoryStyle } from '../utils/categoryStyle';
import { capitalize } from '../utils/format';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import Button from '../ui/Button';
import IconBadge from '../ui/IconBadge';
import SectionHeader from '../ui/SectionHeader';
import { colors, fonts, radius, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

type ConfidenceTone = { label: string; color: string; tint: string; icon: 'shield-checkmark' | 'shield-half' | 'alert-circle' };

/** Map a confidence label ("HIGH", "MEDIUM", "87%"…) to a display tone. */
function confidenceTone(confidence: string): ConfidenceTone {
  const value = confidence.trim().toUpperCase();
  const percent = value.endsWith('%') ? parseFloat(value) : NaN;
  const level =
    !Number.isNaN(percent)
      ? percent >= 80
        ? 'HIGH'
        : percent >= 60
          ? 'MEDIUM'
          : 'LOW'
      : value;

  if (level === 'HIGH' || level === 'GOOD') {
    return { label: 'High confidence', color: colors.primary, tint: colors.primarySoft, icon: 'shield-checkmark' };
  }
  if (level === 'MEDIUM') {
    return { label: 'Medium confidence', color: colors.warning, tint: colors.warningSoft, icon: 'shield-half' };
  }
  if (level === 'LOW') {
    return { label: 'Low confidence', color: colors.danger, tint: colors.dangerSoft, icon: 'alert-circle' };
  }
  return { label: 'Confidence unknown', color: colors.inkSecondary, tint: colors.surfaceMuted, icon: 'shield-half' };
}

// ── Amount / currency helpers ─────────────────────────────────────────────────

/** Parse a numeric amount from a formatted string such as "PKR 2,450" → 2450. */
function parseNumericAmount(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** "PKR 12,345.5" for a list of amount strings; used to keep a statement's total in step with its rows. */
function sumAmounts(items: UFRItem[], currency: string | null): string {
  const sum = items.reduce((acc, item) => acc + (parseNumericAmount(item.amount) ?? 0), 0);
  const formatted = (Math.round(sum * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

/** Extract a 2-4 letter ISO currency code from a formatted string such as "PKR 2,450" → "PKR". */
function parseCurrencyCode(s: string): string | null {
  const match = s.match(/\b([A-Z]{2,4})\b/);
  return match ? match[1] : null;
}

// ── UFR payload builder ───────────────────────────────────────────────────────

function buildSavePayload(
  recordId: string,
  editedMerchant: string,
  editedDate: string,
  editedTotal: string,
  editedItems: UFRItem[],
  ufr: UniversalFinancialRecord,
  category: string | null,
  confirmTotalMismatch: boolean = false,
): SaveRecordPayload {
  return {
    record_id: recordId,
    document_type: ufr.documentType,
    merchant: editedMerchant.trim() || null,
    document_date: editedDate.trim() || null,
    currency: parseCurrencyCode(editedTotal),
    total_amount: parseNumericAmount(editedTotal),
    payment_method: null,
    category,
    items: editedItems.map((item) => ({
      description: item.name,
      amount: parseNumericAmount(item.amount),
      quantity: null,
      unit_price: null,
      category: item.category ?? null,
      metadata: item.metadata ?? {},
    })),
    metadata: {
      source: ufr.source ?? 'receipt_analysis',
      details: ufr.details,
      confidence: null,
      confidence_level: ufr.confidence || null,
      review_required: null,
      review_hints: ufr.reviewHints.map((hint) => ({
        field: 'general',
        message: hint,
      })),
      quality_score: null,
      parser_version: 'mobile-review-v1',
      service_charge: parseNumericAmount(ufr.serviceCharge ?? ''),
      tax_amount: parseNumericAmount(ufr.taxAmount ?? ''),
      delivery_charge: parseNumericAmount(ufr.deliveryCharge ?? ''),
      discount_amount: parseNumericAmount(ufr.discountAmount ?? ''),
      subtotal_amount: parseNumericAmount(ufr.subtotalAmount ?? ''),
      confirm_total_mismatch: confirmTotalMismatch || undefined,
    },
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ReviewScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { imageUri, ufr: uploadedUfr } = route.params;
  const [ufr, setUfr] = useState<UniversalFinancialRecord | null>(null);

  // Editable local state — initialized from UFR when it loads.
  const [editedMerchant, setEditedMerchant] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedTotal, setEditedTotal] = useState('');
  const [editedItems, setEditedItems] = useState<UFRItem[]>([]);
  // Set once the backend confirms the save; drives the success sheet.
  const [savedCategory, setSavedCategory] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(1);
  // null = let HissabAI auto-categorise on save.
  const [category, setCategory] = useState<string | null>(null);

  // Save lifecycle state.
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Stable record ID — generated once when the UFR loads; reused on retry.
  const [recordId, setRecordId] = useState<string | null>(null);

  useEffect(() => {
    setUfr(uploadedUfr);
    setEditedMerchant(uploadedUfr.merchant);
    setEditedDate(uploadedUfr.date);
    setEditedTotal(uploadedUfr.total);
    setEditedItems(uploadedUfr.items);
    // Generate the record ID once; it does not change across save retries.
    setRecordId(generateUUID());
  }, [uploadedUfr]);

  const isStatement = (ufr?.documentType ?? uploadedUfr.documentType) === 'bank_statement';

  // A statement's total is always the sum of the rows kept, so dropping or
  // correcting a row can never leave the total out of step with them.
  const applyStatementItems = (items: UFRItem[]) => {
    setEditedItems(items);
    setEditedTotal(sumAmounts(items, parseCurrencyCode(editedTotal)));
  };

  const removeItem = (index: number) => {
    if (editedItems.length <= 1) return;
    applyStatementItems(editedItems.filter((_, i) => i !== index));
  };

  const updateItemName = (index: number, text: string) => {
    setEditedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: text } : item)),
    );
  };

  const updateItemAmount = (index: number, text: string) => {
    const next = editedItems.map((item, i) => (i === index ? { ...item, amount: text } : item));
    if (isStatement) applyStatementItems(next);
    else setEditedItems(next);
  };

  const doSave = async (confirmMismatch: boolean) => {
    if (isSaving || saved || !ufr || !recordId) return;

    const payload = buildSavePayload(
      recordId,
      editedMerchant,
      editedDate,
      editedTotal,
      editedItems,
      ufr,
      category,
      confirmMismatch,
    );

    setIsSaving(true);

    try {
      const result = await saveFinancialRecord(payload);

      // HTTP 201 — success.
      setSaved(true);
      setSavedCount(result.records_saved ?? 1);
      setSavedCategory(result.category ?? 'other');
    } catch (error) {
      if (error instanceof SaveError) {
        if (error.status === 409) {
          const body = error.body as {
            detail?: { error?: string; message?: string; record_id?: string };
          } | null;
          const errorCode = body?.detail?.error;

          if (errorCode === 'total_mismatch') {
            // Non-critical arithmetic mismatch — ask the user to confirm.
            Alert.alert(
              "Amounts don't fully match",
              "The item amounts do not fully reconcile with the final total. " +
                "This may be caused by GST, service charges, discounts, rounding, " +
                "or an extraction issue.",
              [
                {
                  text: 'Review Amounts',
                  style: 'cancel',
                  // Dismiss dialog; user stays on Review Screen to edit.
                },
                {
                  text: 'Save Anyway',
                  style: 'destructive',
                  onPress: () => doSave(true),
                },
              ],
            );
          } else if (errorCode === 'Financial record already exists') {
            // Duplicate — treat as already saved.
            setSaved(true);
            Alert.alert(
              'Already Saved',
              'This record has already been saved. No duplicate was created.',
              [{ text: 'OK', onPress: () => navigation.popToTop() }],
            );
          } else {
            Alert.alert(
              'Already Saved',
              'This record has already been saved. No duplicate was created.',
              [{ text: 'OK', onPress: () => navigation.popToTop() }],
            );
          }
        } else if (error.status === 422) {
          // Hard validation error — keep the user on the review screen with edits intact.
          const body = error.body as { detail?: { errors?: string[] } } | null;
          const details =
            body?.detail?.errors?.join('\n') ??
            'The record could not be validated. Please check your entries and try again.';
          Alert.alert('Validation Error', details);
        } else if (error.status === 503) {
          Alert.alert(
            'Temporarily Unavailable',
            'Saving is temporarily unavailable. Your edits are preserved — please try again shortly.',
          );
        } else {
          Alert.alert(
            'Save Failed',
            `An unexpected error occurred (HTTP ${error.status}). Your edits are preserved.`,
          );
        }
      } else {
        // Network / timeout error.
        Alert.alert(
          'Connection Error',
          (error as Error).message ||
            'Could not reach the server. Check your connection and try again.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => doSave(false);

  // Read-only values that are never edited.
  const documentType = ufr?.documentType ?? '';
  const confidence = ufr?.confidence ?? '';
  const reviewHints = ufr?.reviewHints ?? [];
  const tone = confidenceTone(confidence);

  // Charges summary — show only when at least one field is non-empty.
  const hasCharges =
    ufr &&
    [
      ufr.subtotalAmount,
      ufr.taxAmount,
      ufr.serviceCharge,
      ufr.deliveryCharge,
      ufr.discountAmount,
    ].some((v) => v);

  const saveButtonDisabled = isSaving || saved || !ufr;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Scanned document ─────────────────────────────── */}
        <Card padded={false} style={styles.imageCard}>
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          <View style={styles.docChip}>
            <Ionicons name="document-text" size={13} color={colors.inkInverse} />
            <Txt variant="caption" color={colors.inkInverse} style={styles.docChipText}>
              {documentTypeLabel(documentType)}
            </Txt>
          </View>
        </Card>

        {/* ── Confidence ───────────────────────────────────── */}
        <Card style={styles.confidenceCard}>
          <IconBadge icon={tone.icon} color={tone.color} tint={tone.tint} size={44} />
          <View style={styles.confidenceText}>
            <Txt variant="bodyStrong">{tone.label}</Txt>
            <Txt variant="caption" color={colors.inkSecondary}>
              AI extracted these details. Check them before saving.
            </Txt>
          </View>
        </Card>

        {reviewHints.length > 0 && (
          <Card style={styles.hintsCard}>
            <Txt variant="overline" color={colors.warning} style={styles.hintsTitle}>
              Worth a second look
            </Txt>
            {reviewHints.map((hint, i) => (
              <HintCard key={hint} hint={hint} isFirst={i === 0} />
            ))}
          </Card>
        )}

        {/* ── Editable details ─────────────────────────────── */}
        <SectionHeader title="Details" subtitle="Tap any field to correct it" />
        <Card>
          <Field
            label={isStatement ? 'Bank' : 'Merchant'}
            icon={isStatement ? 'business-outline' : 'storefront-outline'}
            value={editedMerchant}
            onChangeText={setEditedMerchant}
            placeholder={isStatement ? 'Bank name' : 'Store name'}
          />
          <Field
            label={isStatement ? 'Statement end date' : 'Date'}
            icon="calendar-outline"
            value={editedDate}
            onChangeText={setEditedDate}
            placeholder="YYYY-MM-DD"
          />
          <View style={styles.lastField}>
            <Field
              label={isStatement ? 'Total spent' : 'Total paid'}
              icon="cash-outline"
              value={editedTotal}
              onChangeText={isStatement ? () => {} : setEditedTotal}
              editable={!isStatement}
              placeholder="PKR 0"
              emphasize
            />
          </View>
        </Card>

        {/* ── Category ─────────────────────────────────────── */}
        {isStatement ? (
          <Card style={styles.statementNote}>
            <IconBadge icon="layers" color={colors.primary} tint={colors.primarySoft} size={40} />
            <View style={styles.confidenceText}>
              <Txt variant="bodyStrong">Categorised row by row</Txt>
              <Txt variant="caption" color={colors.inkSecondary}>
                Each spending row is filed under its own category. Remove any row that isn’t spending, such as a
                transfer between your own accounts.
              </Txt>
            </View>
          </Card>
        ) : (
          <>
        <SectionHeader title="Category" subtitle="Auto-detect uses the merchant and items" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {[null, ...CATEGORIES].map((c) => {
            const selected = c === category;
            const style = c ? getCategoryStyle(c) : null;
            const tint = style?.color ?? colors.primary;
            return (
              <Pressable
                key={c ?? 'auto'}
                onPress={() => setCategory(c)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && { backgroundColor: tint, borderColor: tint }]}
              >
                <Ionicons
                  name={style?.icon ?? 'sparkles'}
                  size={15}
                  color={selected ? colors.inkInverse : tint}
                />
                <Txt
                  variant="label"
                  color={selected ? colors.inkInverse : colors.ink}
                  style={styles.chipText}
                >
                  {c ? capitalize(c) : 'Auto-detect'}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
          </>
        )}

        {editedItems.length > 0 && (
          <>
            <SectionHeader
              title={isStatement ? 'Spending transactions' : 'Items'}
              subtitle={
                isStatement
                  ? `${editedItems.length} debit${editedItems.length === 1 ? '' : 's'} found · money in is not counted`
                  : `${editedItems.length} line item${editedItems.length === 1 ? '' : 's'} found`
              }
            />
            <Card style={styles.itemsCard}>
              {editedItems.map((item, index) => (
                <ItemRow
                  key={index}
                  index={index}
                  name={item.name}
                  amount={item.amount}
                  onChangeName={(text) => updateItemName(index, text)}
                  onChangeAmount={(text) => updateItemAmount(index, text)}
                  caption={isStatement ? statementCaption(item) : undefined}
                  onRemove={isStatement && editedItems.length > 1 ? () => removeItem(index) : undefined}
                />
              ))}
            </Card>
          </>
        )}

        {isStatement && ufr?.details && (
          <>
            <SectionHeader title="Statement summary" />
            <Card>
              {ufr.details.period_start || ufr.details.period_end ? (
                <SummaryRow
                  label="Period"
                  value={`${ufr.details.period_start ?? '—'} → ${ufr.details.period_end ?? '—'}`}
                />
              ) : null}
              {ufr.details.account_last4 ? (
                <SummaryRow label="Account" value={`•••• ${String(ufr.details.account_last4)}`} />
              ) : null}
              {typeof ufr.details.total_credits === 'number' ? (
                <SummaryRow
                  label={`Money in (${String(ufr.details.credit_count ?? 0)})`}
                  value={sumAmounts([{ name: '', amount: String(ufr.details.total_credits) }], parseCurrencyCode(editedTotal))}
                />
              ) : null}
              <SummaryRow label="Total spent" value={editedTotal} total />
            </Card>
          </>
        )}

        {hasCharges && (
          <>
            <SectionHeader title="Summary" />
            <Card>
              {ufr?.subtotalAmount ? <SummaryRow label="Subtotal" value={ufr.subtotalAmount} /> : null}
              {ufr?.taxAmount ? <SummaryRow label="GST / Tax" value={ufr.taxAmount} /> : null}
              {ufr?.serviceCharge ? (
                <SummaryRow label="Service charge" value={ufr.serviceCharge} />
              ) : null}
              {ufr?.deliveryCharge ? (
                <SummaryRow label="Delivery charge" value={ufr.deliveryCharge} />
              ) : null}
              {ufr?.discountAmount ? (
                <SummaryRow label="Discount" value={`− ${ufr.discountAmount}`} />
              ) : null}
              <SummaryRow label="Total" value={editedTotal} total />
            </Card>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          title={saved ? 'Saved' : 'Save expense'}
          icon={saved ? 'checkmark-done' : 'checkmark'}
          onPress={handleSave}
          loading={isSaving}
          disabled={saveButtonDisabled}
        />
      </View>

      <SuccessSheet
        visible={savedCategory !== null}
        merchant={editedMerchant}
        total={editedTotal}
        category={savedCategory ?? 'other'}
        savedCount={savedCount}
        onDone={() => navigation.popToTop()}
        onScanAnother={() => {
          navigation.popToTop();
          navigation.navigate('Camera');
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** Small caption under a statement row: its date and the date-less fallback. */
function statementCaption(item: UFRItem): string | undefined {
  const date = item.metadata?.date;
  return typeof date === 'string' && date ? date : undefined;
}

const styles = StyleSheet.create({
  statementNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  imageCard: { overflow: 'hidden' },
  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceMuted,
  },
  docChip: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  docChipText: { marginLeft: 5, fontFamily: fonts.semibold },
  confidenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  confidenceText: { flex: 1, marginLeft: spacing.md },
  hintsCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.warningSoft,
  },
  hintsTitle: { marginBottom: spacing.md },
  lastField: { marginBottom: -spacing.lg },
  itemsCard: { paddingVertical: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { marginLeft: 6 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
