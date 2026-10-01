import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Txt from '../ui/Txt';
import { haptics } from '../ui/haptics';
import { colors, gradients, radius, shadow } from '../ui/theme';

type TabMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const TABS: Record<string, TabMeta> = {
  Home: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  Budgets: { label: 'Budgets', icon: 'pie-chart-outline', iconActive: 'pie-chart' },
  Insights: { label: 'Insights', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  Assistant: { label: 'Assistant', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
};

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const renderTab = (index: number) => {
    const route = state.routes[index];
    const meta = TABS[route.name];
    const focused = state.index === index;
    const tint = focused ? colors.primary : colors.inkMuted;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        haptics.tap();
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
      >
        <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={tint} />
        <Txt variant="overline" color={tint} style={styles.tabLabel}>
          {meta.label}
        </Txt>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {renderTab(0)}
        {renderTab(1)}
        <View style={styles.fabSlot} />
        {renderTab(2)}
        {renderTab(3)}
      </View>
      <Pressable
        onPress={() => {
          haptics.press();
          navigation.navigate('AddExpense');
        }}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
      >
        <LinearGradient colors={gradients.brandSoft} style={styles.fabFill}>
          <Ionicons name="add" size={30} color={colors.inkInverse} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const FAB = 62;

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    ...shadow.card,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabLabel: {
    marginTop: 4,
    letterSpacing: 0.4,
    textTransform: 'none',
  },
  fabSlot: {
    width: FAB + 8,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    top: -14,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: 4,
    borderColor: colors.bg,
    ...shadow.raised,
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
  fabFill: {
    flex: 1,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
