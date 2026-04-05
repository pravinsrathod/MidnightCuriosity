import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Platform, TextInput, Image, ActivityIndicator, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { auth, db, storage } from '../services/firebaseConfig';
import { doc, setDoc, collection, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export default function FeeDetailScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = useMemo(() => ({
        PENDING: { color: colors.warning, icon: 'time-outline', label: 'Pending' },
        PARTIAL: { color: colors.info, icon: 'pie-chart-outline', label: 'Partial' },
        PAID: { color: colors.success, icon: 'checkmark-circle-outline', label: 'Paid' },
        OVERDUE: { color: colors.danger, icon: 'alert-circle-outline', label: 'Overdue' },
        WAIVED: { color: colors.textSecondary, icon: 'remove-circle-outline', label: 'Waived' },
    }), [colors]);

    const {
        id, label, grade, totalAmount, paidAmount,
        dueDate, status: initialStatus, paymentMethod, receiptNumber,
        notes, items: itemsJson, tenantId, studentId
    } = params as Record<string, string>;

    const [status, setStatus] = useState(initialStatus);
    const [currentTotal, setCurrentTotal] = useState(parseFloat(totalAmount || '0'));
    const [currentPaid, setCurrentPaid] = useState(parseFloat(paidAmount || '0'));
    const [submitting, setSubmitting] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [proofUri, setProofUri] = useState<string | null>(null);
    const [pendingReceipts, setPendingReceipts] = useState<any[]>([]);

    // 1. Listen for Real-time Fee Document Updates
    useEffect(() => {
        if (!id) return;
        const unsub = onSnapshot(doc(db, 'fees', id), snap => {
            if (snap.exists()) {
                const data = snap.data();
                setStatus(data.status);
                setCurrentPaid(data.paidAmount || 0);
                setCurrentTotal(data.totalAmount || 0);
            }
        }, (err) => {
            console.error("Fee detail doc snapshot error:", err);
        });
        return unsub;
    }, [id]);

    // 2. Listen for Real-time Payment Receipts
    useEffect(() => {
        if (!id || !tenantId) return;
        const q = query(collection(db, 'paymentReceipts'), where('feeId', '==', id), where('tenantId', '==', tenantId));
        return onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setPendingReceipts(list);
        }, (err) => {
            console.error("Payment receipts snapshot error:", err);
        });
    }, [id, tenantId]);

    const remaining = currentTotal - currentPaid;
    const pendingAmountTotal = pendingReceipts
        .filter(r => r.status === 'VERIFICATION_PENDING')
        .reduce((sum, r) => sum + (r.amountPaid || 0), 0);
    const actualRemaining = Math.max(0, remaining - pendingAmountTotal);
    const parsedItems: { name: string; amount: number }[] = useMemo(() => {
        try { return JSON.parse(itemsJson || '[]'); } catch { return []; }
    }, [itemsJson]);

    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
    const progressPct = currentTotal > 0 ? Math.min(100, (currentPaid / currentTotal) * 100) : 0;
    const isPaid = status === 'PAID';
    const isOverdue = status === 'OVERDUE';

    const InfoRow = ({ icon, label, value }: { icon: any; label: string; value: string }) => (
        <View style={styles.infoRow}>
            <Ionicons name={icon} size={16} color={colors.textSecondary} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setProofUri(result.assets[0].uri);
        }
    };

    const submitPaymentProof = async () => {
        const amount = parseFloat(payAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid amount.');
            return;
        }
        if (amount > actualRemaining) {
            Alert.alert('Invalid Amount', `Maximum payable amount is RM ${actualRemaining.toFixed(2)}${pendingAmountTotal > 0 ? `\n(RM ${pendingAmountTotal.toFixed(2)} is already pending)` : ''}`);
            return;
        }
        if (!proofUri) {
            Alert.alert('Missing Image', 'Please attach a payment receipt photo.');
            return;
        }
        if (!tenantId || !studentId || !id) {
            Alert.alert('Error', 'Missing required student or fee identifiers.');
            return;
        }

        setSubmitting(true);
        try {
            const filename = proofUri.split('/').pop() || `receipt_${Date.now()}.jpg`;
            const storageRef = ref(storage, `tenants/${tenantId}/receipts/${id}/${filename}`);

            const response = await fetch(proofUri);
            const blob = await response.blob();

            await uploadBytesResumable(storageRef, blob);
            const downloadUrl = await getDownloadURL(storageRef);

            const docRef = doc(collection(db, 'paymentReceipts'));
            await setDoc(docRef, {
                tenantId,
                studentId,
                feeId: id,
                feeLabel: label,
                amountPaid: amount,
                proofUrl: downloadUrl,
                status: 'VERIFICATION_PENDING',
                submittedAt: serverTimestamp(),
                submittedBy: auth.currentUser?.uid
            });

            Alert.alert('Success', 'Payment receipt submitted successfully. Administrator will verify it soon.');
            setProofUri(null);
            setPayAmount('');
        } catch (error: any) {
            Alert.alert('Submission Failed', error.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>Fee Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Status Card */}
                <View style={[styles.card, isPaid && { borderColor: colors.success + '40' }, isOverdue && { borderColor: colors.danger + '40' }]}>
                    <View style={styles.statusHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.feeLabel}>{label}</Text>
                            <Text style={styles.gradeText}>{grade}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20', borderColor: cfg.color + '50' }]}>
                            <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>

                    {/* Amount display */}
                    <View style={styles.amountBlock}>
                        <View style={styles.amountItem}>
                            <Text style={styles.amountLabel}>Total</Text>
                            <Text style={styles.amountValue}>RM {currentTotal.toFixed(2)}</Text>
                        </View>
                        <View style={[styles.amountDivider]} />
                        <View style={styles.amountItem}>
                            <Text style={styles.amountLabel}>Paid</Text>
                            <Text style={[styles.amountValue, { color: colors.success }]}>RM {currentPaid.toFixed(2)}</Text>
                        </View>
                        <View style={styles.amountDivider} />
                        <View style={styles.amountItem}>
                            <Text style={styles.amountLabel}>{isPaid ? 'Balance' : 'Remaining'}</Text>
                            <Text style={[styles.amountValue, { color: isPaid ? colors.success : colors.warning }]}>
                                RM {remaining.toFixed(2)}
                            </Text>
                        </View>
                    </View>

                    {/* Progress bar */}
                    {!isPaid && currentPaid > 0 && (
                        <View style={{ marginTop: 16 }}>
                            <Text style={[styles.infoLabel, { marginBottom: 6 }]}>{progressPct.toFixed(0)}% paid</Text>
                            <View style={styles.progressBar}>
                                <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: cfg.color }]} />
                            </View>
                        </View>
                    )}
                </View>

                {/* Fee Breakdown */}
                {parsedItems.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="list-outline" size={20} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Breakdown</Text>
                        </View>
                        {parsedItems.map((item, i) => (
                            <View key={i} style={styles.breakdownRow}>
                                <Text style={styles.breakdownName}>{item.name}</Text>
                                <Text style={styles.breakdownAmount}>RM {parseFloat(String(item.amount || 0)).toFixed(2)}</Text>
                            </View>
                        ))}
                        <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                            <Text style={[styles.breakdownName, { fontWeight: '700', color: colors.text }]}>Total</Text>
                            <Text style={[styles.breakdownAmount, { fontWeight: '700', color: colors.text }]}>RM {currentTotal.toFixed(2)}</Text>
                        </View>
                    </View>
                )}

                {/* Details Card */}
                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Details</Text>
                    </View>
                    <InfoRow icon="calendar-outline" label="Due Date" value={dueDate} />
                    {paymentMethod && <InfoRow icon="card-outline" label="Payment Method" value={paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)} />}
                    {notes && notes !== 'null' && <InfoRow icon="document-text-outline" label="Notes" value={notes} />}
                </View>

                {/* Receipt Card — only when fully paid */}
                {isPaid && receiptNumber && receiptNumber !== 'null' && (
                    <View style={[styles.card, { borderColor: colors.success + '40', backgroundColor: colors.success + '08' }]}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="receipt-outline" size={20} color={colors.success} />
                            <Text style={[styles.sectionTitle, { color: colors.success }]}>Payment Receipt</Text>
                        </View>
                        <Text style={styles.receiptLabel}>Receipt Number</Text>
                        <Text style={styles.receiptNumber}>{receiptNumber}</Text>
                        <View style={styles.paidStamp}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            <Text style={styles.paidStampText}>PAID IN FULL</Text>
                        </View>
                    </View>
                )}

                {/* Pending Receipts Banner */}
                {pendingReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length > 0 && (
                    <View style={[styles.card, { borderColor: colors.warning + '40', backgroundColor: colors.warning + '08' }]}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="time-outline" size={20} color={colors.warning} />
                            <Text style={[styles.sectionTitle, { color: colors.warning }]}>Under Verification</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 10 }}>
                            You have submitted receipts that are currently pending verification by the institute.
                        </Text>
                        {pendingReceipts.filter(r => r.status === 'VERIFICATION_PENDING').map(r => (
                            <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
                                <Text style={{ color: colors.text }}>RM {r.amountPaid?.toFixed(2)}</Text>
                                <Text style={{ color: colors.warning, fontWeight: 'bold' }}>Pending</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Submit Payment Proof Form */}
                {!isPaid && actualRemaining > 0 && (
                    <View style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="camera-outline" size={20} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Submit Payment Receipt</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 15 }}>
                            Attach your payment proof/receipt below. Wait for the institute to verify it.
                        </Text>

                        <Text style={styles.infoLabel}>Amount Paid (RM)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={`Max: ${actualRemaining.toFixed(2)}`}
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="numeric"
                            value={payAmount}
                            onChangeText={setPayAmount}
                            editable={!submitting}
                        />

                        <Text style={[styles.infoLabel, { marginTop: 10 }]}>Attachment</Text>
                        {proofUri ? (
                            <View style={{ marginTop: 10, position: 'relative', width: 120, height: 160 }}>
                                <Image source={{ uri: proofUri }} style={{ width: 120, height: 160, borderRadius: 12 }} />
                                {!submitting && (
                                    <TouchableOpacity style={styles.deleteImgBtn} onPress={() => setProofUri(null)}>
                                        <Ionicons name="close-circle" size={24} color={colors.danger} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.uploadBox} onPress={pickImage} disabled={submitting}>
                                <Ionicons name="image-outline" size={32} color={colors.primary} />
                                <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }}>Select Photo</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
                            onPress={submitPaymentProof}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color={colors.background} />
                            ) : (
                                <>
                                    <Ionicons name="cloud-upload-outline" size={20} color={colors.background} />
                                    <Text style={styles.submitButtonText}>Submit Proof</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* CTA banner for overdue */}
                {isOverdue && (
                    <View style={[styles.overdueBanner, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
                        <Ionicons name="warning-outline" size={20} color={colors.danger} />
                        <Text style={[styles.overdueText, { color: colors.danger }]}>
                            This fee is overdue. Please contact your institute administrator to arrange payment.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 15,
        backgroundColor: colors.background,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { paddingRight: 10 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: colors.text },
    content: { padding: 16, paddingBottom: insets.bottom + 20 },
    card: {
        backgroundColor: colors.card, borderRadius: 16,
        padding: 20, marginBottom: 16,
        borderWidth: 1, borderColor: colors.border,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 2 },
        }),
    },
    statusHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    feeLabel: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
    gradeText: { fontSize: 13, color: colors.textSecondary },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 20, borderWidth: 1,
    },
    statusText: { fontSize: 12, fontWeight: '600' },
    amountBlock: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 12, overflow: 'hidden' },
    amountItem: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    amountDivider: { width: 1, backgroundColor: colors.border, marginVertical: 12 },
    amountLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    amountValue: { fontSize: 16, fontWeight: '700', color: colors.text },
    progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + '60' },
    breakdownTotal: { borderBottomWidth: 0, marginTop: 4, paddingTop: 12 },
    breakdownName: { fontSize: 14, color: colors.textSecondary },
    breakdownAmount: { fontSize: 14, color: colors.textSecondary },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    infoLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
    infoValue: { fontSize: 13, color: colors.text, fontWeight: '600' },
    receiptLabel: { fontSize: 12, color: colors.success, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    receiptNumber: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: 2, marginBottom: 16 },
    paidStamp: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    paidStampText: { fontSize: 12, fontWeight: '700', color: colors.success, letterSpacing: 1 },
    overdueBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 16, borderRadius: 12,
        borderWidth: 1,
        marginBottom: 20,
    },
    overdueText: { flex: 1, fontSize: 14, lineHeight: 20 },
    input: {
        backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
        borderRadius: 10, padding: 14, fontSize: 16, color: colors.text, marginTop: 6,
    },
    uploadBox: {
        backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary,
        borderStyle: 'dashed', borderRadius: 12, height: 120,
        justifyContent: 'center', alignItems: 'center', marginTop: 6,
    },
    deleteImgBtn: {
        position: 'absolute', top: -10, right: -10,
        backgroundColor: colors.card, borderRadius: 15,
    },
    submitButton: {
        backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12,
        marginTop: 20,
    },
    submitButtonText: { color: colors.background, fontSize: 16, fontWeight: 'bold' },
});
