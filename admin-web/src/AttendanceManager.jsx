import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { sendPushNotification } from './notificationService';

const AttendanceManager = ({ students, tenantId, onAlert, filterGrade }) => {
    const [selectedDate, setSelectedDate] = useState(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Filter only active students
    const activeStudents = students.filter(s => s.status === 'ACTIVE' && (!filterGrade || filterGrade === 'All' || s.grade === filterGrade));

    useEffect(() => {
        if (tenantId && selectedDate) {
            fetchAttendance();
        }
    }, [tenantId, selectedDate]);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const docId = `${tenantId}_${selectedDate}`;
            const docRef = doc(db, 'attendance', docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setAttendanceMap(docSnap.data().records || {});
            } else {
                // specific logic: if no record exists, maybe default all to PRESENT or UNMARKED?
                // Let's default to empty (UNMARKED) so user has to explicitly mark.
                // Or default to PRESENT for convenience? 
                // Let's start with empty map, effectively "Unmarked".

                // Actually, let's pre-fill with "PRESENT" for all active students if it's a new day?
                // That might be dangerous if they just open the page.
                // Better: Initialize all active students to 'PRESENT' in the UI state if it's empty?
                // No, let's keep it explicit. If key missing -> 'UNKNOWN'
                setAttendanceMap({});
            }
        } catch (e) {
            console.error("Error fetching attendance:", e);
        } finally {
            setLoading(false);
        }
    };

    const markAll = (status) => {
        const newMap = {};
        activeStudents.forEach(s => {
            newMap[s.id] = status;
        });
        setAttendanceMap(newMap);
    };

    const handleStatusChange = (studentId, status) => {
        setAttendanceMap(prev => ({
            ...prev,
            [studentId]: status
        }));
    };

    // Use local date to avoid timezone issues blocking 'Today'
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    const todayStr = todayLocal.toISOString().split('T')[0];

    const isLocked = () => {
        if (selectedDate > todayStr) return true; // Future
        const sel = new Date(selectedDate);
        const today = new Date(todayStr);
        // Reset times to compare dates only
        sel.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = today - sel;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays > 2; // Allow Today(0), Yesterday(1), DayBefore(2). Lock > 2.
    };

    const saveAttendance = async () => {
        if (selectedDate > todayStr) {
            return onAlert("Cannot mark attendance for future dates.", "Error");
        }
        if (isLocked()) {
            return onAlert("Attendance log is locked for this date (older than 48h).", "Error");
        }

        setSaving(true);
        try {
            const docId = `${tenantId}_${selectedDate}`;
            await setDoc(doc(db, 'attendance', docId), {
                tenantId,
                date: selectedDate,
                records: attendanceMap,
                totalStudents: activeStudents.length,
                presentCount: Object.values(attendanceMap).filter(v => v === 'PRESENT').length,
                absentCount: Object.values(attendanceMap).filter(v => v === 'ABSENT').length,
                updatedAt: serverTimestamp()
            });

            // --- Send Attendance Notifications ---
            try {
                const affectedStudentIds = Object.keys(attendanceMap).filter(id => attendanceMap[id] === 'ABSENT' || attendanceMap[id] === 'LATE');
                if (affectedStudentIds.length > 0) {
                    const parentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                    const parentSnaps = await getDocs(parentsQuery);

                    const studentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId));
                    const studentSnaps = await getDocs(studentsQuery);
                    const studentMap = Object.fromEntries(studentSnaps.docs.map(d => [d.id, { id: d.id, ...d.data() }]));

                    for (const parentDoc of parentSnaps.docs) {
                        const parent = parentDoc.data();
                        const linkedPhones = [parent.linkedStudentPhone, ...(parent.linkedStudentPhones || [])]
                            .filter(Boolean)
                            .map(ph => ph.replace(/[^0-9]/g, ''));

                        if (parent.pushToken && linkedPhones.length > 0) {
                            const matchedAffectedStudents = Object.values(studentMap).filter(s => {
                                const cleanStudentPhone = (s.phoneNumber || '').replace(/[^0-9]/g, '');
                                const isLinked = linkedPhones.includes(cleanStudentPhone);
                                const isAffected = affectedStudentIds.includes(s.id);
                                return isLinked && isAffected;
                            });

                            for (const sData of matchedAffectedStudents) {
                                const status = attendanceMap[sData.id];
                                console.log(`Triggering notification for parent ${parent.name} regarding student ${sData.name}`);
                                await sendPushNotification(
                                    parent.pushToken,
                                    `⚠️ Attendance Alert: ${sData.name}`,
                                    `${sData.name} was marked ${status} today (${selectedDate}).`,
                                    { screen: 'parent-dashboard' }
                                );
                            }
                        }
                    }
                }
            } catch (notifyErr) {
                console.warn("Attendance notifications failed", notifyErr);
            }

            onAlert("Attendance Saved Successfully! ✅", "Success");
        } catch (e) {
            console.error("Error saving attendance:", e);
            onAlert("Failed to save attendance: " + e.message, "Error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>📅 Attendance Register</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Tracking attendance for <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{activeStudents.length}</span> students.</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date:</label>
                    <input
                        type="date"
                        max={todayStr}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '80px 0', textAlign: 'center' }}>
                    <div className="loader" style={{ margin: '0 auto 16px' }}></div>
                    <div style={{ color: 'var(--text-secondary)' }}>Synchronizing records...</div>
                </div>
            ) : activeStudents.length === 0 ? (
                <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'var(--danger-border)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>👥</div>
                    <h3>No Active Students Found</h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>Please ensure students are approved in the "Students" tab before marking attendance.</p>
                </div>
            ) : (
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => markAll('PRESENT')}
                                disabled={isLocked()}
                                style={{ color: 'var(--success)', fontSize: '0.85rem' }}
                            >
                                Mark All Present
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => markAll('ABSENT')}
                                disabled={isLocked()}
                                style={{ color: 'var(--danger)', fontSize: '0.85rem' }}
                            >
                                Mark All Absent
                            </button>
                        </div>
                        {isLocked() && (
                            <div className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                                🔒 Locked (Read Only)
                            </div>
                        )}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Student</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Class</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Marking</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeStudents.map(student => {
                                    const status = attendanceMap[student.id] || 'UNMARKED';
                                    return (
                                        <tr key={student.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '20px 24px' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{student.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {student.id.slice(0, 8)}</div>
                                            </td>
                                            <td style={{ padding: '20px 24px' }}>
                                                <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{student.grade}</span>
                                            </td>
                                            <td style={{ padding: '20px 24px', textAlign: 'center' }}>
                                                <span className={`badge ${status === 'PRESENT' ? 'badge-success' :
                                                    status === 'ABSENT' ? 'badge-danger' :
                                                        status === 'LATE' ? 'badge-warning' : ''
                                                    }`} style={{ opacity: status === 'UNMARKED' ? 0.3 : 1 }}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '20px 24px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'PRESENT')}
                                                        style={{
                                                            width: '36px', height: '36px', borderRadius: '10px',
                                                            border: '1px solid var(--success-border)',
                                                            background: status === 'PRESENT' ? 'var(--success)' : 'transparent',
                                                            color: status === 'PRESENT' ? '#fff' : 'var(--success)',
                                                            cursor: 'pointer', fontWeight: 800, transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1, fontSize: '0.8rem'
                                                        }}
                                                    >P</button>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'ABSENT')}
                                                        style={{
                                                            width: '36px', height: '36px', borderRadius: '10px',
                                                            border: '1px solid var(--danger-border)',
                                                            background: status === 'ABSENT' ? 'var(--danger)' : 'transparent',
                                                            color: status === 'ABSENT' ? '#fff' : 'var(--danger)',
                                                            cursor: 'pointer', fontWeight: 800, transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1, fontSize: '0.8rem'
                                                        }}
                                                    >A</button>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'LATE')}
                                                        style={{
                                                            width: '36px', height: '36px', borderRadius: '10px',
                                                            border: '1px solid var(--warning-border)',
                                                            background: status === 'LATE' ? 'var(--warning)' : 'transparent',
                                                            color: status === 'LATE' ? '#fff' : 'var(--warning)',
                                                            cursor: 'pointer', fontWeight: 800, transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1, fontSize: '0.8rem'
                                                        }}
                                                    >L</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-primary"
                            onClick={saveAttendance}
                            disabled={saving || isLocked()}
                            style={{ padding: '12px 32px', fontSize: '1rem', minWidth: '220px' }}
                        >
                            {saving ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : (isLocked() ? 'Log Locked 🔒' : '💾 Save Changes')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceManager;
