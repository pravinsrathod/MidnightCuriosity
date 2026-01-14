import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../services/firebaseConfig';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

export default function RewardScreen() {
    const router = useRouter();
    const { topic } = useLocalSearchParams<{ topic: string }>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            let uid = user?.uid;
            if (!uid) {
                // Fallback to Mock ID
                const storedUid = await AsyncStorage.getItem('user_uid');
                if (storedUid) uid = storedUid;
            }

            if (uid && topic) {
                try {
                    console.log("Saving progress for topic:", topic, "User:", uid);
                    const userRef = doc(db, 'users', uid);
                    // Use setDoc with merge: true to create document if it doesn't exist (e.g. mock users)
                    await setDoc(userRef, {
                        completedTopics: arrayUnion(topic)
                    }, { merge: true });
                    console.log("Progress saved for:", topic);
                } catch (e) {
                    console.error("Error saving progress:", e);
                }
            } else {
                console.log("Waiting for Auth or Topic...", { user: !!uid, topic });
            }
        });
        return () => unsubscribe();
    }, [topic]);

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Ionicons name="trophy" size={80} color={colors.warning} />
                </View>

                <Text style={styles.title}>Great Job!</Text>
                <Text style={styles.subtitle}>You've completed the lesson.</Text>

                <View style={styles.xpCard}>
                    <Text style={styles.xpText}>+50 XP</Text>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => router.push('/knowledge-graph')}
                >
                    <Text style={styles.buttonText}>Continue Learning</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background, // Removed LinearGradient for simplicity with themes for now, can add back if needed
    },
    content: {
        alignItems: 'center',
        width: '100%',
        padding: 30,
    },
    iconContainer: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: colors.warningLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
        borderWidth: 2,
        borderColor: colors.warning,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: colors.textSecondary,
        marginBottom: 40,
    },
    xpCard: {
        backgroundColor: colors.warningLight,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        marginBottom: 60,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    xpText: {
        color: colors.warning,
        fontSize: 24,
        fontWeight: 'bold',
    },
    button: {
        backgroundColor: colors.primary,
        width: '100%',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 5,
            },
            web: {
                boxShadow: `0px 4px 8px ${colors.primary}4D`,
            }
        }),
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
