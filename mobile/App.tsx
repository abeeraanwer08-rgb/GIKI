import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import AppNavigator from './app/navigation/AppNavigator';
import AuthScreen from './app/screens/AuthScreen';
import VerifyEmailScreen from './app/screens/VerifyEmailScreen';
import { AuthProvider, useAuth } from './app/auth/AuthContext';
import Splash from './app/ui/Splash';
import { colors } from './app/ui/theme';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.border,
  },
};

/**
 * Signed-out users see only the sign-in screen. The navigator is unmounted on sign-out,
 * so no screen keeps the previous user's data in memory for the next person.
 */
function Root() {
  const { status } = useAuth();
  if (status === 'loading') return null; // the splash covers this moment
  if (status === 'signedOut') return <AuthScreen />;
  if (status === 'unverified') return <VerifyEmailScreen />;
  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="dark" />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const hideSplash = useCallback(() => setShowSplash(false), []);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
      {showSplash && <Splash onDone={hideSplash} />}
    </SafeAreaProvider>
  );
}
