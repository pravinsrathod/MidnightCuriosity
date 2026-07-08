import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Image, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTenant, useFeature } from '../../context/TenantContext';
import { ParentHeader } from '../../components/ParentHeader';
import { useAuth } from '../../context/AuthContext';
import CampaignCarousel from '../../components/CampaignCarousel';
import { onAuthStateChanged } from 'firebase/auth';
import { linkGoogleAccount } from '../../services/googleAuthService';

// --- Premium UI Components (Overview versions) ---

const AttendanceMini = ({ total, present, colors, styles, onPress }: { total: number, present: number, colors: any, styles: any, onPress: () => void }) => {
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return (
        <TouchableOpacity style={styles.gridCard} onPress={onPress}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={[styles.iconCircleSmall, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="calendar" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.gridCardValue, { color: colors.primary }]}>{percentage}%</Text>
            </View>
            <View>
                <Text style={styles.cardTitle}>Attendance</Text>
                <Text style={styles.cardSubtitle}>{present}/{total} Days</Text>
            </View>
            <View style={[styles.progressBarBg, { marginTop: 12 }]}>
                <View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: colors.primary }]} />
            </View>
        </TouchableOpacity>
    );
};

const HomeworkMini = ({ count, colors, styles, onPress }: { count: number, colors: any, styles: any, onPress: () => void }) => {
    return (
        <TouchableOpacity style={styles.gridCard} onPress={onPress}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={[styles.iconCircleSmall, { backgroundColor: colors.warning + '15' }]}>
                    <Ionicons name="book" size={20} color={colors.warning} />
                </View>
                <Text style={[styles.gridCardValue, { color: colors.warning }]}>{count}</Text>
            </View>
            <View>
                <Text style={styles.cardTitle}>Homework</Text>
                <Text style={styles.cardSubtitle}>Pending Tasks</Text>
            </View>
        </TouchableOpacity>
    );
};

const TimetableMini = ({ colors, styles, onPress }: { colors: any, styles: any, onPress: () => void }) => {
    return (
        <TouchableOpacity style={styles.gridCard} onPress={onPress}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={[styles.iconCircleSmall, { backgroundColor: colors.info + '15' }]}>
                    <Ionicons name="time" size={20} color={colors.info} />
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.info} />
            </View>
            <View>
                <Text style={styles.cardTitle}>Timetable</Text>
                <Text style={styles.cardSubtitle}>Class Schedule</Text>
            </View>
        </TouchableOpacity>
    );
};

export default function HomeDashboard() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { tenantName, tenantLogo } = useTenant();
    const showAttendance = useFeature('enableAttendance');
    const showHomework = useFeature('enableHomework');
    const showFees = useFeature('enableFees');
    const showTimetable = useFeature('enableTimetable');
    const showCampaigns = useFeature('enableCampaigns');
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    const { profile, selectedChildId, setSelectedChildId, user: authUser } = useAuth();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [studentName, setStudentName] = useState('');
    const [studentContext, setStudentContext] = useState<any>(null);
    const [children, setChildren] = useState<any[]>([]);
    const [parentName, setParentName] = useState('');
    const [parentUid, setParentUid] = useState('');

    // Data Summaries
    const [stats, setStats] = useState({ present: 0, total: 0 });
    const [pendingHomeworkCount, setPendingHomeworkCount] = useState(0);
    const [feesTotalDue, setFeesTotalDue] = useState(0);

    const [isGoogleLinked, setIsGoogleLinked] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                const linked = user.providerData.some(p => p.providerId === 'google.com');
                setIsGoogleLinked(linked);
            }
        });
        return unsubscribe;
    }, []);

    const handleLinkGoogle = async () => {
        try {
            const user = await linkGoogleAccount();
            setIsGoogleLinked(true);
            
            if (parentUid) {
                await updateDoc(doc(db, "users", parentUid), {
                    authProvider: 'google.com',
                    email: user.email
                });
            }
            Alert.alert("Success", "Your Google account has been linked successfully! You can now log in using Google.");
        } catch (e: any) {
            console.error("Linking error:", e);
            if (e.code === 'auth/credential-already-in-use') {
                Alert.alert("Account Already Linked", "This Google account is already linked to another user. Please contact your Institute Administrator to resolve this, or use a different Google account.");
                return;
            }
            const isCancel = e.message?.includes('developer') || e.code === 'SIGN_IN_CANCELLED' || e.code === '12501';
            if (!isCancel) {
                Alert.alert("Linking Failed", e.message || "Failed to link Google account.");
            }
        }
    };

    const fetchIdentity = async () => {
        try {
            if (!profile) {
                if (!authUser) { router.replace('/auth'); return; }
                return; // Wait for profile from AuthContext
            }
            
            // SELF-HEALING: If a student lands here, redirect them
            if (profile.role?.toUpperCase() === 'STUDENT') {
                router.replace('/grade');
                return;
            }

            setParentName(profile.firstName || profile.name || profile.displayName || 'Parent');
            setParentUid(profile.id);
            
            const foundStudents: any[] = [];
            const phonesToQuery = new Set<string>();
            if (profile.linkedStudentPhone) phonesToQuery.add(profile.linkedStudentPhone);
            if (profile.linkedStudentPhones) profile.linkedStudentPhones.forEach((p: string) => phonesToQuery.add(p));

            if (phonesToQuery.size > 0) {
                const studentQ = query(collection(db, "users"), where("phoneNumber", "in", Array.from(phonesToQuery)), where("tenantId", "==", profile.tenantId));
                const studentSnap = await getDocs(studentQ);
                studentSnap.docs.forEach(d => foundStudents.push({ id: d.id, ...d.data(), isPending: false }));
            }

            const pendingStudents: any[] = [];
            if (profile.pendingChildPhones && profile.pendingChildPhones.length > 0) {
                const pendingQ = query(collection(db, "users"), where("phoneNumber", "in", profile.pendingChildPhones), where("tenantId", "==", profile.tenantId));
                const pendingSnap = await getDocs(pendingQ);
                pendingSnap.forEach(d => pendingStudents.push({ id: d.id, ...d.data(), isPending: true }));
            }

            const allChildren = [...foundStudents, ...pendingStudents];
            setChildren(allChildren);
            
            // If no child is selected yet, default to the first one
            if (allChildren.length > 0 && !selectedChildId) {
                setSelectedChildId(allChildren[0].id);
            }
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
    }, [profile]);

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
                        router.replace('/auth');
                    } catch (e) { console.error(e); }
                }
            }
        ]);
    };

    const handleAddChild = async (phone: string) => {
        if (!phone || phone.length < 8) {
            Alert.alert("Invalid Input", "Please enter a valid phone number.");
            return;
        }
        setLoading(true);
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
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
        <View style={styles.container}>
            {/* Premium Header Component */}
            <ParentHeader 
                parentName={parentName}
                studentName={studentName}
                childList={children}
                selectedChildId={selectedChildId}
                onSelectStudent={(id) => setSelectedChildId(id)}
                onAddChild={handleAddChild}
                onLogout={handleLogout}
                tenantLogo={tenantLogo}
            />
            <ScrollView 
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >

            {studentContext?.isPending ? (
                <View style={styles.pendingCard}>
                    <Ionicons name="time" size={48} color={colors.warning} />
                    <Text style={styles.pendingTitle}>Verification Pending</Text>
                    <Text style={styles.pendingText}>The request to link this student is currently being reviewed by the administration.</Text>
                </View>
            ) : (
                <View style={{ padding: 20 }}>
                    <Text style={styles.sectionTitle}>Dashboard Overview</Text>

                    {!isGoogleLinked && (
                        <TouchableOpacity 
                            style={[
                                styles.card, 
                                { 
                                    borderColor: colors.primary + '30', 
                                    backgroundColor: colors.primary + '08', 
                                    marginBottom: 16,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 16
                                }
                            ]}
                            onPress={handleLinkGoogle}
                        >
                            <View style={[styles.iconCircleSmall, { backgroundColor: colors.primary + '15', marginRight: 12, borderRadius: 20 }]}>
                                <Ionicons name="logo-google" size={20} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>Secure your Account</Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Link your Google account for one-click secure login</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                    )}
                    
                    {showFees && feesTotalDue > 0 && (
                        <TouchableOpacity 
                            style={[styles.card, { borderColor: colors.danger + '30', marginBottom: 16 }]}
                            onPress={() => router.push('/(tabs)/parent-fees')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View>
                                    <Text style={styles.cardTitle}>Fees Outstanding</Text>
                                    <Text style={[styles.cardValue, { color: colors.danger }]}>${feesTotalDue}</Text>
                                    <Text style={styles.cardSubtitle}>Action Required</Text>
                                </View>
                                <View style={[styles.iconCircle, { backgroundColor: colors.danger + '15' }]}>
                                    <Ionicons name="wallet" size={28} color={colors.danger} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}

                    <View style={styles.gridContainer}>
                        {showAttendance && (
                            <AttendanceMini 
                                total={stats.total} 
                                present={stats.present} 
                                colors={colors} 
                                styles={styles}
                                onPress={() => router.push('/(tabs)/parent-attendance')} 
                            />
                        )}

                        {showHomework && (
                            <HomeworkMini 
                                count={pendingHomeworkCount} 
                                colors={colors} 
                                styles={styles}
                                onPress={() => router.push('/(tabs)/parent-homework')} 
                            />
                        )}

                        {showTimetable && (
                            <TimetableMini 
                                colors={colors} 
                                styles={styles}
                                onPress={() => router.push('/timetable')} 
                            />
                        )}
                    </View>




                </View>
            )}

                {showCampaigns && <CampaignCarousel audience="PARENT" />}
            </ScrollView>
        </View>
    );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    logo: { width: 50, height: 50 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 20 },
    modalOverlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'center', padding: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pendingCard: { margin: 20, padding: 30, backgroundColor: colors.card, borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    pendingTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 15 },
    pendingText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 },
    quickActions: { marginTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    actionText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: colors.text },
    card: {
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    gridCard: {
        width: '48%',
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardTitle: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '600',
        marginBottom: 4,
    },
    cardValue: {
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 2,
    },
    gridCardValue: {
        fontSize: 24,
        fontWeight: '800',
    },
    cardSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircleSmall: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressBarBg: {
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        marginTop: 16,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    }
});
