import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ThemeProvider as AppThemeProvider, useTheme } from '../context/ThemeContext';

function RootLayoutNav() {
  const { theme } = useTheme();

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="grade" />
        <Stack.Screen name="knowledge-graph" />
        <Stack.Screen name="hook" />
        <Stack.Screen name="reward" />
        <Stack.Screen name="solver" />
        <Stack.Screen name="exam" />
        <Stack.Screen name="poll" />
        <Stack.Screen name="poll-history" />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

import { TenantProvider } from '../context/TenantContext';

export default function RootLayout() {
  return (
    <TenantProvider>
      <AppThemeProvider>
        <RootLayoutNav />
      </AppThemeProvider>
    </TenantProvider>
  );
}
