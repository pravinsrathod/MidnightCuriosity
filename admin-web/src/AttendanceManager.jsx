import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

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
            onAlert("Attendance Saved Successfully! ✅", "Success");
        } catch (e) {
            console.error("Error saving attendance:", e);
            onAlert("Failed to save attendance: " + e.message, "Error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h2 style={{ marginBottom: '5px' }}>📅 Attendance Register</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Mark attendance for active students.</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="label" style={{ margin: 0 }}>Select Date:</label>
                    <input
                        type="date"
                        max={todayStr}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: '#fff' }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading attendance record...</div>
            ) : activeStudents.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No Active Students found. Approve students in the "Students" tab first.
                </div>
            ) : (
                <>
                    {/* Bulk Actions */}
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button className="btn-ghost" onClick={() => markAll('PRESENT')} disabled={isLocked()} style={{ color: 'var(--success)', borderColor: 'var(--success)', opacity: isLocked() ? 0.5 : 1 }}>Mark All Present</button>
                        <button className="btn-ghost" onClick={() => markAll('ABSENT')} disabled={isLocked()} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', opacity: isLocked() ? 0.5 : 1 }}>Mark All Absent</button>
                        {isLocked() && <span style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>🔒 Record Locked (Read Only)</span>}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-tertiary)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px', borderRadius: '8px 0 0 8px' }}>Student Name</th>
                                    <th style={{ padding: '12px' }}>Grade</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '12px', borderRadius: '0 8px 8px 0', textAlign: 'center' }}>Marking</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeStudents.map(student => {
                                    const status = attendanceMap[student.id] || 'UNMARKED';
                                    return (
                                        <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>{student.name}</td>
                                            <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{student.grade}</td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.8rem',
                                                    background: status === 'PRESENT' ? 'var(--success)' : status === 'ABSENT' ? 'var(--danger)' : 'var(--bg-tertiary)',
                                                    color: '#fff',
                                                    opacity: status === 'UNMARKED' ? 0.5 : 1
                                                }}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'PRESENT')}
                                                        style={{
                                                            padding: '6px 15px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--success)',
                                                            background: status === 'PRESENT' ? 'var(--success)' : 'transparent',
                                                            color: status === 'PRESENT' ? '#fff' : 'var(--success)',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1
                                                        }}
                                                    >
                                                        P
                                                    </button>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'ABSENT')}
                                                        style={{
                                                            padding: '6px 15px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--danger)',
                                                            background: status === 'ABSENT' ? 'var(--danger)' : 'transparent',
                                                            color: status === 'ABSENT' ? '#fff' : 'var(--danger)',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1
                                                        }}
                                                    >
                                                        A
                                                    </button>
                                                    <button
                                                        disabled={isLocked()}
                                                        onClick={() => handleStatusChange(student.id, 'LATE')}
                                                        style={{
                                                            padding: '6px 15px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--warning)',
                                                            background: status === 'LATE' ? 'var(--warning)' : 'transparent',
                                                            color: status === 'LATE' ? '#fff' : 'var(--warning)',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            transition: 'all 0.2s',
                                                            opacity: isLocked() ? 0.3 : 1
                                                        }}
                                                    >
                                                        L
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="btn-primary"
                            onClick={saveAttendance}
                            disabled={saving || isLocked()}
                            style={{ padding: '10px 30px', fontSize: '1rem', opacity: isLocked() ? 0.5 : 1 }}
                        >
                            {saving ? 'Saving...' : (isLocked() ? 'Log Locked' : '💾 Save Attendance Log')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default AttendanceManager;
