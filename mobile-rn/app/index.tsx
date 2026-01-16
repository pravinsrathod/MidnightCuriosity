import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { doc, getDoc } from 'firebase/firestore';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTenant } from '../context/TenantContext';
import { Image } from 'react-native';

export default function SplashScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantName, tenantLogo } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                await auth.authStateReady();
            } catch (e) {
                console.warn("Auth ready check failed", e);
            }

            const currentUser = auth.currentUser;
            const storedUid = await AsyncStorage.getItem('user_uid');
            const bioEnabled = await AsyncStorage.getItem('biometric_enabled');

            // 1. Check for Biometric Enablement
            if (bioEnabled === 'true' && storedUid) {
                const hasHardware = await LocalAuthentication.hasHardwareAsync();
                const isEnrolled = await LocalAuthentication.isEnrolledAsync();

                if (hasHardware && isEnrolled) {
                    const result = await LocalAuthentication.authenticateAsync({
                        promptMessage: "Welcome back! Login with Biometrics",
                        fallbackLabel: "Use Passcode"
                    });

                    if (result.success) {
                        // SUCCESS: Fetch User & Redirect
                        try {
                            const userDoc = await getDoc(doc(db, "users", storedUid));
                            if (userDoc.exists()) {
                                const userData = userDoc.data();
                                if (userData.status === 'BLOCKED' || userData.status === 'REJECTED') {
                                    router.replace('/auth');
                                    return;
                                }

                                if (userData.role === 'admin' || userData.role === 'ADMIN') {
                                    router.replace('/admin-dashboard');
                                } else if (userData.role === 'PARENT') {
                                    if (userData.status === 'PENDING') router.replace('/approval-pending');
                                    else router.replace('/parent-dashboard');
                                } else {
                                    // Student
                                    if (userData.status === 'PENDING') router.replace('/approval-pending');
                                    else router.replace('/grade');
                                }
                                return; // Stop here, we redirected
                            }
                        } catch (e) {
                            console.error("Fetch profile failed", e);
                        }
                    }
                }
            }

            // Fallback to Auth Screen if no biometrics or failed
            setTimeout(() => {
                router.replace('/auth');
            }, 1000);
        };

        checkAuth();
    }, []);


    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {tenantLogo ? (
                    <Image source={{ uri: tenantLogo }} style={{ width: 100, height: 100, borderRadius: 20, marginBottom: 20 }} />
                ) : (
                    <Text style={{ fontSize: 60, marginBottom: 10 }}>🚀</Text>
                )}
                <Text style={styles.title}>{tenantName || "EduPro"}</Text>
                <Text style={styles.subtitle}>Ignite your potential</Text>
                <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            </View>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background
    },
    content: {
        alignItems: 'center',
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: colors.textSecondary,
        marginBottom: 40,
    },
    loader: {
        marginTop: 20,
    },
});
