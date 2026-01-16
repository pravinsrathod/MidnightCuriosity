import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { auth, db } from '../services/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ApprovalPendingScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    // Real-time listener for auto-approval
    useEffect(() => {
        let unsub: () => void;

        const setupListener = async () => {
            let uid = auth.currentUser?.uid;

            // Prefer stored ID for consistency with "Phone Login" flow
            const stored = await AsyncStorage.getItem('user_uid');
            if (stored) uid = stored;

            if (!uid) return;
            console.log("Listening for approval on:", uid);

            unsub = onSnapshot(doc(db, "users", uid), (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.status === 'ACTIVE') {
                        console.log("Auto-Approval Detected! Redirecting...");
                        router.replace('/grade');
                    }
                }
            });
        };

        setupListener();

        return () => {
            if (unsub) unsub();
        };
    }, []);

    const handleSignOut = async () => {
        await auth.signOut();
        await AsyncStorage.removeItem('user_uid');
        await AsyncStorage.removeItem('biometric_enabled');
        router.replace('/auth');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="time-outline" size={80} color={colors.primary} />
                </View>

                <Text style={styles.title}>Approval Pending</Text>

                <Text style={styles.description}>
                    Your request has been sent to the institute administrator.
                    {"\n\n"}
                    Once approved, you will be able to access your classes and learning materials.
                </Text>

                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.infoText}>This usually takes less than 24 hours.</Text>
                </View>

                <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.border }]}
                    onPress={handleSignOut}
                >
                    <Text style={[styles.buttonText, { color: colors.text }]}>Sign Out / Check Later</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    iconCircle: {
        width: 150,
        height: 150,
        borderRadius: 75,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 15,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        padding: 15,
        borderRadius: 12,
        marginBottom: 30,
        width: '100%',
    },
    infoText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginLeft: 10,
    },
    button: {
        width: '100%',
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});
