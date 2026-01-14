import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

export default function PollScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [activePoll, setActivePoll] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [currentUid, setCurrentUid] = useState<string | null>(null);

    // Load User ID
    useEffect(() => {
        const loadUid = async () => {
            const stored = await AsyncStorage.getItem('user_uid');
            // FIX: If stored ID is a demo/mock user, prefer it over the auth.currentUser.uid (which is anonymous)
            // This ensures we read the correct demo profile data while having a valid permission session.
            let finalUid = auth.currentUser?.uid;
            if (stored && (stored.startsWith('demo_') || stored.startsWith('mock_'))) {
                finalUid = stored;
            } else if (!finalUid && stored) {
                finalUid = stored;
            }
            setCurrentUid(finalUid || null);
        };
        loadUid();
    }, []);

    // Listen for Active Polls & Check Vote Status
    useEffect(() => {
        if (!currentUid) return;

        const q = query(
            collection(db, "polls"),
            where("tenantId", "==", tenantId || "default")
        );
        const unsub = onSnapshot(q, async (snapshot) => {
            // Filter locally for active polls to avoid composite index requirement
            const polls = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const activePolls = polls.filter((p: any) => p.active === true);

            if (activePolls.length > 0) {
                const pollData: any = activePolls[0];
                const pollId = pollData.id;

                setActivePoll(pollData);

                // Check if user already voted in Backend
                const votedIds = pollData.votedUserIds || [];
                const isVoted = votedIds.includes(currentUid);

                if (isVoted) {
                    // Try to restore selection from local storage for better UX
                    const savedSelection = await AsyncStorage.getItem(`poll_selection_${pollId}`);
                    if (savedSelection !== null) {
                        setSelectedOption(parseInt(savedSelection, 10));
                    }
                } else {
                    setSelectedOption(null); // Reset selection if not voted or new poll
                }
            } else {
                setActivePoll(null);
                setSelectedOption(null);
            }
            setLoading(false);
        });
        return () => unsub();
    }, [currentUid]);

    const handleVote = async (optionIndex: number) => {
        if (!activePoll || selectedOption !== null || !currentUid) return;

        // Optimistic Update
        setSelectedOption(optionIndex);

        // 1. Save to Local Storage (Persistence)
        await AsyncStorage.setItem(`poll_selection_${activePoll.id}`, optionIndex.toString());

        // 2. Calculate New Stats
        const newOptions = [...activePoll.options];
        newOptions[optionIndex].votes = (newOptions[optionIndex].votes || 0) + 1;

        try {
            await updateDoc(doc(db, "polls", activePoll.id), {
                options: newOptions,
                totalVotes: (activePoll.totalVotes || 0) + 1,
                votedUserIds: arrayUnion(currentUid) // 3. Enforce "One Vote" on Backend
            });
            // Alert.alert("Success", "Your vote has been cast!"); // Removed Native Popup
        } catch (e) {
            console.error("Vote failed", e);
            // Alert.alert("Error", "Failed to submit vote."); // Removed Native Popup
            setSelectedOption(null); // Revert on failure
            AsyncStorage.removeItem(`poll_selection_${activePoll.id}`);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Live Poll</Text>
            </View>

            <View style={styles.content}>
                {activePoll ? (
                    <View style={styles.pollCard}>
                        <View style={styles.pollHeader}>
                            <View style={styles.pollBadgeContainer}>
                                <View style={styles.pollDot} />
                                <Text style={styles.pollBadgeText}>LIVE NOW</Text>
                            </View>
                            <Text style={styles.pollQuestion}>{activePoll.question}</Text>
                        </View>

                        <View style={styles.pollOptions}>
                            {activePoll.options.map((option: any, index: number) => {
                                const isSelected = selectedOption === index;
                                const total = activePoll.totalVotes || 0;
                                const percent = total > 0 ? ((option.votes || 0) / total) * 100 : 0;
                                // Robust check: Local optimistic OR Backend confirmed
                                const alreadyVotedBackend = (activePoll.votedUserIds || []).includes(currentUid);
                                const hasVoted = selectedOption !== null || alreadyVotedBackend;

                                return (
                                    <TouchableOpacity
                                        key={index}
                                        disabled={hasVoted}
                                        onPress={() => handleVote(index)}
                                        style={[
                                            styles.pollOptionBtn,
                                            hasVoted && styles.pollOptionBtnDisabled,
                                            isSelected && styles.pollOptionBtnSelected
                                        ]}
                                    >
                                        {/* Background Bar */}
                                        {hasVoted && (
                                            <View style={[
                                                styles.pollBarFill,
                                                { width: `${percent}%` },
                                                isSelected && { backgroundColor: colors.primary, opacity: 0.5 }
                                            ]} />
                                        )}

                                        <View style={styles.pollOptionContent}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                {isSelected && <Ionicons name="checkmark-circle" size={20} color="#FFF" />}
                                                <Text style={[styles.pollOptionText, hasVoted && { color: colors.text }]}>
                                                    {option.text}
                                                </Text>
                                            </View>
                                            {hasVoted && (
                                                <Text style={styles.pollVoteCount}>{Math.round(percent)}%</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {(selectedOption !== null || (activePoll.votedUserIds || []).includes(currentUid)) && (
                            <Text style={styles.votedText}>Thanks for voting! Waiting for results...</Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="stats-chart" size={64} color={colors.textSecondary} />
                        <Text style={styles.emptyText}>No live poll active at the moment.</Text>
                        <Text style={styles.emptySubText}>Check back later during class!</Text>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        gap: 15,
        borderBottomWidth: 1,
        borderColor: colors.border
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    content: {
        flex: 1,
        padding: 24,
    },
    pollCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    pollHeader: {
        marginBottom: 24,
    },
    pollBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: colors.dangerLight,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    pollBadgeText: {
        color: colors.danger,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    pollDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.danger,
        marginRight: 6,
    },
    pollQuestion: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        lineHeight: 30,
    },
    pollOptions: {
        gap: 16,
    },
    pollOptionBtn: {
        backgroundColor: colors.inputBackground,
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        borderColor: colors.border,
    },
    pollOptionBtnSelected: {
        borderColor: colors.primary,
        borderWidth: 2,
    },
    pollOptionBtnDisabled: {
        opacity: 0.9,
    },
    pollBarFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: colors.primary,
        opacity: 0.3,
    },
    pollOptionContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        zIndex: 2,
    },
    pollOptionText: {
        color: colors.textSecondary,
        fontWeight: '600',
        fontSize: 16,
    },
    pollVoteCount: {
        color: colors.text,
        fontWeight: 'bold',
        fontSize: 16,
    },
    votedText: {
        marginTop: 20,
        color: colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -50,
    },
    emptyText: {
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 8,
    },
    emptySubText: {
        color: colors.textSecondary,
        fontSize: 14,
    }
});
