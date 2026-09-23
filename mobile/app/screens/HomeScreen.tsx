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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
      <StatusBar barStyle="light-content" backgroundColor="#164A30" />

      {/* Header */}
      <LinearGradient colors={['#1F6E45', '#164A30']} style={styles.header}>
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
            <Ionicons name="sparkles" size={14} color="#FFFFFF" style={styles.insightsIcon} />
            <Text style={styles.insightsButtonText}>Insights</Text>
          </TouchableOpacity>
        </View>
        {records.length > 0 && (
          <View style={styles.totalCard}>
            <View style={styles.totalIconBadge}>
              <Ionicons name="wallet" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.totalLabel}>Total tracked</Text>
              <Text style={styles.totalValue}>
                {currency} {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>

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
                <View style={styles.emptyIconCircle}>
                  <Ionicons
                    name={state === 'error' ? 'cloud-offline' : 'receipt-outline'}
                    size={36}
                    color="#1B5E3B"
                  />
                </View>
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
          onPress={() => navigation.navigate('AddExpense')}
          activeOpacity={0.85}
          style={styles.primaryButtonWrapper}
        >
          <LinearGradient colors={['#1F6E45', '#164A30']} style={styles.primaryButton}>
            <Ionicons name="add" size={20} color="#FFFFFF" style={styles.primaryButtonIcon} />
            <Text style={styles.primaryButtonText}>Add Expense</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.footerNote}>Track your spending in PKR</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#164A30',
  },
  header: {
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
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 13,
    color: '#A8D5B8',
    marginTop: 4,
  },
  insightsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  insightsIcon: {
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
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  totalLabel: {
    fontSize: 11,
    color: '#A8D5B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  content: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E3F3E9',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#8B94A0',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  footer: {
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 16,
    alignItems: 'center',
  },
  primaryButtonWrapper: {
    width: '100%',
    borderRadius: 14,
    shadowColor: '#164A30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonIcon: {
    marginRight: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#AAAAAA',
  },
});
