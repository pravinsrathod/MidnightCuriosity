import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ParentDashboard() {
    const router = useRouter();
    const { colors, isDark, toggleTheme } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [studentName, setStudentName] = useState('');
    const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
    const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });

    const fetchData = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;

            if (!uid) {
                // Check storage
                uid = await AsyncStorage.getItem('user_uid') || undefined;
            }

            if (!uid) {
                router.replace('/auth');
                return;
            }

            // 1. Get Parent Profile
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();

                // If it is a parent, find the linked student
                let studentUid = uid;
                let studentNameDisplay = userData.name || 'Student';

                if (userData.role === 'PARENT' && userData.linkedStudentPhone) {
                    const studentQ = query(collection(db, "users"), where("phoneNumber", "==", userData.linkedStudentPhone));
                    const studentSnap = await getDocs(studentQ);

                    let foundStudent = null;
                    if (!studentSnap.empty) {
                        // Filter results: Must not be self, must not be another parent
                        const candidates = studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                        foundStudent = candidates.find(c => c.id !== uid && c.role !== 'PARENT');
                    }

                    if (foundStudent) {
                        studentUid = foundStudent.id;
                        studentNameDisplay = foundStudent.name || 'Your Child';

                        // Check for legacy ID (from admin creation)
                        if (foundStudent.legacyUid) {
                            console.log("Found legacy UID for student:", foundStudent.legacyUid);
                        }
                    } else {
                        // Student not found by phone
                        setStudentName("Student Not Found");
                        setLoading(false);
                        return;
                    }
                }

                const studentDataFull = (await getDoc(doc(db, "users", studentUid))).data();
                const studentLegacyUid = studentDataFull?.legacyUid;

                setStudentName(studentNameDisplay);
                const tenantId = userData.tenantId;

                if (tenantId) {
                    // 2. Fetch Attendance
                    // Note: In MVP, attendance is stored in 'attendance' collection with docId = {tenantId}_{date}
                    // We need to query docs with this tenantId.
                    // Ideally, we'd have a better index or subcollection. 
                    // For now, we query all attendance docs for this tenant (limit 30 most recent).
                    // Actually, since doc IDs are predictable strings, we can't easily query by date unless we have a field.
                    // The admin panel saves: { tenantId: ..., date: ..., records: { uid: status } }
                    // So we can query collection("attendance").where("tenantId", "==", tenantId)

                    const q = query(
                        collection(db, "attendance"),
                        where("tenantId", "==", tenantId),
                        orderBy("date", "desc"),
                        limit(30) // Last 30 days
                    );

                    const snapshot = await getDocs(q);
                    const history: any[] = [];
                    let p = 0, a = 0, l = 0;

                    snapshot.forEach(doc => {
                        const data = doc.data();
                        // Check CURRENT UID or LEGACY UID
                        const status = data.records?.[studentUid] || (studentLegacyUid ? data.records?.[studentLegacyUid] : undefined) || 'UNMARKED';

                        // Only add if relevant (or maybe show all days?)
                        // Let's show all days that exist in the system
                        if (data.date) {
                            history.push({
                                id: doc.id,
                                date: data.date,
                                status: status
                            });

                            if (status === 'PRESENT') p++;
                            else if (status === 'ABSENT') a++;
                            else if (status === 'LATE') l++;
                        }
                    });

                    setAttendanceHistory(history);
                    setStats({ present: p, absent: a, late: l, total: history.length });
                }
            }

        } catch (e) {
            console.error("Error fetching parent data", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            router.replace('/auth');
        } catch (e) {
            console.error(e);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PRESENT': return colors.success;
            case 'ABSENT': return colors.danger;
            case 'LATE': return colors.warning;
            default: return colors.textSecondary;
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Parent Portal</Text>
                    <Text style={styles.headerSubtitle}>Viewing: {studentName}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                    <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Stats Cards */}
                <View style={styles.statsContainer}>
                    <View style={[styles.statCard, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                        <Text style={[styles.statValue, { color: colors.success }]}>{stats.present}</Text>
                        <Text style={styles.statLabel}>Present</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.danger + '15', borderColor: colors.danger }]}>
                        <Text style={[styles.statValue, { color: colors.danger }]}>{stats.absent}</Text>
                        <Text style={styles.statLabel}>Absent</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
                        <Text style={[styles.statValue, { color: colors.warning }]}>{stats.late}</Text>
                        <Text style={styles.statLabel}>Late</Text>
                    </View>
                </View>

                {/* Attendance List */}
                <View style={styles.sectionHeader}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Attendance History (Last 30 Days)</Text>
                </View>

                {attendanceHistory.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No attendance records found yet.</Text>
                    </View>
                ) : (
                    <View style={styles.listContainer}>
                        {attendanceHistory.map((item) => (
                            <View key={item.id} style={styles.listItem}>
                                <View style={styles.dateBox}>
                                    <Text style={styles.dayText}>{new Date(item.date).getDate()}</Text>
                                    <Text style={styles.monthText}>{new Date(item.date).toLocaleString('default', { month: 'short' })}</Text>
                                </View>
                                <View style={{ flex: 1, paddingLeft: 15 }}>
                                    <Text style={styles.dateFullText}>{new Date(item.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                                </View>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ height: 40 }} />

                <TouchableOpacity style={styles.switchModeButton} onPress={() => router.replace('/grade')}>
                    <Text style={styles.switchModeText}>Go to Student View</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
    },
    logoutButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: colors.background,
    },
    content: {
        padding: 20,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
        gap: 10,
    },
    statCard: {
        flex: 1,
        padding: 15,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    listContainer: {
        backgroundColor: colors.card,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    dateBox: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        borderRadius: 8,
        width: 50,
        height: 50,
        borderWidth: 1,
        borderColor: colors.border,
    },
    dayText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    monthText: {
        fontSize: 10,
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    dateFullText: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '500',
    },
    statusBadge: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
    },
    statusText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: colors.textSecondary,
        fontStyle: 'italic',
    },
    switchModeButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        gap: 10,
    },
    switchModeText: {
        color: colors.textSecondary,
        fontSize: 14,
    }
});
