import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { AttendanceCalendar } from '../../components/AttendanceCalendar';
import { ParentHeader } from '../../components/ParentHeader';
import { useTenant } from '../../context/TenantContext';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AttendanceScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
    const [studentContext, setStudentContext] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        const month = '' + (d.getMonth() + 1);
        const day = '' + d.getDate();
        const year = d.getFullYear();
        return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
    });
    const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
    const { profile, selectedChildId, setSelectedChildId, user: authUser } = useAuth();
    const { tenantLogo } = useTenant();
    const [parentName, setParentName] = useState('');
    const [studentName, setStudentName] = useState('');
    const [children, setChildren] = useState<any[]>([]);
    const router = useRouter();

    const fetchIdentity = useCallback(async () => {
        try {
            if (!profile) {
                if (!authUser) router.replace('/auth');
                return;
            }
            
            // SELF-HEALING: If a student lands here, redirect them
            if (profile.role?.toUpperCase() === 'STUDENT') {
                router.replace('/grade');
                return;
            }

            setParentName(profile.firstName || profile.name || profile.displayName || 'Parent');

            const linkedPhones = profile.linkedStudentPhones || (profile.linkedStudentPhone ? [profile.linkedStudentPhone] : []);
            
            if (linkedPhones.length > 0) {
                const q = query(collection(db, "users"), where("phoneNumber", "in", linkedPhones), where("tenantId", "==", profile.tenantId));
                const snap = await getDocs(q);
                const kids = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                setChildren(kids);

                const currentChild = kids.find(k => k.id === selectedChildId) || kids[0];
                if (currentChild) {
                    // Update global selected child if none is currently selected in context
                    if (!selectedChildId) setSelectedChildId(currentChild.id);
                    
                    setStudentName(currentChild.firstName || currentChild.displayName || 'Student');
                    setStudentContext({ 
                        tenantId: currentChild.tenantId, 
                        grade: currentChild.grade, 
                        studentUid: currentChild.id, 
                        batch: currentChild.batch,
                        isPending: false 
                    });
                }
            } else if (profile.pendingChildPhones?.length > 0) {
                setStudentContext({ isPending: true });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [profile, selectedChildId, router]);

    useEffect(() => {
        fetchIdentity();
    }, [fetchIdentity]);

    useEffect(() => {
        if (!studentContext || studentContext.isPending) return;
        const { tenantId, studentUid, batch } = studentContext;

        const q = query(collection(db, "attendance"), where("tenantId", "==", tenantId));
        const unsub = onSnapshot(q, (snapshot) => {
            let list: any[] = [];
            let p = 0, a = 0, l = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.batch === "All" || data.batch === (batch || "General Batch")) {
                    if (data.records?.[studentUid]) {
                        const status = data.records[studentUid];
                        list.push({ id: doc.id, date: data.date, status });
                        if (status === 'PRESENT') p++;
                        else if (status === 'ABSENT') a++;
                        else if (status === 'LATE') l++;
                    }
                }
            });

            list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const map: Record<string, string> = {};
            list.forEach(item => { map[item.date] = item.status; });
            
            setHistory(list);
            setAttendanceMap(map);
            setStats({ present: p, absent: a, late: l, total: list.length });
        });

        return () => unsub();
    }, [studentContext]);

    const handleAddChild = async (phone: string) => {
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            await updateDoc(doc(db, "users", profile.id), {
                pendingChildPhones: arrayUnion(cleanPhone)
            });
            Alert.alert("Success", "Request sent! Once approved, you can switch to this child.");
            fetchIdentity();
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to add child.");
        }
    };

    const handleLogout = async () => {
        await auth.signOut();
        router.replace('/auth');
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <View style={styles.container}>
            <ParentHeader 
                parentName={parentName}
                studentName={studentName}
                childList={children}
                selectedChildId={selectedChildId}
                onSelectStudent={(id) => setSelectedChildId(id)}
                onAddChild={handleAddChild}
                onLogout={handleLogout}
                tenantLogo={tenantLogo}
                showWelcome={false}
            />

            {studentContext?.isPending ? (
                <View style={styles.center}>
                    <View style={styles.pendingCard}>
                        <Ionicons name="time-outline" size={64} color={colors.warning} />
                        <Text style={styles.pendingTitle}>Approval Pending</Text>
                        <Text style={styles.pendingText}>Your link request for {studentName} is waiting for admin approval.</Text>
                    </View>
                </View>
            ) : (
                <ScrollView 
                    contentContainerStyle={styles.contentContainer}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchIdentity().then(() => setRefreshing(false)); }} tintColor={colors.primary} />}
                >
                    <View style={{ paddingHorizontal: 20 }}>
                        <Text style={styles.title}>Attendance</Text>
                        <Text style={styles.subtitle}>Detailed history and statistics</Text>
                    </View>

                    <View style={styles.calendarContainer}>
                        <AttendanceCalendar 
                            attendanceData={attendanceMap} 
                            colors={colors} 
                            onDateSelect={setSelectedDate} 
                            selectedDate={selectedDate} 
                        />
                    </View>

                    <View style={styles.statsContainer}>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.success }]}>{stats.present}</Text>
                            <Text style={styles.statLabel}>Present</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.danger }]}>{stats.absent}</Text>
                            <Text style={styles.statLabel}>Absent</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.warning }]}>{stats.late}</Text>
                            <Text style={styles.statLabel}>Late</Text>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>History</Text>
                    {history.map((item) => (
                        <View key={item.id} style={styles.historyCard}>
                            <View>
                                <Text style={styles.historyDate}>
                                    {new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                </Text>
                            </View>
                            <View style={[
                                styles.statusBadge,
                                { backgroundColor: item.status === 'PRESENT' ? colors.success + '15' : (item.status === 'ABSENT' ? colors.danger + '15' : colors.warning + '15') }
                            ]}>
                                <Text style={[
                                    styles.statusText,
                                    { color: item.status === 'PRESENT' ? colors.success : (item.status === 'ABSENT' ? colors.danger : colors.warning) }
                                ]}>{item.status}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    contentContainer: { paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginTop: 20 },
    subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 20 },
    calendarContainer: { marginVertical: 10 },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30, marginTop: 10 },
    statBox: { alignItems: 'center' },
    statValue: { fontSize: 24, fontWeight: 'bold' },
    statLabel: { color: colors.textSecondary },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 15, paddingHorizontal: 20 },
    historyCard: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
        padding: 16, backgroundColor: colors.card, borderRadius: 16, 
        marginBottom: 12, borderWidth: 1, borderColor: colors.border
    },
    historyDate: { fontSize: 16, fontWeight: '600', color: colors.text },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
    statusText: { fontSize: 12, fontWeight: 'bold' },
    pendingCard: { margin: 20, padding: 30, backgroundColor: colors.card, borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    pendingTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 15 },
    pendingText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
