import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeworkCalendar } from '../../components/HomeworkCalendar';

// --- Premium UI Components ---

const ModernHomeworkCard = ({ item, colors, onPress }: { item: any, colors: any, onPress: () => void }) => {
    const isVerified = item.submission?.status === 'CHECKED';
    const isRedo = item.submission?.status === 'INCOMPLETE';
    const isSubmitted = !!item.submission;
    
    let statusColor = colors.warning;
    let statusText = 'Pending';
    if (isVerified) { statusColor = colors.success; statusText = 'Verified'; }
    else if (isRedo) { statusColor = colors.danger; statusText = 'Redo'; }
    else if (isSubmitted) { statusColor = colors.primary; statusText = 'Submitted'; }
 
    return (
        <TouchableOpacity style={styles_premium.hwCard} onPress={onPress}>
            <View style={[styles_premium.hwIconContainer, { backgroundColor: statusColor + '15' }]}>
                <Ionicons name={isVerified ? "checkmark-circle" : (isRedo ? "alert-circle" : "book")} size={24} color={statusColor} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles_premium.hwTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles_premium.hwSubject}>{item.subject || 'General'}</Text>
            </View>
            <View style={[styles_premium.hwBadge, { backgroundColor: statusColor + '10' }]}>
                <Text style={[styles_premium.hwBadgeText, { color: statusColor }]}>{statusText}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles_premium = StyleSheet.create({
    hwCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    hwIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hwTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
    hwSubject: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    hwBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    hwBadgeText: { fontSize: 11, fontWeight: 'bold' }
});
const formatLocal = (date: Date) => {
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
};

export default function HomeworkScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rawHomeworks, setRawHomeworks] = useState<any[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any>({});
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [viewMonth, setViewMonth] = useState(new Date());
    const [studentContext, setStudentContext] = useState<any>(null);

    const fetchChildContext = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;
            if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
            if (!uid) return;

            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists()) return;
            const userData = userDoc.data();

            let firstChildPhone = userData.linkedStudentPhone || userData.linkedStudentPhones?.[0];
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
        const { tenantId, grade, studentUid, batch } = studentContext;

        // Homework Listener
        const qHw = query(collection(db, "homework"), where("tenantId", "==", tenantId), where("grade", "==", grade));
        const unsubHw = onSnapshot(qHw, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = list.filter((hw: any) => !hw.batch || hw.batch === "All" || hw.batch === (batch || "General Batch"));
            setRawHomeworks(filtered);
        });

        // Submissions Listener
        const qSub = query(collection(db, "submissions"), where("tenantId", "==", tenantId), where("studentId", "==", studentUid));
        const unsubSub = onSnapshot(qSub, (snapshot) => {
            const map: any = {};
            snapshot.forEach(d => {
                const data = d.data();
                map[data.homeworkId] = { id: d.id, ...data };
            });
            setRawSubmissions(map);
            setLoading(false);
        });

        return () => { unsubHw(); unsubSub(); };
    }, [studentContext]);

    const homeworkStatusMap = useMemo(() => {
        const map: Record<string, string> = {};
        rawHomeworks.forEach(h => {
            const date = h.dueDate?.toDate ? h.dueDate.toDate() : new Date(h.dueDate);
            const dateStr = formatLocal(date);
            const submission = rawSubmissions[h.id];
            
            let status = 'PENDING';
            if (submission?.status === 'CHECKED') status = 'VERIFIED';
            else if (submission?.status === 'INCOMPLETE') status = 'REDO';
            else if (submission) status = 'SUBMITTED';

            // Priority: REDO > PENDING > SUBMITTED > VERIFIED
            const currentStatus = map[dateStr];
            if (!currentStatus) {
                map[dateStr] = status;
            } else {
                if (status === 'REDO') map[dateStr] = 'REDO';
                else if (status === 'PENDING' && currentStatus !== 'REDO') map[dateStr] = 'PENDING';
                else if (status === 'SUBMITTED' && currentStatus !== 'REDO' && currentStatus !== 'PENDING') map[dateStr] = 'SUBMITTED';
            }
        });
        return map;
    }, [rawHomeworks, rawSubmissions]);

    const filteredHomework = useMemo(() => {
        return rawHomeworks.filter(h => {
            const date = h.dueDate?.toDate ? h.dueDate.toDate() : new Date(h.dueDate);
            if (selectedDate) {
                return formatLocal(date) === selectedDate;
            } else {
                // Default: show all for the current viewed month
                return date.getMonth() === viewMonth.getMonth() && date.getFullYear() === viewMonth.getFullYear();
            }
        }).map(h => ({
            ...h,
            submission: rawSubmissions[h.id] || null
        })).sort((a,b) => {
            const da = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
            const db = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
            return da.getTime() - db.getTime();
        });
    }, [rawHomeworks, rawSubmissions, selectedDate, viewMonth]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchChildContext().then(() => setRefreshing(false));
    };

    if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <ScrollView 
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: colors.text }}>Homework</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginTop: 4 }}>Track assignments and submissions</Text>

            <View style={{ marginTop: 20 }}>
                <HomeworkCalendar 
                    selectedDate={selectedDate} 
                    onDateSelect={setSelectedDate} 
                    onMonthChange={setViewMonth}
                    homeworkData={homeworkStatusMap} 
                    colors={colors}
                />
            </View>

            <View style={{ marginTop: 30 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 15 }}>
                    {selectedDate 
                        ? `Tasks for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : `Tasks for ${viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`
                    }
                </Text>

                {filteredHomework.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                        <Ionicons name="cafe-outline" size={48} color="rgba(255,255,255,0.2)" />
                        <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>No assignments found for this date.</Text>
                    </View>
                ) : (
                    filteredHomework.map(item => (
                        <ModernHomeworkCard 
                            key={item.id} 
                            item={item} 
                            colors={colors} 
                            onPress={() => router.push({
                                pathname: '/parent-homework-detail',
                                params: {
                                    id: item.id,
                                    title: item.title,
                                    description: item.description,
                                    dueDate: item.dueDate?.toDate ? item.dueDate.toDate().toLocaleDateString() : new Date(item.dueDate).toLocaleDateString(),
                                    status: item.submission?.status || 'PENDING',
                                    fileUrl: item.submission?.fileUrl || 'null',
                                    teacherComment: item.submission?.feedback || item.submission?.teacherComment || 'null',
                                    teacherFileUrl: item.submission?.teacherFileUrl || 'null',
                                    submittedAt: item.submission?.submittedAt?.toDate ? Math.floor(item.submission.submittedAt.toDate().getTime() / 1000).toString() : 'null'
                                }
                            })} 
                        />
                    ))
                )}
            </View>
        </ScrollView>
    );
}
