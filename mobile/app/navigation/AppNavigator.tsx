import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import InsightsScreen from '../screens/InsightsScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import AssistantScreen from '../screens/AssistantScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import CameraScreen from '../screens/CameraScreen';
import ReceiptPreviewScreen from '../screens/ReceiptPreviewScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import ReviewScreen from '../screens/ReviewScreen';
import TabBar from './TabBar';
import { UniversalFinancialRecord } from '../types/ufr';
import { ScanDocumentType } from '../utils/scanType';
import { colors, fonts } from '../ui/theme';

export type TabParamList = {
  Home: undefined;
  /** `newBudgetCategory` opens the budget sheet pre-selected on that category. */
  Budgets: { newBudgetCategory?: string } | undefined;
  Insights: undefined;
  Assistant: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList> | undefined;
  AddExpense: undefined;
  /** `documentType` is what the user said they are scanning; omitted = auto-detect. */
  Camera: { documentType?: ScanDocumentType; existingImages?: string[] } | undefined;
  ReceiptPreview: {
    /** Array of local image URIs — structured for multi-photo support in a future milestone */
    capturedImages: string[];
    documentType?: ScanDocumentType;
  };
  Processing: {
    capturedImages: string[];
    documentType?: ScanDocumentType;
  };
  Review: {
    imageUri: string;
    capturedImages: string[];
    ufr: UniversalFinancialRecord;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Budgets" component={BudgetsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{ title: 'Add expense' }}
      />
      <Stack.Screen name="Camera" component={CameraScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ReceiptPreview"
        component={ReceiptPreviewScreen}
        options={{
          title: 'Preview',
          headerStyle: { backgroundColor: '#0B1220' },
          headerTintColor: colors.inkInverse,
          contentStyle: { backgroundColor: '#0B1220' },
        }}
      />
      <Stack.Screen
        name="Processing"
        component={ProcessingScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="Review"
        component={ReviewScreen}
        options={{ title: 'Review details' }}
      />
    </Stack.Navigator>
  );
}
