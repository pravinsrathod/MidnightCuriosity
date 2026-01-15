import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, onSnapshot, getDoc, doc, orderBy } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

export default function HomeworkListScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [homework, setHomework] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [studentData, setStudentData] = useState<any>(null);

    useEffect(() => {
        let unsubHomework: any;

        const fetchData = async () => {
            try {
                let uid = auth.currentUser?.uid;
                if (!uid) {
                    const storedUid = await AsyncStorage.getItem('user_uid');
                    if (storedUid) uid = storedUid;
                }

                if (!uid) {
                    setLoading(false);
                    return;
                }

                // Get Student Profile for Grade & Tenant
                const userDoc = await getDoc(doc(db, 'users', uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    setStudentData(userData);

                    if (userData.tenantId && userData.grade) {
                        // Query Homework
                        const q = query(
                            collection(db, 'homework'),
                            where('tenantId', '==', userData.tenantId),
                            where('grade', '==', userData.grade),
                            orderBy('dueDate', 'desc')
                        );

                        unsubHomework = onSnapshot(q, (snapshot) => {
                            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                            setHomework(list);
                            setLoading(false);
                        });
                    } else {
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
            } catch (e) {
                console.error("Error fetching homework:", e);
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            if (unsubHomework) unsubHomework();
        };
    }, []);

    const renderItem = ({ item }: { item: any }) => {
        // Status checks could be enhanced if we filtered for submissions here or in details
        // For list view, we just show the assignment. 
        // We could fetch submission status in a sub-component or separate effect if needed for the list badge.
        // For simplicity, let's click to see status.
        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({ pathname: '/homework/[id]', params: { id: item.id, title: item.title, description: item.description || '' } })}
            >
                <View style={styles.cardHeader}>
                    <View style={[styles.subjectTag, { backgroundColor: colors.primaryLight }]}>
                        <Text style={styles.subjectText}>{item.subject}</Text>
                    </View>
                    <Text style={styles.dateText}>Due: {item.dueDate}</Text>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text numberOfLines={2} style={styles.description}>{item.description}</Text>

                <View style={styles.footer}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.footerText}> View & Submit</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Homework</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : homework.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="library-outline" size={64} color={colors.border} />
                    <Text style={styles.emptyText}>No homework assigned.</Text>
                    <Text style={styles.emptySubText}>Enjoy your free time!</Text>
                </View>
            ) : (
                <FlatList
                    data={homework}
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
    dateText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 6,
    },
    description: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 16,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 12,
    },
    footerText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginLeft: 4
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 60,
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
    }
});
