import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { HomeworkCalendar } from '../../components/HomeworkCalendar';
import { ParentHeader } from '../../components/ParentHeader';
import { useTenant, useFeature } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';

// --- Premium UI Components ---

const ModernHomeworkCard = ({ item, colors, styles, onPress }: { item: any, colors: any, styles: any, onPress: () => void }) => {
    const isVerified = item.submission?.status === 'CHECKED';
    const isRedo = item.submission?.status === 'INCOMPLETE';
    const isSubmitted = !!item.submission;
    
    let statusColor = colors.warning;
    let statusText = 'Pending';
    if (isVerified) { statusColor = colors.success; statusText = 'Verified'; }
    else if (isRedo) { statusColor = colors.danger; statusText = 'Redo'; }
    else if (isSubmitted) { statusColor = colors.primary; statusText = 'Submitted'; }
 
    return (
        <TouchableOpacity style={styles.hwCard} onPress={onPress}>
            <View style={[styles.hwIconContainer, { backgroundColor: statusColor + '15' }]}>
                <Ionicons name={isVerified ? "checkmark-circle" : (isRedo ? "alert-circle" : "book")} size={24} color={statusColor} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.hwTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.hwSubject}>{item.subject || 'General'}</Text>
            </View>
            <View style={[styles.hwBadge, { backgroundColor: statusColor + '10' }]}>
                <Text style={[styles.hwBadgeText, { color: statusColor }]}>{statusText}</Text>
            </View>
        </TouchableOpacity>
    );
};

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
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const isEnabled = useFeature('enableHomework');

    useEffect(() => {
        if (!isEnabled) router.replace('/(tabs)/parent-home' as any);
    }, [isEnabled, router]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rawHomeworks, setRawHomeworks] = useState<any[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any>({});
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [viewMonth, setViewMonth] = useState(new Date());
    const [children, setChildren] = useState<any[]>([]);
    const [parentName, setParentName] = useState('Parent');
    const [studentName, setStudentName] = useState('Student');
    const [studentContext, setStudentContext] = useState<any>(null);
    const { profile, selectedChildId, setSelectedChildId, user: authUser } = useAuth();
    const { tenantLogo } = useTenant();

    const fetchIdentity = React.useCallback(async () => {
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
        const { tenantId, grade, studentUid, batch } = studentContext;

        const qHw = query(collection(db, "homework"), where("tenantId", "==", tenantId), where("grade", "==", grade));
        const unsubHw = onSnapshot(qHw, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = list.filter((hw: any) => !hw.batch || hw.batch === "All" || hw.batch === (batch || "General Batch"));
            setRawHomeworks(filtered);
        });

        const qSub = query(collection(db, "submissions"), where("tenantId", "==", tenantId), where("studentId", "==", studentUid));
        const unsubSub = onSnapshot(qSub, (snapshot) => {
            const map: any = {};
            snapshot.forEach(d => {
                const data = d.data();
                map[data.homeworkId] = { id: d.id, ...data };
            });
            setRawSubmissions(map);
            setRefreshing(false);
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
                        <Text style={styles.title}>Homework</Text>
                        <Text style={styles.subtitle}>Assignments and tasks</Text>
                    </View>

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
                        <Text style={styles.sectionTitle}>
                            {selectedDate 
                                ? `Tasks for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : `Tasks for ${viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`
                            }
                        </Text>

                        {filteredHomework.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="cafe-outline" size={48} color={colors.textSecondary + '40'} />
                                <Text style={styles.emptyText}>No assignments found for this date.</Text>
                            </View>
                        ) : (
                            filteredHomework.map(item => (
                                <ModernHomeworkCard 
                                    key={item.id} 
                                    item={item} 
                                    colors={colors} 
                                    styles={styles}
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
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 15, paddingHorizontal: 20 },
    hwCard: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, 
        padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border,
        marginHorizontal: 20
    },
    hwIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hwTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text },
    hwSubject: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    hwBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    hwBadgeText: { fontSize: 11, fontWeight: 'bold' },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 20,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyText: { color: colors.textSecondary, marginTop: 12 },
    pendingCard: { margin: 20, padding: 30, backgroundColor: colors.card, borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    pendingTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 15 },
    pendingText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
