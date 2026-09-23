import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { FinancialRecordSummary } from '../types/insights';
import { fetchFinancialRecords } from '../services/insightsService';
import TransactionRow from '../components/home/TransactionRow';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function HomeScreen({ navigation }: Props) {
  const [records, setRecords] = useState<FinancialRecordSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchFinancialRecords();
      setRecords(result);
      setState('loaded');
    } catch {
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refetch every time Home regains focus (e.g. after saving an expense).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const total = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const currency = records.find((r) => r.currency)?.currency ?? 'PKR';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E3B" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.appName}>KharchAI</Text>
            <Text style={styles.tagline}>Your AI-powered financial copilot</Text>
          </View>
          <TouchableOpacity
            style={styles.insightsButton}
            onPress={() => navigation.navigate('Insights')}
            activeOpacity={0.8}
          >
            <Text style={styles.insightsButtonIcon}>✨</Text>
            <Text style={styles.insightsButtonText}>Insights</Text>
          </TouchableOpacity>
        </View>
        {records.length > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total tracked</Text>
            <Text style={styles.totalValue}>
              {currency} {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
        )}
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {state === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#1B5E3B" size="large" />
          </View>
        ) : records.length === 0 ? (
          <FlatList
            data={[]}
            renderItem={null}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>📊</Text>
                <Text style={styles.emptyStateTitle}>
                  {state === 'error' ? "Couldn't load your expenses" : 'No expenses yet'}
                </Text>
                <Text style={styles.emptyStateText}>
                  {state === 'error'
                    ? 'Pull down to try again, or check your connection.'
                    : 'Your expenses will appear here once you start adding them. Track your spending in PKR with AI-powered receipt scanning.'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.emptyListContent}
          />
        ) : (
          <>
            <Text style={styles.sectionHeading}>Recent Transactions</Text>
            <FlatList
              data={records}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <TransactionRow record={item} />}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContent}
            />
          </>
        )}
      </View>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('AddExpense')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>+ Add Expense</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>Track your spending in PKR</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1B5E3B',
  },
  header: {
    backgroundColor: '#1B5E3B',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: '#A8D5B8',
    marginTop: 4,
  },
  insightsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  insightsButtonIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  insightsButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  totalCard: {
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
  },
  totalLabel: {
    fontSize: 12,
    color: '#A8D5B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyStateIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  footer: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#1B5E3B',
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#1B5E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#AAAAAA',
  },
});
