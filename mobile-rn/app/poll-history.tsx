import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '../services/firebaseConfig';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

export default function PollHistoryScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [polls, setPolls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUid, setCurrentUid] = useState<string | null>(null);

    useEffect(() => {
        const loadUid = async () => {
            const stored = await AsyncStorage.getItem('user_uid');
            const finalUid = auth.currentUser?.uid || stored;
            setCurrentUid(finalUid || null);
        };
        loadUid();
    }, []);

    useEffect(() => {
        fetchPolls();
    }, []);

    const fetchPolls = async () => {
        try {
            const q = query(
                collection(db, "polls"),
                where("tenantId", "==", tenantId || "default")
            );
            const snapshot = await getDocs(q);
            const loadedPolls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side sort to avoid composite index
            const sorted = loadedPolls.sort((a: any, b: any) => {
                const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
                const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
                return timeB - timeA; // desc
            });

            setPolls(sorted);
        } catch (error) {
            console.error("Error fetching poll history:", error);
        } finally {
            setLoading(false);
        }
    };

    const renderPollItem = ({ item }: { item: any }) => {
        const totalVotes = item.totalVotes || 0;
        const isActive = item.active;

        // Find winner/top option
        const sortedOptions = [...item.options].sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const topOption = sortedOptions[0];
        const topPercent = totalVotes > 0 && topOption ? Math.round(((topOption.votes || 0) / totalVotes) * 100) : 0;

        // Check if user voted (best effort check)
        const voted = (item.votedUserIds || []).includes(currentUid);

        return (
            <View style={[styles.card, isActive && styles.activeCard]}>
                <View style={styles.cardHeader}>
                    <View style={styles.badgeRow}>
                        {isActive ? (
                            <View style={styles.activeBadge}>
                                <View style={styles.dot} />
                                <Text style={styles.activeText}>LIVE</Text>
                            </View>
                        ) : (
                            <View style={styles.closedBadge}>
                                <Text style={styles.closedText}>ENDED</Text>
                            </View>
                        )}
                        {voted && (
                            <View style={styles.votedBadge}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                                <Text style={styles.votedText}>Voted</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.dateText}>
                        {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}
                    </Text>
                </View>

                <Text style={styles.question}>{item.question}</Text>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Ionicons name="people" size={16} color={colors.textSecondary} />
                        <Text style={styles.statText}>{totalVotes} Votes</Text>
                    </View>
                    {totalVotes > 0 && topOption && (
                        <View style={styles.statItem}>
                            <Ionicons name="trophy" size={16} color={colors.warning} />
                            <Text style={styles.statText}>Top: {topOption.text} ({topPercent}%)</Text>
                        </View>
                    )}
                </View>
            </View>
        );
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
                <Text style={styles.title}>Poll History</Text>
            </View>

            <FlatList
                data={polls}
                renderItem={renderPollItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No polls found yet.</Text>
                    </View>
                }
            />
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
    listContent: {
        padding: 20,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeCard: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    badgeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    activeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.dangerLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.danger,
        marginRight: 6,
    },
    activeText: {
        color: colors.danger,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    closedBadge: {
        backgroundColor: colors.border,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    closedText: {
        color: colors.textSecondary,
        fontSize: 10,
        fontWeight: 'bold',
    },
    votedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.successLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    votedText: {
        color: colors.success,
        fontSize: 10,
        fontWeight: 'bold',
    },
    dateText: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    question: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 16,
        lineHeight: 24,
    },
    statsRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 12,
        gap: 16,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statText: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: colors.textSecondary,
        fontStyle: 'italic',
    }
});
