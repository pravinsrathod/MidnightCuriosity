import React, { useState, useEffect } from "react";
import { db, storage, auth } from "./firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, orderBy, limit, arrayUnion, arrayRemove, setDoc, getDoc } from "firebase/firestore";
import { sendPushNotification } from "./notificationService";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, signOut } from "firebase/auth";
import AdminLogin from "./AdminLogin";
import ConfirmModal from "./ConfirmModal";
import AttendanceManager from "./AttendanceManager"; // Import Attendance Component
import HomeworkManager from "./HomeworkManager"; // Import Homework Component
import FeesManager from "./FeesManager"; // Import Fees Component

import { generateLessonContent, getApiKey, setApiKey, generateDoubtAnswer, generateExamFromPdf } from "./aiService";
import { seedDemoData } from "./demoSeeder";

import { wipeAllData } from './wiper';

function App() {
  useEffect(() => {
    // TRIGGER WIPE (Manual Trigger via UI is safer but for fast reset:)
    // wipeAllData(); 
    // Commented out by default to prevent loops. Uncomment to run once.
    window.wipeData = wipeAllData; // Expose to console for manual run
  }, []); const [activeTab, setActiveTab] = useState('lectures'); // 'lectures', 'settings', 'doubts'
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Admin Tenant State
  const [adminTenantId, setAdminTenantId] = useState(null);
  const [tenantData, setTenantData] = useState({ name: "", code: "" });
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [tenantEditForm, setTenantEditForm] = useState({ name: "", code: "" });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allTenants, setAllTenants] = useState([]);
  const [pendingUserStatus, setPendingUserStatus] = useState(null); // 'PENDING_APPROVAL', 'APPROVED', etc.

  // Custom Modal State (Promise-based)
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: 'alert',
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    isDangerous: false,
    resolve: null
  });

  const showModal = (options) => {
    console.log("showModal opening with options:", options);
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: options.type || 'alert',
        title: options.title || (options.type === 'alert' ? 'Message' : 'Confirm'),
        message: options.message || '',
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        isDangerous: options.isDangerous || false,
        resolve: resolve // Store resolve function
      });
    });
  };

  const handleModalResult = (result) => {
    console.log("handleModalResult called with:", result);
    // Capture resolve before state update might affect checks (though closure captures it)
    const resolveFunc = modalState.resolve;
    setModalState(prev => ({ ...prev, isOpen: false }));
    if (resolveFunc) {
      resolveFunc(result);
    } else {
      console.error("No resolve function found in modalState!");
    }
  };

  // Helper wrappers for native replacements
  const customAlert = (message, title = "Alert") => showModal({ type: 'alert', title, message });

  const customConfirm = async (message, title = "Confirm", isDangerous = false) => {
    // Returns true/false. Confirmed = true (or result from prompt), Cancel = undefined/false
    const res = await showModal({ type: 'confirm', title, message, isDangerous });
    return !!res;
  };

  const customPrompt = (message, title = "Input Required") => showModal({ type: 'prompt', title, message });


  // Authenticate Admin Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // 1. IMMEDIATE SUPER ADMIN CHECK (Based on Email)
          if (currentUser.email === 'prowintechs@gmail.com') {
            setIsSuperAdmin(true);
            setPendingUserStatus('APPROVED'); // Super admin is always approved
          }

          // 2. FETCH USER PROFILE
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setAdminTenantId(userData.tenantId);
            setPendingUserStatus(userData.status || 'APPROVED');
          }
        } catch (e) {
          console.error("Failed to fetch user profile", e);
        }
      } else {
        setAdminTenantId(null);
        setTenantData({ name: "", code: "" });
        setIsSuperAdmin(false);
        setPendingUserStatus(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Tenant Profile Data
  useEffect(() => {
    if (!adminTenantId || adminTenantId === 'default') return;
    const unsub = onSnapshot(doc(db, "tenants", adminTenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTenantData({ name: data.name, code: data.code, logoUrl: data.logoUrl });
        setTenantEditForm({ name: data.name, code: data.code, logoUrl: data.logoUrl });
      }
    });
    return () => unsub();
  }, [adminTenantId]);

  // Super Admin: Fetch all tenants
  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = onSnapshot(collection(db, "tenants"), (snapshot) => {
      const tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllTenants(tenants);
    });
    return () => unsub();
  }, [isSuperAdmin]);

  // Config States
  const [grades, setGrades] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);


  const [selectedGradeFilter, setSelectedGradeFilter] = useState("All");
  // Doubts State
  const [doubts, setDoubts] = useState([]);
  const [replyText, setReplyText] = useState({}); // Map of doubtId -> text

  // Students State
  const [students, setStudents] = useState([]);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentFormData, setStudentFormData] = useState({ name: "", grade: "" });
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState({ name: "", phoneNumber: "", grade: "", password: "" });

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [apiKey, setApiKeyLocal] = useState(getApiKey() || "");
  const [studentSubTab, setStudentSubTab] = useState('students');


  // Form States
  const [formData, setFormData] = useState({
    title: "",
    grade: "",
    subject: "",
    topic: "",
    overview: "",
    notes: ""
  });

  const [quizzes, setQuizzes] = useState([
    { question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 25 }
  ]);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recentUploads, setRecentUploads] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState('');

  // Dashboard Stats
  const [stats, setStats] = useState({ lectures: 0, doubts: 0, pendingDoubts: 0, pendingStudents: 0, deletionRequests: 0 });

  // Polls State
  const [polls, setPolls] = useState([]);
  const [pollFormData, setPollFormData] = useState({
    question: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    grade: "All"
  });

  useEffect(() => {
    if (!adminTenantId) return;
    // Listen for Polls
    const q = query(
      collection(db, "polls"),
      where("tenantId", "==", adminTenantId)
    );
    const unsubPolls = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by createdAt desc in memory
      const sorted = docs.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
      setPolls(sorted);
    });
    return () => unsubPolls();
  }, [adminTenantId]);

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (!pollFormData.question || !pollFormData.optionA || !pollFormData.optionB) {
      customAlert("Question and at least 2 options are required.");
      return;
    }

    setLoading(true);
    try {
      const options = [
        { text: pollFormData.optionA, votes: 0 },
        { text: pollFormData.optionB, votes: 0 }
      ];
      if (pollFormData.optionC) options.push({ text: pollFormData.optionC, votes: 0 });
      if (pollFormData.optionD) options.push({ text: pollFormData.optionD, votes: 0 });

      await addDoc(collection(db, "polls"), {
        question: pollFormData.question,
        options: options,
        active: true,
        tenantId: adminTenantId, // Multi-tenancy
        grade: pollFormData.grade || "All",
        createdAt: serverTimestamp(),
        totalVotes: 0
      });

      // --- Push Notifications ---
      try {
        const studentQuery = pollFormData.grade === "All"
          ? query(collection(db, "users"), where("tenantId", "==", adminTenantId))
          : query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("grade", "==", pollFormData.grade));

        const snaps = await getDocs(studentQuery);
        const tokens = snaps.docs.map(d => d.data().pushToken).filter(Boolean);

        if (tokens.length > 0) {
          await sendPushNotification(tokens, "📊 New Live Poll!", pollFormData.question, { screen: 'poll' });
        }
      } catch (e) { console.warn("Poll notification failed", e); }

      setPollFormData({ question: "", optionA: "", optionB: "", optionC: "", optionD: "", grade: "All" });
      customAlert("Poll Started Live! 🚀");
    } catch (e) {
      console.error(e);
      customAlert("Error creating poll");
    } finally {
      setLoading(false);
    }
  };

  const togglePollStatus = async (poll) => {
    try {
      await updateDoc(doc(db, "polls", poll.id), {
        active: !poll.active
      });
    } catch (e) {
      console.error("Error updating poll", e);
    }
  };

  const deletePoll = async (id) => {
    if (await customConfirm("Delete this poll?", "Delete Poll", true)) {
      await deleteDoc(doc(db, "polls", id));
    }
  };

  // --- Exams Logic ---
  const [exams, setExams] = useState([]);
  const [examForm, setExamForm] = useState({
    title: "",
    date: "",
    duration: 60,
    questions: [],
    status: "scheduled",
    grade: "",
    subject: "",
    topic: ""
  });
  const [examFile, setExamFile] = useState(null);
  const [isProcessingExam, setIsProcessingExam] = useState(false);

  useEffect(() => {
    if (!adminTenantId) return;
    const q = query(
      collection(db, "exams"),
      where("tenantId", "==", adminTenantId)
    );
    const unsub = onSnapshot(q, (snap) => {
      console.log("Exams snapshot update:", snap.size, "docs");
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Exams snapshot error:", error);
    });
    return () => unsub();
  }, [adminTenantId]);

  const handleExamFileChange = (e) => {
    if (e.target.files[0]) {
      if (e.target.files[0].type !== 'application/pdf') {
        customAlert("Please upload a valid PDF file.");
        e.target.value = "";
        return;
      }
      setExamFile(e.target.files[0]);
    }
  };

  const processExamPdf = async () => {
    if (!examFile) return customAlert("Please select a PDF file first.");

    if (!apiKey) {
      customAlert("✨ API Key Required! \n\nTo extracting questions from your custom PDF, you need a Gemini API Key. \n\nPlease enter it in the next prompt (or Mock Mode will remain active).");
      saveApiKey();
      return;
    }

    setIsProcessingExam(true);
    try {
      const extractedQuestions = await generateExamFromPdf(examFile, apiKey);
      setExamForm(prev => ({ ...prev, questions: extractedQuestions }));
      customAlert(`Success! Generated ${extractedQuestions.length} questions.`);
    } catch (e) {
      console.error(e);
      customAlert("Failed to process PDF: " + e.message);
    } finally {
      setIsProcessingExam(false);
    }
  };

  const saveExam = async () => {
    const examDate = new Date(examForm.date);
    const now = new Date();
    if (examDate < now) {
      return customAlert("Exam date cannot be in the past.");
    }

    if (!examForm.title || !examForm.date || !examForm.grade || examForm.questions.length === 0) {
      return customAlert("Please fill Title, Date, Grade and ensure questions are generated.");
    }

    try {
      setLoading(true);
      await addDoc(collection(db, "exams"), {
        ...examForm,
        tenantId: adminTenantId, // Multi-tenancy
        createdAt: serverTimestamp()
      });

      // --- Push Notifications ---
      try {
        const studentQuery = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("grade", "==", examForm.grade));
        const snaps = await getDocs(studentQuery);
        const tokens = snaps.docs.map(d => d.data().pushToken).filter(Boolean);

        if (tokens.length > 0) {
          await sendPushNotification(tokens, "✍️ New Exam Scheduled", `${examForm.title} for ${examForm.grade} on ${examForm.date}.`, { screen: 'exam' });
        }
      } catch (e) { console.warn("Exam notification failed", e); }

      setExamForm({ title: "", date: "", duration: 60, questions: [], status: "scheduled", grade: grades[0] || "", subject: subjects[0] || "", topic: topics[0] || "" });
      setExamFile(null);
      customAlert("Exam scheduled successfully!");
    } catch (e) {
      console.error(e);
      customAlert("Error saving exam.");
    } finally {
      setLoading(false);
    }
  };

  const deleteExam = async (id) => {
    if (await customConfirm("Delete this exam?", "Delete Exam", true)) {
      await deleteDoc(doc(db, "exams", id));
    }
  };

  useEffect(() => {
    if (!adminTenantId) return;
    // Quick listeners for dashboard stats
    const qLec = query(collection(db, "lectures"), where("tenantId", "==", adminTenantId));
    const unsubLec = onSnapshot(qLec, snap => {
      setStats(prev => ({ ...prev, lectures: snap.size }));
    });

    const qDoubts = query(collection(db, "doubts"), where("tenantId", "==", adminTenantId));
    const unsubDoubts = onSnapshot(qDoubts, snap => {
      setStats(prev => ({
        ...prev,
        doubts: snap.size,
        pendingDoubts: snap.docs.filter(d => !d.data().solved).length
      }));
    });

    const qPendingStudents = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("status", "==", "PENDING"));
    const unsubStudents = onSnapshot(qPendingStudents, snap => {
      setStats(prev => ({ ...prev, pendingStudents: snap.size }));
    });

    const qDeletionRequests = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("status", "==", "DELETION_PENDING"));
    const unsubDeletion = onSnapshot(qDeletionRequests, snap => {
      setStats(prev => ({ ...prev, deletionRequests: snap.size }));
    });

    return () => {
      unsubLec();
      unsubDoubts();
      unsubStudents();
      unsubDeletion();
    };
  }, [adminTenantId]);

  const saveApiKey = async () => {
    const key = await customPrompt("Enter Gemini API Key (Leave empty for Mock Mode):", apiKey);
    if (key !== false) { // customPrompt returns false on cancel
      setApiKey(key);
      setApiKeyLocal(key);
    }
  };

  const handleAiGenerate = async () => {
    if (!formData.title || !formData.subject || !formData.grade || !formData.topic) {
      customAlert("Please fill in Title, Grade, Subject and Topic first.");
      return;
    }
    setAiLoading(true);
    try {
      // Pass the file object (video) if available
      const content = await generateLessonContent(formData.topic, formData.subject, formData.grade, file);

      setFormData(prev => ({
        ...prev,
        overview: content.overview || "",
        notes: content.notes || ""
      }));

      if (content.quizzes && content.quizzes.length > 0) {
        setQuizzes(content.quizzes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  // ---- CONFIG MANAGEMENT ----
  useEffect(() => {
    if (!adminTenantId) return;
    fetchConfig();
    const unsubscribeUploads = fetchRecentUploads();
    const unsubscribeDoubts = fetchDoubts();
    const unsubscribeStudents = fetchStudents();
    return () => {
      unsubscribeUploads();
      unsubscribeDoubts();
      unsubscribeStudents();
    };
  }, [adminTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDoubts = () => {
    if (!adminTenantId) return () => { };
    const q = query(
      collection(db, "doubts"),
      where("tenantId", "==", adminTenantId)
    );
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by createdAt desc in memory
      const sorted = docs.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
      setDoubts(sorted);
    });
  };

  const fetchRecentUploads = () => {
    if (!adminTenantId) return () => { };
    const q = query(
      collection(db, "lectures"),
      where("tenantId", "==", adminTenantId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by createdAt desc in memory and limit to 5
      const sorted = docs.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
      }).slice(0, 5);
      setRecentUploads(sorted);
    });
    return unsubscribe;
  }

  const fetchStudents = () => {
    if (!adminTenantId) return () => { };
    // Fetch students belonging to this tenant
    const q2 = query(collection(db, "users"), where("tenantId", "==", adminTenantId));
    return onSnapshot(q2, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(docs);
    });
  };

  const fetchConfig = async () => {
    try {
      const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setGrades(data.grades || []);
        setSubjects(data.subjects || []);
        setTopics(data.topics || []);
        // Set defaults if form empty
        if (!formData.grade && data.grades?.length > 0) setFormData(prev => ({ ...prev, grade: data.grades[0] }));
        if (!formData.subject && data.subjects?.length > 0) setFormData(prev => ({ ...prev, subject: data.subjects[0] }));
        if (!formData.topic && data.topics?.length > 0) setFormData(prev => ({ ...prev, topic: data.topics[0] }));
      } else {
        // Initialize Defaults if first run
        const defaults = {
          grades: Array.from({ length: 12 }, (_, i) => `Grade ${i + 1} `),
          subjects: ["Maths", "Physics", "Chemistry", "Biology", "English", "History"],
          topics: ["Algebra", "Geometry", "Calculus"]
        };
        await setDoc(docRef, defaults);
        setGrades(defaults.grades);
        setSubjects(defaults.subjects);
        setTopics(defaults.topics);
        setFormData(prev => ({ ...prev, grade: defaults.grades[0], subject: defaults.subjects[0], topic: defaults.topics[0] }));
      }
    } catch (e) {
      console.error("Error fetching config:", e);
    } finally {
      // Config loaded
    }
  };

  const addItem = async (type, value) => {
    if (!value.trim() || !adminTenantId) return;
    const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
    await updateDoc(docRef, {
      [type]: arrayUnion(value.trim())
    });
    // Refresh local state (or rely on onSnapshot if we hooked it up, but simple fetch/update for now)
    fetchConfig();
  };

  const removeItem = async (type, value) => {
    if (!await customConfirm(`Delete ${value}?`) || !adminTenantId) return;
    const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
    await updateDoc(docRef, {
      [type]: arrayRemove(value)
    });
    fetchConfig();
  };

  // ---- DOUBTS MANAGEMENT ----
  const postAdminReply = async (doubtId) => {
    const text = replyText[doubtId];
    if (!text || !text.trim()) return;

    const reply = {
      id: Date.now().toString(),
      userId: "admin",
      userName: "Admin (Teacher)",
      text: text,
      isCorrect: true, // Admin replies are trusted
      createdAt: new Date().toISOString()
    };

    const doubtRef = doc(db, "doubts", doubtId);
    await updateDoc(doubtRef, {
      replies: arrayUnion(reply),
      solved: true
    });

    setReplyText({ ...replyText, [doubtId]: "" });
    customAlert("Reply posted and doubt marked as Solved!");
  };

  const handleApproveStudent = async (id) => {
    try {
      await updateDoc(doc(db, "users", id), { status: 'ACTIVE' });
      customAlert("Student Approved!");
    } catch (e) {
      console.error(e);
      customAlert("Failed to approve student");
    }
  };

  const handleRejectStudent = async (id) => {
    if (!await customConfirm("Reject this student request?")) return;
    try {
      await updateDoc(doc(db, "users", id), { status: 'REJECTED' });
    } catch (e) {
      console.error(e);
      customAlert("Failed to reject student");
    }
  };

  const handleApproveDeletion = async (id) => {
    if (!await customConfirm("PERMANENTLY DELETE this account and all associated data? This action is absolute and irreversible.", "Finalize Deletion", true)) return;
    try {
      setLoading(true);
      // Delete the core user document
      await deleteDoc(doc(db, "users", id));

      // Note: Ideally, a Cloud Function/Cron should clean up associated 
      // fees, submissions, etc. to ensure orphan data is removed.

      customAlert("Account and profile data permanently removed.");
      setStats(prev => ({ ...prev, deletionRequests: Math.max(0, prev.deletionRequests - 1) }));
    } catch (e) {
      console.error(e);
      customAlert("Failed to finalize deletion: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectDeletion = async (id) => {
    if (!await customConfirm("Restore this account and reject the deletion request?")) return;
    try {
      await updateDoc(doc(db, "users", id), {
        status: 'ACTIVE',
        deletionRequested: false
      });
      customAlert("Account restored.");
    } catch (e) {
      console.error(e);
      customAlert("Failed to restore account");
    }
  };





  const handleAiSolve = async (doubtId, questionText) => {
    setLoading(true); // Re-using global loading state, or could make a local one
    try {
      const answer = await generateDoubtAnswer(questionText);
      setReplyText(prev => ({ ...prev, [doubtId]: answer }));
    } catch (e) {
      console.error(e);
      customAlert("AI Failed to solve doubt.");
    } finally {
      setLoading(false);
    }
  };

  // ---- STUDENT MANAGEMENT ACTIONS ----
  const handleDeleteStudent = async (id) => {
    console.log("handleDeleteStudent called for ID:", id);
    const confirmed = await customConfirm("Are you sure you want to delete this student? This action cannot be undone.", "Delete Student", true);
    console.log("Delete Student confirmed:", confirmed);

    if (confirmed) {
      try {
        await deleteDoc(doc(db, "users", id));
        customAlert("Student deleted successfully.");
      } catch (e) {
        console.error("Error deleting student:", e);
        customAlert("Failed to delete student.");
      }
    }
  };

  const handleEditStudent = (student) => {
    setEditingStudentId(student.id);
    setStudentFormData({
      name: student.name || "",
      grade: student.grade || ""
    });
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setStudentFormData({ name: "", grade: "" });
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentForm.name || !newStudentForm.phoneNumber || !newStudentForm.grade || !newStudentForm.password) {
      const missing = [];
      if (!newStudentForm.name) missing.push("Name");
      if (!newStudentForm.phoneNumber) missing.push("Phone");
      if (!newStudentForm.grade) missing.push("Grade");
      if (!newStudentForm.password) missing.push("Password");
      customAlert(`Please fill the following fields: ${missing.join(', ')} `);
      return;
    }

    setLoading(true);
    let secondaryApp = null;

    try {
      // Dynamically import needed modules
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import("firebase/auth");
      const { deleteApp } = await import("firebase/app");

      const firebaseConfig = auth.app.options;

      // Initialize a secondary app instance
      const appName = "SecondaryApp-" + Date.now(); // Using Date.now() in JS, but here it's string literal
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);

      const cleanPhone = newStudentForm.phoneNumber.replace(/[^0-9]/g, '');
      const virtualEmail = `${cleanPhone}@midnightcuriosity.com`;

      let newUid;

      try {
        // Create the user in Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, virtualEmail, newStudentForm.password);
        newUid = userCredential.user.uid;
      } catch (createError) {
        if (createError.code === 'auth/email-already-in-use') {
          // ATTEMPT RECOVERY: Try to sign in with provided password
          try {
            const userCredential = await signInWithEmailAndPassword(secondaryAuth, virtualEmail, newStudentForm.password);
            newUid = userCredential.user.uid;
            console.log("Recovered UID from existing auth:", newUid);
            customAlert("Note: Student account existed (Auth). Restoring Profile...");
          } catch (signinError) {
            throw new Error("Student exists, but password mismatch. Cannot restore. Please contact support or reset password.");
          }
        } else {
          throw createError;
        }
      }

      // Use the MAIN app's Firestore (db) to save the profile
      await setDoc(doc(db, "users", newUid), {
        name: newStudentForm.name,
        phoneNumber: cleanPhone,
        grade: newStudentForm.grade,
        tenantId: adminTenantId,
        instituteCode: tenantData.code || adminTenantId,
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        createdBy: 'ADMIN'
      });

      await signOut(secondaryAuth);
      try { await deleteApp(secondaryApp); secondaryApp = null; } catch (e) { }

      setNewStudentForm({ name: "", phoneNumber: "", grade: "", password: "" });
      setShowAddStudentModal(false);
      customAlert(`Student '${newStudentForm.name}' added successfully!
Phone: ${newStudentForm.phoneNumber}
Password: [Hidden]`);

    } catch (error) {
      console.error("Error adding student:", error);
      let msg = error.message;
      if (error.code === 'auth/email-already-in-use') msg = "A student with this phone number already exists.";
      customAlert("Failed to add student: " + msg);
    } finally {
      if (secondaryApp) {
        const { deleteApp } = await import("firebase/app");
        try { await deleteApp(secondaryApp); } catch (e) { }
      }
      setLoading(false);
    }
  };


  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!studentFormData.name || !studentFormData.grade) {
      customAlert("Please fill in Name and Grade.");
      return;
    }

    try {
      const updateData = {
        name: studentFormData.name,
        grade: studentFormData.grade
      };

      // Note: Updating password in Auth requires Admin SDK or re-auth.
      // For this prototype, we'll store it in Firestore strictly for reference if provided,
      // or we can implement a Cloud Function later.
      if (studentFormData.password && studentFormData.password.trim() !== "") {
        updateData.password = studentFormData.password; // INSECURE: Demo purpuse only
        customAlert("Note: Password saved to profile but Auth credential not updated in this demo.");
      }

      await updateDoc(doc(db, "users", editingStudentId), updateData);
      customAlert("Student updated successfully!");
      cancelEditStudent();
    } catch (e) {
      console.error("Error updating student:", e);
      customAlert("Failed to update student.");
    }
  };


  // ---- DANGEROUS DATA ACTIONS ----
  const handleClearData = async (collectionName) => {
    const confirmation = await customPrompt(`Type "DELETE" to permanently delete ALL ${collectionName}?`);
    if (confirmation !== "DELETE") return;

    try {
      const q = query(collection(db, collectionName), where("tenantId", "==", adminTenantId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, collectionName, d.id)));
      await Promise.all(deletePromises);
      customAlert(`All ${collectionName} for your institute deleted successfully.`);
    } catch (e) {
      console.error("Error clearing data:", e);
      customAlert("Failed to delete data. Check console.");
    }
  };

  // ---- LECTURE MANAGEMENT ----
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'video/mp4' && selectedFile.type !== 'video/webm' && !selectedFile.name.endsWith('.mp4')) {
        customAlert("Invalid file format. Please upload an MP4 video.");
        e.target.value = ""; // Reset input
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleLogoChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.type.startsWith('image/')) {
        customAlert("Invalid format. Please upload an image (PNG, JPG, etc).");
        e.target.value = "";
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDelete = async (id) => {
    if (await customConfirm("Are you sure you want to delete this lecture?", "Delete Lecture", true)) {
      await deleteDoc(doc(db, "lectures", id));
    }
  };

  const handleEdit = (doc) => {
    setActiveTab('lectures');
    setEditingId(doc.id);
    setFormData({
      title: doc.title,
      grade: doc.grade,
      subject: doc.subject,
      topic: doc.topic,
      overview: doc.overview || "",
      notes: doc.notes || ""
    });
    setExistingVideoUrl(doc.videoUrl);

    if (doc.quizzes && Array.isArray(doc.quizzes)) {
      setQuizzes(doc.quizzes);
    } else if (doc.quiz) {
      // Backward compatibility
      setQuizzes([{
        question: doc.quiz.question,
        options: doc.quiz.options,
        correctIndex: doc.quiz.correctIndex,
        triggerPercentage: doc.quiz.triggerPercentage || 50
      }]);
    } else {
      setQuizzes([{ question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }]);
    }
    window.scrollTo(0, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ title: "", topic: topics[0] || "", grade: grades[0] || "Grade 1", subject: subjects[0] || "Maths", overview: "", notes: "" });
    setExistingVideoUrl("");
    setQuizzes([{ question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }]);
  };

  const finalizeTenantUpdate = async (formData, newLogoUrl = null) => {
    setLoading(true);

    try {
      const isCodeChanged = formData.code !== tenantData.code;
      const dataToUpdate = {
        name: formData.name,
        updatedAt: serverTimestamp()
      };

      if (isCodeChanged) {
        dataToUpdate.code = formData.code;
      }

      if (newLogoUrl) {
        dataToUpdate.logoUrl = newLogoUrl;
      }

      await updateDoc(doc(db, "tenants", adminTenantId), dataToUpdate);

      setTenantData(prev => ({
        ...prev,
        ...dataToUpdate,
        // Since serverTimestamp won't be immediately available, use Date
        updatedAt: new Date()
      }));

      customAlert(`Institute Profile Updated Successfully! ${isCodeChanged ? `\nNew Code: '${formData.code}'` : ''} `);
      setIsEditingTenant(false);
    } catch (e) {
      console.error(e);
      customAlert("Error updating profile: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenantInfo = async (e) => {
    e.preventDefault();
    if (!tenantEditForm.name || !tenantEditForm.code) return customAlert("Name and Code are required.");

    setLoading(true);
    try {
      const isCodeChanged = tenantEditForm.code !== tenantData.code;
      let newLogoUrl = null;

      // 1. DUPLICATE CHECK
      if (isCodeChanged) {
        const q = query(collection(db, "tenants"), where("code", "==", tenantEditForm.code));
        const checkSnap = await getDocs(q);

        if (!checkSnap.empty) {
          customAlert(`The code '${tenantEditForm.code}' is already taken.Please choose another.`);
          setLoading(false);
          return;
        }
      }

      // 2. LOGO UPLOAD
      if (file) {
        const storageRef = ref(storage, `logos / ${adminTenantId}/logo_${Date.now()}.png`);
        await uploadBytes(storageRef, file);
        newLogoUrl = await getDownloadURL(storageRef);
      }

      const proceed = async () => {
        await finalizeTenantUpdate(tenantEditForm, newLogoUrl);
      };

      if (isCodeChanged) {
        setLoading(false); // Pause loading to show modal

        if (await customConfirm(`Are you sure you want to change your Institute Code to '${tenantEditForm.code}'?\n\n• Existing students will need the new code to log in.\n• Your curriculum and content will be migrated automatically.`, "Change Institute Code?", true)) {
          await proceed();
        }
      } else {
        await proceed();
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
      customAlert("Update Failed: " + e.message);
    }
  };
  const handleApproveTenant = async (tenant) => {
    if (!await customConfirm(`Approve institute '${tenant.name}'?`)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "tenants", tenant.id), { status: 'APPROVED', isActive: true });
      if (tenant.adminUid) await updateDoc(doc(db, "users", tenant.adminUid), { status: 'APPROVED' });
      customAlert(`Institute '${tenant.name}' approved successfully!`);
    } catch (e) {
      console.error(e);
      customAlert("Failed to approve institute.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectTenant = async (tenant) => {
    if (!await customConfirm(`Reject institute '${tenant.name}'?`, "Confirm Rejection", true)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "tenants", tenant.id), { status: 'REJECTED', isActive: false });
      if (tenant.adminUid) await updateDoc(doc(db, "users", tenant.adminUid), { status: 'REJECTED' });
      customAlert(`Institute '${tenant.name}' rejected.`);
    } catch (e) {
      console.error(e);
      customAlert("Failed to reject institute.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.grade || !formData.subject || !formData.topic) {
      customAlert("Please filling all fields.");
      return;
    }

    setLoading(true);
    try {
      let finalVideoUrl = existingVideoUrl;

      if (file) {
        const storageRef = ref(storage, `lectures/${formData.grade}/${formData.subject}/${file.name}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        finalVideoUrl = await getDownloadURL(storageRef);
      } else if (!editingId && !file) {
        customAlert("Please select a video file.");
        setLoading(false);
        return;
      }

      const lectureData = {
        title: formData.title,
        grade: formData.grade,
        subject: formData.subject,
        topic: formData.topic,
        videoUrl: finalVideoUrl,
        overview: formData.overview,
        notes: formData.notes,
        quizzes: quizzes.filter(q => q.question.trim().length > 0), // Save all valid quizzes
        updatedAt: serverTimestamp(),
        // Multi-tenancy: Only set tenantId on CREATE or if missing
      };

      if (!editingId) {
        lectureData.createdAt = serverTimestamp();
        lectureData.tenantId = adminTenantId; // Add Tenant ID
      }

      if (editingId) {
        try {
          await updateDoc(doc(db, "lectures", editingId), lectureData);
          customAlert("Lecture updated!");
        } catch (e) {
          if (e.code === 'not-found' || e.message.includes('No document to update')) {
            console.warn("Document missing, creating new instead...");
            // Fallback: Create new
            lectureData.createdAt = serverTimestamp();
            lectureData.tenantId = adminTenantId; // Ensure tenant on fallback
            const newRef = await addDoc(collection(db, "lectures"), lectureData);
            customAlert("Original lecture was missing, created new one instead! ID: " + newRef.id);
          } else {
            throw e;
          }
        }
      } else {
        await addDoc(collection(db, "lectures"), lectureData);
        customAlert("Lecture uploaded!");
      }

      cancelEdit();
      setFile(null);
      setExistingVideoUrl("");
    } catch (error) {
      console.error("Error uploading:", error);
      customAlert("Action failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- SUB COMPONENT FOR SETTINGS ----
  const ConfigList = ({ title, items, type }) => {
    const [newItem, setNewItem] = useState("");
    return (
      <div style={{ marginBottom: '20px', background: 'var(--bg-input)', padding: '15px', borderRadius: '8px' }}>
        <h4 style={{ marginBottom: '10px' }}>{title}</h4>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={`Add new ${title}`}
            style={{ flex: 1 }}
          />
          <button onClick={() => { addItem(type, newItem); setNewItem(""); }} className="btn-primary" style={{ padding: '0 15px' }}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {items.map(item => (
            <span key={item} style={{ background: '#334155', color: '#fff', padding: '5px 10px', borderRadius: '15px', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {item}
              <button onClick={() => removeItem(type, item)} style={{
                display: 'none',
                border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold'
              }}>×</button>
              <span onClick={() => removeItem(type, item)} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#cbd5e1', marginLeft: '5px' }}>×</span>
            </span>
          ))}
        </div>
      </div>
    )
  };

  // ---- RENDERERS ----

  const Sidebar = () => (
    <aside className="sidebar">
      <div className="logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {tenantData?.logoUrl ? (
            <img src={tenantData.logoUrl} alt="Logo" style={{ width: '42px', height: '42px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)' }} />
          ) : (
            <div style={{ padding: '8px', background: 'var(--accent-gradient)', borderRadius: '12px', display: 'flex' }}>🚀</div>
          )}
          <span style={{ fontWeight: 800, fontSize: '1.5rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tenantData?.name || "EduPro"}</span>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => { setActiveTab('settings'); cancelEdit(); }}
          style={{
            padding: '10px',
            borderRadius: '12px',
            background: activeTab === 'settings' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--accent)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            border: activeTab === 'settings' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'
          }}
          title="Institute Settings"
        >
          ⚙️
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', minHeight: 0, marginBottom: '16px' }}>
        <div className="nav-group">
          <div className="nav-label">Main</div>
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); cancelEdit(); }}>
            <span>📊</span> <span>Dashboard</span>
          </button>
        </div>

        <div className="nav-group">
          <div className="nav-label">Learning Content</div>
          <button className={`nav-item ${activeTab === 'lectures' ? 'active' : ''}`} onClick={() => { setActiveTab('lectures'); cancelEdit(); }}>
            <span>📚</span> <span>Lectures</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>AI</span>
          </button>
          <button className={`nav-item ${activeTab === 'homework' ? 'active' : ''}`} onClick={() => { setActiveTab('homework'); cancelEdit(); }}>
            <span>🏠</span> <span>Homework</span>
          </button>
          <button className={`nav-item ${activeTab === 'exams' ? 'active' : ''}`} onClick={() => { setActiveTab('exams'); cancelEdit(); }}>
            <span>📝</span> <span>Exams</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>AI</span>
          </button>
        </div>

        <div className="nav-group">
          <div className="nav-label">Student Engagement</div>
          <button className={`nav-item ${activeTab === 'doubts' ? 'active' : ''}`} onClick={() => { setActiveTab('doubts'); cancelEdit(); }}>
            <span>💬</span> <span>Doubts</span>
            {stats.pendingDoubts > 0 ? (
              <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>{stats.pendingDoubts}</span>
            ) : (
              <span style={{ marginLeft: 'auto', fontSize: '10px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>AI</span>
            )}
          </button>
          <button className={`nav-item ${activeTab === 'polls' ? 'active' : ''}`} onClick={() => { setActiveTab('polls'); cancelEdit(); }}>
            <span>🗳️</span> <span>Live Polls</span>
          </button>
          <button className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => { setActiveTab('attendance'); cancelEdit(); }}>
            <span>📅</span> <span>Attendance</span>
          </button>
        </div>

        <div className="nav-group">
          <div className="nav-label">Management</div>
          <button className={`nav-item ${activeTab === 'students' ? 'active' : ''}`} onClick={() => { setActiveTab('students'); cancelEdit(); }}>
            <span>🎓</span> <span>Students</span>
            {stats.pendingStudents > 0 && <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>{stats.pendingStudents}</span>}
          </button>
          <button className={`nav-item ${activeTab === 'fees' ? 'active' : ''}`} onClick={() => { setActiveTab('fees'); cancelEdit(); }}>
            <span>💰</span> <span>Fees</span>
          </button>
          <button className={`nav-item ${activeTab === 'deletion' ? 'active' : ''}`} onClick={() => { setActiveTab('deletion'); cancelEdit(); }}>
            <span>⚠️</span> <span>Deletion</span>
            {stats.deletionRequests > 0 && <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>{stats.deletionRequests}</span>}
          </button>
          {isSuperAdmin && (
            <button className={`nav-item ${activeTab === 'superadmin' ? 'active' : ''}`} onClick={() => { setActiveTab('superadmin'); cancelEdit(); }}>
              <span>🛂</span> <span>Super Admin</span>
              {allTenants.filter(t => t.status === 'PENDING_APPROVAL').length > 0 && (
                <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>{allTenants.filter(t => t.status === 'PENDING_APPROVAL').length}</span>
              )}
            </button>
          )}
        </div>
      </nav>


    </aside>
  );

  const DeletionRequestsView = () => {
    const [requests, setRequests] = useState([]);
    const [reqLoading, setReqLoading] = useState(true);

    useEffect(() => {
      if (!adminTenantId) return;
      const q = query(
        collection(db, "users"),
        where("tenantId", "==", adminTenantId),
        where("status", "==", "DELETION_PENDING")
      );
      const unsub = onSnapshot(q, (snapshot) => {
        setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setReqLoading(false);
      });
      return () => unsub();
    }, [adminTenantId]);

    return (
      <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', borderColor: 'var(--danger-border)', background: 'rgba(239, 68, 68, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '3rem' }}>⚠️</div>
            <div>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '8px', color: '#fca5a5' }}>Account Deletion Pipeline</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                The following users have initiated a permanent account removal request.
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}> This action is irreversible</span> once approved.
              </p>
            </div>
          </div>
        </div>

        {reqLoading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div className="loader" style={{ margin: '0 auto' }}></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '24px' }}>🛡️</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Clear for Duty</h3>
            <p style={{ color: 'var(--text-secondary)' }}>You have no pending deletion requests at this time.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {requests.map(req => (
              <div key={req.id} className="card animate-scale-up" style={{ borderLeft: '4px solid var(--danger)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 800 }}>
                      {req.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{req.name || req.phoneNumber || req.email}</h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span className="badge" style={{ background: 'var(--bg-tertiary)', fontSize: '0.7rem' }}>{req.role?.toUpperCase()}</span>
                        <span style={{ margin: '0 8px', opacity: 0.3 }}>•</span>
                        Requested: {req.deletionRequestedAt ? new Date(req.deletionRequestedAt).toLocaleString() : 'Recently'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-ghost" onClick={() => handleRejectDeletion(req.id)}>Restore Account</button>
                    <button className="btn btn-danger" onClick={() => handleApproveDeletion(req.id)}>Confirm Deletion</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const DashboardView = () => (
    <div className="stats-grid animate-fade-in">
      <div className="card stat-card">
        <div className="stat-label">Total Lectures</div>
        <div className="stat-value">{stats.lectures}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>Active Content</div>
        <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>📚</div>
      </div>
      <div className="card stat-card">
        <div className="stat-label">Total Doubts</div>
        <div className="stat-value">{stats.doubts}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Lifetime queries</div>
        <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>💬</div>
      </div>
      <div className="card stat-card" style={{ borderLeft: `4px solid ${stats.pendingDoubts > 0 ? 'var(--danger)' : 'var(--success)'}` }}>
        <div className="stat-label">Pending Actions</div>
        <div className="stat-value" style={{ color: stats.pendingDoubts > 0 ? 'var(--danger)' : 'var(--success)' }}>
          {stats.pendingDoubts}
        </div>
        <div style={{ fontSize: '0.85rem', color: stats.pendingDoubts > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
          {stats.pendingDoubts > 0 ? 'Requires Attention' : 'All Clear!'}
        </div>
        <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>⚠️</div>
      </div>
    </div>
  );

  const SuperAdminView = () => (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>🛂 Control Center</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage institute registrations and global system status.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{allTenants.length}</div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Registered Institutes</div>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '40px' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--warning)' }}>⏳</span> Pending Approvals
          </h3>
        </div>

        {allTenants.filter(t => t.status === 'PENDING_APPROVAL').length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>✔️</div>
            <p>Queue is empty. All institutes have been processed.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allTenants.filter(t => t.status === 'PENDING_APPROVAL').map(tenant => (
              <div key={tenant.id} style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--accent-gradient)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem', fontWeight: 800 }}>
                    {tenant.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{tenant.name}</h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Code: <code style={{ color: 'var(--accent)', fontWeight: 600 }}>{tenant.code}</code>
                      <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
                      Admin: <span style={{ color: 'var(--text-primary)' }}>{tenant.adminUid?.slice(0, 12)}...</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-primary" onClick={() => handleApproveTenant(tenant)}>Approve Access</button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleRejectTenant(tenant)}>Reject Request</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ margin: 0 }}>Verified Partners</h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Institute Name</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Unique Code</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Management</th>
              </tr>
            </thead>
            <tbody>
              {allTenants.filter(t => t.status !== 'PENDING_APPROVAL').map(tenant => (
                <tr key={tenant.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '20px 24px', fontWeight: 600 }}>{tenant.name}</td>
                  <td style={{ padding: '20px 24px' }}><code style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '4px', color: 'var(--accent)' }}>{tenant.code}</code></td>
                  <td style={{ padding: '20px 24px' }}>
                    <span className={`badge ${tenant.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {tenant.isActive ? 'OPERATIONAL' : 'SUSPENDED'}
                    </span>
                  </td>
                  <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                    <button className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={async () => {
                      if (await customConfirm(`Manually ${tenant.isActive ? 'Suspend' : 'Unsuspend'} ${tenant.name}?`)) {
                        await updateDoc(doc(db, "tenants", tenant.id), { isActive: !tenant.isActive });
                      }
                    }}>
                      {tenant.isActive ? "🔴 Suspend" : "🟢 Unsuspend"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (authLoading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#94a3b8' }}>Loading System...</div>;
  if (!user) return <AdminLogin />;

  // PENDING APPROVAL SCREEN OR REJECTED
  if (!isSuperAdmin && (pendingUserStatus === 'PENDING_APPROVAL' || pendingUserStatus === 'REJECTED')) {
    const isRejected = pendingUserStatus === 'REJECTED';
    return (
      <div className="app-layout" style={{ justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary)', padding: '20px' }}>
        <div className="card animate-fade-in" style={{ maxWidth: '600px', textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: '5rem', marginBottom: '24px', filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))' }}>{isRejected ? '❌' : '⏳'}</div>
          <h1 style={{ marginBottom: '16px', fontSize: '2.5rem' }}>{isRejected ? 'Registration Rejected' : 'Approval Pending'}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.8', marginBottom: '32px' }}>
            {isRejected
              ? `We're sorry, but your institute registration for '${tenantData.name || 'your institute'}' has been rejected by our administration team.`
              : `Welcome! Your institute ${tenantData.name ? `<strong>${tenantData.name}</strong>` : 'account'} is currently being reviewed. We verify all institutes to maintain a high-quality learning environment.`
            }
          </p>
          <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '40px' }}>
            {isRejected ? (
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Please contact support at <strong style={{ color: 'var(--accent)' }}>prowintechs@gmail.com</strong> for more information.</p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Access is usually granted within <strong style={{ color: 'var(--accent)' }}>24 hours</strong>. You'll be able to manage your students once approved.</p>
            )}
          </div>
          <button className="btn btn-ghost" onClick={() => signOut(auth)}>Sign Out from Account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <header className="section-header">
          <h1>
            {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'lectures' && 'Content Management'}
            {activeTab === 'doubts' && 'Student Community'}
            {activeTab === 'polls' && 'Live Classroom Polls'}
            {activeTab === 'exams' && 'Scheduled Exams'}
            {activeTab === 'attendance' && 'Daily Attendance'}
            {activeTab === 'homework' && 'Manage Homework'}
            {activeTab === 'fees' && 'Fees Management'}
            {activeTab === 'students' && 'Manage Students'}
            {activeTab === 'deletion' && 'Account Deletion Requests'}
            {activeTab === 'settings' && 'System Configuration'}
            {activeTab === 'superadmin' && 'Super Admin Control Panel'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-glass)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}></span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>System Online</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-glass)', padding: '6px 16px 6px 6px', borderRadius: '30px', border: '1px solid var(--border)' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold', color: 'white' }}>
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1 }}>{user?.email?.split('@')[0]}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Administrator</span>
              </div>
              <button
                onClick={() => signOut(auth)}
                style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', marginLeft: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', opacity: 0.8, transition: 'all 0.2s' }}
                title="Logout"
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.8}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </header>

        {/* Global Grade Filter */}
        {['students', 'attendance', 'homework', 'exams', 'doubts'].includes(activeTab) && (
          <div className="glass-panel animate-fade-in" style={{ padding: '12px 24px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '32px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '8px' }}>Active Class:</span>
            {['All', ...grades].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGradeFilter(g)}
                className={`btn ${selectedGradeFilter === g ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '0.85rem',
                  borderRadius: 'var(--radius-full)',
                  boxShadow: selectedGradeFilter === g ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'deletion' && <DeletionRequestsView />}
        {activeTab === 'superadmin' && isSuperAdmin && <SuperAdminView />}
        {activeTab === 'fees' && (
          <FeesManager
            students={students}
            tenantId={adminTenantId}
            grades={grades}
            onAlert={customAlert}
            onConfirm={customConfirm}
          />
        )}

        {activeTab === 'settings' && (
          <div className="animate-fade-in grid-2" style={{ gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Tenant Profile Card */}
              <div className="glass-panel" style={{ padding: '32px', borderColor: 'var(--accent-border)', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(30, 58, 138, 0.05) 100%)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '1.5rem', margin: 0 }}>🏢 {tenantData.name || "Institute Environment"}</h2>
                  {!isEditingTenant && (
                    <button onClick={() => setIsEditingTenant(true)} className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>Edit Identity</button>
                  )}
                </div>

                {isEditingTenant ? (
                  <form onSubmit={handleUpdateTenantInfo} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="form-group">
                      <label className="label">Brand Asset (Logo)</label>
                      <input type="file" accept="image/*" onChange={handleLogoChange} />
                      {tenantData.logoUrl && !file && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img src={tenantData.logoUrl} alt="Brand" style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Emblem</span>
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="label">Public Title</label>
                      <input
                        type="text"
                        className="form-control"
                        value={tenantEditForm.name}
                        onChange={e => setTenantEditForm({ ...tenantEditForm, name: e.target.value })}
                        required
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="label">Registry Identifier (Code)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={tenantEditForm.code}
                        onChange={e => setTenantEditForm({ ...tenantEditForm, code: e.target.value })}
                        required
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                      <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>{loading ? "Persisting..." : "Save Identity"}</button>
                      <button type="button" onClick={() => { setIsEditingTenant(false); setFile(null); }} className="btn btn-ghost" style={{ flex: 1 }}>Discard</button>
                    </div>
                  </form>
                ) : (
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Invitation Token</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent)', letterSpacing: '4px' }}>
                      {tenantData.code || adminTenantId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '12px', fontFamily: 'monospace' }}>
                      UUID: {adminTenantId}
                    </div>
                    <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-primary)', lineHeight: '1.5' }}>
                        <strong>Distribution Directive:</strong> Provide this token to authorized members. Re-generation requires administrative clearance.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel" style={{ padding: '32px' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>System Taxonomies</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Define standardized classifications for your ecosystem.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <ConfigList title="Grade Levels" items={grades} type="grades" />
                  <ConfigList title="Subject Clusters" items={subjects} type="subjects" />
                </div>
              </div>


            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div className="glass-panel" style={{ padding: '32px' }}>
                <ConfigList title="Topic Schema" items={topics} type="topics" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doubts' && (
          <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            {doubts.length === 0 ? (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '24px' }}>✨</div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Workspace is Serene</h3>
                <p style={{ color: 'var(--text-secondary)' }}>All student inquiries have been resolved. Excellent work.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Resolution Queue</h3>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
                </div>

                {doubts.map(d => (
                  <div key={d.id} className="glass-panel animate-scale-up" style={{ padding: '24px', borderLeft: d.solved ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ padding: '6px 14px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d.subject}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{d.userName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Posted {new Date(d.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <span className={`badge ${d.solved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>{d.solved ? 'RESOLVED' : 'PENDING'}</span>
                    </div>

                    <p style={{ fontSize: '1.15rem', color: 'var(--text-primary)', lineHeight: '1.6', margin: '0 0 24px 0', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>{d.question}</p>

                    {/* Replies */}
                    {d.replies && d.replies.length > 0 && (
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600, textTransform: 'uppercase' }}>Discussion Thread</div>
                        {d.replies.map((r, i) => (
                          <div key={i} style={{ marginBottom: i < d.replies.length - 1 ? '16px' : 0, paddingBottom: i < d.replies.length - 1 ? '16px' : 0, borderBottom: i < d.replies.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: r.isCorrect ? 'var(--success)' : 'var(--text-primary)' }}>{r.userName}</span>
                              {r.isCorrect && <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>✓ OFFICIAL</span>}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{r.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!d.solved && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.8rem', height: '36px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                            onClick={() => handleAiSolve(d.id, d.question)}
                          >
                            <span style={{ marginRight: '8px' }}>✨</span> Deploy A.I. Solver
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                          <textarea
                            rows={3}
                            placeholder="Draft your expert response..."
                            value={replyText[d.id] || ""}
                            onChange={(e) => setReplyText({ ...replyText, [d.id]: e.target.value })}
                            style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white', resize: 'vertical', fontSize: '1rem' }}
                          />
                          <button className="btn btn-primary" style={{ height: '48px', padding: '0 24px', alignSelf: 'flex-end' }} onClick={() => postAdminReply(d.id)}>Submit Resolution</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'polls' && (
          <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ marginBottom: '40px', padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <div>
                  <h2 style={{ fontSize: '1.75rem', margin: 0 }}>📊 Engagement Studio</h2>
                  <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Launch interactive live polls for student cohorts.</p>
                </div>
              </div>

              <form onSubmit={handleCreatePoll} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                  <div className="form-group">
                    <label className="label">Target Cohort</label>
                    <select
                      value={pollFormData.grade}
                      onChange={(e) => setPollFormData({ ...pollFormData, grade: e.target.value })}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                    >
                      <option value="All">Global (All Grades)</option>
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Inquiry Question</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Which concept requires more clarification?"
                      value={pollFormData.question}
                      onChange={(e) => setPollFormData({ ...pollFormData, question: e.target.value })}
                      required
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" style={{ marginBottom: '12px', display: 'block' }}>Response Parameters</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <input type="text" placeholder="Option A" value={pollFormData.optionA} onChange={e => setPollFormData({ ...pollFormData, optionA: e.target.value })} required style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
                    <input type="text" placeholder="Option B" value={pollFormData.optionB} onChange={e => setPollFormData({ ...pollFormData, optionB: e.target.value })} required style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
                    <input type="text" placeholder="Option C (Optional)" value={pollFormData.optionC} onChange={e => setPollFormData({ ...pollFormData, optionC: e.target.value })} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
                    <input type="text" placeholder="Option D (Optional)" value={pollFormData.optionD} onChange={e => setPollFormData({ ...pollFormData, optionD: e.target.value })} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 32px', fontSize: '1rem' }} disabled={loading}>
                  {loading ? 'Initiating...' : '🚀 Broadcast Live Poll'}
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Historical Feed</h3>
              <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
            </div>

            {polls.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No polls have been recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {polls.map(poll => (
                  <div key={poll.id} className="glass-panel animate-scale-up" style={{ padding: '24px', borderLeft: poll.active ? '4px solid var(--success)' : '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                          {poll.active ? (
                            <span className="badge" style={{ background: 'var(--danger)', animation: 'pulse 2s infinite', fontSize: '0.7rem' }}>● LIVE NOW</span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>CONCLUDED</span>
                          )}
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{poll.grade || 'Global'}</span>
                        </div>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>{poll.question}</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {poll.options.map((opt, i) => {
                            const percentage = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                            return (
                              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                  <span>{String.fromCharCode(65 + i)}. {opt.text}</span>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{percentage}% ({opt.votes})</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${percentage}%`, background: poll.active ? 'var(--accent-gradient)' : 'var(--text-muted)', height: '100%', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '16px' }}>
                          Aggregated Participation: {poll.totalVotes || 0} respondents
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', marginLeft: '24px' }}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '8px 12px' }} onClick={() => togglePollStatus(poll)}>
                          {poll.active ? 'End Stream' : 'Restart'}
                        </button>
                        <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '8px 12px' }} onClick={() => deletePoll(poll.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'exams' && (
          <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ marginBottom: '40px', padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                  <h2 style={{ fontSize: '1.75rem', margin: 0 }}>📋 Schedule Assessment</h2>
                  <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Configure exam parameters and upload repositories.</p>
                </div>
                <div style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
                  A.I. Assisted Extract
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                  <div className="form-group">
                    <label className="label">Target Classification</label>
                    <select value={examForm.grade} onChange={e => setExamForm(prev => ({ ...prev, grade: e.target.value }))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}>
                      <option value="">Select Level</option>
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Assessment Title</label>
                    <input type="text" className="form-control" value={examForm.title} onChange={e => setExamForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Quantum Mechanics Final" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} />
                  </div>
                  <div className="form-group">
                    <label className="label">Scheduled Window</label>
                    <input type="datetime-local" className="form-control" value={examForm.date} onChange={e => setExamForm(prev => ({ ...prev, date: e.target.value }))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} />
                  </div>
                  <div className="form-group">
                    <label className="label">Quota (Minutes)</label>
                    <input type="number" className="form-control" value={examForm.duration} onChange={e => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))} placeholder="60" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div className="form-group">
                    <label className="label">Subject domain</label>
                    <select value={examForm.subject} onChange={e => setExamForm(prev => ({ ...prev, subject: e.target.value }))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}>
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Specific Unit (Optional)</label>
                    <select value={examForm.topic} onChange={e => setExamForm(prev => ({ ...prev, topic: e.target.value }))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}>
                      <option value="">Select Focus Area</option>
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ border: '2px dashed var(--accent-border)', background: 'rgba(59, 130, 246, 0.02)', padding: '40px 20px', borderRadius: '16px', textAlign: 'center', transition: 'all 0.3s ease' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📄</div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>Assessment Repository Upload</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>Drop your PDF question paper here for AI analysis.</p>
                  <input type="file" accept="application/pdf" onChange={handleExamFileChange} style={{ marginBottom: '24px' }} />

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                    <button className="btn btn-primary" onClick={processExamPdf} disabled={isProcessingExam || !examFile} style={{ height: '48px', padding: '0 24px' }}>
                      {isProcessingExam ? '⚡ Analyzing Corpus...' : '✨ Extract Questions'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => {
                      const mockQuestions = [
                        { question: "What is the unit of Force?", options: ["Joule", "Newton", "Watt", "Pascal"], correctAnswer: 1 },
                        { question: "Kinetic Energy formula?", options: ["mv", "1/2 mv^2", "mgh", "ma"], correctAnswer: 1 },
                        { question: "Value of g on Earth?", options: ["9.8 m/s^2", "10 m/s", "8.9 m/s^2", "0"], correctAnswer: 0 }
                      ];
                      setExamForm(prev => ({ ...prev, questions: mockQuestions }));
                      customAlert("Loaded Mock Questions for Testing!");
                    }} style={{ height: '48px' }}>
                      🛠️ Manual Seed
                    </button>
                  </div>
                </div>

                {examForm.questions.length > 0 && (
                  <div className="animate-fade-in" style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                      Parsed Directives <span>{examForm.questions.length} Questions</span>
                    </h4>
                    <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '10px' }}>
                      {examForm.questions.map((q, i) => (
                        <div key={i} style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>{i + 1}. {q.question}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {q.options.map((opt, idx) => (
                              <div key={idx} style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                background: idx === q.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                                border: idx === q.correctAnswer ? '1px solid var(--success-border)' : '1px solid transparent',
                                color: idx === q.correctAnswer ? 'var(--success)' : 'var(--text-secondary)'
                              }}>
                                <span style={{ marginRight: '8px', fontWeight: 800 }}>{String.fromCharCode(65 + idx)}</span> {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button className="btn btn-primary" onClick={saveExam} disabled={loading || examForm.questions.length === 0} style={{ alignSelf: 'flex-start', padding: '14px 40px', fontSize: '1.1rem', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)' }}>
                  {loading ? 'Committing...' : '💾 Finalize & Publish'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Active Assessments</h3>
              <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
              {exams.length === 0 ? (
                <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No assessments currently scheduled.</div>
              ) : exams.map(exam => (
                <div key={exam.id} className="glass-panel animate-scale-up" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'transform 0.2s ease' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>PUBLISHED</span>
                      <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{exam.title}</h4>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span>🗓️ {new Date(exam.date).toLocaleString()}</span>
                      <span>⚙️ {exam.questions.length} Items • {exam.duration} Minutes • {exam.subject}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '12px' }} onClick={() => deleteExam(exam.id)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '24px 32px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', marginBottom: '4px', margin: 0 }}>👥 Community Directory</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage enrollments, approvals, and credentials.</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowAddStudentModal(true)}
                style={{ height: '48px', padding: '0 24px', fontSize: '1rem' }}
              >
                + Register New Entry
              </button>
            </div>

            {/* Add Student Modal */}
            {showAddStudentModal && (
              <div className="animate-fade-in" style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px'
              }}>
                <div className="card animate-scale-up" style={{ width: '100%', maxWidth: '450px', padding: '32px', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Personal Profile Registration</h3>
                    <button className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)} style={{ padding: '8px' }}>✕</button>
                  </div>

                  <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="form-group">
                      <label className="label">Full Legal Name</label>
                      <input autoFocus placeholder="e.g. Rahul Sharma" value={newStudentForm.name} onChange={e => setNewStudentForm({ ...newStudentForm, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }} />
                    </div>

                    <div className="form-group">
                      <label className="label">Contact Line (Phone)</label>
                      <input placeholder="e.g. +919876543210" value={newStudentForm.phoneNumber} onChange={e => setNewStudentForm({ ...newStudentForm, phoneNumber: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }} />
                    </div>

                    <div className="form-group">
                      <label className="label">Access Key (Password)</label>
                      <input
                        type="password"
                        placeholder="Secure passkey..."
                        value={newStudentForm.password}
                        onChange={e => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">Assigned Grade</label>
                      <select value={newStudentForm.grade} onChange={e => setNewStudentForm({ ...newStudentForm, grade: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}>
                        <option value="">Select Category</option>
                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)} style={{ flex: 1 }}>Discard</button>
                      <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>{loading ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : '💾 Establish Link'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Student Edit Form */}
            {editingStudentId && (
              <div className="glass-panel animate-scale-up" style={{ marginBottom: '32px', padding: '24px', borderColor: 'var(--accent-border)' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '1.25rem' }}>✏️ Update Credentials</h3>
                <form onSubmit={handleUpdateStudent} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '200px' }}>
                    <label className="label">Display Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={studentFormData.name}
                      onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="label">Grade</label>
                    <select
                      className="form-control"
                      value={studentFormData.grade}
                      onChange={(e) => setStudentFormData({ ...studentFormData, grade: e.target.value })}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
                    >
                      <option value="">Select Category</option>
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      {!grades.includes(studentFormData.grade) && studentFormData.grade && (
                        <option value={studentFormData.grade}>{studentFormData.grade}</option>
                      )}
                    </select>
                  </div>
                  <div style={{ flex: 1.5, minWidth: '180px' }}>
                    <label className="label">Security Reset (Optional)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="New security key..."
                      value={studentFormData.password || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, password: e.target.value })}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '12px 24px' }}>Commit</button>
                    <button type="button" className="btn btn-ghost" onClick={cancelEditStudent} style={{ padding: '12px 24px' }}>Discard</button>
                  </div>
                </form>
              </div>
            )}

            {students.length === 0 ? (
              <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '24px' }}>📂</div>
                <h3>Registry is Empty</h3>
                <p style={{ color: 'var(--text-secondary)' }}>No individuals have been registered in this institute yet.</p>
              </div>
            ) : (
              <>
                {/* Pending Requests Section */}
                {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length > 0 && (
                  <div style={{ marginBottom: '40px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem' }}>
                      <span style={{ color: 'var(--accent)' }}>❇️</span> Incoming Invitations
                      <span className="badge" style={{ background: 'var(--accent)', marginLeft: '10px' }}>
                        {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length}
                      </span>
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                      {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).map(s => (
                        <div key={s.id} className="card animate-scale-up" style={{ border: '1px solid var(--accent-border)', background: 'rgba(59, 130, 246, 0.05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 800 }}>
                                {s.name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{s.name || "Anonymous Resident"}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.phoneNumber}</div>
                              </div>
                            </div>
                            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>NEW JOIN</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.85rem' }}>
                              {s.role === 'PARENT' ? (
                                <span style={{ color: '#ec4899', fontWeight: 700 }}>PARENT ACCOUNT</span>
                              ) : (
                                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>STUDENT ACCOUNT</span>
                              )}
                            </div>
                            <div style={{ height: '12px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Grade: <span style={{ fontWeight: 600 }}>{s.grade}</span></div>
                          </div>

                          {s.linkedStudentPhone && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              🔗 Relates to student: <span style={{ color: 'var(--text-primary)' }}>{s.linkedStudentPhone}</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleApproveStudent(s.id)}>Admit</button>
                            <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger-border)' }} onClick={() => handleRejectStudent(s.id)}>Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* STUDENTS TAB START */}
                {/* TAB NAVIGATION */}
                <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '6px', marginBottom: '32px', borderRadius: '14px', maxWidth: '400px' }}>
                  <button
                    onClick={() => setStudentSubTab('students')}
                    className={`btn ${studentSubTab === 'students' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: studentSubTab === 'students' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
                  >
                    Scholars
                  </button>
                  <button
                    onClick={() => setStudentSubTab('parents')}
                    className={`btn ${studentSubTab === 'parents' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: studentSubTab === 'parents' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
                  >
                    Guardians
                  </button>
                </div>

                {studentSubTab === 'students' && (
                  <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <h3 style={{ margin: 0 }}>Enrollment Roster</h3>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Identify</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Classification</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Verification</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>System Access</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Operations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.filter(s => (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && (!s.role || s.role === 'STUDENT' || s.role === 'student')).map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', opacity: (s.status === 'REJECTED' || s.status === 'BLOCKED') ? 0.5 : 1 }}>
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.status === 'ACTIVE' ? 'var(--accent-gradient)' : 'var(--bg-tertiary)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                                    {s.name ? s.name.charAt(0).toUpperCase() : '?'}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600 }}>{s.name || "Scholastic Entry"}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phoneNumber}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                  {s.grade || "No Grade"}
                                </span>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : (s.status === 'PENDING' ? 'badge-warning' : 'badge-danger')}`}>
                                  {s.status || 'ACTIVE'}
                                </span>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                {s.deviceId ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                                      {s.deviceId.substring(0, 8)}
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Floating</span>
                                )}
                              </td>
                              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                  <button onClick={() => handleEditStudent(s)} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Edit</button>
                                  <button onClick={() => handleDeleteStudent(s.id)} className="btn btn-ghost" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {studentSubTab === 'parents' && (
                  <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <h3 style={{ margin: 0 }}>Registered Guardians</h3>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Guardian Identity</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Linked Household</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Operations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.filter(s => s.role === 'PARENT').map(p => {
                            const linkedPhones = [p.linkedStudentPhone, ...(p.linkedStudentPhones || [])].filter(Boolean);
                            const linkedStudents = students.filter(s2 =>
                              linkedPhones.includes(s2.phoneNumber?.replace(/[^0-9]/g, '')) && s2.role !== 'PARENT'
                            );

                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', opacity: (p.status === 'REJECTED' || p.status === 'BLOCKED') ? 0.5 : 1 }}>
                                <td style={{ padding: '16px 24px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                                      {p.name ? p.name.charAt(0).toUpperCase() : 'G'}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 600 }}>{p.name || "Guardian Member"}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.phoneNumber}</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {linkedStudents.length > 0 ? linkedStudents.map(ls => (
                                      <span key={ls.lsId} style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75em', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                                        {ls.name} ({ls.grade})
                                      </span>
                                    )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{p.linkedStudentPhone || 'Unlinked'}</span>}
                                  </div>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                  <span className={`badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                    {p.status || 'UNVERIFIED'}
                                  </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button onClick={() => handleEditStudent(p)} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Modify</button>
                                    <button onClick={() => handleDeleteStudent(p.id)} className="btn btn-ghost" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>Remove</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}


        {/* Attendance Tab */}
        {
          activeTab === 'attendance' && (
            <AttendanceManager filterGrade={selectedGradeFilter} students={students.filter(s => s.role === 'STUDENT')} tenantId={adminTenantId} onAlert={customAlert} />
          )
        }

        {
          activeTab === 'homework' && (
            <HomeworkManager filterGrade={selectedGradeFilter} grades={grades} subjects={subjects} topics={topics} students={students} tenantId={adminTenantId} onAlert={customAlert} />
          )
        }

        {
          activeTab === 'lectures' && (
            <div className="animate-fade-in grid-2" style={{ gap: '32px' }}>
              {/* Upload Form */}
              <div className="glass-panel" style={{ padding: '32px' }}>
                <h2 style={{ fontSize: '1.75rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {editingId ? "✏️ Edit Curriculum Entry" : "🎬 Publish New Lecture"}
                </h2>
                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="label">Target Classification</label>
                      <select name="grade" value={formData.grade} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                        {grades.length === 0 && <option>Loading...</option>}
                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="label">Subject Domain</label>
                      <select name="subject" value={formData.subject} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                        {subjects.length === 0 && <option>Loading...</option>}
                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="label">Curriculum Focus (Topic)</label>
                    <select name="topic" value={formData.topic} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                      {topics.length === 0 && <option value="">Add topics in System Configuration</option>}
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label">Lecture Designation (Title)</label>
                    <input
                      type="text"
                      name="title"
                      className="form-control"
                      placeholder="e.g. Introduction to Quantum States"
                      value={formData.title}
                      onChange={handleChange}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Cinematic Material (MP4)</label>
                    <input type="file" accept="video/*" onChange={handleFileChange} />
                    {existingVideoUrl && !file && (
                      <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                        ✅ Source Material Enshrined. Selecting a new file will replace it.
                      </div>
                    )}
                  </div>

                  {/* AI GENERATION SECTION */}
                  <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)', padding: '24px', borderRadius: '16px', border: '1px solid var(--accent-border)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.05 }}>✨</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ color: 'var(--accent)', margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>✨</span> Synthetic Architect
                      </h3>
                      <button type="button" onClick={saveApiKey} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '6px 12px', background: apiKey ? 'var(--bg-tertiary)' : 'transparent', color: apiKey ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {apiKey ? 'Interface Active 🟢' : 'Configure Uplink'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                      Leverage advanced neural networks to synthesize comprehensive overviews, structured study notes, and intelligently timed interactive evaluations based on the selected domain parameters.
                    </p>
                    <button
                      type="button"
                      onClick={handleAiGenerate}
                      className="btn btn-primary"
                      style={{ width: '100%', height: '48px', background: 'var(--accent-gradient)', border: 'none', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)', fontWeight: 600, letterSpacing: '0.5px' }}
                      disabled={aiLoading}
                    >
                      {aiLoading ? <span className="loader" style={{ width: '20px', height: '20px', borderTopColor: '#fff' }}></span> : "Initialize Synthesis Sequence"}
                    </button>
                  </div>

                  <div className="form-group">
                    <label className="label">Executive Summary</label>
                    <textarea
                      name="overview"
                      className="form-control"
                      value={formData.overview}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Provide a high-level briefing..."
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', resize: 'vertical' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Structured Intelligence (Markdown Enabled)</label>
                    <textarea
                      name="notes"
                      className="form-control"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={6}
                      placeholder="• Theorem 1&#10;• Formula 2"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', resize: 'vertical', fontFamily: 'monospace' }}
                    />
                  </div>

                  <hr style={{ borderColor: 'rgba(255,255,255,0.05)', margin: '16px 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Interactive Evaluations</h3>
                    <button type="button" className="btn btn-ghost" onClick={() => setQuizzes([...quizzes, { question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }])} style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                      + Append Node
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {quizzes.map((quiz, qIndex) => (
                      <div key={qIndex} style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                        {quizzes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setQuizzes(quizzes.filter((_, i) => i !== qIndex))}
                            style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: '0.2s' }}
                          >
                            Remove Node
                          </button>
                        )}

                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '24px', height: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{qIndex + 1}</span>
                            Inquiry
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="State the core question..."
                            value={quiz.question}
                            onChange={(e) => {
                              const newQuizzes = [...quizzes];
                              newQuizzes[qIndex].question = e.target.value;
                              setQuizzes(newQuizzes);
                            }}
                            style={{ background: 'var(--bg-input)' }}
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: '20px' }}>
                          <label className="label">Activation Threshold (% of video)</label>
                          <input
                            type="number"
                            className="form-control"
                            min="1"
                            max="99"
                            value={quiz.triggerPercentage}
                            onChange={(e) => {
                              const newQuizzes = [...quizzes];
                              newQuizzes[qIndex].triggerPercentage = parseInt(e.target.value);
                              setQuizzes(newQuizzes);
                            }}
                            style={{ background: 'var(--bg-input)' }}
                          />
                        </div>

                        <div className="grid-3" style={{ gap: '16px', marginBottom: '20px' }}>
                          {quiz.options.map((opt, oIndex) => (
                            <div className="form-group" key={oIndex} style={{ margin: 0 }}>
                              <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Parameter {String.fromCharCode(65 + oIndex)}</label>
                              <input
                                type="text"
                                className="form-control"
                                value={opt}
                                onChange={(e) => {
                                  const newQuizzes = [...quizzes];
                                  newQuizzes[qIndex].options[oIndex] = e.target.value;
                                  setQuizzes(newQuizzes);
                                }}
                                style={{ background: 'var(--bg-input)' }}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="label">Validated Parameter (Correct Answer)</label>
                          <select
                            className="form-control"
                            value={quiz.correctIndex}
                            onChange={(e) => {
                              const newQuizzes = [...quizzes];
                              newQuizzes[qIndex].correctIndex = parseInt(e.target.value);
                              setQuizzes(newQuizzes);
                            }}
                            style={{ background: 'var(--bg-input)', borderColor: 'var(--success-border)', color: 'var(--success)' }}
                          >
                            <option value={0}>Parameter A</option>
                            <option value={1}>Parameter B</option>
                            <option value={2}>Parameter C</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '52px', fontSize: '1rem', fontWeight: 600, boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)' }} disabled={loading}>
                      {loading ? <span className="loader" style={{ width: '20px', height: '20px', borderTopColor: '#fff', margin: '0 auto' }}></span> : (editingId ? "Update Curriculum Structure" : "Commit to System")}
                    </button>
                    {editingId && (
                      <button type="button" onClick={cancelEdit} className="btn btn-ghost" style={{ flex: 1, height: '52px' }}>
                        Abort Operation
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Recent Uploads Feed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Archives</h3>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
                </div>

                {recentUploads.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Central repository is currently empty.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {recentUploads.map(doc => (
                      <div key={doc.id} className="glass-panel animate-scale-up" style={{
                        padding: '24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'transform 0.2s, background 0.2s',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-primary)' }}>{doc.title}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent)' }}>{doc.grade}</span>
                            <span>•</span>
                            <span style={{ fontWeight: 600 }}>{doc.subject}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--text-muted)' }}>{doc.topic}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginLeft: '16px' }}>
                          <button onClick={() => handleEdit(doc)} className="btn btn-ghost" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                            Modify
                          </button>
                          <button onClick={() => handleDelete(doc.id)} className="btn btn-ghost" style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                            Purge
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }
      </main >

      <ConfirmModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        isDangerous={modalState.isDangerous}
        onConfirm={(val) => handleModalResult(val !== undefined ? val : true)}
        onCancel={() => handleModalResult(false)}
      />
    </div >
  );
}

export default App;
