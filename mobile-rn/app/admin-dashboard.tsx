import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export default function AdminDashboard() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [activeTab, setActiveTab] = useState('STUDENTS'); // STUDENTS, HOMEWORK, ATTENDANCE

    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // ATTENDANCE STATE
    const [attendanceDate, setAttendanceDate] = useState(new Date());
    const [attendanceMap, setAttendanceMap] = useState<any>({});
    const [saving, setSaving] = useState(false);

    // Fetch Data
    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        const q = query(collection(db, "users"), where("tenantId", "==", tenantId));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = list.filter((u: any) => u.role !== 'admin' && u.role !== 'ADMIN');
            setStudents(filtered);
            setLoading(false);
        });

        return () => unsub();
    }, [tenantId]);

    // Fetch Attendance Record when Date/Tab changes
    useEffect(() => {
        if (activeTab === 'ATTENDANCE' && tenantId) {
            const dateStr = attendanceDate.toISOString().split('T')[0];
            const docId = `${tenantId}_${dateStr}`;
            const unsub = onSnapshot(doc(db, "attendance", docId), (docSnap) => {
                if (docSnap.exists()) {
                    setAttendanceMap(docSnap.data().records || {});
                } else {
                    setAttendanceMap({});
                }
            });
            return () => unsub();
        }
    }, [activeTab, attendanceDate, tenantId]);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            router.replace('/auth');
        } catch (e) {
            console.error(e);
        }
    };

    const handleApprove = async (id: string, name: string) => {
        try {
            await updateDoc(doc(db, "users", id), { status: 'ACTIVE' });
            Alert.alert("Success", `Approved ${name}`);
        } catch (e) {
            Alert.alert("Error", "Failed to approve.");
        }
    };

    const handleReject = async (id: string) => {
        try {
            await updateDoc(doc(db, "users", id), { status: 'REJECTED' });
        } catch (e) {
            Alert.alert("Error", "Failed to reject.");
        }
    };

    // ATTENDANCE FUNCTIONS
    const activeStudentList = students.filter(s => s.status === 'ACTIVE');

    const changeDate = (days: number) => {
        const newDate = new Date(attendanceDate);
        newDate.setDate(newDate.getDate() + days);
        setAttendanceDate(newDate);
    };

    const markStatus = (studentId: string, status: string) => {
        setAttendanceMap((prev: any) => ({ ...prev, [studentId]: status }));
    };

    const markAll = (status: string) => {
        const newMap: any = {};
        activeStudentList.forEach(s => {
            newMap[s.id] = status;
        });
        setAttendanceMap(newMap);
    };

    const saveAttendance = async () => {
        if (activeStudentList.length === 0) return;
        setSaving(true);
        try {
            const dateStr = attendanceDate.toISOString().split('T')[0];
            const docId = `${tenantId}_${dateStr}`;

            // Calculate stats
            const records = attendanceMap;
            const total = activeStudentList.length;
            const present = Object.values(records).filter(v => v === 'PRESENT').length;
            const absent = Object.values(records).filter(v => v === 'ABSENT').length;

            await import('firebase/firestore').then(({ setDoc, serverTimestamp }) => {
                setDoc(doc(db, "attendance", docId), {
                    tenantId,
                    date: dateStr,
                    records,
                    totalStudents: total,
                    presentCount: present,
                    absentCount: absent,
                    updatedAt: serverTimestamp(),
                    markedBy: auth.currentUser?.uid || 'admin'
                });
            });

            Alert.alert("Success", "Attendance Saved!");
        } catch (e: any) {
            Alert.alert("Error", e.message);
        } finally {
            setSaving(false);
        }
    };

    const renderStudentItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                    <Text style={styles.cardTitle}>{item.name || "Unknown"}</Text>
                    <Text style={styles.cardSubtitle}>{item.phoneNumber}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <View style={[styles.badge, { backgroundColor: colors.border }]}>
                            <Text style={styles.badgeText}>{item.grade || "No Grade"}</Text>
                        </View>
                        <View style={[styles.badge, {
                            backgroundColor: item.status === 'ACTIVE' ? colors.success + '20' :
                                (item.status === 'PENDING' ? colors.warning + '20' : colors.danger + '20')
                        }]}>
                            <Text style={[styles.badgeText, {
                                color: item.status === 'ACTIVE' ? colors.success :
                                    (item.status === 'PENDING' ? colors.warning : colors.danger)
                            }]}>{item.status}</Text>
                        </View>
                    </View>
                </View>
                {item.status === 'PENDING' && (
                    <View style={{ gap: 8 }}>
                        <TouchableOpacity onPress={() => handleApprove(item.id, item.name)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleReject(item.id)} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
                            <Ionicons name="close" size={16} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );

    const renderAttendanceItem = ({ item }: { item: any }) => {
        const status = attendanceMap[item.id] || 'UNMARKED';
        return (
            <View style={[styles.card, { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={[styles.cardSubtitle, { fontSize: 10 }]}>{item.grade}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'PRESENT')}
                        style={[styles.attBtn, status === 'PRESENT' && { backgroundColor: colors.success, borderColor: colors.success }]}
                    >
                        <Text style={[styles.attBtnText, status === 'PRESENT' && { color: '#FFF' }]}>P</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'ABSENT')}
                        style={[styles.attBtn, status === 'ABSENT' && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                    >
                        <Text style={[styles.attBtnText, status === 'ABSENT' && { color: '#FFF' }]}>A</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'LATE')}
                        style={[styles.attBtn, status === 'LATE' && { backgroundColor: colors.warning, borderColor: colors.warning }]}
                    >
                        <Text style={[styles.attBtnText, status === 'LATE' && { color: '#FFF' }]}>L</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const pendingStudents = students.filter(s => s.status === 'PENDING');
    const activeStudents = students.filter(s => s.status !== 'PENDING');

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Admin Console</Text>
                    <Text style={styles.headerSubtitle}>Tenant: {tenantId}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                    <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                </TouchableOpacity>
            </View>

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                {['STUDENTS', 'HOMEWORK', 'ATTENDANCE'].map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab.charAt(0) + tab.slice(1).toLowerCase()}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <>
                        {activeTab === 'STUDENTS' && (
                            <FlatList
                                data={[...pendingStudents, ...activeStudents]}
                                keyExtractor={item => item.id}
                                renderItem={renderStudentItem}
                                ListHeaderComponent={() => (
                                    <View style={{ marginBottom: 10 }}>
                                        {pendingStudents.length > 0 && <Text style={styles.sectionHeader}>Pending Approvals ({pendingStudents.length})</Text>}
                                    </View>
                                )}
                                contentContainerStyle={{ paddingBottom: 20 }}
                            />
                        )}

                        {activeTab === 'HOMEWORK' && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Homework Management</Text>
                                <View style={styles.emptyState}>
                                    <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
                                    <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Mobile Homework Manager coming soon.</Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Use Web Portal for full features.</Text>
                                </View>
                            </View>
                        )}

                        {activeTab === 'ATTENDANCE' && (
                            <View style={styles.section}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: colors.card, padding: 10, borderRadius: 12 }}>
                                    <TouchableOpacity onPress={() => changeDate(-1)} style={{ padding: 5 }}>
                                        <Ionicons name="chevron-back" size={24} color={colors.primary} />
                                    </TouchableOpacity>
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={{ fontWeight: 'bold', color: colors.text, fontSize: 16 }}>
                                            {attendanceDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                            {new Date().toDateString() === attendanceDate.toDateString() ? 'Today' : ''}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => changeDate(1)} style={{ padding: 5 }}>
                                        <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                {loading ? (
                                    <ActivityIndicator />
                                ) : (
                                    <>
                                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10, gap: 10 }}>
                                            <TouchableOpacity onPress={() => markAll('PRESENT')}><Text style={{ color: colors.success, fontWeight: 'bold' }}>All Present</Text></TouchableOpacity>
                                            <TouchableOpacity onPress={() => markAll('ABSENT')}><Text style={{ color: colors.danger, fontWeight: 'bold' }}>All Absent</Text></TouchableOpacity>
                                        </View>

                                        <FlatList
                                            data={activeStudents}
                                            keyExtractor={item => item.id}
                                            renderItem={renderAttendanceItem}
                                            contentContainerStyle={{ paddingBottom: 20 }}
                                            style={{ flex: 1 }}
                                        />
                                    </>
                                )}

                                <TouchableOpacity
                                    style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                                    onPress={saveAttendance}
                                    disabled={saving}
                                >
                                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Attendance</Text>}
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </View>
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
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
        fontFamily: 'monospace'
    },
    logoutButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: colors.background,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        padding: 10,
        justifyContent: 'space-around',
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    activeTab: {
        backgroundColor: colors.primary + '20',
    },
    tabText: {
        color: colors.textSecondary,
        fontWeight: '600',
        fontSize: 12
    },
    activeTabText: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    section: {
        marginBottom: 20,
        flex: 1, // Ensure it takes space
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 10,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.warning,
        marginBottom: 10,
        marginTop: 10
    },
    card: {
        backgroundColor: colors.card,
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text
    },
    cardSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.text
    },
    actionBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        opacity: 0.7
    },
    attBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background
    },
    attBtnText: {
        fontWeight: 'bold',
        color: colors.textSecondary
    },
    saveBtn: {
        backgroundColor: colors.primary,
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20
    },
    saveBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16
    }
});
