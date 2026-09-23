import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar, StatusBarStyle } from 'expo-status-bar';

/** Status bar that only applies while its screen is focused, so screens can differ. */
export default function FocusStatusBar({ style }: { style: StatusBarStyle }) {
  return useIsFocused() ? <StatusBar style={style} /> : null;
}
