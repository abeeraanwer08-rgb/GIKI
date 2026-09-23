import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import CameraScreen from '../screens/CameraScreen';
import ReceiptPreviewScreen from '../screens/ReceiptPreviewScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import ReviewScreen from '../screens/ReviewScreen';
import InsightsScreen from '../screens/InsightsScreen';
import { UniversalFinancialRecord } from '../types/ufr';

export type RootStackParamList = {
  Home: undefined;
  Insights: undefined;
  AddExpense: undefined;
  Camera: undefined;
  ReceiptPreview: {
    /** Array of local image URIs — structured for multi-photo support in a future milestone */
    capturedImages: string[];
  };
  Processing: {
    capturedImages: string[];
  };
  Review: {
    imageUri: string;
    capturedImages: string[];
    ufr: UniversalFinancialRecord;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: '#1B5E3B' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#F8F9FA' },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ title: 'Insights' }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{ title: 'Add Expense' }}
      />
      {/* Full-screen camera — no header, custom top bar */}
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReceiptPreview"
        component={ReceiptPreviewScreen}
        options={{ title: 'Receipt Preview', headerStyle: { backgroundColor: '#1A1A2E' } }}
      />
      <Stack.Screen
        name="Processing"
        component={ProcessingScreen}
        options={{ title: 'Processing', headerBackVisible: false }}
      />
      <Stack.Screen
        name="Review"
        component={ReviewScreen}
        options={{ title: 'Review' }}
      />
    </Stack.Navigator>
  );
}
