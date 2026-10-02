import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { InsightsResponse } from '../types/insights';
import { fetchInsights } from '../services/insightsService';
import { getCategoryStyle } from '../utils/categoryStyle';
import { PERIODS, PeriodKey, periodLabel, rangeFor } from '../utils/period';
import { haptics } from '../ui/haptics';
import { capitalize, formatMoney, formatShortDate, monthName } from '../utils/format';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import IconBadge from '../ui/IconBadge';
import SectionHeader from '../ui/SectionHeader';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import DonutChart from '../ui/DonutChart';
import Button from '../ui/Button';
import FocusStatusBar from '../ui/FocusStatusBar';
import { AnimatedBar, FadeIn } from '../ui/motion';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Insights'>,
  NativeStackScreenProps<RootStackParamList>
>;

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';


export default function InsightsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [period, setPeriod] = useState<PeriodKey>('all');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await fetchInsights(rangeFor(period));
      setData(result);
      setState(result.summary.record_count === 0 ? 'empty' : 'loaded');
    } catch {
      setState('error');
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Txt variant="overline" color={colors.primary}>
          AI copilot
        </Txt>
        <Txt variant="title" style={styles.headerTitle}>
          Insights
        </Txt>
      </View>
      <Pressable onPress={load} style={styles.refresh} accessibilityRole="button"
          accessibilityLabel="Refresh insights" hitSlop={8}>
        <Ionicons name="refresh" size={18} color={colors.inkSecondary} />
      </Pressable>
    </View>
  );

  const periodBar = (
    <View style={styles.periodRow}>
      {PERIODS.map((p) => {
        const active = p.key === period;
        return (
          <Pressable
            key={p.key}
            onPress={() => {
              if (p.key === period) return;
              haptics.tap();
              setPeriod(p.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.periodChip, active && styles.periodChipActive]}
          >
            <Txt variant="label" color={active ? colors.inkInverse : colors.inkSecondary}>
              {p.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );

  let content: React.ReactNode;

  if (state === 'loading') {
    content = (
      <>
        <Skeleton height={150} rounded={radius.xl} />
        <Skeleton height={280} rounded={radius.xl} style={styles.gapTop} />
        <Skeleton height={120} rounded={radius.xl} style={styles.gapTop} />
      </>
    );
  } else if (state === 'error') {
    content = (
      <Card>
        <EmptyState
          icon="cloud-offline"
          tone="danger"
          title="Couldn’t load insights"
          body="The AI insights service may be unavailable right now."
          actionLabel="Try again"
          onAction={load}
        />
      </Card>
    );
  } else if (state === 'empty' || !data) {
    content = (
      <Card>
        <EmptyState
          icon="sparkles"
          title="No insights yet"
          body={
            period === 'all'
              ? 'Save a few expenses first — insights are generated from your saved records.'
              : `No expenses in this period (${periodLabel(period).toLowerCase()}). Try a longer range.`
          }
          actionLabel="Scan a receipt"
          onAction={() => navigation.navigate('Camera')}
        />
      </Card>
    );
  } else {
    const { summary, headline, insights, recommendations } = data;
    const categories = [...summary.by_category].sort((a, b) => b.total_amount - a.total_amount);
    const average = summary.record_count > 0 ? summary.total_amount / summary.record_count : 0;
    const topMerchant = summary.top_merchants[0]?.category ?? '—';
    const forecast = summary.current_month;
    const segments = categories.map((c) => ({
      key: c.category,
      value: c.total_amount,
      color: getCategoryStyle(c.category).color,
    }));

    content = (
      <>
        {/* ── AI summary ───────────────────────────────────── */}
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summary}
        >
          <View style={styles.summaryTop}>
            <IconBadge icon="sparkles" color={colors.gold} tint="rgba(255,255,255,0.14)" size={32} />
            <Txt variant="overline" color={colors.inkInverseMuted} style={styles.summaryLabel}>
              AI summary
            </Txt>
          </View>
          <Txt variant="heading" color={colors.inkInverse} style={styles.headline}>
            {headline}
          </Txt>
        </LinearGradient>

        {/* ── Month-end forecast ──────────────────────────── */}
        {forecast && (
          <Card style={styles.forecast}>
            <View style={styles.forecastTop}>
              <IconBadge icon="trending-up" color={colors.info} tint={colors.infoSoft} size={38} />
              <View style={styles.forecastText}>
                <Txt variant="caption" color={colors.inkMuted}>
                  {monthName(forecast.month)} forecast
                </Txt>
                <Txt variant="heading">
                  On pace for {formatMoney(forecast.projected_total, summary.currency)}
                </Txt>
              </View>
            </View>
            <View style={styles.forecastTrack}>
              <AnimatedBar
                percent={(forecast.days_elapsed / forecast.days_in_month) * 100}
                color={colors.info}
                trackColor="transparent"
                height={6}
              />
            </View>
            <Txt variant="caption" color={colors.inkSecondary} style={styles.forecastMeta}>
              {formatMoney(forecast.spent_to_date, summary.currency)} spent in {forecast.days_elapsed} of{' '}
              {forecast.days_in_month} days
            </Txt>
          </Card>
        )}

        {/* ── Stat tiles ───────────────────────────────────── */}
        <FadeIn index={2} style={styles.tiles}>
          <Card style={styles.tile}>
            <Txt variant="caption" color={colors.inkMuted}>
              Transactions
            </Txt>
            <Txt variant="heading" style={styles.tileValue}>
              {summary.record_count}
            </Txt>
          </Card>
          <Card style={styles.tile}>
            <Txt variant="caption" color={colors.inkMuted}>
              Avg. spend
            </Txt>
            <Txt variant="heading" style={styles.tileValue} numberOfLines={1}>
              {formatMoney(average, null)}
            </Txt>
          </Card>
          <Card style={styles.tile}>
            <Txt variant="caption" color={colors.inkMuted}>
              Top merchant
            </Txt>
            <Txt variant="heading" style={styles.tileValue} numberOfLines={1}>
              {topMerchant}
            </Txt>
          </Card>
        </FadeIn>

        {/* ── Category breakdown ───────────────────────────── */}
        {segments.length > 0 && (
          <>
            <SectionHeader title="Where your money goes" subtitle="Share of total spending" />
            <Card>
              <View style={styles.donutWrap}>
                <DonutChart segments={segments} size={188} thickness={22}>
                  <Txt variant="overline" color={colors.inkMuted}>
                    Total {summary.currency ?? ''}
                  </Txt>
                  <Txt variant="title" style={styles.donutTotal}>
                    {formatMoney(summary.total_amount, null)}
                  </Txt>
                </DonutChart>
              </View>
              {categories.map((c, i) => {
                const style = getCategoryStyle(c.category);
                const share = summary.total_amount > 0 ? c.total_amount / summary.total_amount : 0;
                return (
                  <View
                    key={c.category}
                    style={[styles.legendRow, i > 0 && styles.legendDivider]}
                  >
                    <IconBadge icon={style.icon} color={style.color} tint={style.tint} size={34} />
                    <View style={styles.legendText}>
                      <Txt variant="label">{capitalize(c.category)}</Txt>
                      <Txt variant="caption" color={colors.inkMuted}>
                        {c.record_count} record{c.record_count === 1 ? '' : 's'}
                      </Txt>
                    </View>
                    <View style={styles.legendRight}>
                      <Txt variant="bodyStrong">{formatMoney(c.total_amount, summary.currency)}</Txt>
                      <Txt variant="caption" color={style.color} style={styles.share}>
                        {Math.round(share * 100)}%
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* ── Unusual spending ────────────────────────────── */}
        {summary.anomalies.length > 0 && (
          <>
            <SectionHeader title="Unusual spending" subtitle="Much higher than your usual for the category" />
            <Card>
              {summary.anomalies.map((a, i) => (
                <View key={`${a.record_id ?? i}`} style={[styles.anomalyRow, i > 0 && styles.legendDivider]}>
                  <IconBadge icon="warning" color={colors.danger} tint={colors.dangerSoft} size={36} />
                  <View style={styles.legendText}>
                    <Txt variant="label" numberOfLines={1}>
                      {a.merchant ?? capitalize(a.category)}
                    </Txt>
                    <Txt variant="caption" color={colors.inkMuted}>
                      {a.ratio}× your usual {formatMoney(a.typical_amount, summary.currency)} on{' '}
                      {a.category} · {formatShortDate(a.transaction_date)}
                    </Txt>
                  </View>
                  <Txt variant="bodyStrong" color={colors.danger}>
                    {formatMoney(a.amount, summary.currency)}
                  </Txt>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── Insights & recommendations ───────────────────── */}
        {insights.length > 0 && (
          <>
            <SectionHeader title="Key insights" />
            <Card>
              {insights.map((item, i) => (
                <View key={i} style={[styles.pointRow, i > 0 && styles.pointGap]}>
                  <IconBadge icon="bulb" color={colors.warning} tint={colors.warningSoft} size={30} />
                  <Txt variant="label" color={colors.inkSecondary} style={styles.pointText}>
                    {item}
                  </Txt>
                </View>
              ))}
            </Card>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <SectionHeader title="Recommendations" />
            <Card>
              {recommendations.map((item, i) => (
                <View key={i} style={[styles.pointRow, i > 0 && styles.pointGap]}>
                  <View style={styles.stepBadge}>
                    <Txt variant="overline" color={colors.primary} style={styles.stepNumber}>
                      {i + 1}
                    </Txt>
                  </View>
                  <Txt variant="label" color={colors.inkSecondary} style={styles.pointText}>
                    {item}
                  </Txt>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── Assistant CTA ───────────────────────────────── */}
        <Card style={styles.cta}>
          <IconBadge icon="chatbubbles" color={colors.primary} tint={colors.primarySoft} size={46} round />
          <View style={styles.ctaText}>
            <Txt variant="bodyStrong">Have a question?</Txt>
            <Txt variant="caption" color={colors.inkSecondary}>
              Ask HissabAI in English, اردو or Roman Urdu.
            </Txt>
          </View>
        </Card>
        <Button
          title="Open assistant"
          iconRight="arrow-forward"
          variant="secondary"
          onPress={() => navigation.navigate('Assistant')}
          style={styles.ctaButton}
        />
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <FocusStatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        {header}
        {periodBar}
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.xl,
  },
  headerTitle: { marginTop: 2 },
  refresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  gapTop: { marginTop: spacing.lg },
  summary: {
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  summaryLabel: { marginLeft: spacing.sm },
  headline: { marginTop: spacing.md, fontSize: 18, lineHeight: 26 },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tile: { flex: 1, padding: spacing.md },
  tileValue: { marginTop: spacing.xs },
  donutWrap: { alignItems: 'center', marginBottom: spacing.lg },
  donutTotal: { marginTop: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  legendDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendText: { flex: 1, marginLeft: spacing.md },
  legendRight: { alignItems: 'flex-end' },
  share: { fontFamily: fonts.semibold },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pointGap: { marginTop: spacing.lg },
  pointText: { flex: 1, marginLeft: spacing.md, marginTop: 4 },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontSize: 13, letterSpacing: 0 },
  forecast: { marginTop: spacing.md, padding: spacing.lg },
  forecastTop: { flexDirection: 'row', alignItems: 'center' },
  forecastText: { flex: 1, marginLeft: spacing.md },
  forecastTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  forecastMeta: { marginTop: spacing.sm },
  anomalyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  cta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxl, padding: spacing.lg },
  ctaText: { flex: 1, marginLeft: spacing.md },
  ctaButton: { marginTop: spacing.md },
});
