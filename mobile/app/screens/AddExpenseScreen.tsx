import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';

type AddExpenseScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AddExpense'
>;

interface Props {
  navigation: AddExpenseScreenNavigationProp;
}

export default function AddExpenseScreen({ navigation }: Props) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>How would you like to add your expense?</Text>
      <Text style={styles.subheading}>
        Scan a receipt and our AI will extract the details for you automatically.
      </Text>

      {/* Primary action — Scan Receipt */}
      <TouchableOpacity
        style={styles.primaryCard}
        onPress={() => navigation.navigate('Camera')}
        activeOpacity={0.85}
      >
        <View style={styles.cardIconBadge}>
          <Ionicons name="camera" size={22} color="#1B5E3B" />
        </View>
        <View style={styles.cardTextContainer}>
          <Text style={styles.cardTitle}>Scan Receipt</Text>
          <Text style={styles.cardDescription}>
            Use your camera to scan a receipt — AI will fill in the details
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#1B5E3B" />
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>coming soon</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Disabled — Manual entry */}
      <View style={[styles.card, styles.disabledCard]}>
        <View style={[styles.cardIconBadge, styles.cardIconBadgeDisabled]}>
          <Ionicons name="create" size={22} color="#BBBBBB" />
        </View>
        <View style={styles.cardTextContainer}>
          <Text style={[styles.cardTitle, styles.disabledText]}>Enter Manually</Text>
          <Text style={[styles.cardDescription, styles.disabledText]}>
            Type in your expense details
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 24,
    paddingTop: 32,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1B5E3B',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  disabledCard: {
    opacity: 0.45,
  },
  cardIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E3F3E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardIconBadgeDisabled: {
    backgroundColor: '#F0F1F3',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 20,
  },
  disabledText: {
    color: '#BBBBBB',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8EDF2',
  },
  dividerText: {
    fontSize: 12,
    color: '#BBBBBB',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
