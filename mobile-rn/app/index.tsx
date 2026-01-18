import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';

export default function SplashScreen() {
    const router = useRouter();

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
                                const role = userData.role?.toUpperCase();

                                if (role === 'PARENT') {
                                    router.replace('/parent-dashboard');
                                } else if (role === 'ADMIN') {
                                    router.replace('/admin-dashboard');
                                } else {
                                    router.replace('/grade');
                                }
                            } else {
                                router.replace('/auth');
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
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Erudite</Text>
            <Text style={styles.subtitle}>Booting system...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0F172A'
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: '#94A3B8',
    }
});
