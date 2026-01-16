import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; // Ensure storage is imported
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const HomeworkManager = ({ students, tenantId, onAlert, grades: propGrades, filterGrade }) => {
    const [selectedDate, setSelectedDate] = useState(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]);
    const [homeworkList, setHomeworkList] = useState([]);
    const [submissions, setSubmissions] = useState({}); // Map: homeworkId -> { studentId -> submissionData }
    const [loading, setLoading] = useState(false);

    // Create Homework State
    const [newHomework, setNewHomework] = useState({ title: "", description: "", grade: "", subject: "" });
    const [homeworkFile, setHomeworkFile] = useState(null);
    const [creating, setCreating] = useState(false);

    // Review State
    const [reviewingSubmission, setReviewingSubmission] = useState(null); // { homeworkId, studentId, ...data }
    const [reviewStatus, setReviewStatus] = useState("CHECKED");
    const [teacherComment, setTeacherComment] = useState("");
    const [teacherFile, setTeacherFile] = useState(null);

    // Config options
    const grades = propGrades && propGrades.length > 0 ? propGrades : Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1));
    const subjects = ["Maths", "Physics", "Chemistry", "Biology"];

    useEffect(() => {
        if (!tenantId) return;

        // Listen for Homework assignments for this tenant
        // Listen for Homework assignments for this tenant
        // REMOVED orderBy to avoid "Missing Index" error. Sorting client-side.
        const q = query(
            collection(db, "homework"),
            where("tenantId", "==", tenantId)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Client-side Sort: Latest First
            list.sort((a, b) => {
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                // If dates are same, sort by created time if avail
                if (dateB === dateA) {
                    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
                }
                return dateB - dateA;
            });

            setHomeworkList(list);
        }, (error) => {
            console.error("Homework subscription error:", error);
            onAlert("Error loading homework list. Please refresh.", "Error");
        });

        return () => unsub();
    }, [tenantId]);

    // Listen for submissions for the visible homeworks
    useEffect(() => {
        if (!tenantId || homeworkList.length === 0) return;

        // In a real app, might want to query per homework item or perform specific index queries.
        // For simplicity, we'll fetch all submissions for this tenant's homeworks
        // Or better: just subscribe to a 'submissions' subcollection or top-level collection.
        // Let's assume a top-level 'submissions' collection linked by homeworkId & studentId

        const qSub = query(collection(db, "submissions"), where("tenantId", "==", tenantId));
        const unsubSub = onSnapshot(qSub, (snapshot) => {
            const map = {};
            snapshot.docs.forEach(d => {
                const data = d.data();
                if (!map[data.homeworkId]) map[data.homeworkId] = {};
                map[data.homeworkId][data.studentId] = { id: d.id, ...data };
            });
            setSubmissions(map);
        });

        return () => unsubSub();
    }, [tenantId, homeworkList]);


    const handleCreateHomework = async (e) => {
        e.preventDefault();
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const todayStr = new Date(today.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
        if (selectedDate < todayStr) return onAlert("Due Date cannot be in the past.", "Error");

        if (!newHomework.title || !newHomework.grade || !newHomework.subject) return onAlert("Please fill all fields", "Error");

        setCreating(true);
        try {
            let fileUrl = null;
            if (homeworkFile) {
                const storageRef = ref(storage, `homework_attachments/${tenantId}/${Date.now()}_${homeworkFile.name}`);
                await uploadBytes(storageRef, homeworkFile);
                fileUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, "homework"), {
                ...newHomework,
                dueDate: selectedDate,
                tenantId,
                attachmentUrl: fileUrl,
                createdAt: serverTimestamp(),
                status: 'OPEN'
            });
            onAlert("Homework Assigned Successfully! 📝", "Success");
            setNewHomework({ title: "", description: "", grade: "", subject: "" });
            setHomeworkFile(null);
        } catch (error) {
            console.error(error);
            onAlert("Failed to assign homework: " + error.message, "Error");
        } finally {
            setCreating(false);
        }
    };

    const handleReviewSave = async () => {
        if (!reviewingSubmission) return;

        setLoading(true);
        try {
            let fileUrl = "";
            if (teacherFile) {
                const storageRef = ref(storage, `homework_feedback/${tenantId}/${reviewingSubmission.homeworkId}/${reviewingSubmission.studentId}_${Date.now()}`);
                await uploadBytes(storageRef, teacherFile);
                fileUrl = await getDownloadURL(storageRef);
            }

            const submissionId = reviewingSubmission.id;

            // If submission exists, update it. If not (teacher manual override), create it.
            if (submissionId) {
                await updateDoc(doc(db, "submissions", submissionId), {
                    teacherComment: teacherComment,
                    teacherFileUrl: fileUrl || reviewingSubmission.teacherFileUrl || null,
                    status: reviewStatus,
                    checkedAt: serverTimestamp()
                });
            } else {
                // Manual creation by teacher
                await addDoc(collection(db, "submissions"), {
                    homeworkId: reviewingSubmission.homeworkId,
                    studentId: reviewingSubmission.studentId,
                    tenantId,
                    studentName: reviewingSubmission.studentName, // Need to ensure we pass this
                    status: reviewStatus, // 'CHECKED' or 'INCOMPLETE'
                    teacherComment,
                    teacherFileUrl: fileUrl,
                    checkedAt: serverTimestamp(),
                    submittedAt: null // Explicitly null as student didn't submit
                });
            }

            onAlert(`Homework Marked as ${reviewStatus}! ✅`, "Success");
            setReviewingSubmission(null);
            setTeacherComment("");
            setTeacherFile(null);
        } catch (error) {
            console.error(error);
            onAlert("Failed to save review: " + error.message, "Error");
        } finally {
            setLoading(false);
        }
    };

    const [activeSubTab, setActiveSubTab] = useState('create');

    // Helper to filtered homework by date
    const filteredHomework = homeworkList.filter(hw => hw.dueDate === selectedDate && (!filterGrade || filterGrade === 'All' || hw.grade === filterGrade));

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* SUB-MENU TABS */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                <button
                    onClick={() => { setActiveSubTab('create'); setSelectedDate(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]); }}
                    style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeSubTab === 'create' ? '2px solid var(--accent)' : 'none',
                        color: activeSubTab === 'create' ? 'var(--accent)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Create New Homework
                </button>
                <button
                    onClick={() => { setActiveSubTab('assess'); setSelectedDate(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]); }}
                    style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeSubTab === 'assess' ? '2px solid var(--accent)' : 'none',
                        color: activeSubTab === 'assess' ? 'var(--accent)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Assess Homework
                </button>
            </div>

            <div className="content-area">
                {/* 1. Create Homework Section */}
                {activeSubTab === 'create' && (
                    <div className="card" style={{ maxWidth: '600px' }}>
                        <h3 style={{ marginBottom: '15px' }}>➕ Assign New Homework</h3>
                        <form onSubmit={handleCreateHomework} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label className="label">Due Date (Today Onwards)</label>
                                <input
                                    type="date"
                                    min={new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]} // Min Today
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                                />
                            </div>
                            <div className="grid-2">
                                <div>
                                    <label className="label">Grade</label>
                                    <select
                                        value={newHomework.grade}
                                        onChange={e => setNewHomework({ ...newHomework, grade: e.target.value })}
                                        style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                                    >
                                        <option value="">Select Grade</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Subject</label>
                                    <select
                                        value={newHomework.subject}
                                        onChange={e => setNewHomework({ ...newHomework, subject: e.target.value })}
                                        style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                                    >
                                        <option value="">Select Subject</option>
                                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="label">Task Title</label>
                                <input
                                    placeholder="e.g. Algebra Exercise 4.1"
                                    value={newHomework.title}
                                    onChange={e => setNewHomework({ ...newHomework, title: e.target.value })}
                                    style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                                />
                            </div>
                            <div>
                                <label className="label">Description / Instructions</label>
                                <textarea
                                    placeholder="Solve Q1 to Q10 in notebook and upload photo."
                                    value={newHomework.description}
                                    onChange={e => setNewHomework({ ...newHomework, description: e.target.value })}
                                    rows={3}
                                    style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                                />
                            </div>
                            <div>
                                <label className="label">Reference File (PDF/Image)</label>
                                <input type="file" onChange={e => setHomeworkFile(e.target.files[0])} />
                            </div>
                            <button type="submit" className="btn-primary" disabled={creating}>
                                {creating ? "Assigning..." : "Assign Homework"}
                            </button>
                        </form>
                    </div>
                )}

                {/* 2. Assess Homework Section */}
                {activeSubTab === 'assess' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="card" style={{ marginBottom: '10px', padding: '15px' }}>
                            <label className="label">Filter by Due Date (Today & Previous)</label>
                            <input
                                type="date"
                                max={new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]} // Max Today
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                            />
                        </div>

                        {filteredHomework.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No homework found for {selectedDate}.
                            </div>
                        ) : (
                            filteredHomework.map(hw => (
                                <div key={hw.id} className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <h4>{hw.title}</h4>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Due: {hw.dueDate}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                        {hw.grade} • {hw.subject}
                                        {hw.attachmentUrl && <a href={hw.attachmentUrl} target="_blank" rel="noreferrer" style={{ marginLeft: '10px', color: 'var(--accent)' }}>[View Attachment]</a>}
                                    </div>
                                    <p style={{ fontSize: '0.9rem', marginBottom: '15px' }}>{hw.description}</p>

                                    {/* Student Status List */}
                                    <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '10px', color: 'var(--text-secondary)' }}> STUDENT SUBMISSIONS</div>
                                        {students.filter(s => s.grade === hw.grade && s.status === 'ACTIVE' && (s.role === 'student' || s.role === 'STUDENT')).map(student => {
                                            const sub = submissions[hw.id]?.[student.id];
                                            const isChecked = sub?.status === 'CHECKED';
                                            const isIncomplete = sub?.status === 'INCOMPLETE';

                                            return (
                                                <div key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            width: '8px', height: '8px', borderRadius: '50%',
                                                            background: sub ? (isChecked ? 'var(--success)' : (isIncomplete ? 'var(--danger)' : 'var(--warning)')) : 'var(--text-tertiary)'
                                                        }}></span>
                                                        <span>{student.name}</span>
                                                        {sub && sub.fileUrl && (
                                                            <a href={sub.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                                                                [View File]
                                                            </a>
                                                        )}
                                                    </div>
                                                    <button
                                                        className="btn-ghost"
                                                        style={{
                                                            fontSize: '0.8rem', padding: '2px 8px',
                                                            border: isChecked ? '1px solid var(--success)' : (isIncomplete ? '1px solid var(--danger)' : '1px solid var(--border)'),
                                                            color: isChecked ? 'var(--success)' : (isIncomplete ? 'var(--danger)' : 'var(--text)')
                                                        }}
                                                        onClick={() => {
                                                            setReviewingSubmission({
                                                                homeworkId: hw.id,
                                                                studentId: student.id,
                                                                studentName: student.name,
                                                                ...sub // Spread existing submission data if any
                                                            });
                                                            setReviewStatus(sub?.status || 'CHECKED');
                                                            setTeacherComment(sub?.teacherComment || "");
                                                        }}
                                                    >
                                                        {isChecked ? "✅ Verified" : (isIncomplete ? "❌ Incomplete" : (sub ? "Review" : "Mark manually"))}
                                                    </button>
                                                </div>
                                            )
                                        })}
                                        {students.filter(s => s.grade === hw.grade && s.status === 'ACTIVE' && (s.role === 'student' || s.role === 'STUDENT')).length === 0 && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No students found in {hw.grade}</div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* REVIEW MODAL */}
            {reviewingSubmission && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '500px', padding: '20px', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginBottom: '15px' }}>Review Homework: {reviewingSubmission.studentName}</h3>

                        {reviewingSubmission.fileUrl ? (
                            <div style={{ marginBottom: '15px', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                                📄 Student uploaded: <a href={reviewingSubmission.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>View Attachment</a>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                                    Submitted at: {reviewingSubmission.submittedAt ? new Date(reviewingSubmission.submittedAt.seconds * 1000).toLocaleString() : "Manual Entry"}
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '15px', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--warning)' }}>
                                ⚠️ No file uploaded by student.
                            </div>
                        )}

                        <div className="form-group">
                            <label className="label">Status</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', background: reviewStatus === 'CHECKED' ? 'var(--success)' : 'transparent' }}>
                                    <input
                                        type="radio"
                                        name="status"
                                        value="CHECKED"
                                        checked={reviewStatus === 'CHECKED'}
                                        onChange={() => setReviewStatus('CHECKED')}
                                    />
                                    Verified (Complete)
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', background: reviewStatus === 'INCOMPLETE' ? 'var(--danger)' : 'transparent' }}>
                                    <input
                                        type="radio"
                                        name="status"
                                        value="INCOMPLETE"
                                        checked={reviewStatus === 'INCOMPLETE'}
                                        onChange={() => setReviewStatus('INCOMPLETE')}
                                    />
                                    Incomplete / Redo
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="label">Teacher's Remark / Feedback</label>
                            <textarea
                                rows={3}
                                value={teacherComment}
                                onChange={e => setTeacherComment(e.target.value)}
                                placeholder="Good work! OR Please redo Q3."
                                style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
                            />
                        </div>

                        <div className="form-group">
                            <label className="label">Attach Correction File (Optional)</label>
                            <input type="file" onChange={e => setTeacherFile(e.target.files[0])} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button className="btn-ghost" onClick={() => setReviewingSubmission(null)}>Cancel</button>
                            <button className="btn-primary" onClick={handleReviewSave} disabled={loading}>
                                {loading ? "Saving..." : "Save Status"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomeworkManager;
