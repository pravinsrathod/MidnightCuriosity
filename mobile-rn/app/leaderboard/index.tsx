import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, SafeAreaView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useTenant } from '../../context/TenantContext';

interface UserRank {
    id: string;
    name: string;
    completedCount: number;
    grade?: string;
    avatarUrl?: string;
}

export default function LeaderboardScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [users, setUsers] = useState<UserRank[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                // Firestore limitation: cannot sort by array length directly.
                // WE NEED TO UPDATE THE DB LOGIC TO TRACK 'xp' OR 'completedCount' AS A NUMBER.
                // For MVP: Fetch all for this tenant and sort client side (ok for 100 students)
                const q = query(
                    collection(db, 'users'),
                    where('tenantId', '==', tenantId || 'default')
                );
                const allUsersSnap = await getDocs(q);
                const allUsers = allUsersSnap.docs.map(doc => {
                    const data = doc.data();
                    const completed = data.completedTopics ? data.completedTopics.length : 0;

                    // Prioritize real photoURL, fallback to procedural
                    const avatar = data.photoURL || `https://api.dicebear.com/7.x/avataaars/png?seed=${doc.id}`;

                    return {
                        id: doc.id,
                        name: data.name || "Anonymous",
                        completedCount: completed,
                        grade: data.grade,
                        avatarUrl: avatar
                    };
                });

                // Sort Descending
                const sorted = allUsers.sort((a, b) => b.completedCount - a.completedCount);
                setUsers(sorted);
            } catch (e) {
                console.error("Leaderboard fetch error:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, []);


    const renderItem = ({ item, index }: { item: UserRank; index: number }) => {
        let rankColor = colors.textSecondary;
        let rankBg = colors.card;
        let icon: keyof typeof Ionicons.glyphMap | null = null;
        let borderColor = colors.border;
        let borderWidth = 1;

        if (index === 0) {
            rankColor = '#FBBF24'; // Amber 400
            rankBg = 'rgba(251, 191, 36, 0.1)';
            icon = 'trophy';
            borderColor = '#FBBF24';
        } else if (index === 1) {
            rankColor = '#94A3B8'; // Slate 400
            rankBg = 'rgba(148, 163, 184, 0.1)';
            icon = 'medal';
            borderColor = '#94A3B8';
        } else if (index === 2) {
            rankColor = '#B45309'; // Amber 700
            rankBg = 'rgba(180, 83, 9, 0.1)';
            icon = 'medal';
            borderColor = '#B45309';
        }

        return (
            <View style={[styles.card, { borderColor: borderColor, borderWidth: borderWidth }]}>
                <View style={[styles.rankBadge, { backgroundColor: rankBg }]}>
                    {icon ? (
                        <Ionicons name={icon} size={20} color={rankColor} />
                    ) : (
                        <Text style={[styles.rankText, { color: rankColor }]}>#{index + 1}</Text>
                    )}
                </View>

                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />

                <View style={styles.cardInfo}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userGrade}>{item.grade || 'Student'}</Text>
                </View>

                <View style={styles.scoreContainer}>
                    <Text style={styles.score}>{item.completedCount}</Text>
                    <Text style={styles.scoreLabel}>Topics</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Leaderboard</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.banner}>
                <Text style={styles.bannerText}>Top Performers 🏆</Text>
                <Text style={styles.bannerSubtext}>Keep learning to climb the ranks!</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={users}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
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
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: colors.background,
    },
    backBtn: {
        padding: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    banner: {
        padding: 24,
        margin: 16,
        borderRadius: 20,
        alignItems: 'center',
        backgroundColor: colors.primary, // Using primary color instead of gradient
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
    bannerText: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
    },
    bannerSubtext: {
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 5,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    rankBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    rankText: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.border,
        marginRight: 16,
    },
    cardInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    userGrade: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    scoreContainer: {
        alignItems: 'center',
        backgroundColor: colors.primaryLight,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    score: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.primary,
    },
    scoreLabel: {
        fontSize: 10,
        color: colors.textSecondary,
    },
});
