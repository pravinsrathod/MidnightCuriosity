import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

interface Assignment {
    id: string;
    topic: string;
    status: 'Pending' | 'Completed';
    score?: number;
}

export default function AssignmentsScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');

    useEffect(() => {

        const fetchAssignments = async () => {
            try {
                let uid = auth.currentUser?.uid;
                if (!uid) {
                    const storedUid = await AsyncStorage.getItem('user_uid');
                    if (storedUid) uid = storedUid;
                }

                if (uid) {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        const completedTopics = data.completedTopics || [];
                        const results = data.assignmentResults || {};

                        // Generate assignments for completed topics
                        const items: Assignment[] = completedTopics.map((topic: string) => ({
                            id: topic,
                            topic: topic,
                            status: results[topic] !== undefined ? 'Completed' : 'Pending',
                            score: results[topic]
                        }));

                        setAssignments(items.reverse()); // Newest first
                    }
                }
            } catch (e) {
                console.error("Error fetching assignments:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchAssignments();
    }, []);

    const filteredData = assignments.filter(item => {
        if (filter === 'All') return true;
        return item.status === filter;
    });

    const startQuiz = (topic: string) => {
        router.push({
            pathname: '/assignments/quiz',
            params: { topic }
        });
    };


    const renderItem = ({ item }: { item: Assignment }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={[styles.subjectTag, { backgroundColor: colors.primaryLight }]}>
                    <Text style={styles.subjectText}>Assignment</Text>
                </View>
                {item.status === 'Completed' ? (
                    <Text style={[styles.statusText, { color: colors.success }]}>
                        Score: {item.score}%
                    </Text>
                ) : (
                    <Text style={[styles.statusText, { color: colors.danger }]}>
                        Pending
                    </Text>
                )}
            </View>

            <Text style={styles.cardTitle}>{item.topic} Assessment</Text>
            <Text style={styles.dueDate}>Based on your learning</Text>

            {item.status === 'Pending' ? (
                <TouchableOpacity style={styles.actionButton} onPress={() => startQuiz(item.topic)}>
                    <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
                    <Text style={styles.actionText}>Start MCQs</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={[styles.actionButton, { borderColor: colors.success }]} onPress={() => startQuiz(item.topic)}>
                    <Ionicons name="refresh-circle-outline" size={20} color={colors.success} />
                    <Text style={[styles.actionText, { color: colors.success }]}>Retake Quiz</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Assignments</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Filter Tabs */}
            <View style={styles.tabs}>
                {['All', 'Pending', 'Completed'].map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, filter === tab && styles.activeTab]}
                        onPress={() => setFilter(tab)}
                    >
                        <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>
                            {tab}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : filteredData.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="book-outline" size={64} color={colors.border} />
                    <Text style={styles.emptyText}>No assignments yet.</Text>
                    <Text style={styles.emptySubText}>Complete topics in the Knowledge Graph to unlock assignments.</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredData}
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
    tabs: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeTab: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    tabText: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#FFFFFF',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
            web: {
                boxShadow: `0px 2px 4px ${colors.primary}1A`,
            }
        }),
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    subjectTag: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
    },
    subjectText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.primary,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 6,
    },
    dueDate: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 16,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: 8,
    },
    actionText: {
        marginLeft: 8,
        color: colors.primary,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    emptySubText: {
        marginTop: 8,
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        opacity: 0.7
    }
});
