import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Image, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTenant } from '../../context/TenantContext';

// --- Premium UI Components (Overview versions) ---

const AttendanceMini = ({ total, present, colors, onPress }: { total: number, present: number, colors: any, onPress: () => void }) => {
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return (
        <TouchableOpacity style={styles_overview.card} onPress={onPress}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                    <Text style={styles_overview.cardTitle}>Attendance</Text>
                    <Text style={[styles_overview.cardValue, { color: colors.primary }]}>{percentage}%</Text>
                    <Text style={styles_overview.cardSubtitle}>{present} / {total} Days Present</Text>
                </View>
                <View style={[styles_overview.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="calendar" size={28} color={colors.primary} />
                </View>
            </View>
            <View style={styles_overview.progressBarBg}>
                <View style={[styles_overview.progressBarFill, { width: `${percentage}%`, backgroundColor: colors.primary }]} />
            </View>
        </TouchableOpacity>
    );
};

const HomeworkMini = ({ count, colors, onPress }: { count: number, colors: any, onPress: () => void }) => {
    return (
        <TouchableOpacity style={styles_overview.card} onPress={onPress}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                    <Text style={styles_overview.cardTitle}>Homework</Text>
                    <Text style={[styles_overview.cardValue, { color: colors.warning }]}>{count}</Text>
                    <Text style={styles_overview.cardSubtitle}>Pending Tasks</Text>
                </View>
                <View style={[styles_overview.iconCircle, { backgroundColor: colors.warning + '15' }]}>
                    <Ionicons name="book" size={28} color={colors.warning} />
                </View>
            </View>
        </TouchableOpacity>
    );
};

const styles_overview = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardTitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        marginBottom: 4,
    },
    cardValue: {
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressBarBg: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 3,
        marginTop: 16,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    }
});

export default function HomeDashboard() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { tenantName, tenantLogo } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [studentName, setStudentName] = useState('');
    const [studentContext, setStudentContext] = useState<any>(null);
    const [children, setChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const [isSelectionModalVisible, setIsSelectionModalVisible] = useState(false);
    const [isAddChildModalVisible, setIsAddChildModalVisible] = useState(false);
    const [newChildPhone, setNewChildPhone] = useState('');
    const [parentName, setParentName] = useState('');
    const [parentUid, setParentUid] = useState('');

    // Data Summaries
    const [stats, setStats] = useState({ present: 0, total: 0 });
    const [pendingHomeworkCount, setPendingHomeworkCount] = useState(0);
    const [feesTotalDue, setFeesTotalDue] = useState(0);

    const fetchIdentity = async () => {
        try {
            const user = auth.currentUser;
            let uid = user?.uid;
            if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
            if (!uid) { router.replace('/auth'); return; }

            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists()) { setLoading(false); return; }
            const userData = userDoc.data();
            setParentName(userData.name || 'Parent');
            setParentUid(uid);
            
            const foundStudents: any[] = [];
            const phonesToQuery = new Set<string>();
            if (userData.linkedStudentPhone) phonesToQuery.add(userData.linkedStudentPhone);
            if (userData.linkedStudentPhones) userData.linkedStudentPhones.forEach((p: string) => phonesToQuery.add(p));

            if (phonesToQuery.size > 0) {
                const studentQ = query(collection(db, "users"), where("phoneNumber", "in", Array.from(phonesToQuery)), where("tenantId", "==", userData.tenantId));
                const studentSnap = await getDocs(studentQ);
                studentSnap.docs.forEach(d => foundStudents.push({ id: d.id, ...d.data(), isPending: false }));
            }

            const pendingStudents: any[] = [];
            if (userData.pendingChildPhones && userData.pendingChildPhones.length > 0) {
                const pendingQ = query(collection(db, "users"), where("phoneNumber", "in", userData.pendingChildPhones), where("tenantId", "==", userData.tenantId));
                const pendingSnap = await getDocs(pendingQ);
                pendingSnap.forEach(d => pendingStudents.push({ id: d.id, ...d.data(), isPending: true }));
            }

            const allChildren = [...foundStudents, ...pendingStudents];
            setChildren(allChildren);
            if (allChildren.length > 0 && !selectedChildId) setSelectedChildId(allChildren[0].id);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedChildId || children.length === 0) return;
        const child = children.find(c => c.id === selectedChildId);
        if (!child) return;
        setStudentName(child.name);
        setStudentContext({ tenantId: child.tenantId, grade: child.grade, studentUid: child.id, isPending: child.isPending, batch: child.batch });
    }, [selectedChildId, children]);

    useEffect(() => {
        fetchIdentity();
    }, []);

    // Listeners for Summary Data
    useEffect(() => {
        if (!studentContext || studentContext.isPending) return;
        const { tenantId, grade, studentUid, batch } = studentContext;

        // Attendance Stats
        const qAtt = query(collection(db, "attendance"), where("tenantId", "==", tenantId));
        const unsubAtt = onSnapshot(qAtt, (snapshot) => {
            let p = 0, t = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.batch === "All" || data.batch === (batch || "General Batch")) {
                    if (data.records?.[studentUid]) {
                        t++;
                        if (data.records[studentUid] === 'PRESENT') p++;
                    }
                }
            });
            setStats({ present: p, total: t });
        });

        // Homework Count
        const qHw = query(collection(db, "homework"), where("tenantId", "==", tenantId), where("grade", "==", grade));
        const unsubHw = onSnapshot(qHw, (snapshot) => {
            const hws = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = hws.filter((hw: any) => !hw.batch || hw.batch === "All" || hw.batch === (batch || "General Batch"));
            
            // Just count them for overview
            setPendingHomeworkCount(filtered.length); 
        });

        // Fees
        const qFees = query(collection(db, 'fees'), where('tenantId', '==', tenantId), where('studentId', '==', studentUid));
        const unsubFees = onSnapshot(qFees, (snapshot) => {
            let due = 0;
            snapshot.forEach(d => {
                const f = d.data();
                if (['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status)) {
                    due += (f.totalAmount || 0) - (f.paidAmount || 0);
                }
            });
            setFeesTotalDue(due);
        });

        return () => { unsubAtt(); unsubHw(); unsubFees(); };
    }, [studentContext]);

    const onRefresh = () => { setRefreshing(true); fetchIdentity().then(() => setRefreshing(false)); };

    const handleLogout = async () => {
        Alert.alert("Logout", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Logout", 
                style: "destructive", 
                onPress: async () => {
                    try {
                        await auth.signOut();
                        await AsyncStorage.removeItem('user_uid');
                        router.replace('/auth');
                    } catch (e) { console.error(e); }
                }
            }
        ]);
    };

    const handleAddChild = async () => {
        if (!newChildPhone || newChildPhone.length < 8) {
            Alert.alert("Invalid Input", "Please enter a valid phone number.");
            return;
        }
        setLoading(true);
        try {
            const cleanPhone = newChildPhone.replace(/[^0-9]/g, '');
            // Check if student exists
            const q = query(collection(db, "users"), where("phoneNumber", "==", cleanPhone));
            const snap = await getDocs(q);
            
            if (snap.empty) {
                Alert.alert("Not Found", "No student found with this phone number. Please check the number and try again.");
                setLoading(false);
                return;
            }

            await updateDoc(doc(db, "users", parentUid), {
                pendingChildPhones: arrayUnion(cleanPhone)
            });

            Alert.alert("Success", "Request sent! Once approved, you can switch to this child's dashboard.");
            setIsAddChildModalVisible(false);
            setNewChildPhone('');
            fetchIdentity();
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to add child. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <ScrollView 
            style={styles.container} 
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <View style={styles.header}>
                <View>
                    <Text style={styles.parentName}>{parentName}</Text>
                    <Text style={styles.welcomeText}>Parent Dashboard</Text>
                    <TouchableOpacity onPress={() => setIsSelectionModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={styles.studentName}>{studentName}</Text>
                        <Ionicons name="chevron-down" size={18} color={colors.primary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 15 }}>
                    <TouchableOpacity onPress={() => setIsAddChildModalVisible(true)} style={styles.headerIcon}>
                        <Ionicons name="person-add-outline" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.headerIcon}>
                        <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                    </TouchableOpacity>
                </View>
            </View>

            {studentContext?.isPending ? (
                <View style={styles.pendingCard}>
                    <Ionicons name="time" size={48} color={colors.warning} />
                    <Text style={styles.pendingTitle}>Verification Pending</Text>
                    <Text style={styles.pendingText}>The request to link this student is currently being reviewed by the administration.</Text>
                </View>
            ) : (
                <View style={{ padding: 20 }}>
                    <Text style={styles.sectionTitle}>Dashboard Overview</Text>
                    
                    <AttendanceMini 
                        total={stats.total} 
                        present={stats.present} 
                        colors={colors} 
                        onPress={() => router.push('/(tabs)/parent-attendance')} 
                    />

                    <HomeworkMini 
                        count={pendingHomeworkCount} 
                        colors={colors} 
                        onPress={() => router.push('/(tabs)/parent-homework')} 
                    />

                    {feesTotalDue > 0 && (
                        <TouchableOpacity style={[styles_overview.card, { borderColor: colors.danger + '30' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View>
                                    <Text style={styles_overview.cardTitle}>Fees Outstanding</Text>
                                    <Text style={[styles_overview.cardValue, { color: colors.danger }]}>${feesTotalDue}</Text>
                                    <Text style={styles_overview.cardSubtitle}>Action Required</Text>
                                </View>
                                <View style={[styles_overview.iconCircle, { backgroundColor: colors.danger + '15' }]}>
                                    <Ionicons name="wallet" size={28} color={colors.danger} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}


                </View>
            )}

            {/* Selection Modal */}
            <Modal visible={isSelectionModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.selectionModal}>
                        <Text style={styles.modalTitle}>Select Child</Text>
                        {children.map((child: any) => (
                            <TouchableOpacity 
                                key={child.id} 
                                style={[styles.childItem, selectedChildId === child.id && { backgroundColor: colors.primary + '10' }]}
                                onPress={() => { setSelectedChildId(child.id); setIsSelectionModalVisible(false); }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Ionicons name="person-circle" size={40} color={child.isPending ? colors.warning : colors.primary} />
                                    <View style={{ marginLeft: 12 }}>
                                        <Text style={styles.childName}>{child.name}</Text>
                                        <Text style={styles.childInfo}>{child.grade} • {child.isPending ? 'Pending' : 'Active'}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setIsSelectionModalVisible(false)}>
                            <Text style={{ color: colors.textSecondary }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/* Add Child Modal */}
            <Modal visible={isAddChildModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.selectionModal}>
                        <Text style={styles.modalTitle}>Add Child</Text>
                        <Text style={{ color: colors.textSecondary, marginBottom: 15, textAlign: 'center' }}>
                            Enter the phone number your child used to register.
                        </Text>
                        <TextInput 
                            style={styles.modalInput}
                            placeholder="Child's Phone Number"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="phone-pad"
                            value={newChildPhone}
                            onChangeText={setNewChildPhone}
                        />
                        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleAddChild}>
                            <Text style={styles.submitBtnText}>Link Student</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setIsAddChildModalVisible(false)}>
                            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    welcomeText: { fontSize: 13, color: colors.primary, fontWeight: '600', textTransform: 'uppercase' },
    parentName: { fontSize: 20, fontWeight: 'bold', color: colors.text },
    studentName: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
    logo: { width: 50, height: 50 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pendingCard: { margin: 20, padding: 30, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    pendingTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 15 },
    pendingText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
    selectionModal: { backgroundColor: '#161616', borderRadius: 32, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 12, textAlign: 'center' },
    childItem: { padding: 15, borderRadius: 20, marginBottom: 10 },
    childName: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
    childInfo: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
    closeBtn: { marginTop: 10, alignSelf: 'center', padding: 10 },
    modalInput: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, color: '#FFF', fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    submitBtn: { padding: 16, borderRadius: 16, alignItems: 'center' },
    submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    quickActions: { marginTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    actionText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: colors.text },
});
