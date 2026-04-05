import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

export default function AttendanceRedirect() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { colors } = useTheme();

    useEffect(() => {
        const checkRole = async () => {
            try {
                const user = auth.currentUser;
                let uid = user?.uid;
                if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
                
                if (uid) {
                    const userDoc = await getDoc(doc(db, "users", uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        setRole(userData.role?.toUpperCase() || 'STUDENT');
                    }
                }
            } catch (e) {
                console.error("Error checking role for attendance redirect:", e);
            } finally {
                setLoading(false);
            }
        };
        checkRole();
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (role === 'PARENT') {
        return <Redirect href="/(tabs)/parent-attendance" />;
    }

    return <Redirect href="/student-attendance" />;
}
