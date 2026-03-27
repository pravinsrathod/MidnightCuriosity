import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AttendanceCalendar } from '../../components/AttendanceCalendar';


export default function AttendanceScreen() {
    const { colors } = useTheme();
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

    const fetchChildContext = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;
            if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
            if (!uid) return;

            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists()) return;
            const userData = userDoc.data();

            // For simplicity, we get the first child. In a real app, this should match the selected child in Home.
            // Better to use a shared context, but for now let's query the first child.
            let firstChildPhone = userData.linkedStudentPhone || userData.linkedStudentPhones?.[0];
            if (!firstChildPhone && userData.pendingChildPhones?.length > 0) firstChildPhone = userData.pendingChildPhones[0];

            if (firstChildPhone) {
                const q = query(collection(db, "users"), where("phoneNumber", "==", firstChildPhone), where("tenantId", "==", userData.tenantId));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const child = snap.docs[0].data();
                    setStudentContext({ tenantId: child.tenantId, grade: child.grade, studentUid: snap.docs[0].id, batch: child.batch });
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchChildContext();
    }, []);

    useEffect(() => {
        if (!studentContext) return;
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
            setLoading(false);
        });

        return () => unsub();
    }, [studentContext]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchChildContext().then(() => setRefreshing(false));
    };

    if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <ScrollView 
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 20, paddingTop: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: colors.text }}>Attendance</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginTop: 4 }}>Detailed history and statistics</Text>


            <View style={{ marginVertical: 10 }}>
                <AttendanceCalendar 
                    attendanceData={attendanceMap} 
                    colors={colors} 
                    onDateSelect={setSelectedDate} 
                    selectedDate={selectedDate} 
                />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30 }}>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.success }}>{stats.present}</Text>
                    <Text style={{ color: colors.textSecondary }}>Present</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.danger }}>{stats.absent}</Text>
                    <Text style={{ color: colors.textSecondary }}>Absent</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.warning }}>{stats.late}</Text>
                    <Text style={{ color: colors.textSecondary }}>Late</Text>
                </View>
            </View>

            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 15 }}>History</Text>
            {history.map((item) => (
                <View key={item.id} style={{ 
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
                    padding: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, 
                    marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
                }}>
                    <View>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                            {new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </Text>
                    </View>
                    <View style={{ 
                        paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
                        backgroundColor: item.status === 'PRESENT' ? colors.success + '15' : (item.status === 'ABSENT' ? colors.danger + '15' : colors.warning + '15')
                    }}>
                        <Text style={{ 
                            fontSize: 12, fontWeight: 'bold',
                            color: item.status === 'PRESENT' ? colors.success : (item.status === 'ABSENT' ? colors.danger : colors.warning)
                        }}>{item.status}</Text>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
