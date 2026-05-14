import React, { useState, useEffect } from 'react';
import Pagination from './common/Pagination';
import { db, storage } from '../firebase'; // Ensure storage is imported
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, onSnapshot, addDoc, orderBy, getDocs } from 'firebase/firestore';
import { sendPushNotification } from '../notificationService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
    Calendar as CalendarIcon, 
    ChevronLeft, 
    ChevronRight, 
    FileText, 
    Paperclip, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    User,
    ChevronDown,
    ChevronUp,
    BarChart3,
    Search,
    Filter,
    Plus,
    Check
} from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import ConfirmModal from './ConfirmModal';


const HomeworkCalendar = ({ selectedDate, onDateSelect, homeworkList }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
    
    // Normalize date for comparison: YYYY-MM-DD
    const formatDate = (date) => {
        const d = new Date(date);
        return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    };

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    // Get set of dates that have homework
    const homeworkDates = new Set(homeworkList.map(hw => hw.dueDate));

    const renderDays = () => {
        const dayElements = [];
        // Empty cells for days before the 1st of the month
        for (let i = 0; i < startDay; i++) {
            dayElements.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        }
        // Day cells
        for (let day = 1; day <= days; day++) {
            const dateStr = formatDate(new Date(year, month, day));
            const isSelected = dateStr === selectedDate;
            const isToday = formatDate(new Date()) === dateStr;
            const hasHomework = homeworkDates.has(dateStr);

            dayElements.push(
                <div 
                    key={day} 
                    className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => onDateSelect(dateStr)}
                >
                    {day}
                    {hasHomework && <div className="has-homework-dot"></div>}
                </div>
            );
        }
        return dayElements;
    };

    return (
        <div className="homework-calendar animate-fade-in shadow-glass">
            <div className="calendar-header">
                <button className="calendar-nav-btn" onClick={prevMonth}><ChevronLeft size={20} /></button>
                <h4>{monthNames[month]} {year}</h4>
                <button className="calendar-nav-btn" onClick={nextMonth}><ChevronRight size={20} /></button>
            </div>
            <div className="calendar-grid">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="calendar-day-label">{d}</div>
                ))}
                {renderDays()}
            </div>
        </div>
    );
};

const HomeworkManager = ({ students = [], tenantId, onAlert = () => {}, grades: propGrades, subjects: propSubjects, topics: propTopics, filterGrade, filterBatch, batches = {} }) => {

    const [selectedDate, setSelectedDate] = useState(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]);
    const [homeworkList, setHomeworkList] = useState([]);
    const [submissions, setSubmissions] = useState({}); // Map: homeworkId -> { studentId -> submissionData }
    const [loading, setLoading] = useState(false);

    // Create Homework State
    const [newHomework, setNewHomework] = useState({ title: "", description: "", grade: "", batch: "All", subject: "", topic: "" });
    const [homeworkFile, setHomeworkFile] = useState(null);
    const [creating, setCreating] = useState(false);

    // Expansion State
    const [expandedHomework, setExpandedHomework] = useState(null);
    const [selectedStudents, setSelectedStudents] = useState([]); // Array of student IDs
    const [studentSearch, setStudentSearch] = useState("");
    const [studentListPage, setStudentListPage] = useState(1);
    const [hwPage, setHwPage] = useState(1);
    const STUDENT_PAGE_SIZE = 10;
    const HW_PAGE_SIZE = 10;

    // Review State
    const [reviewingSubmission, setReviewingSubmission] = useState(null); // { homeworkId, studentId, ...data }
    const [reviewStatus, setReviewStatus] = useState("CHECKED");
    const [teacherComment, setTeacherComment] = useState("");
    const [teacherFile, setTeacherFile] = useState(null);

    // Bulk Confirmation Modal State
    const [bulkConfirm, setBulkConfirm] = useState({ isOpen: false, status: null });

    // Config options
    const grades = (propGrades && propGrades.length > 0) ? propGrades : Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1));
    const subjects = (propSubjects && propSubjects.length > 0) ? propSubjects : ["Maths", "Physics", "Chemistry", "Biology"];
    const topics = (propTopics && propTopics.length > 0) ? propTopics : ["General"];

    // Reset pages on filter changes
    useEffect(() => {
        setHwPage(1);
        setExpandedHomework(null);
    }, [selectedDate, filterGrade, filterBatch]);

    useEffect(() => {
        setStudentListPage(1);
    }, [studentSearch]);

    useEffect(() => {
        setStudentListPage(1);
        setStudentSearch("");
        setSelectedStudents([]); // Reset selection when switching homework cards
    }, [expandedHomework]);

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

    // Reset selection/search on expansion change
    useEffect(() => {
        setSelectedStudents([]);
        setStudentSearch("");
        setStudentListPage(1);
    }, [expandedHomework]);

    useEffect(() => {
        setStudentListPage(1);
    }, [studentSearch]);

    // Reset expansion if filters change
    useEffect(() => {
        setExpandedHomework(null);
    }, [selectedDate, filterGrade, filterBatch]);


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

            const docRef = await addDoc(collection(db, "homework"), {
                ...newHomework,
                batch: newHomework.batch || "All",
                dueDate: selectedDate,
                tenantId,
                attachmentUrl: fileUrl,
                createdAt: serverTimestamp(),
                status: 'OPEN'
            });

            // --- Send Push Notifications to Parents ---
            try {
                // 1. Get all students in this grade
                const studentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("grade", "==", newHomework.grade));
                const studentSnaps = await getDocs(studentsQuery);
                const assignedBatch = newHomework.batch || "All";
                const studentPhones = studentSnaps.docs
                    .map(d => d.data())
                    .filter(data => assignedBatch === "All" || (data.batch || "General Batch") === assignedBatch)
                    .map(data => data.phoneNumber)
                    .filter(Boolean);

                if (studentPhones.length > 0) {
                    // 2. Get all parents for this tenant
                    const parentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                    const parentSnaps = await getDocs(parentsQuery);

                    // 3. Filter parents linked to these students and get tokens
                    const tokens = parentSnaps.docs
                        .map(d => d.data())
                        .filter(p => {
                            if (!p.pushToken) return false;
                            const pPhones = [(p.linkedStudentPhone || ''), ...(p.linkedStudentPhones || [])];
                            return pPhones.some(pp => {
                                const cleanParentLink = (pp || '').replace(/[^0-9]/g, '');
                                return cleanParentLink && studentPhones.some(sp => (sp || '').replace(/[^0-9]/g, '') === cleanParentLink);
                            });
                        })
                        .map(p => p.pushToken);

                    if (tokens.length > 0) {
                        await sendPushNotification(
                            tokens,
                            `📚 New Homework: ${newHomework.subject}`,
                            `${newHomework.title} assigned for ${newHomework.grade}.`,
                            {
                                screen: 'homework/[id]',
                                params: { id: docRef.id }
                            }
                        );
                    }
                }
            } catch (notifyErr) {
                console.warn("Notification failed, but homework was saved", notifyErr);
            }

            onAlert("Homework Assigned Successfully! 📝", "Success");
            setNewHomework({ title: "", description: "", grade: "", batch: "All", subject: "", topic: "" });
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

            // --- Send Push Notifications to Parent ---
            try {
                // 1. Get the student's data to find their phone
                const studentDoc = await getDoc(doc(db, "users", reviewingSubmission.studentId));
                if (studentDoc.exists()) {
                    const studentData = studentDoc.data();
                    const studentPhone = studentData.phoneNumber;

                    if (studentPhone) {
                        const cleanStudentPhone = studentPhone.replace(/[^0-9]/g, '');
                        // 2. Find the parent linked to this phone (fetching all parents of tenant for robust matching)
                        const parentQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                        const parentSnaps = await getDocs(parentQuery);

                        const tokens = parentSnaps.docs
                            .map(d => d.data())
                            .filter(p => {
                                if (!p.pushToken) return false;
                                const pPhones = [(p.linkedStudentPhone || ''), ...(p.linkedStudentPhones || [])];
                                return pPhones.some(pp => (pp || '').replace(/[^0-9]/g, '') === cleanStudentPhone);
                            })
                            .map(p => p.pushToken);

                        if (tokens.length > 0) {
                            const statusLabel = reviewStatus === 'CHECKED' ? 'Verified ✅' : 'Incomplete / Redo ❌';
                            await sendPushNotification(
                                tokens,
                                `📝 Homework Reviewed: ${reviewingSubmission.studentName}`,
                                `Homework status: ${statusLabel}. Click for details.`,
                                {
                                    screen: 'homework/[id]',
                                    params: { id: reviewingSubmission.homeworkId }
                                }
                            );
                        }
                    }
                }
            } catch (notifyErr) {
                console.warn("Review notification failed", notifyErr);
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

    const handleBulkReview = async (status) => {
        if (selectedStudents.length === 0 || !expandedHomework) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const homeworkId = expandedHomework;

            for (const studentId of selectedStudents) {
                const sub = submissions[homeworkId]?.[studentId];
                const student = students.find(s => s.id === studentId);

                if (sub) {
                    batch.update(doc(db, "submissions", sub.id), {
                        status: status,
                        checkedAt: serverTimestamp(),
                        teacherComment: `Bulk verified on ${new Date().toLocaleDateString()}`
                    });
                } else {
                    const subRef = doc(collection(db, "submissions"));
                    batch.set(subRef, {
                        homeworkId,
                        studentId,
                        tenantId,
                        studentName: student?.name || "Unknown",
                        status: status,
                        teacherComment: `Bulk marked as ${status} on ${new Date().toLocaleDateString()}`,
                        checkedAt: serverTimestamp(),
                        submittedAt: null
                    });
                }
            }

            await batch.commit();
            onAlert(`Successfully updated ${selectedStudents.length} students! ✅`, "Success");
            setSelectedStudents([]);
        } catch (error) {
            console.error(error);
            onAlert("Bulk update failed: " + error.message, "Error");
        } finally {
            setLoading(false);
        }
    };

    const [activeSubTab, setActiveSubTab] = useState('create');

    // Helper to filtered homework by date
    const filteredHomework = homeworkList.filter(hw => 
        hw.dueDate === selectedDate && 
        (!filterGrade || filterGrade === 'All' || hw.grade === filterGrade) &&
        (!filterBatch || filterBatch === 'All' || hw.batch === filterBatch)
    );

    const paginatedHomework = filteredHomework.slice((hwPage - 1) * HW_PAGE_SIZE, hwPage * HW_PAGE_SIZE);

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* SUB-MENU TABS */}
            <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '8px', marginBottom: '32px', borderRadius: '16px' }}>
                <button
                    onClick={() => { 
                        setActiveSubTab('create'); 
                        setExpandedHomework(null);
                        setSelectedDate(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]); 
                    }}
                    className={`btn ${activeSubTab === 'create' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, borderRadius: '12px' }}
                >
                    Assign Homework
                </button>
                <button
                    onClick={() => { 
                        setActiveSubTab('assess'); 
                        setExpandedHomework(null);
                        setSelectedDate(new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]); 
                    }}
                    className={`btn ${activeSubTab === 'assess' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, borderRadius: '12px' }}
                >
                    Review Submissions
                </button>
            </div>

            <div className="content-area">
                {/* 1. Create Homework Section */}
                {activeSubTab === 'create' && (
                    <div className="glass-panel animate-scale-up" style={{ maxWidth: '700px', margin: '0 auto', padding: '40px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📝</div>
                            <h2 style={{ fontSize: '1.75rem' }}>Create New Assignment</h2>
                            <p style={{ color: 'var(--text-secondary)' }}>Send a new task to your students' dashboard.</p>
                        </div>

                        <form onSubmit={handleCreateHomework} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="form-group">
                                <label className="label">Due Date</label>
                                <input
                                    type="date"
                                    min={new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]} // Min Today
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="date-input"
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                />
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="label">Class/Grade</label>
                                    <select
                                        value={newHomework.grade}
                                        onChange={e => setNewHomework({ ...newHomework, grade: e.target.value })}
                                        style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                    >
                                        <option value="">Select Grade</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                {newHomework.grade && (
                                    <div className="form-group">
                                        <label className="label">Batch Assignment</label>
                                        <select
                                            value={newHomework.batch}
                                            onChange={e => setNewHomework({ ...newHomework, batch: e.target.value })}
                                            style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                        >
                                            <option value="">Select Batch (Defaults to All)</option>
                                            <option value="All">All Batches</option>
                                            {(batches[newHomework.grade] || ["General Batch"]).map((b, idx) => (
                                                <option key={idx} value={b}>{b}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="label">Subject</label>
                                    <select
                                        value={newHomework.subject}
                                        onChange={e => setNewHomework({ ...newHomework, subject: e.target.value })}
                                        style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                    >
                                        <option value="">Select Subject</option>
                                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="label">Topic Name</label>
                                <input
                                    placeholder="e.g. Trigonometry Basics"
                                    value={newHomework.topic}
                                    onChange={e => setNewHomework({ ...newHomework, topic: e.target.value })}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="label">Assignment Title</label>
                                <input
                                    placeholder="e.g. Exercise 5.2 - Question 1 to 10"
                                    value={newHomework.title}
                                    onChange={e => setNewHomework({ ...newHomework, title: e.target.value })}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="label">Task Instructions</label>
                                <textarea
                                    placeholder="Explain the task clearly for students..."
                                    value={newHomework.description}
                                    onChange={e => setNewHomework({ ...newHomework, description: e.target.value })}
                                    rows={4}
                                    style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px', resize: 'vertical' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="label">Upload Resource (PDF/Image)</label>
                                <div style={{
                                    border: '2px dashed var(--border)',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    textAlign: 'center',
                                    background: homeworkFile ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                                    transition: 'all 0.3s'
                                }}>
                                    <input type="file" id="hw-file" onChange={e => setHomeworkFile(e.target.files[0])} style={{ display: 'none' }} />
                                    <label htmlFor="hw-file" style={{ cursor: 'pointer' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{homeworkFile ? '📄' : '📤'}</div>
                                        <div style={{ fontWeight: 600 }}>{homeworkFile ? homeworkFile.name : 'Click to Browse Files'}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Max file size: 10MB</div>
                                    </label>
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={creating} style={{ padding: '16px', fontSize: '1.1rem', marginTop: '12px' }}>
                                {creating ? <span className="loader" style={{ width: '20px', height: '20px' }}></span> : "🚀 Distribute Assignment"}
                            </button>
                        </form>
                    </div>
                )}

                {/* 2. Assess Homework Section */}
                {activeSubTab === 'assess' && (
                    <div className="homework-review-layout">
                        {/* Sidebar: Calendar & Instructions */}
                        <div className="assess-sidebar-inner">
                            <HomeworkCalendar 
                                selectedDate={selectedDate} 
                                onDateSelect={setSelectedDate} 
                                homeworkList={homeworkList} 
                            />
                            
                            <div className="glass-panel" style={{ padding: '20px' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Tips</h4>
                                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <li>Dates with <span style={{ color: 'var(--accent-light)', fontWeight: 'bold' }}>dots</span> have active assignments.</li>
                                    <li>Click any date to see all tasks due that day.</li>
                                    <li>Use the tabs above to switch between assigning and reviewing.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Main Content: Homework List & Submissions */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="glass-panel" style={{ padding: '20px 32px' }}>
                                <h3 style={{ margin: 0 }}>Submissions for {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {filteredHomework.length} {filteredHomework.length === 1 ? 'assignment' : 'assignments'} found for this date.
                                </p>
                            </div>

                            {filteredHomework.length === 0 ? (
                                <div className="glass-panel" style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                                    <h3 style={{ color: 'var(--text-primary)' }}>No Assignments Found</h3>
                                    <p>There were no homework tasks due on this date.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid-auto">
                                        {paginatedHomework.map(hw => {
                                        const totalStudents = students.filter(s => s.grade === hw.grade && s.status === 'ACTIVE' && (s.role === 'student' || s.role === 'STUDENT') && ((hw.batch === 'All' || !hw.batch) || (s.batch || 'General Batch') === hw.batch));
                                        const submittedCount = Object.keys(submissions[hw.id] || {}).length;
                                        const checkedCount = Object.values(submissions[hw.id] || {}).filter(s => s.status === 'CHECKED').length;
                                        const progressPercent = totalStudents.length > 0 ? (submittedCount / totalStudents.length) * 100 : 0;
                                        const isExpanded = expandedHomework === hw.id;

                                        return (
                                            <div key={hw.id} className="glass-panel homework-card animate-fade-in">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <h4 className="card-title">{hw.title}</h4>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{hw.grade}</span>
                                                            {(hw.batch && hw.batch !== 'General Batch') && <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{hw.batch}</span>}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <FileText size={14} />
                                                                <span>{hw.subject}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {hw.attachmentUrl && (
                                                            <a href={hw.attachmentUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '8px', borderRadius: '8px' }} title="View Resource">
                                                                <Paperclip size={18} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px', flex: isExpanded ? '0 0 auto' : '1', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: isExpanded ? 'none' : '2', overflow: 'hidden' }}>
                                                    {hw.description}
                                                </p>

                                                {/* Submission Progress Bar */}
                                                <div className="progress-container">
                                                    <div className="progress-stats">
                                                        <span>Submissions</span>
                                                        <span>{submittedCount} / {totalStudents.length}</span>
                                                    </div>
                                                    <div className="progress-bar">
                                                        <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
                                                    </div>
                                                    <div className="progress-stats" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                                                        <div className="stat-group">
                                                            <div className="stat-item">
                                                                <div className="stat-dot" style={{ background: 'var(--success)' }}></div>
                                                                <span>{checkedCount} Verified</span>
                                                            </div>
                                                            <div className="stat-item">
                                                                <div className="stat-dot" style={{ background: 'var(--warning)' }}></div>
                                                                <span>{submittedCount - checkedCount} Pending</span>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            className="btn btn-ghost" 
                                                            style={{ padding: '4px 12px', fontSize: '0.75rem', height: 'auto', border: 'none', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-light)' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedHomework(isExpanded ? null : hw.id);
                                                            }}
                                                        >
                                                            {isExpanded ? <><ChevronUp size={14} /> Close</> : <><ChevronDown size={14} /> Manage</>}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Student List */}
                                                {isExpanded && (
                                                    <div className="student-list-container">
                                                        <div className="student-search-wrapper">
                                                            <div className="search-icon-inner"><Search size={14} /></div>
                                                            <input 
                                                                className="student-search-input" 
                                                                placeholder="Search students..." 
                                                                value={studentSearch}
                                                                onChange={(e) => setStudentSearch(e.target.value)}
                                                            />
                                                            <div 
                                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                                                                onClick={() => {
                                                                    const filtered = totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()));
                                                                    const allSelectedInFiltered = filtered.length > 0 && filtered.every(s => selectedStudents.includes(s.id));
                                                                    if (allSelectedInFiltered) {
                                                                        setSelectedStudents(prev => prev.filter(id => !filtered.find(f => f.id === id)));
                                                                    } else {
                                                                        setSelectedStudents(prev => [...new Set([...prev, ...filtered.map(f => f.id)])]);
                                                                    }
                                                                }}
                                                            >
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                                    {(() => {
                                                                        const filtered = totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()));
                                                                        return filtered.length > 0 && filtered.every(s => selectedStudents.includes(s.id)) ? 'Unselect All' : 'Select All';
                                                                    })()}
                                                                </span>
                                                                <div 
                                                                    className={`custom-checkbox ${(() => {
                                                                        const filtered = totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()));
                                                                        return filtered.length > 0 && filtered.every(s => selectedStudents.includes(s.id)) ? 'checked' : '';
                                                                    })()}`}
                                                                    title="Select All"
                                                                >
                                                                    {(() => {
                                                                        const filtered = totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()));
                                                                        return filtered.length > 0 && filtered.every(s => selectedStudents.includes(s.id)) && <Check size={12} color="#fff" />;
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {totalStudents.length === 0 ?
                                                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                                    No students in this class/batch.
                                                                </div>
                                                            : (() => {
                                                                const filtered = totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()));
                                                                if (filtered.length === 0) {
                                                                    return (
                                                                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                            No students match "{studentSearch}"
                                                                        </div>
                                                                    );
                                                                }
                                                                return filtered.slice((studentListPage - 1) * STUDENT_PAGE_SIZE, studentListPage * STUDENT_PAGE_SIZE).map(student => {
                                                                    const sub = submissions[hw.id]?.[student.id];
                                                                    const isChecked = sub?.status === 'CHECKED';
                                                                    const isIncomplete = sub?.status === 'INCOMPLETE';
                                                                    const isSelected = selectedStudents.includes(student.id);

                                                                    return (
                                                                        <div key={student.id} className="student-row">
                                                                            <div 
                                                                                className={`custom-checkbox ${isSelected ? 'checked' : ''}`}
                                                                                onClick={() => {
                                                                                    setSelectedStudents(prev => 
                                                                                        prev.includes(student.id) 
                                                                                        ? prev.filter(id => id !== student.id)
                                                                                        : [...prev, student.id]
                                                                                    );
                                                                                }}
                                                                            >
                                                                                {isSelected && <Check size={12} color="#fff" />}
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                                                                <div style={{
                                                                                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                                                                    background: sub ? (isChecked ? 'rgba(16, 185, 129, 0.2)' : (isIncomplete ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)')) : 'rgba(255,255,255,0.05)',
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                                }}>
                                                                                    {sub ? (isChecked ? <CheckCircle2 size={16} color="var(--success)" /> : (isIncomplete ? <AlertCircle size={16} color="var(--danger)" /> : <Clock size={16} color="var(--warning)" />)) : <User size={16} color="var(--text-muted)" />}
                                                                                </div>
                                                                                <span style={{ fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                                {sub?.fileUrl && (
                                                                                    <a href={sub.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'flex' }} title="View Submission">
                                                                                        <Search size={18} />
                                                                                    </a>
                                                                                )}
                                                                                <button
                                                                                    className="btn btn-ghost"
                                                                                    style={{
                                                                                        fontSize: '0.75rem', padding: '6px 12px', minWidth: '85px', height: 'auto',
                                                                                        borderColor: isChecked ? 'rgba(16, 185, 129, 0.3)' : (isIncomplete ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'),
                                                                                        color: isChecked ? 'var(--success)' : (isIncomplete ? 'var(--danger)' : 'var(--text-primary)'),
                                                                                        background: isChecked ? 'rgba(16, 185, 129, 0.05)' : (isIncomplete ? 'rgba(239, 68, 68, 0.05)' : 'transparent')
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        setReviewingSubmission({
                                                                                            homeworkId: hw.id,
                                                                                            studentId: student.id,
                                                                                            studentName: student.name,
                                                                                            ...sub
                                                                                        });
                                                                                        setReviewStatus(sub?.status || 'CHECKED');
                                                                                        setTeacherComment(sub?.teacherComment || "");
                                                                                    }}
                                                                                >
                                                                                    {isChecked ? "Verified" : (isIncomplete ? "Redo" : (sub ? "Review" : "Mark"))}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        {totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase())).length > STUDENT_PAGE_SIZE && (
                                                            <div style={{ marginTop: '16px', padding: '12px', borderTop: '1px solid var(--border)' }}>
                                                                <Pagination 
                                                                    currentPage={studentListPage}
                                                                    totalItems={totalStudents.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase())).length}
                                                                    pageSize={STUDENT_PAGE_SIZE}
                                                                    onPageChange={setStudentListPage}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                {filteredHomework.length > HW_PAGE_SIZE && (
                                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                                        <Pagination 
                                            currentPage={hwPage}
                                            totalItems={filteredHomework.length}
                                            pageSize={HW_PAGE_SIZE}
                                            onPageChange={setHwPage}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        </div>
                    </div>
                )}
            </div>

            {/* REVIEW MODAL */}
            {reviewingSubmission && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-panel animate-scale-up" style={{ width: '100%', maxWidth: '550px', padding: '32px', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Submission Review</h3>
                            <button className="btn btn-ghost" onClick={() => setReviewingSubmission(null)} style={{ padding: '8px' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
                                {reviewingSubmission.studentName?.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{reviewingSubmission.studentName}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {reviewingSubmission.submittedAt ? `Submitted: ${new Date(reviewingSubmission.submittedAt.seconds * 1000).toLocaleDateString()}` : "No submission record"}
                                </div>
                            </div>
                        </div>

                        {reviewingSubmission.fileUrl && (
                            <div style={{ marginBottom: '24px' }}>
                                <label className="label">Student's Work</label>
                                <a href={reviewingSubmission.fileUrl} target="_blank" rel="noreferrer" className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', textDecoration: 'none', color: 'inherit', borderRadius: '10px', transition: 'all 0.2s' }}>
                                    <span style={{ fontSize: '1.5rem' }}>📄</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--accent)' }}>View Attachment</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opens in new tab</div>
                                    </div>
                                    <span>→</span>
                                </a>
                            </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label className="label">Evaluation Status</label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    className={`btn ${reviewStatus === 'CHECKED' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setReviewStatus('CHECKED')}
                                    style={{ flex: 1, height: '45px', border: reviewStatus === 'CHECKED' ? 'none' : '1px solid var(--success-border)', color: reviewStatus === 'CHECKED' ? '#fff' : 'var(--success)' }}
                                >
                                    ✅ Verified
                                </button>
                                <button
                                    className={`btn ${reviewStatus === 'INCOMPLETE' ? 'btn-danger' : 'btn-ghost'}`}
                                    onClick={() => setReviewStatus('INCOMPLETE')}
                                    style={{ flex: 1, height: '45px', border: reviewStatus === 'INCOMPLETE' ? 'none' : '1px solid var(--danger-border)', color: reviewStatus === 'INCOMPLETE' ? '#fff' : 'var(--danger)' }}
                                >
                                    ❌ Incomplete
                                </button>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label className="label">Teacher's Feedback</label>
                            <textarea
                                rows={3}
                                value={teacherComment}
                                onChange={e => setTeacherComment(e.target.value)}
                                placeholder="Add a personal note or guidance for the student..."
                                style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '32px' }}>
                            <label className="label">Attach Correction/Solution (Optional)</label>
                            <input type="file" onChange={e => setTeacherFile(e.target.files[0])} style={{ fontSize: '0.9rem' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-ghost" onClick={() => setReviewingSubmission(null)} style={{ flex: 1 }}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleReviewSave} disabled={loading} style={{ flex: 2 }}>
                                {loading ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : "💾 Save Evaluation"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BULK ACTION BAR */}
            {selectedStudents.length > 0 && (
                <div className="bulk-action-bar">
                    <div className="bulk-count">
                        {selectedStudents.length} Students Selected
                    </div>
                    <div className="bulk-btns">
                        <button 
                            className="btn btn-primary" 
                            style={{ height: '40px', padding: '0 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={() => setBulkConfirm({ isOpen: true, status: 'CHECKED' })}
                            disabled={loading}
                        >
                            {loading ? <span className="loader" style={{ width: '14px', height: '14px' }}></span> : <CheckCircle2 size={16} />}
                            Mark Verified
                        </button>
                        <button 
                            className="btn btn-danger" 
                            style={{ height: '40px', padding: '0 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={() => setBulkConfirm({ isOpen: true, status: 'INCOMPLETE' })}
                            disabled={loading}
                        >
                            {loading ? <span className="loader" style={{ width: '14px', height: '14px' }}></span> : <AlertCircle size={16} />}
                            Mark Redo
                        </button>
                        <button 
                            className="btn btn-ghost" 
                            style={{ height: '40px', padding: '0 20px', fontSize: '0.85rem' }}
                            onClick={() => setSelectedStudents([])}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* BULK CONFIRMATION MODAL */}
            <ConfirmModal 
                isOpen={bulkConfirm.isOpen}
                title="Confirm Bulk Action"
                message={`Are you sure you want to mark ${selectedStudents.length} students as ${bulkConfirm.status === 'CHECKED' ? 'Verified' : 'Incomplete'}?`}
                confirmText={bulkConfirm.status === 'CHECKED' ? "Yes, Verify All" : "Yes, Mark Redo"}
                onConfirm={() => {
                    handleBulkReview(bulkConfirm.status);
                    setBulkConfirm({ isOpen: false, status: null });
                }}
                onCancel={() => setBulkConfirm({ isOpen: false, status: null })}
                isDangerous={bulkConfirm.status === 'INCOMPLETE'}
            />
        </div>
    );
};

export default HomeworkManager;
