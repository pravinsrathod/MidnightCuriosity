import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    SafeAreaView, ActivityIndicator, Platform, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, onSnapshot, getDoc, doc, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
    PENDING: { color: '#eab308', icon: 'time-outline', label: 'Pending' },
    PARTIAL: { color: '#60a5fa', icon: 'pie-chart-outline', label: 'Partial' },
    PAID: { color: '#22c55e', icon: 'checkmark-circle-outline', label: 'Paid' },
    OVERDUE: { color: '#ef4444', icon: 'alert-circle-outline', label: 'Overdue' },
    WAIVED: { color: '#94a3b8', icon: 'remove-circle-outline', label: 'Waived' },
};

export default function FeesTab() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [fees, setFees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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
        const { tenantId, studentUid } = studentContext;

        const q = query(collection(db, 'fees'), where('tenantId', '==', tenantId), where('studentId', '==', studentUid));
        const unsub = onSnapshot(q, snap => {
            const today = new Date().toISOString().split('T')[0];
            const list = snap.docs.map(d => {
                const data = { id: d.id, ...d.data() } as any;
                if (data.status === 'PENDING' && data.dueDate < today) data.status = 'OVERDUE';
                return data;
            });
            list.sort((a, b) => (b.dueDate > a.dueDate ? 1 : -1));
            setFees(list);
            setLoading(false);
            setRefreshing(false);
        }, (err) => {
            console.error("Fees snapshot error:", err);
            setLoading(false);
            setRefreshing(false);
        });

        return () => unsub();
    }, [studentContext]);

    const totalDue = fees
        .filter(f => ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status))
        .reduce((s, f) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);



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
                    <View style={[styles.iconBg, { backgroundColor: cfg.color + '20' }]}>
                        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                    </View>
                    <View style={styles.cardInfo}>
                        <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                        <Text style={styles.dueDate}>Due: {item.dueDate}</Text>
                    </View>
                    <View style={styles.amountCol}>
                        <Text style={styles.amount}>RM {remaining.toFixed(2)}</Text>
                        <View style={[styles.badge, { backgroundColor: cfg.color + '20', borderColor: cfg.color + '60' }]}>
                            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </View>
                {item.status === 'PARTIAL' && (
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, ((item.paidAmount || 0) / (item.totalAmount || 1)) * 100)}%` as any }]} />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Fees Management</Text>
            </View>

            {totalDue > 0 && (
                <View style={styles.banner}>
                    <Ionicons name="alert-circle" size={20} color="#ef4444" />
                    <Text style={styles.bannerText}>
                        Total Outstanding: <Text style={{ fontWeight: 'bold' }}>RM {totalDue.toFixed(2)}</Text>
                    </Text>
                </View>
            )}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : fees.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="checkmark-done-circle-outline" size={64} color={colors.success} />
                    <Text style={styles.emptyTitle}>All Clear!</Text>
                    <Text style={styles.emptySubtitle}>No fees assigned yet.</Text>

                </View>
            ) : (
                <FlatList
                    data={fees}
                    keyExtractor={f => f.id}
                    renderItem={renderFee}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChildContext(); }} tintColor={colors.primary} />}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}

                />
            )}
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        paddingHorizontal: 20, paddingVertical: 15,
        backgroundColor: colors.background,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        paddingTop: Platform.OS === 'ios' ? 10 : 40,
    },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#ef444415', margin: 16, padding: 14,
        borderRadius: 12, borderWidth: 1, borderColor: '#ef444440',
    },
    bannerText: { color: '#ef4444', fontSize: 14 },
    list: { padding: 16 },
    card: {
        backgroundColor: colors.card, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: colors.border,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 2 },
        }),
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBg: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1, minWidth: 0 },
    label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 3 },
    dueDate: { fontSize: 12, color: colors.textSecondary },
    amountCol: { alignItems: 'flex-end', gap: 4 },
    amount: { fontSize: 16, fontWeight: '700', color: colors.text },
    badge: {
        paddingHorizontal: 8, paddingVertical: 2,
        borderRadius: 10, borderWidth: 1,
    },
    badgeText: { fontSize: 11, fontWeight: '600' },
    progressBar: {
        height: 4, backgroundColor: colors.border,
        borderRadius: 2, marginTop: 12, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: '#60a5fa', borderRadius: 2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text },
    emptySubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },

});
