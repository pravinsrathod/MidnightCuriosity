import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import Pagination from './common/Pagination';
import {
    collection, query, where, onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp, writeBatch, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { sendPushNotification } from '../notificationService';

const STATUS_COLORS = {
    PENDING: { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)', text: '#eab308', label: '🟡 Pending' },
    PARTIAL: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa', label: '🔵 Partial' },
    PAID: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', text: '#22c55e', label: '🟢 Paid' },
    OVERDUE: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', label: '🔴 Overdue' },
    WAIVED: { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)', text: '#94a3b8', label: '⚪ Waived' },
};

const generateReceiptNumber = () => `RCP-${Date.now().toString(36).toUpperCase()}`;

const FeesManager = ({ students = [], tenantId, onAlert = () => {}, onConfirm = () => {}, grades: propGrades, subjects: propSubjects, topics: propTopics, batches = {}, filterGrade: propFilterGrade, filterBatch: propFilterBatch }) => {
    const [activeSubTab, setActiveSubTab] = useState('overview');

    // --- Shared data ---
    const [feesList, setFeesList] = useState([]);
    const [structures, setStructures] = useState([]);
    const [paymentReceipts, setPaymentReceipts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [overviewPage, setOverviewPage] = useState(1);
    const [paymentsPage, setPaymentsPage] = useState(1);
    const [receiptsPage, setReceiptsPage] = useState(1);
    const PAGE_SIZE = 10;

    const grades = (propGrades && propGrades.length > 0) ? propGrades : Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1));
    const subjects = (propSubjects && propSubjects.length > 0) ? propSubjects : ["Maths", "Physics", "Chemistry", "Biology"];
    const topics = (propTopics && propTopics.length > 0) ? propTopics : ["General"];
    // --- Fee Structures state ---
    const [newStructure, setNewStructure] = useState({ name: '', grade: '', batch: 'All', period: 'monthly', items: [{ name: '', amount: '' }] });

    // --- Assign Fees state ---
    const [assignStructureId, setAssignStructureId] = useState('');
    const [assignGrade, setAssignGrade] = useState('');
    const [assignBatch, setAssignBatch] = useState('All');
    const [assignDueDate, setAssignDueDate] = useState('');
    const [assigning, setAssigning] = useState(false);

    // --- Record Payment state ---
    const [paymentModal, setPaymentModal] = useState(null); // { fee }
    const [payAmount, setPayAmount] = useState('');
    const [structFilterGrade, setStructFilterGrade] = useState('All');
    const [structFilterBatch, setStructFilterBatch] = useState('All');
    const [payMethod, setPayMethod] = useState('cash');
    const [payNotes, setPayNotes] = useState('');
    const [paying, setPaying] = useState(false);

    // --- Filters ---
    const [filterGrade, setFilterGrade] = useState(propFilterGrade || 'All');
    const [filterBatch, setFilterBatch] = useState(propFilterBatch || 'All');
    const [filterStatus, setFilterStatus] = useState('All');

    // Sync from props
    useEffect(() => {
        if (propFilterGrade) setFilterGrade(propFilterGrade);
        if (propFilterBatch) setFilterBatch(propFilterBatch);
    }, [propFilterGrade, propFilterBatch]);

    // Reset pages when filters change
    useEffect(() => {
        setOverviewPage(1);
    }, [filterGrade, filterBatch, filterStatus]);

    // Reset all pages when switching sub-tabs
    useEffect(() => {
        setOverviewPage(1);
        setPaymentsPage(1);
        setReceiptsPage(1);
    }, [activeSubTab]);

    // ── Firestore listeners ──────────────────────────────────────────────────
    useEffect(() => {
        if (!tenantId || typeof tenantId !== 'string') {
            console.log("Waiting for valid tenant context...");
            return;
        }

        const qFees = query(collection(db, 'fees'), where('tenantId', '==', tenantId));
        const unsubFees = onSnapshot(qFees, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Auto-mark overdue
            const today = new Date().toISOString().split('T')[0];
            list.forEach(f => {
                if (f.status === 'PENDING' && f.dueDate < today) f.status = 'OVERDUE';
            });
            list.sort((a, b) => (b.dueDate > a.dueDate ? 1 : -1));
            setFeesList(list);
        }, err => {
            console.error('Fees listener error:', err);
            onAlert('Error loading fees. Please refresh.', 'Error');
        });

        const qStr = query(collection(db, 'feeStructures'), where('tenantId', '==', tenantId));
        const unsubStr = onSnapshot(qStr, snap => {
            setStructures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, err => {
            console.error('Structures listener error:', err);
        });

        const qReceipts = query(collection(db, 'paymentReceipts'), where('tenantId', '==', tenantId));
        const unsubReceipts = onSnapshot(qReceipts, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
            setPaymentReceipts(list);
        }, err => {
            console.error('Receipts listener error:', err);
        });

        return () => { unsubFees(); unsubStr(); unsubReceipts(); };
    }, [tenantId]);

    // ── Summary stats ────────────────────────────────────────────────────────
    const totalCollected = feesList.reduce((s, f) => s + (f.paidAmount || 0), 0);
    const totalPending = feesList.filter(f => ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status))
        .reduce((s, f) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);
    const overdueCount = feesList.filter(f => f.status === 'OVERDUE').length;

    // ── Filtered fees table ──────────────────────────────────────────────────
    const filteredFees = feesList.filter(f => {
        if (filterGrade !== 'All' && f.grade !== filterGrade) return false;
        if (filterBatch !== 'All' && f.batch !== filterBatch) return false;
        if (filterStatus !== 'All' && f.status !== filterStatus) return false;
        return true;
    });

    // ── Fee Structure handlers ───────────────────────────────────────────────
    const handleAddItem = () =>
        setNewStructure(s => ({ ...s, items: [...s.items, { name: '', amount: '' }] }));

    const handleItemChange = (i, field, val) =>
        setNewStructure(s => {
            const items = [...s.items];
            items[i] = { ...items[i], [field]: val };
            return { ...s, items };
        });

    const handleRemoveItem = i =>
        setNewStructure(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }));

    const handleSaveStructure = async (e) => {
        e.preventDefault();
        if (!newStructure.name || !newStructure.grade) { onAlert('Name and grade are required.', 'Error'); return; }
        const items = newStructure.items.filter(it => it.name && it.amount);
        if (items.length === 0) { onAlert('Add at least one fee item.', 'Error'); return; }
        const totalAmount = items.reduce((s, it) => s + parseFloat(it.amount || 0), 0);
        setLoading(true);
        try {
            await addDoc(collection(db, 'feeStructures'), {
                ...newStructure, items, totalAmount, tenantId, createdAt: serverTimestamp()
            });
            onAlert('Fee structure saved! ✅', 'Success');
            setNewStructure({ name: '', grade: '', batch: 'All', period: 'monthly', items: [{ name: '', amount: '' }] });
        } catch (err) {
            onAlert('Failed to save structure: ' + err.message, 'Error');
        } finally { setLoading(false); }
    };

    const handleDeleteStructure = async (id) => {
        const confirmed = onConfirm
            ? await onConfirm('Delete this fee structure?', 'Confirm Delete', true)
            : window.confirm('Delete this fee structure?');
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, 'feeStructures', id), { deleted: true });
            onAlert('Structure deleted.', 'Success');
        } catch (err) { onAlert('Failed to delete: ' + err.message, 'Error'); }
    };

    // ── Assign Fees handler ──────────────────────────────────────────────────
    const handleAssignFees = async (e) => {
        e.preventDefault();
        if (!assignStructureId || !assignGrade || !assignBatch || !assignDueDate) {
            onAlert('Select a structure, grade, batch, and due date.', 'Error');
            return;
        }

        const structure = structures.find(s => s.id === assignStructureId);
        if (!structure) { onAlert('Structure not found.', 'Error'); return; }

        const targetStudents = students.filter(
            s => s.grade === assignGrade && 
                (assignBatch === 'All' || s.batch === assignBatch) &&
                (s.status === 'ACTIVE' || !s.status) &&
                (s.role === 'student' || s.role === 'STUDENT')
        );
        if (targetStudents.length === 0) {
            onAlert(`No active students found in ${assignGrade}.`, 'Error');
            return;
        }

        setAssigning(true);
        try {
            const batch = writeBatch(db);
            targetStudents.forEach(student => {
                const ref = doc(collection(db, 'fees'));
                batch.set(ref, {
                    tenantId,
                    studentId: student.id,
                    studentName: student.name,
                    studentPhone: student.phoneNumber,
                    grade: assignGrade,
                    batch: student.batch || 'General Batch',
                    structureId: assignStructureId,
                    label: `${structure.name}`,
                    items: structure.items,
                    totalAmount: structure.totalAmount,
                    paidAmount: 0,
                    dueDate: assignDueDate,
                    status: 'PENDING',
                    paymentMethod: null,
                    receiptNumber: null,
                    notes: null,
                    createdAt: serverTimestamp(),
                    paidAt: null,
                });
            });
            await batch.commit();

            // Notify parents
            try {
                const parentsQuery = query(collection(db, 'users'),
                    where('tenantId', '==', tenantId), where('role', '==', 'PARENT'));
                const parentSnaps = await getDocs(parentsQuery);
                const studentPhones = targetStudents.map(s => s.phoneNumber).filter(Boolean);
                const tokens = parentSnaps.docs.map(d => d.data())
                    .filter(p => p.pushToken && studentPhones.some(sp => {
                        const cleanSp = (sp || '').replace(/\D/g, '');
                        if (!cleanSp) return false;
                        const pPhones = [(p.linkedStudentPhone || ''), ...(p.linkedStudentPhones || [])];
                        return pPhones.some(pp => {
                            const cleanPp = (pp || '').replace(/\D/g, '');
                            return cleanPp && cleanPp === cleanSp;
                        });
                    }))
                    .map(p => p.pushToken);
                if (tokens.length > 0) {
                    await sendPushNotification(tokens,
                        `💰 Fee Due: ${structure.name}`,
                        `Amount: RM ${structure.totalAmount.toFixed(2)} · Due: ${assignDueDate}`,
                        { screen: 'fees' }
                    );
                }
            } catch (notifyErr) { console.warn('Fee notification failed', notifyErr); }

            onAlert(`Fees assigned to ${targetStudents.length} students! 🎉`, 'Success');
            setAssignStructureId(''); setAssignGrade(''); setAssignBatch('All'); setAssignDueDate('');
        } catch (err) {
            onAlert('Failed to assign fees: ' + err.message, 'Error');
        } finally { setAssigning(false); }
    };

    // ── Record Payment handler ───────────────────────────────────────────────
    const handleRecordPayment = async () => {
        if (!paymentModal || !payAmount) { onAlert('Enter an amount.', 'Error'); return; }
        const amount = parseFloat(payAmount);
        if (isNaN(amount) || amount <= 0) { onAlert('Enter a valid amount.', 'Error'); return; }
        const fee = paymentModal.fee;
        const remaining = fee.totalAmount - (fee.paidAmount || 0);
        if (amount > remaining) { onAlert(`Max payable is RM ${remaining.toFixed(2)}.`, 'Error'); return; }

        const newPaid = (fee.paidAmount || 0) + amount;
        const newStatus = newPaid >= fee.totalAmount ? 'PAID' : 'PARTIAL';
        const receiptNumber = newStatus === 'PAID' ? generateReceiptNumber() : (fee.receiptNumber || null);

        setPaying(true);
        try {
            await updateDoc(doc(db, 'fees', fee.id), {
                paidAmount: newPaid,
                status: newStatus,
                paymentMethod: payMethod,
                receiptNumber,
                notes: payNotes || null,
                paidAt: newStatus === 'PAID' ? serverTimestamp() : fee.paidAt || null,
            });
            // Notify student/parent
            try {
                const studentSnap = await getDocs(query(collection(db, 'users'),
                    where('tenantId', '==', tenantId), where('role', '==', 'PARENT')));
                const studentDoc = students.find(s => s.id === fee.studentId);
                if (studentDoc?.phoneNumber) {
                    const tokens = studentSnap.docs.map(d => d.data())
                        .filter(p => {
                            if (!p.pushToken) return false;
                            const cleanSp = studentDoc.phoneNumber.replace(/\D/g, '');
                            if (!cleanSp) return false;
                            const pPhones = [(p.linkedStudentPhone || ''), ...(p.linkedStudentPhones || [])];
                            return pPhones.some(pp => {
                                const cleanPp = (pp || '').replace(/\D/g, '');
                                return cleanPp && cleanPp === cleanSp;
                            });
                        })
                        .map(p => p.pushToken);
                    if (tokens.length > 0) {
                        await sendPushNotification(tokens,
                            newStatus === 'PAID' ? '✅ Payment Confirmed' : '💳 Partial Payment Recorded',
                            `RM ${amount.toFixed(2)} received for ${fee.label}.${receiptNumber ? ' Receipt: ' + receiptNumber : ''}`,
                            { screen: 'fees' }
                        );
                    }
                }
            } catch (notifyErr) { console.warn('Payment notification failed', notifyErr); }

            onAlert(newStatus === 'PAID' ? `Payment complete! Receipt: ${receiptNumber} 🎉` : `Partial payment of RM ${amount.toFixed(2)} recorded.`, 'Success');
            setPaymentModal(null); setPayAmount(''); setPayNotes(''); setPayMethod('cash');
        } catch (err) {
            onAlert('Failed to record payment: ' + err.message, 'Error');
        } finally { setPaying(false); }
    };

    const handleWaiveFee = async (fee) => {
        const confirmed = onConfirm
            ? await onConfirm(`Waive fee for ${fee.studentName}?`, 'Confirm Waive', true)
            : window.confirm(`Waive fee for ${fee.studentName}?`);
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, 'fees', fee.id), { status: 'WAIVED', notes: 'Waived by admin' });
            onAlert('Fee waived.', 'Success');
        } catch (err) { onAlert('Failed to waive fee: ' + err.message, 'Error'); }
    };

    // ── Verify Receipt handler ───────────────────────────────────────────────
    const handleVerifyReceipt = async (receipt, approve) => {
        if (approve) {
            const confirmed = onConfirm
                ? await onConfirm(`Approve payment of RM ${receipt.amountPaid.toFixed(2)}?`, 'Confirm Approval', true)
                : window.confirm(`Approve payment of RM ${receipt.amountPaid.toFixed(2)}?`);
            if (!confirmed) return;
        }

        const notifyPaymentParty = async (title, body) => {
            try {
                const studentSnap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('role', '==', 'PARENT')));
                const studentDoc = students.find(s => s.id === receipt.studentId);
                if (studentDoc?.phoneNumber) {
                    const tokens = studentSnap.docs.map(d => d.data())
                        .filter(p => {
                            if (!p.pushToken) return false;
                            const cleanSp = studentDoc.phoneNumber.replace(/\D/g, '');
                            if (!cleanSp) return false;
                            const pPhones = [(p.linkedStudentPhone || ''), ...(p.linkedStudentPhones || [])];
                            return pPhones.some(pp => {
                                const cleanPp = (pp || '').replace(/\D/g, '');
                                return cleanPp && cleanPp === cleanSp;
                            });
                        })
                        .map(p => p.pushToken);
                    if (tokens.length > 0) {
                        await sendPushNotification(tokens, title, body, { screen: 'fees' });
                    }
                }
            } catch (notifyErr) { console.warn('Payment notification failed', notifyErr); }
        };

        try {
            if (approve) {
                const feeRef = doc(db, 'fees', receipt.feeId);
                const receiptRef = doc(db, 'paymentReceipts', receipt.id);

                const { newStatus, receiptNum, feeLabel, finalPaid } = await runTransaction(db, async (transaction) => {
                    const feeSnap = await transaction.get(feeRef);
                    if (!feeSnap.exists()) {
                        throw new Error('Associated fee not found.');
                    }
                    const fee = feeSnap.data();

                    const currentPaid = fee.paidAmount || 0;
                    const finalPaid = currentPaid + receipt.amountPaid;
                    const newStatus = finalPaid >= fee.totalAmount ? 'PAID' : 'PARTIAL';
                    const receiptNum = newStatus === 'PAID' ? generateReceiptNumber() : (fee.receiptNumber || null);

                    transaction.update(feeRef, {
                        paidAmount: finalPaid,
                        status: newStatus,
                        paymentMethod: 'online',
                        receiptNumber: receiptNum,
                        paidAt: newStatus === 'PAID' ? serverTimestamp() : (fee.paidAt || null)
                    });

                    transaction.update(receiptRef, {
                        status: 'APPROVED',
                        verifiedAt: serverTimestamp()
                    });

                    return { newStatus, receiptNum, feeLabel: fee.label, finalPaid };
                });

                // Notify student/parent of approval
                await notifyPaymentParty(
                    newStatus === 'PAID' ? '✅ Payment Verified' : '💳 Partial Payment Verified',
                    `Institute verified RM ${receipt.amountPaid.toFixed(2)} for ${feeLabel}.${receiptNum ? ' Receipt: ' + receiptNum : ''}`
                );

                onAlert('Receipt approved and fee updated!', 'Success');
            } else {
                await updateDoc(doc(db, 'paymentReceipts', receipt.id), {
                    status: 'REJECTED',
                    verifiedAt: serverTimestamp()
                });

                // Notify student/parent of rejection
                await notifyPaymentParty(
                    '❌ Payment Rejected',
                    `Your payment proof of RM ${receipt.amountPaid.toFixed(2)} for ${receipt.feeLabel} could not be verified.`
                );

                onAlert('Receipt rejected.', 'Success');
            }
        } catch (err) {
            onAlert('Error verifying receipt: ' + err.message, 'Error');
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* SUB-TABS */}
            <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '8px', marginBottom: '32px', borderRadius: '16px', flexWrap: 'wrap' }}>
                {[
                    { key: 'overview', label: '📊 Overview' },
                    { key: 'structures', label: '🗂️ Fee Structures' },
                    { key: 'assign', label: '📋 Assign Fees' },
                    { key: 'payment', label: '💳 Record Payment' },
                    { key: 'receipts', label: `🧾 Pending Receipts ${paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length > 0 ? `(${paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length})` : ''}` },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveSubTab(tab.key)}
                        className={`btn ${activeSubTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, borderRadius: '12px' }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── OVERVIEW ── */}
            {activeSubTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                        {[
                            { icon: '💰', label: 'Total Collected', value: `RM ${totalCollected.toFixed(2)}`, color: '#22c55e' },
                            { icon: '⏳', label: 'Total Pending', value: `RM ${totalPending.toFixed(2)}`, color: '#eab308' },
                            { icon: '🔴', label: 'Overdue', value: `${overdueCount} students`, color: '#ef4444' },
                        ].map(card => (
                            <div key={card.label} className="glass-panel animate-fade-in"
                                style={{ padding: '24px', textAlign: 'center' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{card.icon}</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{card.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="glass-panel" style={{ display: 'flex', gap: '12px', padding: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, marginRight: '4px' }}>Filter:</span>
                        <select value={filterGrade} onChange={e => { setFilterGrade(e.target.value); setFilterBatch('All'); }}
                            style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px' }}>
                            <option value="All">All Classes</option>
                            {grades.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)}
                            style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px' }}>
                            <option value="All">All Batches</option>
                            {(batches[filterGrade] || []).map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px' }}>
                            <option value="All">All Statuses</option>
                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {filteredFees.length} records
                        </span>
                    </div>

                    {/* Fees Table */}
                    {filteredFees.length === 0 ? (
                        <div className="glass-panel" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>💸</div>
                            <h3>No Fees Found</h3>
                            <p>Assign fee structures to students to see them here.</p>
                        </div>
                    ) : (
                        <div className="glass-panel" style={{ overflowX: 'auto', padding: '0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                        {['Student', 'Class', 'Fee Label', 'Due Date', 'Amount', 'Paid', 'Status', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFees.slice((overviewPage - 1) * PAGE_SIZE, overviewPage * PAGE_SIZE).map(fee => {
                                        const sc = STATUS_COLORS[fee.status] || STATUS_COLORS.PENDING;
                                        return (
                                            <tr key={fee.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '14px 16px', fontWeight: 600 }}>{fee.studentName}</td>
                                                <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{fee.grade}</td>
                                                <td style={{ padding: '14px 16px' }}>{fee.label}</td>
                                                <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fee.dueDate}</td>
                                                <td style={{ padding: '14px 16px', fontWeight: 600 }}>RM {(fee.totalAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: '14px 16px', color: '#22c55e' }}>RM {(fee.paidAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, whiteSpace: 'nowrap' }}>
                                                        {sc.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {['PENDING', 'OVERDUE', 'PARTIAL'].includes(fee.status) && (
                                                            <button className="btn btn-primary"
                                                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                                onClick={() => { setPaymentModal({ fee }); setPayAmount(String(fee.totalAmount - (fee.paidAmount || 0))); }}>
                                                                Pay
                                                            </button>
                                                        )}
                                                        {['PENDING', 'OVERDUE'].includes(fee.status) && (
                                                            <button className="btn btn-ghost"
                                                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                                onClick={() => handleWaiveFee(fee)}>
                                                                Waive
                                                            </button>
                                                        )}
                                                        {fee.receiptNumber && (
                                                            <span style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                                                                title={`Receipt: ${fee.receiptNumber}`}>🧾</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {filteredFees.length > PAGE_SIZE && (
                                <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                                    <Pagination
                                        currentPage={overviewPage}
                                        totalItems={filteredFees.length}
                                        pageSize={PAGE_SIZE}
                                        onPageChange={setOverviewPage}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── FEE STRUCTURES ── */}
            {activeSubTab === 'structures' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {/* Create Form */}
                    <div className="glass-panel animate-scale-up" style={{ maxWidth: '680px', margin: '0 auto', padding: '40px', width: '100%' }}>
                        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🗂️</div>
                            <h2>New Fee Structure</h2>
                            <p style={{ color: 'var(--text-secondary)' }}>Define a reusable fee template for a grade.</p>
                        </div>
                        <form onSubmit={handleSaveStructure} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group">
                                <label className="label">Structure Name</label>
                                <input placeholder="e.g. Monthly Tuition March 2026"
                                    value={newStructure.name} onChange={e => setNewStructure(s => ({ ...s, name: e.target.value }))}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                <div className="form-group">
                                    <label className="label">Class</label>
                                    <select value={newStructure.grade} onChange={e => setNewStructure(s => ({ ...s, grade: e.target.value, batch: 'All' }))}
                                        style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                        <option value="">Select Class</option>
                                        <option value="All">All Classes</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="label">Batch</label>
                                    <select value={newStructure.batch} onChange={e => setNewStructure(s => ({ ...s, batch: e.target.value }))}
                                        style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                        <option value="All">All Batches (Wildcard)</option>
                                        {(batches[newStructure.grade] || []).map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="label">Billing Period</label>
                                    <select value={newStructure.period} onChange={e => setNewStructure(s => ({ ...s, period: e.target.value }))}
                                        style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                        {['one-time', 'monthly', 'quarterly', 'annual'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">Fee Line Items</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {newStructure.items.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <input placeholder="Fee name (e.g. Tuition)"
                                                value={item.name} onChange={e => handleItemChange(i, 'name', e.target.value)}
                                                style={{ flex: 2, padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }} />
                                            <input type="number" placeholder="Amount (RM)"
                                                value={item.amount} onChange={e => handleItemChange(i, 'amount', e.target.value)}
                                                style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }} />
                                            {newStructure.items.length > 1 && (
                                                <button type="button" className="btn btn-ghost"
                                                    style={{ padding: '10px', borderRadius: '10px', color: '#ef4444' }}
                                                    onClick={() => handleRemoveItem(i)}>✕</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button type="button" className="btn btn-ghost"
                                    style={{ marginTop: '10px', fontSize: '0.85rem' }}
                                    onClick={handleAddItem}>+ Add Item</button>
                                <div style={{ marginTop: '12px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                                    Total: RM {newStructure.items.reduce((s, it) => s + parseFloat(it.amount || 0), 0).toFixed(2)}
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading}
                                style={{ padding: '16px', fontSize: '1.05rem', marginTop: '8px' }}>
                                {loading ? <span className="loader" style={{ width: '18px', height: '18px' }} /> : '💾 Save Structure'}
                            </button>
                        </form>
                    </div>

                    {/* Existing Structures */}
                    {structures.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                                <h3>Saved Structures</h3>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select value={structFilterGrade} onChange={e => { setStructFilterGrade(e.target.value); setStructFilterBatch('All'); }}
                                        style={{ padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px', fontSize: '0.85rem' }}>
                                        <option value="All">All Classes</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                    <select value={structFilterBatch} onChange={e => setStructFilterBatch(e.target.value)}
                                        style={{ padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px', fontSize: '0.85rem' }}>
                                        <option value="All">All Batches</option>
                                        {(batches[structFilterGrade] || []).map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid-3">
                                {structures.filter(s => !s.deleted && (structFilterGrade === 'All' || s.grade === structFilterGrade) && (structFilterBatch === 'All' || s.batch === structFilterBatch)).map(s => (
                                    <div key={s.id} className="glass-panel animate-fade-in" style={{ padding: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.name}</div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                    {s.grade} {s.batch && s.batch !== 'All' ? `(${s.batch})` : '· All Batches'} · {s.period}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 700, color: '#22c55e', fontSize: '1.1rem' }}>RM {(s.totalAmount || 0).toFixed(2)}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                                            {(s.items || []).map((item, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    <span>{item.name}</span>
                                                    <span>RM {parseFloat(item.amount || 0).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                                            onClick={() => handleDeleteStructure(s.id)}>Delete</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── ASSIGN FEES ── */}
            {activeSubTab === 'assign' && (
                <div className="glass-panel animate-scale-up" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📋</div>
                        <h2>Assign Fees to Class</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>Select a fee structure and grade to bulk-assign fees to all active students.</p>
                    </div>
                    <form onSubmit={handleAssignFees} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="form-group">
                            <label className="label">Fee Structure</label>
                            <select value={assignStructureId} onChange={e => {
                                setAssignStructureId(e.target.value);
                                const s = structures.find(x => x.id === e.target.value);
                                if (s?.grade && s.grade !== 'All') setAssignGrade(s.grade);
                            }}
                                style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                <option value="">Select a structure</option>
                                {structures.filter(s => !s.deleted).map(s => (
                                    <option key={s.id} value={s.id}>{s.name} — RM {(s.totalAmount || 0).toFixed(2)}</option>
                                ))}
                            </select>
                        </div>

                        {assignStructureId && (
                            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px' }}>
                                {(() => {
                                    const s = structures.find(x => x.id === assignStructureId);
                                    return s ? (
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>RM {(s.totalAmount || 0).toFixed(2)} · {s.period}</div>
                                            {(s.items || []).map((it, i) => <div key={i}>• {it.name}: RM {parseFloat(it.amount || 0).toFixed(2)}</div>)}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        )}

                            <div className="form-group">
                                <label className="label">Class</label>
                                <select value={assignGrade} onChange={e => { setAssignGrade(e.target.value); setAssignBatch('All'); }}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                    <option value="">Select Class</option>
                                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Target Batch</label>
                                <select value={assignBatch} onChange={e => setAssignBatch(e.target.value)}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                                    <option value="All">All Batches (Wildcard)</option>
                                    {(batches[assignGrade] || []).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Due Date</label>
                                <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }} />
                            </div>

                        {assignGrade && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', padding: '12px 16px', borderRadius: '10px' }}>
                                📌 Will assign to <strong style={{ color: '#fff' }}>
                                    {students.filter(s => s.grade === assignGrade && (assignBatch === 'All' || s.batch === assignBatch) && (s.role === 'student' || s.role === 'STUDENT')).length}
                                </strong> active students in {assignGrade} {assignBatch !== 'All' ? `(${assignBatch})` : ''}
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={assigning}
                            style={{ padding: '16px', fontSize: '1.05rem', marginTop: '8px' }}>
                            {assigning ? <span className="loader" style={{ width: '18px', height: '18px' }} /> : '🚀 Assign Fees'}
                        </button>
                    </form>
                </div>
            )}

            {/* ── RECORD PAYMENT (Quick lookup) ── */}
            {activeSubTab === 'payment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💳</div>
                        <h2 style={{ marginBottom: '8px' }}>Record Payment</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>Showing all pending & partial fees. Click "Pay" to record a payment.</p>
                    </div>

                    {/* Pending/Partial fees quick-action list */}
                    {feesList.filter(f =>
                        ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status) &&
                        (filterGrade === 'All' || f.grade === filterGrade) &&
                        (filterBatch === 'All' || (f.batch || 'General Batch') === filterBatch)
                    ).length === 0 ? (
                        <div className="glass-panel" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>✅</div>
                            <h3>All Caught Up!</h3>
                            <p>No pending or partial fees matching these filters.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {feesList.filter(f =>
                                ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status) &&
                                (filterGrade === 'All' || f.grade === filterGrade) &&
                                (filterBatch === 'All' || (f.batch || 'General Batch') === filterBatch)
                            ).slice((paymentsPage - 1) * PAGE_SIZE, paymentsPage * PAGE_SIZE).map(fee => {
                                const sc = STATUS_COLORS[fee.status];
                                const remaining = (fee.totalAmount || 0) - (fee.paidAmount || 0);
                                return (
                                    <div key={fee.id} className="glass-panel animate-fade-in"
                                        style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px', flexWrap: 'wrap' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0 }}>
                                            {fee.studentName?.charAt(0)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: '140px' }}>
                                            <div style={{ fontWeight: 700 }}>{fee.studentName}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{fee.label} · {fee.grade}</div>
                                        </div>
                                        <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>RM {remaining.toFixed(2)}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Due {fee.dueDate}</div>
                                        </div>
                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, whiteSpace: 'nowrap' }}>
                                            {sc.label}
                                        </span>
                                        <button className="btn btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}
                                            onClick={() => { setPaymentModal({ fee }); setPayAmount(remaining.toFixed(2)); }}>
                                            💳 Pay
                                        </button>
                                    </div>
                                );
                            })}
                            
                            {feesList.filter(f =>
                                ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status) &&
                                (filterGrade === 'All' || f.grade === filterGrade) &&
                                (filterBatch === 'All' || (f.batch || 'General Batch') === filterBatch)
                            ).length > PAGE_SIZE && (
                                <Pagination
                                    currentPage={paymentsPage}
                                    totalItems={feesList.filter(f =>
                                        ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status) &&
                                        (filterGrade === 'All' || f.grade === filterGrade) &&
                                        (filterBatch === 'All' || (f.batch || 'General Batch') === filterBatch)
                                    ).length}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setPaymentsPage}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── PAYMENT MODAL ── */}
            {paymentModal && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-panel animate-scale-up"
                        style={{ width: '100%', maxWidth: '500px', padding: '32px', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Record Payment</h3>
                            <button className="btn btn-ghost" onClick={() => setPaymentModal(null)} style={{ padding: '8px' }}>✕</button>
                        </div>

                        {/* Student Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
                                {paymentModal.fee.studentName?.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{paymentModal.fee.studentName}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{paymentModal.fee.label}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Total: RM {(paymentModal.fee.totalAmount || 0).toFixed(2)} · Paid: RM {(paymentModal.fee.paidAmount || 0).toFixed(2)} ·
                                    <strong style={{ color: '#eab308' }}> Remaining: RM {((paymentModal.fee.totalAmount || 0) - (paymentModal.fee.paidAmount || 0)).toFixed(2)}</strong>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group">
                                <label className="label">Amount Received (RM)</label>
                                <input type="number" step="0.01" min="0.01"
                                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px', fontSize: '1.2rem', fontWeight: 700 }} />
                            </div>

                            <div className="form-group">
                                <label className="label">Payment Method</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['cash', 'cheque', 'online'].map(m => (
                                        <button key={m} type="button"
                                            className={`btn ${payMethod === m ? 'btn-primary' : 'btn-ghost'}`}
                                            style={{ flex: 1, borderRadius: '10px', textTransform: 'capitalize' }}
                                            onClick={() => setPayMethod(m)}>
                                            {m === 'cash' ? '💵 Cash' : m === 'cheque' ? '📄 Cheque' : '🌐 Online'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="label">Notes (Optional)</label>
                                <input placeholder="e.g. Cheque no. 001234"
                                    value={payNotes} onChange={e => setPayNotes(e.target.value)}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button className="btn btn-ghost" onClick={() => setPaymentModal(null)} style={{ flex: 1 }}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleRecordPayment} disabled={paying} style={{ flex: 2 }}>
                                    {paying ? <span className="loader" style={{ width: '16px', height: '16px' }} /> : '✅ Confirm Payment'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── PENDING RECEIPTS ── */}
            {activeSubTab === 'receipts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🧾</div>
                        <h2 style={{ marginBottom: '8px' }}>Verification Queue</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>Review payment proofs submitted by parents and students.</p>
                    </div>

                    {paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length === 0 ? (
                        <div className="glass-panel" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>✅</div>
                            <h3>All Clear</h3>
                            <p>No pending receipts to verify.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').slice((receiptsPage - 1) * PAGE_SIZE, receiptsPage * PAGE_SIZE).map(receipt => {
                                const feeDoc = feesList.find(f => f.id === receipt.feeId);
                                const studentInfo = feeDoc ? feeDoc.studentName : receipt.studentId;
                                return (
                                    <div key={receipt.id} className="glass-panel animate-fade-in"
                                        style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px', flexWrap: 'wrap' }}>

                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0 }}>
                                            {typeof studentInfo === 'string' ? studentInfo.charAt(0) : '👤'}
                                        </div>

                                        <div style={{ flex: 1, minWidth: '180px' }}>
                                            <div style={{ fontWeight: 700 }}>{studentInfo}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {receipt.feeLabel} · Total Fee: RM {(feeDoc?.totalAmount || 0).toFixed(2)}
                                            </div>
                                            {receipt.submittedAt && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Submitted: {new Date(receipt.submittedAt.seconds * 1000).toLocaleString()}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ textAlign: 'right', minWidth: '120px' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Amount Paid</div>
                                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#eab308' }}>RM {(receipt.amountPaid || 0).toFixed(2)}</div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <a href={receipt.proofUrl} target="_blank" rel="noreferrer"
                                                style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                👁️ View Proof
                                            </a>
                                            <button className="btn btn-ghost" style={{ padding: '8px 16px', color: '#ef4444' }} onClick={() => handleVerifyReceipt(receipt, false)}>
                                                Reject
                                            </button>
                                            <button className="btn btn-primary" style={{ padding: '8px 16px', background: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleVerifyReceipt(receipt, true)}>
                                                ✅ Verify
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length > PAGE_SIZE && (
                                <Pagination
                                    currentPage={receiptsPage}
                                    totalItems={paymentReceipts.filter(r => r.status === 'VERIFICATION_PENDING').length}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setReceiptsPage}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FeesManager;
