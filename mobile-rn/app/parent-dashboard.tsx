import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
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

    // Data States
    const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
    const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
    const [homeworkList, setHomeworkList] = useState<any[]>([]);

    // Context for Real-time Listeners
    const [studentContext, setStudentContext] = useState<any>(null); // { tenantId, grade, allStudentIds, studentUid }
    const [rawHomeworks, setRawHomeworks] = useState<any[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any>({});

    const fetchIdentity = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;

            if (!uid) {
                uid = await AsyncStorage.getItem('user_uid') || undefined;
            }

            if (!uid) {
                router.replace('/auth');
                return;
            }

            // 1. Get Parent Profile
            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists()) return;

            const userData = userDoc.data();
            let studentUid = uid;
            let studentNameDisplay = userData.name || 'Student';
            let allStudentIds: string[] = [];
            let primaryStudent: any = null;

            if (userData.role === 'PARENT' && userData.linkedStudentPhone) {
                const studentQ = query(collection(db, "users"), where("phoneNumber", "==", userData.linkedStudentPhone));
                const studentSnap = await getDocs(studentQ);

                const foundStudents = [];
                if (!studentSnap.empty) {
                    const snapshotDocs = studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                    const candidates = snapshotDocs.filter(c => c.id !== uid && c.role !== 'PARENT');
                    foundStudents.push(...candidates);
                }

                if (foundStudents.length > 0) {
                    primaryStudent = foundStudents[0];
                    studentUid = primaryStudent.id;
                    studentNameDisplay = primaryStudent.name || 'Your Child';

                    allStudentIds = foundStudents.map(s => s.id);
                    foundStudents.forEach(s => {
                        if (s.legacyUid) allStudentIds.push(s.legacyUid);
                    });
                } else {
                    setStudentName("Student Not Found");
                    setLoading(false);
                    return;
                }
            } else {
                // Determine IDs for non-parent view (if used implicitly)
                const studentDataFull = (await getDoc(doc(db, "users", studentUid))).data();
                primaryStudent = { id: uid, ...studentDataFull };
                allStudentIds = [uid, studentDataFull?.legacyUid].filter(Boolean);
            }

            setStudentName(studentNameDisplay);
            const tenantId = userData.tenantId;
            const grade = primaryStudent?.grade;

            if (tenantId && grade) {
                setStudentContext({ tenantId, grade, allStudentIds, studentUid });
            } else {
                setLoading(false);
            }

        } catch (e) {
            console.error("Error fetching identity", e);
            setLoading(false);
        }
    };

    // Initial Load
    useEffect(() => {
        fetchIdentity();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchIdentity().then(() => setRefreshing(false));
    };


    // Real-time Listeners
    useEffect(() => {
        if (!studentContext) return;

        const { tenantId, grade, allStudentIds, studentUid } = studentContext;
        setLoading(true);

        // 1. Attendance Listener
        const qAtt = query(collection(db, "attendance"), where("tenantId", "==", tenantId));
        const unsubAtt = onSnapshot(qAtt, (snapshot) => {
            let history: any[] = [];
            let p = 0, a = 0, l = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                let status = 'UNMARKED';

                // Check ALL IDs
                for (const id of allStudentIds) {
                    if (data.records?.[id]) {
                        status = data.records[id];
                        break;
                    }
                }

                if (data.date) {
                    history.push({ id: doc.id, date: data.date, status });
                }
            });

            // Sort & Calc Stats
            history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            history.forEach(item => {
                if (item.status === 'PRESENT') p++;
                else if (item.status === 'ABSENT') a++;
                else if (item.status === 'LATE') l++;
            });

            setStats({ present: p, absent: a, late: l, total: history.length });
            setAttendanceHistory(history.slice(0, 30));
        });


        // 2. Homework Listener
        const qHw = query(collection(db, "homework"), where("tenantId", "==", tenantId), where("grade", "==", grade));
        const unsubHw = onSnapshot(qHw, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRawHomeworks(list);
        });

        // 3. Submissions Listener
        const searchIds = allStudentIds.slice(0, 10); // Limit 10 for 'in' query
        const qSub = query(
            collection(db, "submissions"),
            where("tenantId", "==", tenantId),
            where("studentId", "in", searchIds)
        );
        const unsubSub = onSnapshot(qSub, (snapshot) => {
            const map: any = {};

            snapshot.forEach(d => {
                const data = d.data();
                const hwId = data.homeworkId;
                const newSub = { id: d.id, ...data };

                if (!map[hwId]) {
                    map[hwId] = newSub;
                } else {
                    // Conflict Resolution: Prioritize Verified/Incomplete > Submitted
                    const existing = map[hwId];

                    const getPriority = (s: any) => {
                        if (s.status === 'CHECKED') return 3;
                        if (s.status === 'INCOMPLETE') return 2;
                        return 1;
                    };

                    const pNew = getPriority(newSub);
                    const pExist = getPriority(existing);

                    if (pNew > pExist) {
                        map[hwId] = newSub;
                    } else if (pNew === pExist) {
                        // Tie-break with timestamps
                        const tNew = (newSub as any).checkedAt?.seconds || (newSub as any).submittedAt?.seconds || 0;
                        const tExist = (existing as any).checkedAt?.seconds || (existing as any).submittedAt?.seconds || 0;
                        if (tNew > tExist) {
                            map[hwId] = newSub;
                        }
                    }
                }
            });
            console.log("Processed Submissions Map:", Object.keys(map).length);
            setRawSubmissions(map);
        });

        setLoading(false);

        return () => {
            unsubAtt();
            unsubHw();
            unsubSub();
        };
    }, [studentContext]);

    // Merge Homework & Submissions
    useEffect(() => {
        if (rawHomeworks.length === 0) {
            setHomeworkList([]);
            return;
        }

        let merged = rawHomeworks.map(hw => ({
            ...hw,
            submission: rawSubmissions[hw.id]
        }));

        // Client-side Sort
        merged.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

        setHomeworkList(merged.slice(0, 5));

    }, [rawHomeworks, rawSubmissions]);


    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            await AsyncStorage.removeItem('biometric_enabled');
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

    if (loading && !studentName) { // Only show full loader if we don't even have a name yet
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

                {/* Homework List */}
                <View style={styles.sectionHeader}>
                    <Ionicons name="book-outline" size={20} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Recent Homework</Text>
                </View>

                <View style={[styles.listContainer, { marginBottom: 30 }]}>
                    {homeworkList.length === 0 ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <Text style={{ color: colors.textSecondary }}>No homework assigned recently.</Text>
                        </View>
                    ) : (
                        homeworkList.map((item) => (
                            <View key={item.id} style={styles.listItem}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.dateFullText}>{item.title}</Text>
                                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Due: {item.dueDate}</Text>
                                </View>
                                <View style={[styles.statusBadge, {
                                    backgroundColor: (item.submission ? (item.submission.status === 'CHECKED' ? colors.success : (item.submission.status === 'INCOMPLETE' ? colors.danger : colors.primary)) : colors.warning) + '20'
                                }]}>
                                    <Text style={[styles.statusText, {
                                        color: (item.submission ? (item.submission.status === 'CHECKED' ? colors.success : (item.submission.status === 'INCOMPLETE' ? colors.danger : colors.primary)) : colors.warning)
                                    }]}>
                                        {item.submission ? (item.submission.status === 'CHECKED' ? 'Verified' : (item.submission.status === 'INCOMPLETE' ? 'Redo / Incomplete' : 'Submitted')) : 'Pending'}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
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
