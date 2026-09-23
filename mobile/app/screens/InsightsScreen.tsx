import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { InsightsResponse } from '../types/insights';
import { fetchInsights, askInsights, ApiError } from '../services/insightsService';
import SectionTitle from '../components/review/SectionTitle';
import CategoryBar from '../components/insights/CategoryBar';
import BulletList from '../components/insights/BulletList';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

export default function InsightsScreen() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

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

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const result = await askInsights(trimmed);
      setAnswer(result.answer);
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        setAskError('AI insights are temporarily unavailable. Please try again shortly.');
      } else {
        setAskError('Could not get an answer. Check your connection and try again.');
      }
    } finally {
      setAsking(false);
    }
  };

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#1B5E3B" size="large" />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <View style={[styles.emptyIconCircle, { backgroundColor: '#FBEAE8' }]}>
          <Ionicons name="cloud-offline" size={32} color="#C0392B" />
        </View>
        <Text style={styles.emptyTitle}>Couldn't load insights</Text>
        <Text style={styles.emptyText}>
          The AI insights service may be unavailable. Pull to refresh or try again shortly.
        </Text>
      </View>
    );
  }

  if (state === 'empty' || !data) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="sparkles" size={32} color="#1B5E3B" />
        </View>
        <Text style={styles.emptyTitle}>No insights yet</Text>
        <Text style={styles.emptyText}>
          Save a few expenses first — insights are generated from your saved records.
        </Text>
      </View>
    );
  }

  const { summary, headline, insights, recommendations } = data;
  const maxCategory = Math.max(0, ...summary.by_category.map((c) => c.total_amount));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <LinearGradient colors={['#1F6E45', '#123D28']} style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconBadge}>
              <Ionicons name="stats-chart" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.heroLabel}>Total spending</Text>
          </View>
          <Text style={styles.heroAmount}>
            {summary.currency ? `${summary.currency} ` : ''}
            {summary.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.heroMeta}>
            Across {summary.record_count} record{summary.record_count === 1 ? '' : 's'}
          </Text>
          <View style={styles.heroDivider} />
          <View style={styles.headlineRow}>
            <Ionicons name="bulb" size={15} color="#FFD782" style={styles.headlineIcon} />
            <Text style={styles.headline}>{headline}</Text>
          </View>
        </LinearGradient>

        {summary.by_category.length > 0 && (
          <>
            <SectionTitle title="Spending by Category" />
            <View style={styles.card}>
              {summary.by_category.map((category) => (
                <CategoryBar
                  key={category.category}
                  category={category}
                  maxAmount={maxCategory}
                  currency={summary.currency}
                />
              ))}
            </View>
          </>
        )}

        {insights.length > 0 && (
          <>
            <SectionTitle title="Insights" />
            <View style={styles.card}>
              <BulletList
                icon="bulb"
                iconColor="#B8860B"
                iconTint="#FBF2DA"
                items={insights}
              />
            </View>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <SectionTitle title="Recommendations" />
            <View style={styles.card}>
              <BulletList
                icon="checkmark-circle"
                iconColor="#1B5E3B"
                iconTint="#E3F3E9"
                items={recommendations}
              />
            </View>
          </>
        )}

        <SectionTitle title="Ask KharchAI" />
        <View style={styles.card}>
          <Text style={styles.askHint}>
            Ask a question about your spending — answers are grounded in your saved records.
          </Text>
          <View style={styles.askRow}>
            <TextInput
              style={styles.askInput}
              placeholder="e.g. What did I spend the most on?"
              placeholderTextColor="#A6ADB6"
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={handleAsk}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.askButton, (!question.trim() || asking) && styles.askButtonDisabled]}
              onPress={handleAsk}
              disabled={!question.trim() || asking}
              activeOpacity={0.85}
            >
              {asking ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="send" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          {askError && (
            <View style={styles.askErrorRow}>
              <Ionicons name="alert-circle" size={14} color="#C0392B" />
              <Text style={styles.askError}>{askError}</Text>
            </View>
          )}
          {answer && (
            <View style={styles.answerBox}>
              <View style={styles.answerIconBadge}>
                <Ionicons name="sparkles" size={13} color="#1B5E3B" />
              </View>
              <Text style={styles.answerText}>{answer}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
    padding: 32,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E3F3E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8B94A0',
    textAlign: 'center',
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 22,
    padding: 24,
    marginBottom: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  heroLabel: {
    fontSize: 12,
    color: '#A8D5B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroMeta: {
    fontSize: 12,
    color: '#A8D5B8',
    marginTop: 2,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 16,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headlineIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  headline: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  askHint: {
    fontSize: 12,
    color: '#8B94A0',
    marginBottom: 14,
    lineHeight: 18,
  },
  askRow: {
    flexDirection: 'row',
    gap: 8,
  },
  askInput: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A1A2E',
  },
  askButton: {
    backgroundColor: '#1B5E3B',
    borderRadius: 12,
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButtonDisabled: {
    opacity: 0.45,
  },
  askErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  askError: {
    fontSize: 12,
    color: '#C0392B',
    marginLeft: 6,
    flex: 1,
  },
  answerBox: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: '#E3F3E9',
    borderRadius: 14,
    padding: 14,
  },
  answerIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  answerText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A2E',
    lineHeight: 20,
  },
});
