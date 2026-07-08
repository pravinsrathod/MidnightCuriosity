import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';

export default function SplashScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        const checkAuth = async () => {
            // Give Firebase a moment to check persisted session
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                unsubscribe();

                try {
                    const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');

                    if (user) {
                        // User is logged in via Firebase Auth
                        if (biometricEnabled === 'true') {
                            // If biometrics are enabled, we go to auth screen to challenge them
                            router.replace('/auth?autoauth=true');
                        } else {
                            // Otherwise, go straight to their dashboard
                            const userDoc = await getDoc(doc(db, "users", user.uid));
                            if (userDoc.exists()) {
                                const userData = userDoc.data();

                                // --- Streak & Last Active Logic ---
                                try {
                                    const today = new Date().toISOString().split('T')[0];
                                    const lastActive = userData.lastActiveDate;
                                    let currentStreak = userData.streak || 0;

                                    if (!lastActive) {
                                        currentStreak = 1;
                                    } else if (lastActive !== today) {
                                        const lastDate = new Date(lastActive);
                                        const todayDate = new Date(today);
                                        const diffTime = todayDate.getTime() - lastDate.getTime();
                                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                                        if (diffDays === 1) {
                                            currentStreak += 1;
                                        } else if (diffDays > 1) {
                                            currentStreak = 1;
                                        }
                                    }

                                    if (lastActive !== today) {
                                        await updateDoc(doc(db, "users", user.uid), {
                                            streak: currentStreak,
                                            lastActiveDate: today
                                        });
                                        console.log(`Streak updated to ${currentStreak} for ${user.uid}`);
                                    }
                                } catch (streakErr) {
                                    console.warn("Failed to update streak:", streakErr);
                                }
                                // ----------------------------------

                                const role = userData.role?.toUpperCase();
                                const status = userData.status?.toUpperCase();

                                if (status === 'BLOCKED' || status === 'REJECTED') {
                                    Alert.alert("Access Denied", "Your account is disabled.");
                                    await auth.signOut();
                                    router.replace('/auth');
                                    return;
                                }

                                if (status === 'PENDING') {
                                    router.replace('/approval-pending');
                                    return;
                                }

                                if (role === 'PARENT') {
                                    router.replace('/(tabs)/parent-home');
                                } else if (role === 'ADMIN') {
                                    router.replace('/admin-dashboard');
                                } else {
                                    router.replace('/grade');
                                }
                            } else {
                                if (user.isAnonymous) {
                                    router.replace('/auth');
                                } else {
                                    router.replace('/complete-profile');
                                }
                            }
                        }
                    } else {
                        // No user session, go to login
                        router.replace('/auth');
                    }
                } catch (error) {
                    console.error("Auth check failed:", error);
                    router.replace('/auth');
                }
            });
        };

        const timer = setTimeout(() => {
            checkAuth();
        }, 1500);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{process.env.EXPO_PUBLIC_APP_NAME || "EduPro"}</Text>
            <Text style={styles.subtitle}>Booting system...</Text>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 10,
        color: colors.text,
    },
    subtitle: {
        fontSize: 18,
        color: colors.textSecondary,
    }
});
