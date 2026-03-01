import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import 'react-native-reanimated';

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ThemeProvider as AppThemeProvider, useTheme } from '../context/ThemeContext';
import { TenantProvider } from '../context/TenantContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootLayoutNav() {
  const router = useRouter();
  try {
    const { theme } = useTheme();

    useEffect(() => {
      // Handle notifications received while app is running
      const notificationListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification Received in Foreground:', notification);
      });

      // Handle notification taps
      const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log('Notification Tapped:', data);
        if (data?.screen) {
          const screen = data.screen as string;
          const params = (data as any).params;
          if (screen === 'homework/[id]' && params?.id) {
            router.push({ pathname: '/homework/[id]', params: { id: params.id } });
          } else {
            router.push(screen as any);
          }
        }
      });

      return () => {
        notificationListener.remove();
        responseListener.remove();
      };
    }, []);

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
          <Stack.Screen name="fees" />
          <Stack.Screen name="fee-detail" />
        </Stack>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    );
  } catch (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <Text style={{ color: '#fff' }}>Bootstrap Error</Text>
      </View>
    );
  }
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TenantProvider>
        <AppThemeProvider>
          <RootLayoutNav />
        </AppThemeProvider>
      </TenantProvider>
    </GestureHandlerRootView>
  );
}
