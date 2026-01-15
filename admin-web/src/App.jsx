import React, { useState, useEffect } from "react";
import { db, storage, auth } from "./firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, doc, deleteDoc, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc, getDocs, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, signOut } from "firebase/auth";
import AdminLogin from "./AdminLogin";
import ConfirmModal from "./ConfirmModal";
import AttendanceManager from "./AttendanceManager"; // Import Attendance Component
import HomeworkManager from "./HomeworkManager"; // Import Homework Component

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
  const [adminTenantId, setAdminTenantId] = useState('default');
  const [tenantData, setTenantData] = useState({ name: "", code: "" });
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [tenantEditForm, setTenantEditForm] = useState({ name: "", code: "" });

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
        // Fetch Admin Tenant ID Profile
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists() && userDoc.data().tenantId) {
            setAdminTenantId(userDoc.data().tenantId);
          }
        } catch (e) {
          console.error("Failed to fetch admin tenant", e);
        }
      } else {
        setAdminTenantId('default');
        setTenantData({ name: "", code: "" });
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Tenant Profile Data
  useEffect(() => {
    if (!adminTenantId || adminTenantId === 'default') return;
    const unsub = onSnapshot(doc(db, "tenants", adminTenantId), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setTenantData({ name: data.name, code: data.code });
        setTenantEditForm({ name: data.name, code: data.code });
      }
    });
    return () => unsub();
  }, [adminTenantId]);

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
  const [stats, setStats] = useState({ lectures: 0, doubts: 0, pendingDoubts: 0, pendingStudents: 0 });

  // Polls State
  const [polls, setPolls] = useState([]);
  const [pollFormData, setPollFormData] = useState({
    question: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: ""
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
        createdAt: serverTimestamp(),
        totalVotes: 0
      });

      setPollFormData({ question: "", optionA: "", optionB: "", optionC: "", optionD: "" });
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
    status: "scheduled"
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
    if (e.target.files[0]) setExamFile(e.target.files[0]);
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
    if (!examForm.title || !examForm.date || examForm.questions.length === 0) {
      return customAlert("Please fill title, date and ensure questions are generated.");
    }

    try {
      setLoading(true);
      await addDoc(collection(db, "exams"), {
        ...examForm,
        tenantId: adminTenantId, // Multi-tenancy
        createdAt: serverTimestamp()
      });
      setExamForm({ title: "", date: "", duration: 60, questions: [], status: "scheduled" });
      setExamFile(null);
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

    return () => {
      unsubLec();
      unsubDoubts();
      unsubStudents();
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
          grades: Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`),
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
    }
  };

  const handleResetDeviceLock = async (id) => {
    if (!await customConfirm("Reset device binding for this student? This allows them to log in on a new device once.")) return;
    try {
      await updateDoc(doc(db, "users", id), { deviceId: "" });
      customAlert("Device Lock Reset Successfully.");
    } catch (e) {
      console.error(e);
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
      customAlert("Please fill all fields including Password");
      return;
    }

    setLoading(true);
    let secondaryApp = null;

    try {
      // Dynamically import needed modules
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword, signOut } = await import("firebase/auth");
      const { deleteApp } = await import("firebase/app");

      const firebaseConfig = auth.app.options;

      // Initialize a secondary app instance
      const appName = "SecondaryApp-" + Date.now(); // Using Date.now() in JS, but here it's string literal
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);

      // Create the user in Auth
      const virtualEmail = `${newStudentForm.phoneNumber.replace(/[^0-9]/g, '')}@midnightcuriosity.com`;
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, virtualEmail, newStudentForm.password);
      const newUid = userCredential.user.uid;

      // Use the MAIN app's Firestore (db) to save the profile
      await setDoc(doc(db, "users", newUid), {
        name: newStudentForm.name,
        phoneNumber: newStudentForm.phoneNumber.replace(/[^0-9]/g, ''),
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
      const q = query(collection(db, collectionName));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, collectionName, d.id)));
      await Promise.all(deletePromises);
      customAlert(`All ${collectionName} deleted successfully.`);
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
      setFile(e.target.files[0]);
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

  const finalizeTenantUpdate = async (formData) => {
    setLoading(true);

    try {
      const isCodeChanged = formData.code !== tenantData.code;

      if (isCodeChanged) {
        // UPDATE IN PLACE (Decoupled Logic)
        // Since we are now treating 'code' as a field, we just update it.
        // NOTE: We do NOT change the DocID (adminTenantId) anymore. 
        // The Admin Tenant ID remains the same (e.g. inst_m2mf4), but the public 'code' changes.

        await updateDoc(doc(db, "tenants", adminTenantId), {
          name: formData.name,
          code: formData.code,
          updatedAt: serverTimestamp()
        });

        // We also need to update the local state to reflect the new code representation
        setTenantData(prev => ({ ...prev, code: formData.code, name: formData.name }));

        customAlert(`Institute Code updated to '${formData.code}' successfully! \n(The internal ID remains ${adminTenantId})`);
      } else {
        // SIMPLE UPDATE (Name only)
        await updateDoc(doc(db, "tenants", adminTenantId), {
          name: formData.name,
          updatedAt: serverTimestamp()
        });
        setTenantData(prev => ({ ...prev, name: formData.name }));
        customAlert("Institute Name updated!");
      }
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

      // 1. DUPLICATE CHECK
      if (isCodeChanged) {
        const q = query(collection(db, "tenants"), where("code", "==", tenantEditForm.code));
        const checkSnap = await getDocs(q);

        if (!checkSnap.empty) {
          customAlert(`The code '${tenantEditForm.code}' is already taken. Please choose another.`);
          setLoading(false);
          return;
        }
      }

      if (isCodeChanged) {
        setLoading(false); // Pause loading to show modal

        if (await customConfirm(`Are you sure you want to change your Institute Code to '${tenantEditForm.code}'?\n\n• Existing students will need the new code to log in.\n• Your curriculum and content will be migrated automatically.`, "Change Institute Code?", true)) {
          await finalizeTenantUpdate(tenantEditForm);
        }
      } else {
        // No confirmation needed for name change
        await finalizeTenantUpdate(tenantEditForm);
      }
    } catch (e) {
      console.error(e);
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
      <div className="logo">
        <span>🚀</span> EduPro
      </div>
      <nav>
        <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); cancelEdit(); }}>
          <span>📊</span> Dashboard
        </button>
        <button className={`nav-item ${activeTab === 'lectures' ? 'active' : ''}`} onClick={() => { setActiveTab('lectures'); cancelEdit(); }}>
          <span>📚</span> Lectures
        </button>
        <button className={`nav-item ${activeTab === 'doubts' ? 'active' : ''}`} onClick={() => { setActiveTab('doubts'); cancelEdit(); }}>
          <span>💬</span> Doubts {stats.pendingDoubts > 0 && <span className="badge">{stats.pendingDoubts}</span>}
        </button>
        <button className={`nav-item ${activeTab === 'polls' ? 'active' : ''}`} onClick={() => { setActiveTab('polls'); cancelEdit(); }}>
          <span>🗳️</span> Live Polls
        </button>
        <button className={`nav-item ${activeTab === 'exams' ? 'active' : ''}`} onClick={() => { setActiveTab('exams'); cancelEdit(); }}>
          <span>📝</span> Scheduled Exams
        </button>
        <button className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => { setActiveTab('attendance'); cancelEdit(); }}>
          <span>📅</span> Attendance
        </button>
        <button className={`nav-item ${activeTab === 'homework' ? 'active' : ''}`} onClick={() => { setActiveTab('homework'); cancelEdit(); }}>
          <span>🏠</span> Homework
        </button>

        <button className={`nav-item ${activeTab === 'students' ? 'active' : ''}`} onClick={() => { setActiveTab('students'); cancelEdit(); }}>
          <span>🎓</span> Students {stats.pendingStudents > 0 && <span className="badge" style={{ background: 'var(--accent)' }}>{stats.pendingStudents}</span>}
        </button>
        <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); cancelEdit(); }}>
          <span>⚙️</span> Settings
        </button>
      </nav>
      <button
        className="nav-item"
        onClick={() => signOut(auth)}
        style={{ marginTop: 'auto', color: '#ef4444', border: '1px solid #334155', borderRadius: '8px' }}
      >
        <span>🚪</span> Sign Out
      </button>
      <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        v1.0.0
      </div>
    </aside>
  );

  const DashboardView = () => (
    <div className="grid-3">
      <div className="card">
        <h3>Total Lectures</h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.lectures}</div>
        <div style={{ color: 'var(--accent)' }}>Active Content</div>
      </div>
      <div className="card">
        <h3>Total Doubts</h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.doubts}</div>
        <div style={{ color: 'var(--text-secondary)' }}>Lifetime queries</div>
      </div>
      <div className="card" style={{ border: stats.pendingDoubts > 0 ? '1px solid var(--danger)' : '' }}>
        <h3>Pending Actions</h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: stats.pendingDoubts > 0 ? 'var(--danger)' : 'var(--success)' }}>
          {stats.pendingDoubts}
        </div>
        <div style={{ color: stats.pendingDoubts > 0 ? 'var(--danger)' : 'var(--success)' }}>
          {stats.pendingDoubts > 0 ? 'Requires Attention' : 'All Clear!'}
        </div>
      </div>
    </div>
  );

  if (authLoading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#94a3b8' }}>Loading System...</div>;
  if (!user) return <AdminLogin />;

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
            {activeTab === 'students' && 'Manage Students'}
            {activeTab === 'settings' && 'System Configuration'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }}></span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>System Online</span>
          </div>
        </header>

        {/* Global Grade Filter */}
        {['students', 'attendance', 'homework', 'exams', 'doubts'].includes(activeTab) && (
          <div style={{ padding: '0 2rem 1rem 2rem', overflowX: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Filter:</span>
            {['All', ...grades].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGradeFilter(g)}
                style={{
                  padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border)', cursor: 'pointer',
                  background: selectedGradeFilter === g ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: selectedGradeFilter === g ? 'white' : 'var(--text)',
                  fontSize: '0.9rem', whiteSpace: 'nowrap'
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'dashboard' && <DashboardView />}

        {activeTab === 'settings' && (
          <div className="grid-2">
            <div>
              {/* Tenant Profile Card (New) */}
              <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--primary)', background: 'rgba(59, 130, 246, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>🏢 {tenantData.name || "My Institute"}</h2>
                  {!isEditingTenant && (
                    <button onClick={() => setIsEditingTenant(true)} className="btn-ghost" style={{ fontSize: '0.8rem' }}>Edit Details</button>
                  )}
                </div>

                {isEditingTenant ? (
                  <form onSubmit={handleUpdateTenantInfo} style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label className="label">Institute Name</label>
                      <input
                        type="text"
                        value={tenantEditForm.name}
                        onChange={e => setTenantEditForm({ ...tenantEditForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Institute Code (Tenant ID)</label>
                      <input
                        type="text"
                        value={tenantEditForm.code}
                        onChange={e => setTenantEditForm({ ...tenantEditForm, code: e.target.value })}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? "Updating..." : "Save Profile"}
                      </button>
                      <button type="button" onClick={() => setIsEditingTenant(false)} className="btn-ghost">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Institute Share Code</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--primary)', letterSpacing: '1px' }}>
                      {tenantData.code || adminTenantId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px', fontFamily: 'monospace' }}>
                      Internal ID: {adminTenantId}
                    </div>
                    <p style={{ fontSize: '0.8rem', marginTop: '10px', color: 'var(--text-secondary)' }}>
                      <strong>Share this code with your students.</strong><br />
                      They will enter this code to join your institute.
                    </p>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '20px' }}>
                <h2>Configuration</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Manage standard values for drop-downs.
                </p>
                <ConfigList title="Grades" items={grades} type="grades" />
                <ConfigList title="Subjects" items={subjects} type="subjects" />
              </div>

              <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--accent)' }}>
                <h2 style={{ color: 'var(--accent)' }}>🚀 Demo Setup</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Inject mock data for Grade 11 Demo (Students, Lectures, Doubts).
                </p>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    const isConfirmed = await customConfirm("This will add sample students, lectures, and doubts. Continue?", "Confirm Seeding", true);
                    if (!isConfirmed) return;

                    setLoading(true);
                    try {
                      await seedDemoData(adminTenantId);
                      // seedDemoData handles the success alert and reload itself mostly, but let's be safe
                    } catch (e) {
                      console.error("Seeding failed:", e);
                      customAlert("Failed to seed data: " + e.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  style={{ width: '100%', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? "Seeding Data..." : "Load Grade 11 Demo Data"}
                </button>
              </div>

              <div className="card" style={{ border: '1px solid var(--danger)' }}>
                <h2 style={{ color: 'var(--danger)' }}>Dangerous Zone</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Irreversible actions. Use with caution.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button className="btn-primary" style={{ background: 'var(--danger)' }} onClick={() => handleClearData('lectures')}>
                    Clear All Lectures
                  </button>
                  <button className="btn-primary" style={{ background: 'var(--danger)' }} onClick={() => handleClearData('doubts')}>
                    Clear All Doubts
                  </button>
                  <button className="btn-primary" style={{ background: 'var(--danger)' }} onClick={() => handleClearData('users')}>
                    Clear All Users
                  </button>
                </div>
              </div>
            </div>
            <div>
              <div className="card">
                <ConfigList title="Topics" items={topics} type="topics" />
              </div>

              {/* Tenant Manager for Super Admins (or Debug) */}
              <div className="card" style={{ marginTop: '20px' }}>
                <h3>🌐 Multi-Tenant Manager</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '10px' }}>
                  Create new institutes. (Switching requires re-login).
                </p>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input id="newTenantName" placeholder="Institute Name" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white' }} />
                  <input id="newTenantCode" placeholder="Code (e.g. sunrise)" style={{ width: '120px', padding: '8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white' }} />
                </div>
                <button
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={async () => {
                    const name = document.getElementById('newTenantName').value;
                    const code = document.getElementById('newTenantCode').value;
                    if (!name || !code) return customAlert("Enter Name and Code");

                    try {
                      await setDoc(doc(db, "tenants", code), {
                        name: name,
                        code: code,
                        createdAt: new Date().toISOString(),
                        isActive: true
                      });
                      customAlert(`Tenant '${name}' created! Code: ${code}`);
                      document.getElementById('newTenantName').value = '';
                      document.getElementById('newTenantCode').value = '';
                    } catch (e) {
                      console.error(e);
                      customAlert("Error creating tenant: " + e.message);
                    }
                  }}
                >
                  Create Tenant
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doubts' && (
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {doubts.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '50px' }}>
                <h3>No doubts yet! 🎉</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Students are doing great.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {doubts.map(d => (
                  <div key={d.id} className="card" style={{ textAlign: 'left', borderLeft: d.solved ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8em', fontWeight: 'bold' }}>{d.subject}</span>
                        <strong>{d.userName}</strong>
                        <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>{new Date(d.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="badge" style={{ background: d.solved ? 'var(--success)' : 'var(--warning)', fontSize: '0.8em' }}>{d.solved ? 'Solved' : 'Pending'}</span>
                    </div>
                    <p style={{ fontSize: '1.1em', margin: '20px 0', lineHeight: '1.6' }}>{d.question}</p>

                    {/* Replies */}
                    {d.replies && d.replies.length > 0 && (
                      <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid var(--border)' }}>
                        {d.replies.map((r, i) => (
                          <div key={i} style={{ marginBottom: '15px', borderBottom: i < d.replies.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: '10px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9em', color: r.isCorrect ? 'var(--success)' : 'var(--text-primary)', marginBottom: '5px' }}>
                              {r.userName} {r.isCorrect && '✓'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>{r.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!d.solved && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>

                        {/* AI Button Row */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ fontSize: '0.8rem', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                            onClick={() => handleAiSolve(d.id, d.question)}
                          >
                            ✨ Auto-Solve with AI
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <textarea
                            rows={3}
                            placeholder="Type an answer..."
                            value={replyText[d.id] || ""}
                            onChange={(e) => setReplyText({ ...replyText, [d.id]: e.target.value })}
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white', resize: 'vertical' }}
                          />
                          <button className="btn-primary" style={{ height: 'fit-content', alignSelf: 'flex-end' }} onClick={() => postAdminReply(d.id)}>Reply & Solve</button>
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
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="card" style={{ marginBottom: '30px' }}>
              <h2 style={{ marginBottom: '20px' }}>Create Live Poll</h2>
              <form onSubmit={handleCreatePoll} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label className="label">Question</label>
                  <input
                    type="text"
                    placeholder="e.g. Who discovered gravity?"
                    value={pollFormData.question}
                    onChange={(e) => setPollFormData({ ...pollFormData, question: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <input type="text" placeholder="Option A" value={pollFormData.optionA} onChange={e => setPollFormData({ ...pollFormData, optionA: e.target.value })} required />
                  <input type="text" placeholder="Option B" value={pollFormData.optionB} onChange={e => setPollFormData({ ...pollFormData, optionB: e.target.value })} required />
                  <input type="text" placeholder="Option C (Optional)" value={pollFormData.optionC} onChange={e => setPollFormData({ ...pollFormData, optionC: e.target.value })} />
                  <input type="text" placeholder="Option D (Optional)" value={pollFormData.optionD} onChange={e => setPollFormData({ ...pollFormData, optionD: e.target.value })} />
                </div>
                <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '10px' }} disabled={loading}>
                  {loading ? 'Starting...' : '🚀 Start Live Poll'}
                </button>
              </form>
            </div>

            <h3 style={{ marginBottom: '15px' }}>Recent Polls</h3>
            {polls.length === 0 ? <div className="card">No polls yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {polls.map(poll => (
                  <div key={poll.id} className="card" style={{ borderLeft: poll.active ? '4px solid var(--success)' : '4px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          {poll.active && <span className="badge" style={{ background: 'var(--danger)', animation: 'pulse 2s infinite' }}>● LIVE</span>}
                          <h4 style={{ margin: 0 }}>{poll.question}</h4>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {poll.options.map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}.</span>
                              <span>{opt.text}</span>
                              <span style={{ color: 'var(--text-secondary)' }}> — {opt.votes} votes</span>
                              {/* Simple Bar */}
                              <div style={{ width: '100px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px' }}>
                                <div style={{ width: `${poll.totalVotes > 0 ? (opt.votes / poll.totalVotes) * 100 : 0}%`, background: 'var(--accent)', height: '100%' }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                          Total Votes: {poll.totalVotes || 0}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-ghost" onClick={() => togglePollStatus(poll)}>
                          {poll.active ? '🛑 End Poll' : '🔄 Reactivate'}
                        </button>
                        <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deletePoll(poll.id)}>
                          Delete
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
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="card" style={{ marginBottom: '30px' }}>
              <h2 style={{ marginBottom: '20px' }}>Schedule New Exam</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                  <div>
                    <label className="label">Exam Title</label>
                    <input type="text" value={examForm.title} onChange={e => setExamForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Mid-Term Physics" />
                  </div>
                  <div>
                    <label className="label">Date & Time</label>
                    <input type="datetime-local" value={examForm.date} onChange={e => setExamForm(prev => ({ ...prev, date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Duration (mins)</label>
                    <input type="number" value={examForm.duration} onChange={e => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))} />
                  </div>
                </div>

                <div style={{ border: '2px dashed var(--border)', padding: '20px', borderRadius: '10px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '10px' }}>Upload Question Paper (PDF)</p>
                  <input type="file" accept="application/pdf" onChange={handleExamFileChange} />
                  <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                    <button className="btn-primary" onClick={processExamPdf} disabled={isProcessingExam || !examFile}>
                      {isProcessingExam ? 'AI Extracting Questions...' : '✨ Upload & Extract Questions'}
                    </button>
                    <button className="btn-ghost" onClick={() => {
                      const mockQuestions = [
                        { question: "What is the unit of Force?", options: ["Joule", "Newton", "Watt", "Pascal"], correctAnswer: 1 },
                        { question: "Kinetic Energy formula?", options: ["mv", "1/2 mv^2", "mgh", "ma"], correctAnswer: 1 },
                        { question: "Value of g on Earth?", options: ["9.8 m/s^2", "10 m/s", "8.9 m/s^2", "0"], correctAnswer: 0 }
                      ];
                      setExamForm(prev => ({ ...prev, questions: mockQuestions }));
                      customAlert("Loaded Mock Questions for Testing!");
                    }} style={{ fontSize: '0.8rem' }}>
                      🛠️ Load Mock Data
                    </button>
                  </div>
                </div>

                {examForm.questions.length > 0 && (
                  <div style={{ background: 'var(--bg-input)', padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ marginBottom: '10px' }}>Extracted Questions ({examForm.questions.length})</h4>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {examForm.questions.map((q, i) => (
                        <div key={i} style={{ marginBottom: '15px', padding: '10px', background: 'var(--bg-secondary)', borderRadius: '5px' }}>
                          <strong>Q{i + 1}: {q.question}</strong>
                          <div style={{ marginLeft: '15px', marginTop: '5px', fontSize: '0.9em' }}>
                            {q.options.map((opt, idx) => (
                              <div key={idx} style={{ color: idx === q.correctAnswer ? 'var(--success)' : '' }}>
                                {String.fromCharCode(65 + idx)}. {opt} {idx === q.correctAnswer && '(Correct)'}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button className="btn-primary" onClick={saveExam} disabled={loading || examForm.questions.length === 0} style={{ alignSelf: 'flex-start' }}>
                  {loading ? 'Saving...' : '💾 Schedule Exam for Students'}
                </button>

              </div>
            </div>

            <h3 style={{ marginBottom: '15px' }}>Scheduled Exams</h3>
            {exams.map(exam => (
              <div key={exam.id} className="card" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4>{exam.title}</h4>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Scheduled: {new Date(exam.date).toLocaleString()} • {exam.questions.length} Questions • {exam.duration} mins
                  </div>
                </div>
                <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteExam(exam.id)}>Delete</button>
              </div>
            ))}

          </div>
        )}

        {activeTab === 'students' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Student Management</h2>
              <button className="btn-primary" onClick={() => setShowAddStudentModal(true)}>+ Add Student</button>
            </div>

            {/* Add Student Modal */}
            {showAddStudentModal && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(5px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
              }}>
                <div style={{
                  backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px',
                  width: '90%', maxWidth: '400px', border: '1px solid #334155',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.25rem' }}>Add New Student</h3>
                  <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                    <div>
                      <label className="label">Full Name</label>
                      <input autoFocus placeholder="e.g. Rahul Sharma" value={newStudentForm.name} onChange={e => setNewStudentForm({ ...newStudentForm, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} />
                    </div>

                    <div>
                      <label className="label">Phone Number</label>
                      <input placeholder="e.g. +919876543210" value={newStudentForm.phoneNumber} onChange={e => setNewStudentForm({ ...newStudentForm, phoneNumber: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Must allow student to login via this number.</span>
                    </div>

                    <div>
                      <label className="label">Password</label>
                      <input
                        type="password"
                        placeholder="e.g. secret123"
                        value={newStudentForm.password}
                        onChange={e => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Required for student login.</span>
                    </div>

                    <div>
                      <label className="label">Grade</label>
                      <select value={newStudentForm.grade} onChange={e => setNewStudentForm({ ...newStudentForm, grade: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}>
                        <option value="">Select Grade</option>
                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                      <button type="button" className="btn-ghost" onClick={() => setShowAddStudentModal(false)}>Cancel</button>
                      <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Student'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Student Edit Form */}
            {editingStudentId && (
              <div style={{ marginBottom: '30px', padding: '20px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                <h3 style={{ marginBottom: '15px' }}>Edit Student</h3>
                <form onSubmit={handleUpdateStudent} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="label">Full Name</label>
                    <input
                      type="text"
                      value={studentFormData.name}
                      onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })}
                      placeholder="Student Name"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="label">Grade</label>
                    <select
                      value={studentFormData.grade}
                      onChange={(e) => setStudentFormData({ ...studentFormData, grade: e.target.value })}
                    >
                      <option value="">Select Grade</option>
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      {/* Fallback option if current grade isn't in config list */}
                      {!grades.includes(studentFormData.grade) && studentFormData.grade && (
                        <option value={studentFormData.grade}>{studentFormData.grade}</option>
                      )}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="label">New Password (Opt)</label>
                    <input
                      type="text"
                      placeholder="Reset Password"
                      value={studentFormData.password || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, password: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" className="btn-primary">Save Changes</button>
                    <button type="button" className="btn-ghost" onClick={cancelEditStudent}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {students.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No students registered yet.</p>
            ) : (
              <>
                {/* Pending Requests Section */}
                {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length > 0 && (
                  <div style={{ marginBottom: '40px' }}>
                    <h3 style={{ marginBottom: '15px', color: 'var(--accent)' }}>Pending Approval ({students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length})</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                      {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).map(s => (
                        <div key={s.id} className="card" style={{ border: '1px solid var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{s.name || "Anonymous"}</div>
                              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{s.phoneNumber}</div>
                              <div style={{ fontSize: '0.85rem', marginTop: '5px' }}>Requested: <span style={{ color: 'var(--text)' }}>{s.grade}</span></div>
                            </div>
                            <span className="badge" style={{ background: 'var(--accent)' }}>NEW</span>
                          </div>
                          {/* Role Badge */}
                          {s.role === 'PARENT' && (
                            <div style={{ marginTop: '5px' }}>
                              <span style={{ fontSize: '0.75rem', background: '#ec4899', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>PARENT</span>
                              {s.linkedStudentPhone && <div style={{ fontSize: '0.8rem', color: '#ec4899', marginTop: '2px' }}>Links to: {s.linkedStudentPhone}</div>}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleApproveStudent(s.id)}>Approve</button>
                            <button className="btn-ghost" style={{ flex: 1, border: '1px solid var(--danger)', color: 'var(--danger)' }} onClick={() => handleRejectStudent(s.id)}>Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h3>All Registered Students</h3>
                <br />
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)' }}>Name</th>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)' }}>Class</th>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)' }}>Status</th>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)' }}>Tenant ID</th>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)' }}>Device Binding</th>
                      <th style={{ padding: '10px', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.filter(s => selectedGradeFilter === 'All' || s.grade === selectedGradeFilter).map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', opacity: (s.status === 'REJECTED' || s.status === 'BLOCKED') ? 0.6 : 1 }}>
                        <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '30px', height: '30px', borderRadius: '15px', background: s.status === 'ACTIVE' ? 'var(--success)' : 'var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '0.8rem' }}>
                              {s.name ? s.name.charAt(0).toUpperCase() : '?'}
                            </span>
                            <div>
                              {s.name || "Anonymous"}
                              <div style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{s.phoneNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.85em' }}>
                            {s.grade || "N/A"}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontWeight: 'bold',
                            background: s.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: s.status === 'ACTIVE' ? 'var(--success)' : 'var(--warning)'
                          }}>
                            {s.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {s.tenantId || "None"}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          {s.deviceId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.deviceId.substring(0, 8)}...</span>
                              <button onClick={() => handleResetDeviceLock(s.id)} style={{ padding: '2px 6px', fontSize: '0.7rem', border: '1px solid var(--warning)', color: 'var(--warning)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Reset Lock</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              onClick={() => handleEditStudent(s)}
                              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              style={{ background: 'var(--danger)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <AttendanceManager filterGrade={selectedGradeFilter} students={students.filter(s => s.role === 'STUDENT')} tenantId={adminTenantId} onAlert={customAlert} />
        )}

        {activeTab === 'homework' && (
          <HomeworkManager filterGrade={selectedGradeFilter} grades={grades} students={students} tenantId={adminTenantId} onAlert={customAlert} />
        )}

        {activeTab === 'lectures' && (
          <div className="grid-2">
            {/* Upload Form */}
            <div className="card">
              <h2 style={{ marginBottom: '20px' }}>{editingId ? "Edit Lecture" : "Upload New Lecture"}</h2>
              <form onSubmit={handleUpload}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Grade</label>
                    <select name="grade" value={formData.grade} onChange={handleChange}>
                      {grades.length === 0 && <option>Loading...</option>}
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label">Subject</label>
                    <select name="subject" value={formData.subject} onChange={handleChange}>
                      {subjects.length === 0 && <option>Loading...</option>}
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Topic Name</label>
                  <select name="topic" value={formData.topic} onChange={handleChange}>
                    {topics.length === 0 && <option value="">Add topics in Settings</option>}
                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="label">Lecture Title</label>
                  <input
                    type="text"
                    name="title"
                    placeholder="e.g. Introduction to Variables"
                    value={formData.title}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label className="label">Video File (MP4)</label>
                  <input type="file" accept="video/*" onChange={handleFileChange} />
                </div>

                {/* AI GENERATION SECTION */}
                <div className="ai-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ color: 'var(--accent)', margin: 0 }}>✨ AI Assistant</h3>
                    <button type="button" onClick={saveApiKey} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
                      {apiKey ? 'Key Set ✅' : 'Set API Key'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                    Auto-generate Overview, Notes, and Quizzes based on Topic.
                  </p>
                  <button
                    type="button"
                    onClick={handleAiGenerate}
                    className="btn-primary"
                    style={{ width: '100%', background: 'var(--accent-gradient)' }}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <span className="loader"></span> : "Generate Content with AI"}
                  </button>
                </div>

                <div className="form-group">
                  <label className="label">Overview / Summary</label>
                  <textarea
                    name="overview"
                    value={formData.overview}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Brief summary of the lesson..."
                  />
                </div>

                <div className="form-group">
                  <label className="label">Study Notes (Markdown supported)</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={6}
                    placeholder="• Key Point 1&#10;• Key Point 2"
                  />
                </div>

                <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>Interactive Quizzes</h3>
                  <button type="button" className="btn-ghost" onClick={() => setQuizzes([...quizzes, { question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }])} style={{ fontSize: '0.9em' }}>
                    + Add Question
                  </button>
                </div>

                {quizzes.map((quiz, qIndex) => (
                  <div key={qIndex} style={{ background: 'var(--bg-input)', padding: '15px', borderRadius: '8px', marginBottom: '15px', position: 'relative', border: '1px solid var(--border)' }}>
                    {quizzes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuizzes(quizzes.filter((_, i) => i !== qIndex))}
                        style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    )}

                    <div className="form-group">
                      <label className="label">Question {qIndex + 1}</label>
                      <input
                        type="text"
                        placeholder="e.g. What is value of Pi?"
                        value={quiz.question}
                        onChange={(e) => {
                          const newQuizzes = [...quizzes];
                          newQuizzes[qIndex].question = e.target.value;
                          setQuizzes(newQuizzes);
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">Trigger at Progress (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={quiz.triggerPercentage}
                        onChange={(e) => {
                          const newQuizzes = [...quizzes];
                          newQuizzes[qIndex].triggerPercentage = parseInt(e.target.value);
                          setQuizzes(newQuizzes);
                        }}
                      />
                    </div>

                    <div className="grid-3" style={{ gap: '10px' }}>
                      {quiz.options.map((opt, oIndex) => (
                        <div className="form-group" key={oIndex} style={{ marginBottom: 0 }}>
                          <label className="label">Option {String.fromCharCode(65 + oIndex)}</label>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newQuizzes = [...quizzes];
                              newQuizzes[qIndex].options[oIndex] = e.target.value;
                              setQuizzes(newQuizzes);
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="form-group" style={{ marginTop: '15px' }}>
                      <label className="label">Correct Option</label>
                      <select
                        value={quiz.correctIndex}
                        onChange={(e) => {
                          const newQuizzes = [...quizzes];
                          newQuizzes[qIndex].correctIndex = parseInt(e.target.value);
                          setQuizzes(newQuizzes);
                        }}
                      >
                        <option value={0}>Option A</option>
                        <option value={1}>Option B</option>
                        <option value={2}>Option C</option>
                      </select>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                    {loading ? <span className="loader"></span> : (editingId ? "Update Lecture" : "Upload Lecture")}
                  </button>
                  {editingId && (
                    <button type="button" onClick={cancelEdit} className="btn-ghost">
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Recent Uploads Feed */}
            <div className="card">
              <h2 style={{ marginBottom: '20px' }}>Recent Uploads</h2>
              {recentUploads.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No lectures uploaded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {recentUploads.map(doc => (
                    <div key={doc.id} style={{
                      background: 'var(--bg-input)',
                      padding: '15px',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid var(--border)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{doc.title}</div>
                        <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <span style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{doc.grade}</span> • {doc.subject} • {doc.topic}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleEdit(doc)} style={{ fontSize: '0.8rem', padding: '5px 10px', backgroundColor: 'var(--accent)', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleDelete(doc.id)} style={{ fontSize: '0.8rem', padding: '5px 10px', backgroundColor: 'var(--danger)', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {/* Dev Toolbar */}
      <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 8, border: '1px solid red' }}>
        <p style={{ color: 'red', margin: 0, fontSize: 10, textAlign: 'center' }}>⚠️ DEV ZONE</p>
        <button
          onClick={() => {
            // Ensure we call the imported function directly
            import('./wiper').then(module => module.wipeAllData());
          }}
          style={{ background: 'red', color: 'white', border: 'none', padding: '5px 10px', marginTop: 5, borderRadius: 5, cursor: 'pointer', fontSize: 12 }}
        >
          🔥 Wipe Database
        </button>
      </div>
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
    </div>
  );
}

export default App;
