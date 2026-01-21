import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Image, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTenant } from '../context/TenantContext';

export default function ParentDashboard() {
    const router = useRouter();
    const { colors, isDark, toggleTheme } = useTheme();
    const { tenantName, tenantLogo } = useTenant();
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

    // Multi-Student Support
    const [children, setChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const [isLinkingModalVisible, setIsLinkingModalVisible] = useState(false);
    const [isSelectionModalVisible, setIsSelectionModalVisible] = useState(false);
    const [linkPhone, setLinkPhone] = useState('');
    const [isLinking, setIsLinking] = useState(false);

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
            if (!userDoc.exists()) {
                setLoading(false);
                return;
            }

            const userData = userDoc.data();
            const role = userData.role?.toUpperCase();

            // ROLE GUARD: If not parent, kick them back to student dashboard
            if (role !== 'PARENT') {
                router.replace('/grade');
                return;
            }

            // 2. Find Linked Students
            const foundStudents: any[] = [];
            const phonesToQuery = new Set<string>();

            if (userData.linkedStudentPhone) phonesToQuery.add(userData.linkedStudentPhone);
            if (userData.linkedStudentPhones && Array.isArray(userData.linkedStudentPhones)) {
                userData.linkedStudentPhones.forEach((p: string) => phonesToQuery.add(p));
            }

            if (phonesToQuery.size > 0) {
                const studentQ = query(
                    collection(db, "users"),
                    where("phoneNumber", "in", Array.from(phonesToQuery)),
                    where("tenantId", "==", userData.tenantId)
                );
                const studentSnap = await getDocs(studentQ);
                if (!studentSnap.empty) {
                    const snapshotDocs = studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                    const candidates = snapshotDocs.filter(c => c.id !== uid && c.role !== 'PARENT');
                    foundStudents.push(...candidates);
                }
            }

            setChildren(foundStudents);
            if (foundStudents.length > 0) {
                if (!selectedChildId) {
                    setSelectedChildId(foundStudents[0].id);
                }
            } else {
                setStudentName("No children linked");
            }
            setLoading(false);

        } catch (e) {
            console.error("Error fetching identity", e);
            setLoading(false);
        }
    };

    // Update Context when selection changes
    useEffect(() => {
        if (children.length === 0 || !selectedChildId) return;

        const child = children.find(c => c.id === selectedChildId);
        if (!child) return;

        setStudentName(child.name || 'Your Child');

        const allStudentIds = [child.id];
        if (child.legacyUid) allStudentIds.push(child.legacyUid);

        setStudentContext({
            tenantId: child.tenantId,
            grade: child.grade,
            allStudentIds,
            studentUid: child.id
        });
    }, [selectedChildId, children]);

    // Initial Load
    useEffect(() => {
        fetchIdentity();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchIdentity().then(() => setRefreshing(false));
    };

    const handleLinkAnother = () => {
        setLinkPhone('');
        setIsLinkingModalVisible(true);
    };

    const confirmLinking = async () => {
        if (!linkPhone) return;
        const clean = linkPhone.replace(/[^0-9]/g, '');
        if (clean.length < 10) {
            Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number.");
            return;
        }

        try {
            setIsLinking(true);
            const uid = auth.currentUser?.uid || await AsyncStorage.getItem('user_uid');
            if (!uid) return;

            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            const data = userSnap.data();

            const existing = data?.linkedStudentPhones || [];
            if (existing.includes(clean) || data?.linkedStudentPhone === clean) {
                Alert.alert("Already Linked", "This student is already linked to your account.");
                setIsLinking(false);
                return;
            }

            // Update Firestore
            const { arrayUnion, updateDoc } = await import('firebase/firestore');
            await updateDoc(userRef, {
                linkedStudentPhones: arrayUnion(clean)
            });

            Alert.alert("Success", "Linking requested! Pull down to refresh and see the new child switcher.");
            setIsLinkingModalVisible(false);
            fetchIdentity();
        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Could not link student at this time.");
        } finally {
            setIsLinking(false);
        }
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
        }, (err) => {
            console.error("Attendance snapshot error:", err);
            setLoading(false);
        });


        // 2. Homework Listener
        const qHw = query(collection(db, "homework"), where("tenantId", "==", tenantId), where("grade", "==", grade));
        const unsubHw = onSnapshot(qHw, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRawHomeworks(list);
        }, (err) => {
            console.error("Homework snapshot error:", err);
            setLoading(false);
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
        }, (err) => {
            console.error("Submissions snapshot error:", err);
            setLoading(false);
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {tenantLogo ? (
                        <Image source={{ uri: tenantLogo }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                    ) : (
                        <Text style={{ fontSize: 24 }}>🚀</Text>
                    )}
                    <View>
                        <Text style={styles.headerTitle}>{tenantName || "Parent Portal"}</Text>
                        <Text style={styles.headerSubtitle}>Viewing: {studentName}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => setIsSelectionModalVisible(true)} style={styles.logoutButton}>
                        <Ionicons name="people-outline" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                    </TouchableOpacity>
                </View>
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

            {/* Selection Modal (Switch Student) */}
            <Modal
                visible={isSelectionModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setIsSelectionModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={styles.modalTitle}>Choose Student</Text>
                            <TouchableOpacity onPress={() => setIsSelectionModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ marginBottom: 20 }}>
                            {children.map(child => (
                                <TouchableOpacity
                                    key={child.id}
                                    style={[
                                        styles.selectionItem,
                                        selectedChildId === child.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                                    ]}
                                    onPress={() => {
                                        setSelectedChildId(child.id);
                                        setIsSelectionModalVisible(false);
                                    }}
                                >
                                    <View>
                                        <Text style={[styles.selectionName, selectedChildId === child.id && { color: colors.primary }]}>{child.name}</Text>
                                        <Text style={styles.selectionGrade}>{child.grade}</Text>
                                    </View>
                                    {selectedChildId === child.id && (
                                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.addStudentBtn}
                            onPress={() => {
                                setIsSelectionModalVisible(false);
                                handleLinkAnother();
                            }}
                        >
                            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                            <Text style={styles.addStudentText}>Link Another Student</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Link Student Modal */}
            <Modal
                visible={isLinkingModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsLinkingModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Link Another Student</Text>
                        <Text style={styles.modalSubtitle}>Enter the mobile number of your other child to merge their dashboard.</Text>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Mobile Number"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="phone-pad"
                            value={linkPhone}
                            onChangeText={setLinkPhone}
                            maxLength={10}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: colors.border }]}
                                onPress={() => setIsLinkingModalVisible(false)}
                            >
                                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                                onPress={confirmLinking}
                                disabled={isLinking}
                            >
                                {isLinking ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Link Student</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        width: '100%',
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.border,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 20,
        lineHeight: 20,
    },
    modalInput: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        color: colors.text,
        fontSize: 16,
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalBtnText: {
        fontWeight: '600',
    },
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
    },
    childSelector: {
        marginBottom: 20,
    },
    childChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeChildChip: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    childChipText: {
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    activeChildChipText: {
        color: '#FFFFFF',
    },
    selectionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 10,
        backgroundColor: colors.background,
    },
    selectionName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
    },
    selectionGrade: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    addStudentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.primary,
    },
    addStudentText: {
        color: colors.primary,
        fontWeight: '600',
    }
});
