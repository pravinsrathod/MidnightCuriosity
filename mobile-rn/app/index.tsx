import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { doc, getDoc } from 'firebase/firestore';

export default function SplashScreen() {
    const router = useRouter();
    const { colors } = useTheme();
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

            if (currentUser || (storedUid && (storedUid.startsWith('mock_') || storedUid.startsWith('demo_')))) {
                const uid = currentUser?.uid || storedUid;

                if (uid) {
                    try {
                        const userDoc = await getDoc(doc(db, "users", uid));
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            if (userData.status === 'PENDING') {
                                router.replace('/approval-pending');
                                return;
                            }
                        }
                    } catch (e) {
                        console.error("Error fetching user status:", e);
                    }

                    if (currentUser) {
                        const isDemo = storedUid && (storedUid.startsWith('demo_') || storedUid.startsWith('mock_'));
                        if (!isDemo && storedUid !== currentUser.uid) {
                            await AsyncStorage.setItem('user_uid', currentUser.uid);
                        }
                    }

                    router.replace('/grade');
                    return;
                }
            }

            if (storedUid) {
                console.warn("Session invalid. Redirecting to Login.");
                await AsyncStorage.removeItem('user_uid');
            }

            router.replace('/auth');
        };

        checkAuth();
    }, []);


    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>EduPro 🚀</Text>
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
