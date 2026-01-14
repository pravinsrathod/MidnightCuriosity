import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Dimensions, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

const { width, height } = Dimensions.get('window');

interface TopicNode {
    id: string;
    title: string;
    x: number;
    y: number;
    isLocked: boolean;
    isCompleted: boolean;
}

export default function KnowledgeGraphScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [userName, setUserName] = useState("Student");
    const [grade, setGrade] = useState("Grade 10");
    const [subjects, setSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [topicTitles, setTopicTitles] = useState<string[]>([]);
    const [completedTopicIds, setCompletedTopicIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch initial profile
    useFocusEffect(
        useCallback(() => {
            const fetchProfile = async () => {
                try {
                    let uid = null;
                    const storedUid = await AsyncStorage.getItem('user_uid');

                    // FIX: Prioritize Demo IDs
                    if (storedUid && (storedUid.startsWith('demo_') || storedUid.startsWith('mock_'))) {
                        uid = storedUid;
                    } else {
                        uid = auth.currentUser?.uid || storedUid;
                    }

                    if (uid) {
                        const userDoc = await getDoc(doc(db, 'users', uid));
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            setUserName(data.name || "Student");
                            const userGrade = data.grade || "Grade 10";
                            setGrade(userGrade);
                            setCompletedTopicIds(data.completedTopics || []);

                            // Fetch Tenant Metadata
                            const tid = data.tenantId || tenantId;
                            if (tid) {
                                const configDoc = await getDoc(doc(db, 'tenants', tid, 'metadata', 'lists'));
                                if (configDoc.exists()) {
                                    const config = configDoc.data();
                                    if (config.subjects && Array.isArray(config.subjects)) {
                                        setSubjects(config.subjects);
                                    }
                                }
                            }
                        }
                    } else {
                        // Fallback or explicit check if no user but have tenantId (rare in this flow)
                        if (tenantId) {
                            const configDoc = await getDoc(doc(db, 'tenants', tenantId, 'metadata', 'lists'));
                            if (configDoc.exists()) {
                                const config = configDoc.data();
                                if (config.subjects && Array.isArray(config.subjects)) setSubjects(config.subjects);
                            }
                        }
                    }

                } catch (e) {
                    console.error("Error fetching profile:", e);
                    setSubjects(["Maths", "Physics", "Chemistry"]);
                } finally {
                    setLoading(false);
                }
            };

            fetchProfile();
        }, [])
    );

    // Fetch Topics when subject changes
    useEffect(() => {
        const fetchTopics = async () => {
            if (!selectedSubject) return;
            try {
                const q = query(
                    collection(db, 'lectures'),
                    where('grade', '==', grade),
                    where('subject', '==', selectedSubject),
                    where('tenantId', '==', tenantId || 'default'), // Ensure tenant isolation
                );
                const snapshot = await getDocs(q);
                // Sort by createdAt in memory
                const sortedDocs = snapshot.docs.sort((a, b) => {
                    const dateA = a.data().createdAt?.seconds || 0;
                    const dateB = b.data().createdAt?.seconds || 0;
                    return dateA - dateB; // asc as before
                });
                const titles = [...new Set(sortedDocs.map(d => d.data().topic))].filter(Boolean);
                setTopicTitles(titles);
            } catch (e) {
                console.error("Error fetching topics:", e);
                setTopicTitles([]);
            }
        };
        fetchTopics();
    }, [selectedSubject, grade]);

    const pattern = [
        { x: 0.5, y: 0 },
        { x: 0.2, y: 0 },
        { x: 0.8, y: 0 },
        { x: 0.5, y: 0 },
    ];

    const nodeSpacing = 160;
    const graphHeight = Math.max(height, topicTitles.length * nodeSpacing + 200);

    const nodes: TopicNode[] = topicTitles.map((title, index) => {
        const isCompleted = completedTopicIds.includes((index + 1).toString()) || completedTopicIds.includes(title);

        let isLocked = true;
        if (index === 0) {
            isLocked = false;
        } else {
            const prevTitle = topicTitles[index - 1];
            const prevCompleted = completedTopicIds.includes(prevTitle) || completedTopicIds.includes((index).toString());

            if (prevCompleted) {
                isLocked = false;
            }
        }

        const patternIndex = index % pattern.length;
        const x = pattern[patternIndex].x;
        const y = 80 + (index * nodeSpacing);

        return {
            id: (index + 1).toString(),
            title,
            x: x,
            y: y,
            isLocked: isLocked,
            isCompleted
        };
    });

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!selectedSubject) {
        // SUBJECT LIST
        return (
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={styles.welcomeLabel}>Welcome Back,</Text>
                            <Text style={styles.userName}>{userName}</Text>
                        </View>
                        <View style={styles.gradeBadge}>
                            <Text style={styles.gradeText}>{grade}</Text>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Choose Subject</Text>

                    {subjects.map((subject) => (
                        <TouchableOpacity
                            key={subject}
                            style={styles.subjectCard}
                            onPress={() => setSelectedSubject(subject)}
                        >
                            <View style={styles.subjectIcon}>
                                <Text style={styles.subjectInitial}>{subject.charAt(0)}</Text>
                            </View>
                            <Text style={styles.subjectName}>{subject}</Text>
                            <Ionicons name="arrow-forward" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SafeAreaView>
        );
    }

    // GRAPH VIEW
    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.topBar}>
                <TouchableOpacity onPress={() => setSelectedSubject(null)} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                    <Text style={styles.topBarTitle}>{selectedSubject}</Text>
                </TouchableOpacity>
            </SafeAreaView>

            {topicTitles.length === 0 ? (
                <View style={styles.center}>
                    <Text style={{ color: colors.textSecondary, fontSize: 16 }}>No lessons found for {selectedSubject} yet.</Text>
                    <TouchableOpacity onPress={() => setSelectedSubject(null)} style={{ marginTop: 20 }}>
                        <Text style={{ color: colors.primary }}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.graphScrollContent, { height: graphHeight }]}>
                    {/* Lines */}
                    <Svg style={StyleSheet.absoluteFill}>
                        {nodes.map((node, i) => {
                            if (i < nodes.length - 1) {
                                const nextNode = nodes[i + 1];
                                return (
                                    <Line
                                        key={`line-${i}`}
                                        x1={node.x * width}
                                        y1={node.y}
                                        x2={nextNode.x * width}
                                        y2={nextNode.y}
                                        stroke={node.isCompleted ? colors.primary : colors.border}
                                        strokeWidth="6"
                                        strokeDasharray={node.isCompleted ? [] : [10, 10]}
                                        strokeOpacity={node.isCompleted ? 1 : 0.5}
                                    />
                                );
                            }
                            return null;
                        })}
                    </Svg>

                    {/* Nodes */}
                    {nodes.map((node) => {
                        const nodeX = node.x * width - 40;
                        const nodeY = node.y - 40; // Center offset

                        const bgColor = node.isCompleted ? colors.success : (node.isLocked ? colors.card : colors.warning);
                        const borderColor = node.isLocked ? colors.border : 'transparent';
                        const icon = node.isCompleted ? '✓' : (node.isLocked ? '🔒' : '★');
                        const iconColor = node.isLocked ? colors.icon : '#FFF';
                        const titleColor = node.isLocked ? colors.textSecondary : colors.text;

                        return (
                            <TouchableOpacity
                                key={node.id}
                                style={[styles.nodeContainer, { left: nodeX, top: nodeY }]}
                                onPress={() => {
                                    if (!node.isLocked) {
                                        router.push({ pathname: '/hook', params: { topic: node.title, grade: grade } });
                                    }
                                }}
                                disabled={node.isLocked}
                            >
                                <View style={[styles.nodeCircle, { backgroundColor: bgColor, borderColor: borderColor }]}>
                                    <Text style={[styles.nodeIcon, { color: iconColor }]}>{icon}</Text>
                                </View>
                                <View style={styles.labelContainer}>
                                    <Text style={[styles.nodeTitle, { color: titleColor }]} numberOfLines={2}>{node.title}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 24,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 10,
    },
    welcomeLabel: {
        color: colors.textSecondary,
        fontSize: 14,
        marginBottom: 4,
    },
    userName: {
        color: colors.text,
        fontSize: 24,
        fontWeight: 'bold',
    },
    gradeBadge: {
        backgroundColor: colors.primaryLight,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    gradeText: {
        color: colors.primary,
        fontWeight: 'bold',
        fontSize: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 16,
    },
    subjectCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        padding: 20,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    subjectIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    subjectInitial: {
        color: colors.primary,
        fontWeight: 'bold',
        fontSize: 20,
    },
    subjectName: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: colors.text,
    },
    topBar: {
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    topBarTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 16,
        color: colors.text,
    },
    graphScrollContent: {
        position: 'relative',
        paddingBottom: 40,
    },
    nodeContainer: {
        position: 'absolute',
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    nodeCircle: {
        width: 70,
        height: 70,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        marginBottom: 8,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: `0px 4px 8px rgba(0,0,0,0.3)`,
            }
        }),
    },
    nodeIcon: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    labelContainer: {
        backgroundColor: colors.background, // Or semi-transparent from colors if needed, but background is safer
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: 0.9
    },
    nodeTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center',
    },
});
