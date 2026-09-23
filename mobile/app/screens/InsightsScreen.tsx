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
        <Text style={styles.emptyIcon}>⚠️</Text>
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
        <Text style={styles.emptyIcon}>✨</Text>
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
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total spending</Text>
          <Text style={styles.heroAmount}>
            {summary.currency ? `${summary.currency} ` : ''}
            {summary.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.heroMeta}>
            Across {summary.record_count} record{summary.record_count === 1 ? '' : 's'}
          </Text>
          <Text style={styles.headline}>{headline}</Text>
        </View>

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
              <BulletList icon="💡" items={insights} />
            </View>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <SectionTitle title="Recommendations" />
            <View style={styles.card}>
              <BulletList icon="✅" items={recommendations} />
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
              placeholderTextColor="#AAAAAA"
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
                <Text style={styles.askButtonText}>Ask</Text>
              )}
            </TouchableOpacity>
          </View>
          {askError && <Text style={styles.askError}>{askError}</Text>}
          {answer && (
            <View style={styles.answerBox}>
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
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },
  heroCard: {
    backgroundColor: '#1B5E3B',
    borderRadius: 20,
    padding: 24,
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 12,
    color: '#A8D5B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  heroMeta: {
    fontSize: 12,
    color: '#A8D5B8',
    marginTop: 2,
  },
  headline: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  askHint: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 12,
    lineHeight: 18,
  },
  askRow: {
    flexDirection: 'row',
    gap: 8,
  },
  askInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A2E',
  },
  askButton: {
    backgroundColor: '#1B5E3B',
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButtonDisabled: {
    opacity: 0.5,
  },
  askButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  askError: {
    fontSize: 12,
    color: '#C0392B',
    marginTop: 10,
  },
  answerBox: {
    marginTop: 14,
    backgroundColor: '#EAF5EE',
    borderRadius: 10,
    padding: 14,
  },
  answerText: {
    fontSize: 14,
    color: '#1A1A2E',
    lineHeight: 20,
  },
});
