import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, SafeAreaView, Image } from 'react-native';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { useTenant } from '../context/TenantContext';
import { useRouter } from 'expo-router';

export default function StudentAttendanceScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
    const [studentData, setStudentData] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        const month = '' + (d.getMonth() + 1);
        const day = '' + d.getDate();
        const year = d.getFullYear();
        return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
    });
    const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
    const { tenantLogo, features } = useTenant();
    const router = useRouter();

    // Feature gating
    useEffect(() => {
        if (features && features.enableAttendance === false) {
            router.replace('/grade');
        }
    }, [features]);

    const fetchData = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;
            if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
            if (!uid) return;

            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists()) return;
            const userData = userDoc.data();
            setStudentData(userData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!studentData) return;
        const studentUid = studentData.uid || auth.currentUser?.uid;
        if (!studentUid) return;

        const q = query(collection(db, "attendance"), where("tenantId", "==", studentData.tenantId));
        const unsub = onSnapshot(q, (snapshot) => {
            let list: any[] = [];
            let p = 0, a = 0, l = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.batch === "All" || data.batch === (studentData.batch || "General Batch")) {
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
    }, [studentData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData().then(() => setRefreshing(false));
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.titleText}>Attendance</Text>
                {tenantLogo ? (
                    <Image source={{ uri: tenantLogo }} style={styles.logo} />
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            <ScrollView 
                contentContainerStyle={styles.contentContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                <View style={{ paddingHorizontal: 20 }}>
                    <Text style={styles.title}>My Attendance</Text>
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
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: colors.background,
    },
    backBtn: { padding: 5 },
    titleText: { fontSize: 20, fontWeight: 'bold', color: colors.text },
    logo: { width: 32, height: 32, borderRadius: 16 },
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
        marginBottom: 12, borderWidth: 1, borderColor: colors.border,
        marginHorizontal: 20
    },
    historyDate: { fontSize: 16, fontWeight: '600', color: colors.text },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
    statusText: { fontSize: 12, fontWeight: 'bold' },
});
