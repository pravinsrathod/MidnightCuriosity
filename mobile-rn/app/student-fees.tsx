import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Image, Alert, SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTenant } from '../context/TenantContext';

export default function StudentFeesScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { tenantLogo, features } = useTenant();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    // Feature gating
    useEffect(() => {
        if (features && features.enableFees === false) {
            router.replace('/grade');
        }
    }, [features]);

    const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = useMemo(() => ({
        PENDING: { color: colors.warning, icon: 'time-outline', label: 'Pending' },
        PARTIAL: { color: colors.primary, icon: 'pie-chart-outline', label: 'Partial' },
        PAID: { color: colors.success, icon: 'checkmark-circle-outline', label: 'Paid' },
        OVERDUE: { color: colors.danger, icon: 'alert-circle-outline', label: 'Overdue' },
        WAIVED: { color: colors.textSecondary, icon: 'remove-circle-outline', label: 'Waived' },
    }), [colors]);

    const [fees, setFees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [studentData, setStudentData] = useState<any>(null);

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

        const q = query(
            collection(db, 'fees'), 
            where('tenantId', '==', studentData.tenantId), 
            where('studentId', '==', studentUid)
        );

        const unsub = onSnapshot(q, snap => {
            const today = new Date().toISOString().split('T')[0];
            const list = snap.docs.map(d => {
                const data = { id: d.id, ...d.data() } as any;
                if (data.status === 'PENDING' && data.dueDate < today) data.status = 'OVERDUE';
                return data;
            });
            list.sort((a, b) => (b.dueDate > a.dueDate ? 1 : -1));
            setFees(list);
            setRefreshing(false);
        }, (err) => {
            console.error("Fees snapshot error:", err);
            setRefreshing(false);
        });

        return () => unsub();
    }, [studentData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData().then(() => setRefreshing(false));
    };

    const handlePayNow = () => {
        const outstandingFee = fees.find(f => ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status));
        if (outstandingFee) {
            router.push({
                pathname: '/fee-detail',
                params: {
                    id: String(outstandingFee.id),
                    label: String(outstandingFee.label || ''),
                    grade: String(outstandingFee.grade || ''),
                    totalAmount: String(outstandingFee.totalAmount || 0),
                    paidAmount: String(outstandingFee.paidAmount || 0),
                    dueDate: String(outstandingFee.dueDate || ''),
                    status: String(outstandingFee.status || ''),
                    paymentMethod: String(outstandingFee.paymentMethod || ''),
                    receiptNumber: String(outstandingFee.receiptNumber || ''),
                    notes: String(outstandingFee.notes || ''),
                    items: JSON.stringify(outstandingFee.items || []),
                    tenantId: String(outstandingFee.tenantId || ''),
                    studentId: String(outstandingFee.studentId || ''),
                }
            });
        } else {
            Alert.alert("No Outstanding Fees", "You don't have any pending or overdue fees to pay at the moment.");
        }
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
                <Ionicons name="receipt-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Fees Found</Text>
            <Text style={styles.emptySubtitle}>There are currently no fee records associated with your account.</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
                <Text style={styles.refreshBtnText}>Refresh Data</Text>
            </TouchableOpacity>
        </View>
    );

    const renderFee = ({ item }: { item: any }) => {
        const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
        const remaining = (item.totalAmount || 0) - (item.paidAmount || 0);

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                    pathname: '/fee-detail',
                    params: {
                        id: item.id,
                        label: item.label,
                        grade: item.grade,
                        totalAmount: String(item.totalAmount || 0),
                        paidAmount: String(item.paidAmount || 0),
                        dueDate: item.dueDate,
                        status: item.status,
                        paymentMethod: item.paymentMethod || '',
                        receiptNumber: item.receiptNumber || '',
                        notes: item.notes || '',
                        items: JSON.stringify(item.items || []),
                        tenantId: item.tenantId,
                        studentId: item.studentId,
                    }
                })}
                activeOpacity={0.7}
            >
                <View style={styles.cardRow}>
                    <View style={[styles.iconBg, { backgroundColor: cfg.color + '15' }]}>
                        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                    </View>
                    <View style={styles.cardInfo}>
                        <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                        <View style={styles.row}>
                            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                            <Text style={styles.dueDate}>Due {item.dueDate}</Text>
                        </View>
                    </View>
                    <View style={styles.amountCol}>
                        <Text style={styles.amount}>RM {remaining.toFixed(2)}</Text>
                        <View style={[styles.badge, { backgroundColor: cfg.color + '10', borderColor: cfg.color + '40' }]}>
                            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.border} />
                </View>
                {item.status === 'PARTIAL' && (
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, ((item.paidAmount || 0) / (item.totalAmount || 1)) * 100)}%` as any }]} />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.titleText}>My Fees</Text>
                {tenantLogo ? (
                    <Image source={{ uri: tenantLogo }} style={styles.logo} />
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            <FlatList
                data={fees}
                keyExtractor={f => f.id}
                renderItem={renderFee}
                contentContainerStyle={styles.list}
                ListHeaderComponent={
                    <View style={{ paddingHorizontal: 20 }}>
                        <View style={styles.titleSection}>
                            <Text style={styles.headerTitle}>School Fees</Text>
                            <Text style={styles.headerSubtitle}>Manage and track your payments</Text>
                        </View>
                        
                        {fees.length > 0 ? (
                            <LinearGradient
                                colors={[colors.primary, colors.primary + 'CC']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.summaryCard}
                            >
                                <View style={styles.summaryInfo}>
                                    <Text style={styles.summaryLabel}>Total Outstanding</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                        <Text style={styles.currencySymbol}>RM</Text>
                                        <Text style={styles.totalAmount}>
                                            {fees.reduce((acc, fee) => (fee.status !== 'PAID' ? acc + (Number(fee.totalAmount) - (Number(fee.paidAmount) || 0)) : acc), 0).toFixed(2)}
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity 
                                    style={styles.payAllBtn}
                                    onPress={handlePayNow}
                                >
                                    <Text style={styles.payAllText}>Pay Now</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        ) : (
                            renderEmptyState()
                        )}
                        {fees.length > 0 && <Text style={styles.sectionTitle}>Payment History</Text>}
                    </View>
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            />
        </SafeAreaView>
    );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
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
    list: { paddingBottom: insets.bottom + 20 },
    titleSection: { marginTop: 10, marginBottom: 24, paddingHorizontal: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1 },
    headerSubtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16, marginTop: 8 },
    summaryCard: { 
        padding: 24, 
        borderRadius: 24, 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 32,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    summaryInfo: { gap: 4 },
    summaryLabel: { color: '#FFFFFF', opacity: 0.9, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },
    currencySymbol: { color: '#FFFFFF', fontSize: 18, marginRight: 4, fontWeight: '600' },
    totalAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
    payAllBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    payAllText: { color: colors.primary, fontWeight: 'bold', fontSize: 15 },
    card: {
        backgroundColor: colors.card + '80', 
        borderRadius: 20, 
        padding: 16,
        borderWidth: 1, 
        borderColor: colors.border + '50', 
        marginHorizontal: 20,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconBg: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1, minWidth: 0 },
    label: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    dueDate: { fontSize: 13, color: colors.textSecondary },
    amountCol: { alignItems: 'flex-end', gap: 6 },
    amount: { fontSize: 17, fontWeight: '800', color: colors.text },
    badge: {
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 12, borderWidth: 1,
    },
    badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    progressBar: {
        height: 6, backgroundColor: colors.border + '30',
        borderRadius: 3, marginTop: 16, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
    row: { flexDirection: 'row', alignItems: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
        backgroundColor: colors.card + '40',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: colors.border + '30',
        marginTop: 20,
    },
    emptyIconBg: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.primary + '10',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 12,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    refreshBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
    },
    refreshBtnText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
