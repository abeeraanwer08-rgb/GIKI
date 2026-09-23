import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { InsightsResponse } from '../types/insights';
import { askInsights, ApiError, fetchInsights } from '../services/insightsService';
import ChatBubble, { ChatMessage } from '../components/insights/ChatBubble';
import { getCategoryStyle } from '../utils/categoryStyle';
import { capitalize, formatMoney } from '../utils/format';
import Txt from '../ui/Txt';
import Card from '../ui/Card';
import IconBadge from '../ui/IconBadge';
import SectionHeader from '../ui/SectionHeader';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import DonutChart from '../ui/DonutChart';
import FocusStatusBar from '../ui/FocusStatusBar';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Insights'>,
  NativeStackScreenProps<RootStackParamList>
>;

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

const SUGGESTIONS = [
  'What did I spend the most on?',
  'How much went to groceries?',
  'Any bills I should watch?',
];

export default function InsightsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const nextId = useRef(0);

  const [data, setData] = useState<InsightsResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const asking = messages.some((m) => m.role === 'pending');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await fetchInsights();
      setData(result);
      setState(result.summary.record_count === 0 ? 'empty' : 'loaded');
    } catch {
      setState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || asking) return;

    const pendingId = nextId.current + 1;
    nextId.current += 2;
    setQuestion('');
    setMessages((prev) => [
      ...prev,
      { id: pendingId - 1, role: 'user', text: trimmed },
      { id: pendingId, role: 'pending', text: '' },
    ]);

    let reply: ChatMessage;
    try {
      const result = await askInsights(trimmed);
      reply = { id: pendingId, role: 'assistant', text: result.answer };
    } catch (error) {
      reply = {
        id: pendingId,
        role: 'error',
        text:
          error instanceof ApiError && error.status === 503
            ? 'AI insights are temporarily unavailable. Please try again shortly.'
            : 'Could not get an answer. Check your connection and try again.',
      };
    }
    setMessages((prev) => prev.map((m) => (m.id === pendingId ? reply : m)));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

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
          body="Save a few expenses first — insights are generated from your saved records."
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

        {/* ── Stat tiles ───────────────────────────────────── */}
        <View style={styles.tiles}>
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
        </View>

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

        {/* ── Ask KharchAI ─────────────────────────────────── */}
        <SectionHeader title="Ask KharchAI" subtitle="Answers are grounded in your saved records" />
        <Card>
          {messages.length === 0 ? (
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => ask(s)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                  <Txt variant="caption" color={colors.primaryDark} style={styles.chipText}>
                    {s}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.chat}>
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask about your spending…"
              placeholderTextColor={colors.inkMuted}
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => ask(question)}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => ask(question)}
              disabled={!question.trim() || asking}
              style={[styles.send, (!question.trim() || asking) && styles.sendDisabled]}
              accessibilityRole="button"
          accessibilityLabel="Send question"
            >
              <Ionicons name="arrow-up" size={20} color={colors.inkInverse} />
            </Pressable>
          </View>
        </Card>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FocusStatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        {header}
        {content}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  chips: { gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipPressed: { opacity: 0.75 },
  chipText: { marginLeft: 6, fontFamily: fonts.medium },
  chat: { marginBottom: spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
