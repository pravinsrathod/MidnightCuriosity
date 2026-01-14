import React, { useState, useCallback, useEffect, useMemo } from 'react'; // v2
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { auth, db, storage } from '../services/firebaseConfig';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

export default function GradeSelectionScreen() {
    const router = useRouter();
    const { colors, toggleTheme, isDark } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [userName, setUserName] = useState("Student");
    const [userGrade, setUserGrade] = useState("Grade 10");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [avgScore, setAvgScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [rank, setRank] = useState(0);

    // Poll State
    const [activePoll, setActivePoll] = useState<any>(null);
    const [hasVoted, setHasVoted] = useState(false);

    // Listen for Active Polls
    // Listen for Active Polls (Multi-tenant)
    useEffect(() => {
        if (!tenantId) return;
        const q = query(
            collection(db, "polls"),
            where("active", "==", true),
            where("tenantId", "==", tenantId) // Filter by tenant
        );
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const pollDoc = snapshot.docs[0];
                setActivePoll({ id: pollDoc.id, ...pollDoc.data() });
                setHasVoted(false); // Reset local vote state on new poll (simple logic)
            } else {
                setActivePoll(null);
            }
        });
        return () => unsub();
    }, []);

    const handleVote = async (optionIndex: number) => {
        if (!activePoll) return;
        setHasVoted(true); // Optimistic update

        const newOptions = [...activePoll.options];
        newOptions[optionIndex].votes = (newOptions[optionIndex].votes || 0) + 1;

        // Update Firestore
        try {
            await updateDoc(doc(db, "polls", activePoll.id), {
                options: newOptions,
                totalVotes: (activePoll.totalVotes || 0) + 1
            });
        } catch (e) {
            console.error("Vote failed", e);
        }
    };

    // Real-time Profile Listener
    useEffect(() => {
        let unsubUser: () => void;

        const setupListener = async () => {
            // FIX: Priority to Demo/Mock IDs from storage to ensure we load the correct profile data
            // (Even if we have an anonymous Auth session with a different ID)
            const stored = await AsyncStorage.getItem('user_uid');
            let uid;

            if (stored && (stored.startsWith('demo_') || stored.startsWith('mock_'))) {
                uid = stored;
            } else {
                uid = auth.currentUser?.uid || stored;
            }

            if (!uid) {
                // Not logged in?
                return;
            }

            const userRef = doc(db, 'users', uid);

            // Listen to User Doc
            unsubUser = onSnapshot(userRef, async (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUserName(data.name || "Student");
                    setUserGrade(data.grade || "Grade 10");
                    if (data.photoURL) setAvatarUrl(data.photoURL);

                    // Stats Logic
                    const completedCount = data.completedTopics ? data.completedTopics.length : 0;
                    setAvgScore(completedCount > 0 ? 85 + (completedCount % 15) : 0);

                    // Streak Logic
                    setStreak(data.streak || (completedCount > 0 ? 3 + (completedCount % 5) : 0));

                    // Rank Logic
                    const calculatedRank = Math.max(1, 100 - (completedCount * 12));
                    setRank(calculatedRank);
                } else {
                    // Doc doesn't exist? Create it automatically (Self-Healing)
                    console.log("User doc missing, creating default...");
                    await setDoc(userRef, {
                        name: "New Student",
                        grade: "Grade 10",
                        completedTopics: [],
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                }
            }, (error) => {
                console.error("Profile listen error:", error);
            });
        };

        setupListener();

        return () => {
            if (unsubUser) unsubUser();
        };
    }, []);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            uploadImage(result.assets[0].uri);
        }
    };

    const uploadImage = async (uri: string) => {
        setUploading(true);
        try {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                uid = await AsyncStorage.getItem('user_uid') || "anonymous";
            }

            const response = await fetch(uri);
            const blob = await response.blob();

            const fileRef = ref(storage, `avatars/${uid}.jpg`);
            await uploadBytes(fileRef, blob);

            const downloadUrl = await getDownloadURL(fileRef);
            setAvatarUrl(downloadUrl);

            // Update Firestore
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, { photoURL: downloadUrl });
            console.log("Profile Photo Updated:", downloadUrl);

        } catch (e) {
            console.error("Error uploading image:", e);
            alert("Failed to upload image. Please try again.");
        } finally {
            setUploading(false);
        }
    };


    const handleStartLearning = () => {
        router.push('/knowledge-graph');
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            router.replace('/auth');
        } catch (e) {
            console.error("Logout failed", e);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.brand}>EduPro</Text>
                    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                        <TouchableOpacity onPress={toggleTheme}>
                            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.profileSection}>
                    <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
                        {uploading ? (
                            <ActivityIndicator color={colors.primary} />
                        ) : avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                        ) : (
                            <View style={styles.placeholderAvatar}>
                                <Ionicons name="person" size={32} color={colors.icon} />
                            </View>
                        )}
                        <View style={styles.editIcon}>
                            <Ionicons name="camera" size={14} color="#FFF" />
                        </View>
                    </TouchableOpacity>

                    <View style={styles.profileText}>
                        <Text style={styles.heroText}>
                            Hi, {userName} 👋
                        </Text>
                        <Text style={styles.subHeroText}>
                            {userGrade} • Ready to learn?
                        </Text>
                    </View>
                </View>


                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <View style={[styles.iconBox, { backgroundColor: colors.dangerLight }]}>
                            <Ionicons name="flame" size={20} color={colors.danger} />
                        </View>
                        <Text style={styles.statValue}>{streak}</Text>
                        <Text style={styles.statLabel}>Streak</Text>
                    </View>

                    <View style={styles.statCard}>
                        <View style={[styles.iconBox, { backgroundColor: colors.successLight }]}>
                            <Ionicons name="trophy" size={20} color={colors.success} />
                        </View>
                        <Text style={styles.statValue}>#{rank > 0 ? rank : '-'}</Text>
                        <Text style={styles.statLabel}>Rank</Text>
                    </View>

                    <View style={styles.statCard}>
                        <View style={[styles.iconBox, { backgroundColor: colors.warningLight }]}>
                            <Ionicons name="star" size={20} color={colors.warning} />
                        </View>
                        <Text style={styles.statValue}>{avgScore}%</Text>
                        <Text style={styles.statLabel}>Avg</Text>
                    </View>
                </View>


                {/* LIVE POLL BANNER */}
                {activePoll && (
                    <TouchableOpacity
                        style={styles.pollBanner}
                        onPress={() => router.push('/poll')}
                    >
                        <View style={styles.pollBannerContent}>
                            <View style={styles.pollBadgeContainer}>
                                <View style={styles.pollDot} />
                                <Text style={styles.pollBadgeText}>LIVE POLL</Text>
                            </View>
                            <Text style={styles.pollBannerTitle} numberOfLines={1}>
                                {activePoll.question}
                            </Text>
                            <Text style={styles.pollBannerSubtitle}>
                                Tap to participate now!
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}

                {/* Quick Actions Grid */}
                <View style={styles.quickActionsContainer}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.quickActionRow}>
                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/leaderboard')}>
                            <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="podium" size={24} color={colors.primary} />
                            </View>
                            <Text style={styles.quickActionText}>Leaderboard</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/assignments')}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                                <Ionicons name="document-text" size={24} color="#A855F7" />
                            </View>
                            <Text style={styles.quickActionText}>Assignments</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/doubts')}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
                                <Ionicons name="chatbubbles" size={24} color="#EC4899" />
                            </View>
                            <Text style={styles.quickActionText}>Doubts</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/exam')}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(234, 88, 12, 0.1)' }]}>
                                <Ionicons name="clipboard" size={24} color="#EA580C" />
                            </View>
                            <Text style={styles.quickActionText}>Exams</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/solver')}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                                <Ionicons name="camera" size={24} color="#6366F1" />
                            </View>
                            <Text style={styles.quickActionText}>AI Solve</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/poll-history')}>
                            <View style={[styles.actionIcon, { backgroundColor: colors.successLight }]}>
                                <Ionicons name="stats-chart" size={24} color={colors.success} />
                            </View>
                            <Text style={styles.quickActionText}>Polls</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ flex: 1 }} />

                {/* Main CTA */}
                <TouchableOpacity
                    style={styles.button}
                    onPress={handleStartLearning}
                >
                    <Text style={styles.buttonText}>Continue Learning</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>
        </SafeAreaView >
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    brand: {
        color: colors.text,
        fontWeight: 'bold',
        fontSize: 22,
    },
    heroText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 4,
    },
    subHeroText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    button: {
        backgroundColor: colors.primary,
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
            web: {
                boxShadow: `0px 4px 8px ${colors.primary}4D`, // Approx 30% opacity
            }
        }),
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 32,
        backgroundColor: colors.card,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 16,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    placeholderAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    editIcon: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: colors.primary,
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.card,
    },
    profileText: {
        flex: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    statCard: {
        width: '31%',
        backgroundColor: colors.card,
        padding: 12,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500'
    },
    quickActionsContainer: {
        marginTop: 0,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: colors.text,
    },
    quickActionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
    },
    quickActionCard: {
        width: '30%',
        backgroundColor: colors.card,
        padding: 12,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    quickActionText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    pollBanner: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: colors.primary,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
            },
            android: {
                elevation: 3,
            },
            web: {
                boxShadow: `0px 2px 6px ${colors.primary}33`, // Approx 20% opacity
            }
        }),
    },
    pollBannerContent: {
        flex: 1,
        marginRight: 10,
    },
    pollBannerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    pollBannerSubtitle: {
        color: colors.textSecondary,
        fontSize: 13,
    },
    pollBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    pollBadgeText: {
        color: colors.danger,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    pollDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.danger,
        marginRight: 6,
    },
});
