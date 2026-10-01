import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { BudgetOverview, FinancialRecordSummary, MonthForecast } from '../types/insights';
import { fetchBudgets, fetchFinancialRecords, fetchSummary } from '../services/insightsService';
import TransactionRow from '../components/home/TransactionRow';
import TransactionSheet from '../components/home/TransactionSheet';
import ProfileSheet, { Avatar } from '../components/home/ProfileSheet';
import { useAuth } from '../auth/AuthContext';
import { haptics } from '../ui/haptics';
import { getCategoryStyle } from '../utils/categoryStyle';
import { capitalize, dayLabel, formatMoney, greeting, isSameMonth } from '../utils/format';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import IconBadge from '../ui/IconBadge';
import SectionHeader from '../ui/SectionHeader';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import FocusStatusBar from '../ui/FocusStatusBar';
import Logo from '../ui/Logo';
import { FadeIn, useCountUp } from '../ui/motion';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

type LoadState = 'loading' | 'loaded' | 'error';

type CategoryShare = { category: string; amount: number; share: number; color: string };

/** Count up only once data has arrived, so the skeleton never flashes a stale 0. */
function loadedTotal(state: LoadState, total: number): number {
  return state === 'loaded' ? total : 0;
}

function groupByDay(records: FinancialRecordSummary[]) {
  const groups: { label: string; items: FinancialRecordSummary[] }[] = [];
  for (const record of records) {
    const label = dayLabel(record.transaction_date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(record);
    else groups.push({ label, items: [record] });
  }
  return groups;
}

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [records, setRecords] = useState<FinancialRecordSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [forecast, setForecast] = useState<MonthForecast | null>(null);
  const [budgets, setBudgets] = useState<BudgetOverview | null>(null);
  const [selected, setSelected] = useState<FinancialRecordSummary | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Forecast and budgets are extras: Home still works if either is unavailable.
    const [recordsResult, summaryResult, budgetsResult] = await Promise.allSettled([
      fetchFinancialRecords(),
      fetchSummary(),
      fetchBudgets(),
    ]);
    if (recordsResult.status === 'fulfilled') {
      setRecords(recordsResult.value);
      setState('loaded');
    } else {
      setState('error');
    }
    setForecast(summaryResult.status === 'fulfilled' ? summaryResult.value.current_month : null);
    setBudgets(budgetsResult.status === 'fulfilled' ? budgetsResult.value : null);
    setRefreshing(false);
  }, []);

  // Refetch whenever Home regains focus (e.g. after saving an expense).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const currency = records.find((r) => r.currency)?.currency ?? 'PKR';
  const allTimeTotal = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const monthTotal = records
    .filter((r) => isSameMonth(r.transaction_date))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const categoryShares = useMemo<CategoryShare[]>(() => {
    const totals = new Map<string, number>();
    for (const r of records) {
      const key = r.category || 'other';
      totals.set(key, (totals.get(key) ?? 0) + (r.amount ?? 0));
    }
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    return [...totals.entries()]
      .map(([category, amount]) => ({
        category,
        amount,
        share: sum > 0 ? amount / sum : 0,
        color: getCategoryStyle(category).onDark,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [records]);

  const filterOptions = useMemo(
    () => [...new Set(records.map((r) => r.category).filter((c): c is string => !!c))],
    [records],
  );
  const visibleRecords = useMemo(
    () => (filter ? records.filter((r) => r.category === filter) : records),
    [records, filter],
  );
  const groups = useMemo(() => groupByDay(visibleRecords), [visibleRecords]);
  const animatedMonthTotal = useCountUp(loadedTotal(state, monthTotal));
  const loading = state === 'loading';

  return (
    <View style={styles.screen}>
      <FocusStatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.inkInverse}
          />
        }
      >
        {/* ── Hero ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
        >
          <View style={styles.brandRow}>
            <Logo size={32} />
            <Txt variant="bodyStrong" color={colors.inkInverse}>
              HissabAI
            </Txt>
            <View style={styles.flex} />
            <Pressable
              onPress={() => setProfileOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              hitSlop={8}
            >
              <Avatar name={user?.name ?? ''} />
            </Pressable>
          </View>

          <Txt variant="caption" color={colors.inkInverseMuted} style={styles.greeting}>
            {greeting()}
            {user ? `, ${user.name.trim().split(/\s+/)[0]}` : ''}
          </Txt>
          <Txt variant="title" color={colors.inkInverse}>
            Here’s your spending
          </Txt>

          <View style={styles.balanceCard}>
            <Txt variant="overline" color={colors.inkInverseMuted}>
              Spent this month
            </Txt>
            {loading ? (
              <Skeleton width={180} height={38} style={styles.skeletonOnDark} />
            ) : (
              <Txt variant="display" color={colors.inkInverse} style={styles.balance}>
                {formatMoney(animatedMonthTotal, currency)}
              </Txt>
            )}
            {forecast && forecast.projected_total > 0 && (
              <View style={styles.forecastChip}>
                <Ionicons name="trending-up" size={14} color={colors.gold} />
                <Txt variant="caption" color={colors.inkInverse} style={styles.forecastText}>
                  On pace for {formatMoney(forecast.projected_total, currency)} by month end
                </Txt>
              </View>
            )}

            {categoryShares.length > 0 && (
              <>
                <View style={styles.stackedBar}>
                  {categoryShares.map((c) => (
                    <View
                      key={c.category}
                      style={{ flex: Math.max(c.share, 0.02), backgroundColor: c.color }}
                    />
                  ))}
                </View>
                <View style={styles.legend}>
                  {categoryShares.slice(0, 3).map((c) => (
                    <View key={c.category} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                      <Txt variant="caption" color={colors.inkInverseMuted}>
                        {capitalize(c.category)} {Math.round(c.share * 100)}%
                      </Txt>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Txt variant="caption" color={colors.inkInverseMuted}>
                  All time
                </Txt>
                <Txt variant="bodyStrong" color={colors.inkInverse}>
                  {loading ? '—' : formatMoney(allTimeTotal, currency)}
                </Txt>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Txt variant="caption" color={colors.inkInverseMuted}>
                  Records
                </Txt>
                <Txt variant="bodyStrong" color={colors.inkInverse}>
                  {loading ? '—' : records.length}
                </Txt>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* ── Budget alert ───────────────────────────────────── */}
          {budgets && budgets.alerts > 0 && (
            <Pressable
              onPress={() => navigation.navigate('Budgets')}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Card style={styles.alertCard}>
                <IconBadge icon="alert-circle" color={colors.warning} tint={colors.surface} size={40} />
                <View style={styles.alertText}>
                  <Txt variant="bodyStrong">
                    {budgets.alerts} {budgets.alerts === 1 ? 'budget needs' : 'budgets need'} attention
                  </Txt>
                  <Txt variant="caption" color={colors.inkSecondary} numberOfLines={1}>
                    {budgets.budgets
                      .filter((b) => b.status !== 'on_track')
                      .map((b) => `${capitalize(b.category)} ${Math.round(b.percent_used)}%`)
                      .join(' · ')}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.warning} />
              </Card>
            </Pressable>
          )}

          {/* ── Quick actions ──────────────────────────────────── */}
          <FadeIn index={1} style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.actionPress, pressed && styles.pressed]}
              onPress={() => navigation.navigate('Camera')}
            >
              <Card style={styles.actionCard}>
                <IconBadge icon="scan" color={colors.primary} tint={colors.primarySoft} />
                <Txt variant="bodyStrong" style={styles.actionTitle}>
                  Scan receipt
                </Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  AI reads it for you
                </Txt>
              </Card>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionPress, pressed && styles.pressed]}
              onPress={() => navigation.navigate('Assistant')}
            >
              <Card style={styles.actionCard}>
                <IconBadge icon="chatbubbles" color={colors.info} tint={colors.infoSoft} />
                <Txt variant="bodyStrong" style={styles.actionTitle}>
                  Ask HissabAI
                </Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  English · اردو
                </Txt>
              </Card>
            </Pressable>
          </FadeIn>

          {/* ── Activity ───────────────────────────────────────── */}
          <SectionHeader
            title="Recent activity"
            subtitle={
              state === 'loaded' && records.length > 0
                ? `${records.length} transaction${records.length === 1 ? '' : 's'}`
                : undefined
            }
          />

          {state === 'loaded' && filterOptions.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {[null, ...filterOptions].map((c) => {
                const active = c === filter;
                const cat = c ? getCategoryStyle(c) : null;
                const tint = cat?.color ?? colors.primary;
                return (
                  <Pressable
                    key={c ?? 'all'}
                    onPress={() => {
                      haptics.tap();
                      setFilter(c);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.filterChip, active && { backgroundColor: tint, borderColor: tint }]}
                  >
                    {cat && <Ionicons name={cat.icon} size={14} color={active ? colors.inkInverse : tint} />}
                    <Txt
                      variant="caption"
                      color={active ? colors.inkInverse : colors.inkSecondary}
                      style={[styles.filterText, cat && styles.filterTextIcon]}
                    >
                      {c ? capitalize(c) : 'All'}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {loading ? (
            <Card>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={42} height={42} rounded={13} />
                  <View style={styles.skeletonText}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="35%" height={11} style={styles.skeletonGap} />
                  </View>
                </View>
              ))}
            </Card>
          ) : state === 'error' ? (
            <Card>
              <EmptyState
                icon="cloud-offline"
                tone="danger"
                title="Couldn’t load your expenses"
                body="Check your connection and try again."
                actionLabel="Try again"
                onAction={() => {
                  setState('loading');
                  load();
                }}
              />
            </Card>
          ) : records.length === 0 ? (
            <Card>
              <EmptyState
                icon="receipt-outline"
                title="No expenses yet"
                body="Scan your first receipt and HissabAI will extract the merchant, items and total for you."
                actionLabel="Scan your first receipt"
                onAction={() => navigation.navigate('Camera')}
              />
            </Card>
          ) : (
            groups.map((group, gi) => (
              <FadeIn key={group.label} index={gi + 2} style={styles.group}>
                <Txt variant="overline" color={colors.inkMuted} style={styles.groupLabel}>
                  {group.label}
                </Txt>
                <Card padded={false}>
                  {group.items.map((record, i) => (
                    <TransactionRow
                      key={record.id}
                      record={record}
                      isFirst={i === 0}
                      isLast={i === group.items.length - 1}
                      onPress={setSelected}
                    />
                  ))}
                </Card>
              </FadeIn>
            ))
          )}
        </View>
      </ScrollView>

      <ProfileSheet
        user={user}
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSignOut={() => {
          setProfileOpen(false);
          signOut();
        }}
      />

      <TransactionSheet
        record={selected}
        budgetedCategories={budgets?.budgets.map((b) => b.category) ?? []}
        onClose={() => setSelected(null)}
        onSetBudget={(category) => {
          setSelected(null);
          navigation.navigate('Budgets', { newBudgetCategory: category });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },
  hero: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greeting: { marginTop: spacing.xxl },
  balanceCard: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  balance: { marginTop: spacing.xs },
  forecastChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  forecastText: { marginLeft: 6 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.warningSoft,
  },
  alertText: { flex: 1, marginHorizontal: spacing.md },
  skeletonOnDark: { marginTop: spacing.sm, backgroundColor: 'rgba(255,255,255,0.2)' },
  stackedBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
    marginTop: spacing.lg,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  stat: { flex: 1 },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: spacing.lg,
  },
  body: { paddingHorizontal: spacing.xl },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionPress: { flex: 1 },
  actionCard: { padding: spacing.lg },
  actionTitle: { marginTop: spacing.md },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  filterScroll: { marginHorizontal: -spacing.xl, marginBottom: spacing.md },
  filterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterText: { fontFamily: fonts.medium },
  filterTextIcon: { marginLeft: 5 },
  group: { marginBottom: spacing.lg },
  groupLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skeletonText: { flex: 1, marginLeft: spacing.md },
  skeletonGap: { marginTop: spacing.sm },
});
