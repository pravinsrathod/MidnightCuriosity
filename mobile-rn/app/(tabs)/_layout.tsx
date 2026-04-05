import React, { useCallback, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeature } from '../../context/TenantContext';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const showAttendance = useFeature('enableAttendance');
  const showHomework = useFeature('enableHomework');
  const showFees = useFeature('enableFees');

  // REDUNDANCY: In case a student somehow enters this layout, force redirect
  const [role, setRole] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);
  const { auth, db } = require('../../services/firebaseConfig');
  const { doc, getDoc } = require('firebase/firestore');

  const checkAccess = useCallback(async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setRole(userDoc.data().role);
      }
    }
    setChecking(false);
  }, [auth, db, doc, getDoc]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  if (!checking && role === 'STUDENT') {
    return <Tabs.Screen name="parent-home" options={{ href: null }} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 60 + insets.bottom : 68,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom + 4 : 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="parent-home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="parent-attendance"
        options={{
          title: 'Attendance',
          href: showAttendance ? '/parent-attendance' : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="parent-homework"
        options={{
          title: 'Homework',
          href: showHomework ? '/parent-homework' : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="parent-fees"
        options={{
          title: 'Fees',
          href: showFees ? '/parent-fees' : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
