import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BudgetOverview, BudgetState, BudgetStatus } from '../types/insights';
import { deleteBudget, fetchBudgets, setBudget } from '../services/insightsService';
import BudgetSheet from '../components/budgets/BudgetSheet';
import { getCategoryStyle } from '../utils/categoryStyle';
import { capitalize, formatMoney, monthName } from '../utils/format';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import IconBadge from '../ui/IconBadge';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import FocusStatusBar from '../ui/FocusStatusBar';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type LoadState = 'loading' | 'loaded' | 'error';

const STATE_STYLE: Record<BudgetState, { color: string; tint: string; label: string }> = {
  on_track: { color: colors.primary, tint: colors.primarySoft, label: 'On track' },
  warning: { color: colors.warning, tint: colors.warningSoft, label: 'Close to limit' },
  over: { color: colors.danger, tint: colors.dangerSoft, label: 'Over budget' },
};

function BudgetRow({ budget, currency, onPress }: { budget: BudgetStatus; currency: string; onPress: () => void }) {
  const style = getCategoryStyle(budget.category);
  const state = STATE_STYLE[budget.status];
  const over = budget.remaining < 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.budgetCard}>
        <View style={styles.budgetTop}>
          <IconBadge icon={style.icon} color={style.color} tint={style.tint} size={42} />
          <View style={styles.budgetText}>
            <Txt variant="bodyStrong">{capitalize(budget.category)}</Txt>
            <Txt variant="caption" color={colors.inkMuted}>
              {formatMoney(budget.spent, currency)} of {formatMoney(budget.monthly_limit, currency)}
            </Txt>
          </View>
          <View style={[styles.statePill, { backgroundColor: state.tint }]}>
            <Txt variant="caption" color={state.color} style={styles.statePillText}>
              {Math.round(budget.percent_used)}%
            </Txt>
          </View>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(Math.max(budget.percent_used, 2), 100)}%`, backgroundColor: state.color },
            ]}
          />
        </View>
        <View style={styles.budgetBottom}>
          <Txt variant="caption" color={state.color} style={styles.stateLabel}>
            {state.label}
          </Txt>
          <Txt variant="caption" color={over ? colors.danger : colors.inkSecondary}>
            {over
              ? `${formatMoney(-budget.remaining, currency)} over`
              : `${formatMoney(budget.remaining, currency)} left`}
          </Txt>
        </View>
      </Card>
    </Pressable>
  );
}

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<{ category: string; monthlyLimit: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await fetchBudgets());
      setState('loaded');
    } catch {
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openSheet = (budget: BudgetStatus | null) => {
    setEditing(budget ? { category: budget.category, monthlyLimit: budget.monthly_limit } : null);
    setSheetError(null);
    setSheetOpen(true);
  };

  const mutate = async (action: () => Promise<BudgetOverview>) => {
    setSaving(true);
    setSheetError(null);
    try {
      setOverview(await action());
      setState('loaded');
      setSheetOpen(false);
    } catch {
      setSheetError('Could not save the budget. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const currency = overview?.currency ?? 'PKR';
  const budgets = overview?.budgets ?? [];
  const totalPercent =
    overview && overview.total_limit > 0 ? (overview.total_spent / overview.total_limit) * 100 : 0;

  return (
    <View style={styles.screen}>
      <FocusStatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.flex}>
            <Txt variant="overline" color={colors.primary}>
              Monthly limits
            </Txt>
            <Txt variant="title" style={styles.headerTitle}>
              Budgets
            </Txt>
          </View>
          {state === 'loaded' && (
            <Pressable
              onPress={() => openSheet(null)}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel="Add budget"
            >
              <Ionicons name="add" size={22} color={colors.inkInverse} />
            </Pressable>
          )}
        </View>

        {state === 'loading' ? (
          <>
            <Skeleton height={150} rounded={radius.xl} />
            <Skeleton height={110} rounded={radius.xl} style={styles.gapTop} />
            <Skeleton height={110} rounded={radius.xl} style={styles.gapTop} />
          </>
        ) : state === 'error' ? (
          <Card>
            <EmptyState
              icon="cloud-offline"
              tone="danger"
              title="Couldn’t load budgets"
              body="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => {
                setState('loading');
                load();
              }}
            />
          </Card>
        ) : budgets.length === 0 ? (
          <Card>
            <EmptyState
              icon="pie-chart-outline"
              title="No budgets yet"
              body="Set a monthly limit for a category and HissabAI will warn you when you get close."
              actionLabel="Create your first budget"
              onAction={() => openSheet(null)}
            />
          </Card>
        ) : (
          <>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
              <Txt variant="overline" color={colors.inkInverseMuted}>
                {monthName(overview!.month)} budget
              </Txt>
              <View style={styles.summaryAmounts}>
                <Txt variant="display" color={colors.inkInverse}>
                  {formatMoney(overview!.total_spent, null)}
                </Txt>
                <Txt variant="body" color={colors.inkInverseMuted} style={styles.summaryOf}>
                  of {formatMoney(overview!.total_limit, currency)}
                </Txt>
              </View>
              <View style={styles.summaryTrack}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.min(Math.max(totalPercent, 2), 100)}%`, backgroundColor: colors.gold },
                  ]}
                />
              </View>
              <View style={styles.summaryFooter}>
                <Ionicons
                  name={overview!.alerts > 0 ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={overview!.alerts > 0 ? colors.gold : '#6EE7B7'}
                />
                <Txt variant="caption" color={colors.inkInverse} style={styles.summaryFooterText}>
                  {overview!.alerts > 0
                    ? `${overview!.alerts} ${overview!.alerts === 1 ? 'budget needs' : 'budgets need'} attention`
                    : 'All budgets on track'}
                </Txt>
              </View>
            </LinearGradient>

            <View style={styles.list}>
              {budgets.map((b) => (
                <BudgetRow key={b.category} budget={b} currency={currency} onPress={() => openSheet(b)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <BudgetSheet
        visible={sheetOpen}
        editing={editing}
        taken={budgets.map((b) => b.category)}
        saving={saving}
        error={sheetError}
        onClose={() => setSheetOpen(false)}
        onSave={(category, limit) => mutate(() => setBudget(category, limit))}
        onDelete={(category) => mutate(() => deleteBudget(category))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.xl },
  headerTitle: { marginTop: 2 },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapTop: { marginTop: spacing.md },
  summary: { borderRadius: radius.xl, padding: spacing.xl },
  summaryAmounts: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: spacing.xs },
  summaryOf: { marginLeft: spacing.sm },
  summaryTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  summaryFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  summaryFooterText: { marginLeft: 6 },
  list: { marginTop: spacing.lg, gap: spacing.md },
  budgetCard: { padding: spacing.lg },
  budgetTop: { flexDirection: 'row', alignItems: 'center' },
  budgetText: { flex: 1, marginHorizontal: spacing.md },
  statePill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statePillText: { fontFamily: fonts.bold },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  fill: { height: '100%', borderRadius: 4 },
  budgetBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  stateLabel: { fontFamily: fonts.semibold },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
