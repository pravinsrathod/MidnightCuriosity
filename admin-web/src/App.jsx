import React, { useState, useEffect, useRef } from "react";
import { db, storage, auth, functions } from "./firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, getDoc, writeBatch, arrayUnion, arrayRemove, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { sendPushNotification } from "./notificationService";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, signOut } from "firebase/auth";
import AdminLogin from "./AdminLogin";
import LandingPage from "./LandingPage";
import ConfirmModal from "./components/ConfirmModal";
import AttendanceManager from "./components/AttendanceManager";
import HomeworkManager from "./components/HomeworkManager";
import FeesManager from "./components/FeesManager";
import LiveInstructorPanel from "./components/LiveInstructorPanel";
import { 
  LayoutDashboard, 
  BookOpen, 
  Home, 
  FileText, 
  MessageSquare, 
  BarChart3, 
  Video, 
  Calendar, 
  Users, 
  DollarSign, 
  AlertTriangle, 
  ShieldCheck, 
  Settings,
  LogOut,
  Sparkles,
  Menu,
  X,
  Key,
  PieChart,
  CreditCard,
  List,
  Shield,
  Trash2,
  UserPlus,
  Lock
} from "lucide-react";
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import DeletionRequestsView from './components/DeletionRequestsView';
import SuperAdminView from './components/SuperAdminView';
import StudentsView from './components/StudentsView';
import SettingsView from './components/SettingsView';
import DoubtsView from './components/DoubtsView';
import PollsView from './components/PollsView';
import ExamsView from './components/ExamsView';
import LecturesView from './components/LecturesView';
import PasswordResetRequestsView from './components/PasswordResetRequestsView';
import IntegrityView from './components/IntegrityView';
import SignalsView from './components/SignalsView';
import TimetableView from './components/TimetableView';
import CampaignsView from './components/CampaignsView';


import { 
    generateLessonContent, 
    generateDoubtAnswer, 
    extractYoutubeId, 
    getApiKey, 
    setApiKey
} from './aiService';
// import { seedDemoData } from "./demoSeeder";

import { wipeAllData } from './wiper';
import ErrorBoundary from "./components/ErrorBoundary";
/**
 * LockedFeatureView: Elegant placeholder for disabled features.
 */
const LockedFeatureView = ({ featureName }) => (
  <div className="animate-fade-in" style={{ 
    height: '100%', 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '40px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.02)',
    borderRadius: '24px',
    border: '2px dashed var(--border)',
    margin: '20px'
  }}>
    <div style={{ 
      width: '80px', 
      height: '80px', 
      borderRadius: '20px', 
      background: 'rgba(239, 68, 68, 0.1)', 
      color: 'var(--danger)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      marginBottom: '24px',
      boxShadow: '0 8px 16px rgba(239, 68, 68, 0.1)'
    }}>
      <Lock size={40} />
    </div>
    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>
      {featureName} is Currently Locked
    </h2>
    <p style={{ maxWidth: '400px', fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
      Access to this module has been temporarily disabled by the super-administrator. Please contact your system provider or upgrade your plan to unlock this feature.
    </p>
    <div className="glass-panel" style={{ padding: '16px 32px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Shield size={20} color="var(--primary)" />
      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enterprise Feature Management</span>
    </div>
  </div>
);

const tabFeaturesMap = {
  lectures: 'enableLectures',
  homework: 'enableHomework',
  exams: 'enableExams',
  doubts: 'enableDoubts',
  polls: 'enableLivePolls',
  live: 'enableLiveLectures',
  attendance: 'enableAttendance',
  fees: 'enableFees',
  signals: 'enableSupportBot',
  timetable: 'enableTimetable',
  campaigns: 'enableCampaigns'
};

// --- Extracted Components (Moved to ./components/ for stability) ---

function App() {
  useEffect(() => {
    // Expose wipe tool to console
    window.wipeData = wipeAllData; 
  }, []); 

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  // Admin Tenant State
  const [adminTenantId, setAdminTenantId] = useState(null);
  const [tenantData, setTenantData] = useState({ name: "", code: "", geminiApiKey: "" });
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [tenantEditForm, setTenantEditForm] = useState({ name: "", code: "", geminiApiKey: "" });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allTenants, setAllTenants] = useState([]);
  const [pendingUserStatus, setPendingUserStatus] = useState(null); // 'PENDING_APPROVAL', 'APPROVED', etc.
  const [isOnline, setIsOnline] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

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
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: options.type || 'alert',
        title: options.title || (options.type === 'alert' ? 'Message' : 'Confirm'),
        message: options.message || '',
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        isDangerous: options.isDangerous || false,
        initialValue: options.initialValue || "",
        resolve: resolve // Store resolve function
      });
    });
  };

  const handleModalResult = (result) => {
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

  const customPrompt = (message, initialValue = "", title = "Input Required") => showModal({ type: 'prompt', title, message, initialValue });


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

          // 2. FETCH USER PROFILE (With Retry Logic for SDK Stability)
          const fetchWithRetry = async (attempts = 3) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const docRef = doc(db, "users", currentUser.uid);
                const userDoc = await getDoc(docRef);
                if (userDoc.exists()) {
                  const data = userDoc.data();
                  setAdminTenantId(data.tenantId || 'default');
                  setPendingUserStatus(data.status || 'APPROVED'); // Usually users in 'users' collection are treated by role
                  return true;
                }
                return false;
              } catch (err) {
                if (err.code === 'failed-precondition' || err.message?.includes('ASSERTION')) {
                  console.warn(`Profile fetch attempt ${i + 1} failed, retrying...`, err.message);
                  await new Promise(r => setTimeout(r, 500 * (i + 1)));
                  continue;
                }
                throw err;
              }
            }
            return false;
          };

          try {
            await fetchWithRetry();
          } catch (profileErr) {
            console.error("Profile fetch error after retries:", profileErr);
          }
        } catch (outerErr) {
          console.error("Auth listener internal error:", outerErr);
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
        const fullTenantData = { id: snap.id, ...data };
        setTenantData(fullTenantData);
        setTenantEditForm(fullTenantData);
        if (data.geminiApiKey) {
            setApiKey(data.geminiApiKey); // Save to local storage for aiService
            setApiKeyLocal(data.geminiApiKey); // Update local react state
        }
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
  const [activities, setActivities] = useState([]);
  const [batches, setBatches] = useState({});

  const [selectedGradeFilter, setSelectedGradeFilter] = useState("All");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState("All");
  // Doubts State
  const [doubts, setDoubts] = useState([]);
  const [replyText, setReplyText] = useState({}); // Map of doubtId -> text

  // Students State
  const [students, setStudents] = useState([]);

  // AI State
  const [apiKeyVal, setApiKeyLocal] = useState(getApiKey() || "");
  const [lectureSubTab, setLectureSubTab] = useState('study'); // 'live' or 'study'
  const [isLectureFormExpanded, setIsLectureFormExpanded] = useState(false);
  // Form States
  const [formData, setFormData] = useState({
    title: "",
    grade: "",
    subject: "",
    topic: "",
    overview: "",
    notes: "",
    transcript: "",
    batch: "All",
    youtubeVideoId: ""
  });

  const [quizzes, setQuizzes] = useState([
    { question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 25 }
  ]);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allLectures, setAllLectures] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState('');

  // Dashboard Stats
  const [stats, setStats] = useState({
    lectures: 0,
    doubts: 0,
    pendingDoubts: 0,
    pendingStudents: 0,
    deletionRequests: 0,
    activeStudents: 0,
    todayAttendance: 0,
    liveSessions: 0,
    monthlyRevenue: 0,
    passwordResets: 0
  });

  // Polls State
  const [polls, setPolls] = useState([]);
  const [pollFormData, setPollFormData] = useState({
    question: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    grade: "All",
    batch: "All"
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
        batch: pollFormData.batch || "All",
        createdAt: serverTimestamp(),
        totalVotes: 0
      });

      try {
        const targetGrade = pollFormData.grade;
        const targetBatch = pollFormData.batch || "All";
        
        let studentQuery;
        if (targetGrade === "All") {
          studentQuery = query(collection(db, "users"), where("tenantId", "==", adminTenantId));
        } else {
          studentQuery = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("grade", "==", targetGrade));
        }

        const snaps = await getDocs(studentQuery);
        const tokens = snaps.docs
          .map(d => d.data())
          .filter(data => (targetGrade === "All" || data.grade === targetGrade) && (targetBatch === "All" || (data.batch || "General Batch") === targetBatch))
          .map(data => data.pushToken)
          .filter(Boolean);

        if (tokens.length > 0) {
          await sendPushNotification(tokens, "📊 New Live Poll!", pollFormData.question, { screen: 'poll' });
        }
      } catch (e) { console.warn("Poll notification failed", e); }

      setPollFormData({ question: "", optionA: "", optionB: "", optionC: "", optionD: "", grade: "All", batch: "All" });
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
    batch: "All",
    subject: "",
    topic: ""
  });


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



  const saveExam = async () => {
    const examDate = new Date(examForm.date);
    const now = new Date();
    if (examDate < now) {
      return customAlert("Exam date cannot be in the past.");
    }

    if (!examForm.title || !examForm.date || !examForm.grade || examForm.questions.length === 0) {
      return customAlert("Please fill Title, Date, Class and ensure questions are generated.");
    }

    try {
      setLoading(true);

      // --- Upload Images if any ---
      const processedQuestions = await Promise.all(examForm.questions.map(async (q) => {
        let questionImageUrl = q.questionImage || null;
        if (q.questionImageFile) {
          const storageRef = ref(storage, `exams/${adminTenantId}/${Date.now()}_${q.questionImageFile.name}`);
          await uploadBytes(storageRef, q.questionImageFile);
          questionImageUrl = await getDownloadURL(storageRef);
        }

        const processedOptions = await Promise.all(q.options.map(async (opt) => {
          let optionImageUrl = opt.image || null;
          if (opt.imageFile) {
            const storageRef = ref(storage, `exams/${adminTenantId}/${Date.now()}_${opt.imageFile.name}`);
            await uploadBytes(storageRef, opt.imageFile);
            optionImageUrl = await getDownloadURL(storageRef);
          }
          return {
            text: opt.text || "",
            image: optionImageUrl
          };
        }));

        return {
          question: q.question,
          questionImage: questionImageUrl,
          options: processedOptions,
          correctAnswer: q.correctAnswer
        };
      }));

      // Copy examForm but replace questions with processedQuestions
      const examDataToSave = {
        ...examForm,
        questions: processedQuestions,
        tenantId: adminTenantId, // Multi-tenancy
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "exams"), examDataToSave);

      // --- Push Notifications ---
      try {
        const targetBatch = examForm.batch || "All";
        const studentQuery = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("grade", "==", examForm.grade));
        const snaps = await getDocs(studentQuery);
        const tokens = snaps.docs
          .map(d => d.data())
          .filter(data => targetBatch === "All" || (data.batch || "General Batch") === targetBatch)
          .map(data => data.pushToken)
          .filter(Boolean);

        if (tokens.length > 0) {
          await sendPushNotification(tokens, "✍️ New Exam Scheduled", `${examForm.title} for ${examForm.grade}${targetBatch !== 'All' ? ` (${targetBatch})` : ''} on ${examForm.date}.`, { screen: 'exam' });
        }
      } catch (e) { console.warn("Exam notification failed", e); }

      setExamForm({ title: "", date: "", duration: 60, questions: [], status: "scheduled", grade: grades[0] || "", batch: "All", subject: subjects[0] || "", topic: topics[0] || "" });
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

    const qPasswordResets = query(collection(db, "password_reset_requests"), where("tenantId", "==", adminTenantId), where("status", "==", "PENDING"));
    const unsubResets = onSnapshot(qPasswordResets, snap => {
      setStats(prev => ({ ...prev, passwordResets: snap.size }));
    });

    const qStudents = query(collection(db, "users"), where("tenantId", "==", adminTenantId), where("status", "==", "APPROVED"));
    const unsubActiveStudents = onSnapshot(qStudents, snap => {
      setStats(prev => ({ ...prev, activeStudents: snap.size }));
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const qAttendance = query(collection(db, "attendance"), where("tenantId", "==", adminTenantId), where("date", "==", todayStr));
    const unsubAttendance = onSnapshot(qAttendance, snap => {
      // Calculate average attendance for today
      let totalPresent = 0;
      let totalStudents = 0;
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.records) {
          const records = Object.values(data.records);
          totalPresent += records.filter(status => status === 'PRESENT').length;
          totalStudents += records.length;
        }
      });
      const avg = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;
      setStats(prev => ({ ...prev, todayAttendance: avg }));
    });

    const qLive = query(collection(db, "liveSessions_private"), where("tenantId", "==", adminTenantId));
    const unsubLive = onSnapshot(qLive, snap => {
      setStats(prev => ({ ...prev, liveSessions: snap.size }));
    });

    // Monthly Revenue (Simple aggregate for current month)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const qFees = query(collection(db, "fees"), where("tenantId", "==", adminTenantId));
    const unsubFees = onSnapshot(qFees, snap => {
      let monthlyTotal = 0;
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.payments) {
          data.payments.forEach(p => {
            const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date);
            if ((pDate.getMonth() + 1) === currentMonth && pDate.getFullYear() === currentYear) {
              monthlyTotal += Number(p.amount) || 0;
            }
          });
        }
      });
      setStats(prev => ({ ...prev, monthlyRevenue: monthlyTotal }));
    });

    return () => {
      unsubLec();
      unsubDoubts();
      unsubStudents();
      unsubDeletion();
      unsubResets();
      unsubActiveStudents();
      unsubAttendance();
      unsubLive();
      unsubFees();
    };
  }, [adminTenantId]);

  const saveApiKey = async () => {
    const key = await customPrompt("Enter Gemini API Key (Leave empty for Mock Mode):", apiKeyVal);
    if (key !== false) { // customPrompt returns false on cancel
      setApiKey(key);
      setApiKeyLocal(key);
    }
  };

  // ---- CONNECTIVITY STATUS ----
  useEffect(() => {
    let unsub = () => {};
    try {
      // Use the root collection to check connectivity
      const q = query(collection(db, "metadata"), where("connectivity", "==", "probe"));
      unsub = onSnapshot(q, 
        () => {
          setIsOnline(true);
          setIsConnecting(false);
        },
        (error) => {
          console.error("Firestore Connectivity Error:", error);
          setIsOnline(false);
          setIsConnecting(false);
        }
      );
    } catch (err) {
      console.error("Failed to setup connectivity listener:", err);
      setIsConnecting(false);
      setIsOnline(false);
    }
    return () => unsub();
  }, []);

  // ---- CONFIG MANAGEMENT ----
  useEffect(() => {
    if (!adminTenantId) return;
    fetchConfig();
    const unsubscribeLectures = fetchLectures();
    const unsubscribeDoubts = fetchDoubts();
    const unsubscribeStudents = fetchStudents();
    return () => {
      unsubscribeLectures();
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

  const fetchLectures = () => {
    if (!adminTenantId) return () => { };
    const q = query(
      collection(db, "lectures"),
      where("tenantId", "==", adminTenantId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by createdAt desc in memory
      const sorted = docs.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
      setAllLectures(sorted);
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
    if (!isOnline) {
       console.warn("Skipping fetchConfig: Firebase is offline.");
       return;
    }
    try {
      const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setGrades(data.grades || []);
        setSubjects(data.subjects || []);
        setTopics(data.topics || []);
        setActivities(data.activities || []);
        setBatches(data.batches || {});
        // Set defaults if form empty
        if (!formData.grade && data.grades?.length > 0) setFormData(prev => ({ ...prev, grade: data.grades[0] }));
        if (!formData.subject && data.subjects?.length > 0) setFormData(prev => ({ ...prev, subject: data.subjects[0] }));
        if (!formData.topic && data.topics?.length > 0) setFormData(prev => ({ ...prev, topic: data.topics[0] }));
      } else {
        // Initialize Defaults if first run
        const defaults = {
          grades: Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
          subjects: ["Maths", "Physics", "Chemistry", "Biology", "English", "History"],
          topics: ["Algebra", "Geometry", "Calculus"],
          activities: ["Yoga", "Music", "Art", "Physical Education"],
          batches: {}
        };
        await setDoc(docRef, defaults);
        setGrades(defaults.grades);
        setSubjects(defaults.subjects);
        setTopics(defaults.topics);
        setActivities(defaults.activities);
        setBatches(defaults.batches);
        setFormData(prev => ({ ...prev, grade: defaults.grades[0], subject: defaults.subjects[0], topic: defaults.topics[0] }));
      }
    } catch (e) {
      console.error("Error fetching config:", e);
      // Fallback to minimal defaults so UI doesn't break
      if (grades.length === 0) setGrades(["Class 1", "Class 2"]);
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

  const handleAddBatch = async (grade, batchName) => {
    if (!batchName.trim() || !adminTenantId) return;
    const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
    await updateDoc(docRef, {
      [`batches.${grade}`]: arrayUnion(batchName.trim())
    });
    fetchConfig();
  };

  const handleRemoveBatch = async (grade, batchName) => {
    if (!await customConfirm(`Remove batch ${batchName} from ${grade}?`) || !adminTenantId) return;
    const docRef = doc(db, "tenants", adminTenantId, "metadata", "lists");
    await updateDoc(docRef, {
      [`batches.${grade}`]: arrayRemove(batchName)
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

  // Move handleApproveStudent and handleRejectStudent to StudentsView.jsx

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

  // Student actions moved to StudentsView.jsx



  // ---- LECTURE MANAGEMENT ----

  // Accepts full YouTube URLs (watch?v=, youtu.be/) or raw video IDs

  const handleGenerateAI = async () => {
    if (!formData.title || !formData.grade || !formData.topic || !formData.subject) {
      customAlert("Please fill in Title, Class, Subject, and Topic first.");
      return;
    }

    const rawYoutubeInput = formData.youtubeVideoId?.trim() || "";
    const videoId = extractYoutubeId(rawYoutubeInput);
    const videoUrl = existingVideoUrl || ""; // Use existing MP4 if available

    if (!videoId && !videoUrl) {
      if (rawYoutubeInput.includes('-') && rawYoutubeInput.length > 11) {
        customAlert(`❌ This looks like a 'Playback ID' (${rawYoutubeInput}).\n\nPlease use the 'Video ID' from the URL (e.g., dQw4w9WgXcQ). A Playback ID is only for diagnostic support.`);
      } else {
        customAlert("Please provide a valid YouTube URL/ID or upload a video file first.");
      }
      return;
    }

    if (!adminTenantId) {
      customAlert("Institutional context missing. Please refresh.");
      return;
    }

    setIsGeneratingAI(true);
    try {
      console.log(`[App] Generating AI content. YouTube: ${videoId || 'None'}, Multimodal URL: ${videoUrl || 'None'}`);
      const content = await generateLessonContent(
        formData.topic,
        formData.subject,
        formData.grade,
        videoId,
        adminTenantId,
        videoUrl
      );

      setFormData(prev => ({
        ...prev,
        overview: content.overview || prev.overview,
        notes: content.notes || prev.notes,
        transcript: content.transcript || prev.transcript || "",
        youtubeVideoId: videoId || prev.youtubeVideoId // Normalize if ID was found
      }));

      if (content.quizzes && content.quizzes.length > 0) {
        setQuizzes(content.quizzes);
      }

      customAlert("✨ AI synthesis complete! The overview, notes, and interactive quizzes have been populated.");
    } catch (e) {
      console.error("AI Generation Failed:", e);
      // Better error message for the user
      const msg = e.message || "Unknown error";
      let message = "";
      if (msg.includes("transcript") && !msg.includes("blocked")) {
        message = "AI Generation Failed: Could not find captions. Try uploading the video file (MP4) to enable AI 'listening' fallback.";
      } else if (msg.includes('Streaming data') || msg.includes('404')) {
        message = "YouTube AI Access Blocked: YouTube is preventing automated audio extraction for this video (Error 404/Streaming). Use the 'Upload Video' option below to provide the MP4 file directly for AI transcription.";
      } else if (msg.toLowerCase().includes("internal") || msg.toLowerCase().includes("memory")) {
        message = "Internal Resource Limit Hit: This video is too long or complex for the current server memory. Try again or provide a smaller video file.";
      } else {
        message = "AI Generation Failed: " + msg;
      }
      customAlert(message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "grade") {
      setFormData({ ...formData, grade: value, batch: "All" });
    } else {
      setFormData({ ...formData, [name]: value });
    }
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
      notes: doc.notes || "",
      transcript: doc.transcript || "",
      batch: doc.batch || "All",
      youtubeVideoId: doc.youtubeVideoId || ""
    });
    setExistingVideoUrl(doc.videoUrl || ""); // Keep for display of legacy MP4 lectures
    // Use stored `type` field if available; fall back to: live if no videoUrl, else study
    setLectureSubTab(doc.type || (doc.videoUrl ? 'study' : 'live'));
    setIsLectureFormExpanded(true);

    if (doc.quizzes && Array.isArray(doc.quizzes)) {
      setQuizzes(doc.quizzes);
    } else if (doc.quiz) {
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
    setFormData({
      title: "",
      grade: grades[0] || "Class 1",
      subject: subjects[0] || "Maths",
      topic: topics[0] || "",
      overview: "",
      notes: "",
      transcript: "",
      batch: "All",
      youtubeVideoId: ""
    });
    setExistingVideoUrl("");
    setQuizzes([{ question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }]);
    setLectureSubTab('study');
    setIsLectureFormExpanded(false);
  };

  const finalizeTenantUpdate = async (formData, newLogoUrl = null) => {
    setLoading(true);

    try {
      const isCodeChanged = formData.code !== tenantData.code;
      const dataToUpdate = {
        name: formData.name,
        geminiApiKey: formData.geminiApiKey || "",
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

  const handleDeleteTenant = async (tenant) => {
    if (!await customConfirm(`ARE YOU ABSOLUTELY SURE? This will permanently DELETE '${tenant.name}' and ALL its data (users, lectures, fees, etc.). This cannot be undone.`, "CRITICAL: Permanent Deletion", true)) return;
    
    // Final double confirmation for such a destructive action
    if (!await customConfirm(`FINAL WARNING: To confirm deletion of ${tenant.name}, you are about to wipe everything associated with this code: ${tenant.code}. Proceed?`, "Final Approval", true)) return;

    setLoading(true);
    try {
      const tid = tenant.id;
      console.log(`[SuperAdmin] Requesting deep-clean for tenant: ${tenant.name}`);
      
      const deepDeleteFn = httpsCallable(functions, 'deepDeleteTenant');
      const result = await deepDeleteFn({ 
        tenantId: tid, 
        tenantName: tenant.name 
      });
      
      if (result.data.success) {
        customAlert(result.data.message, "Purge Complete");
      }
    } catch (e) {
      console.error("[Deletion Error]", e);
      customAlert("Deletion Failed: " + (e.message || "Unknown error during deep clean."));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.grade || !formData.subject || !formData.topic) {
      customAlert("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      // Both Live and Study tabs now use YouTube. Extract clean video ID from any URL format.
      const rawYoutubeInput = formData.youtubeVideoId?.trim() || "";
      const finalYoutubeId = extractYoutubeId(rawYoutubeInput);
      const finalVideoUrl = ""; // Storage uploads removed — all lectures are YouTube-based

      if (!finalYoutubeId && !editingId) {
        customAlert("Please provide a valid YouTube Video URL or ID.");
        setLoading(false);
        return;
      }

      const lectureData = {
        title: formData.title,
        grade: formData.grade,
        subject: formData.subject,
        topic: formData.topic,
        videoUrl: finalVideoUrl,         // Empty string; kept for backwards-compat with old MP4 lectures
        youtubeVideoId: finalYoutubeId,
        type: lectureSubTab,              // 'live' or 'study' — for display/AI purposes
        overview: formData.overview,
        notes: formData.notes,
        batch: formData.batch || "All",
        quizzes: quizzes.filter(q => q.question.trim().length > 0),
        updatedAt: serverTimestamp(),
      };

      if (!editingId) {
        lectureData.createdAt = serverTimestamp();
        lectureData.tenantId = adminTenantId;
      }

      if (editingId) {
        try {
          await updateDoc(doc(db, "lectures", editingId), lectureData);
          customAlert("Lecture updated!");
        } catch (e) {
          if (e.code === 'not-found' || e.message.includes('No document to update')) {
            console.warn("Document missing, creating new instead...");
            lectureData.createdAt = serverTimestamp();
            lectureData.tenantId = adminTenantId;
            const newRef = await addDoc(collection(db, "lectures"), lectureData);
            customAlert("Original lecture missing, created new one! ID: " + newRef.id);
          } else {
            throw e;
          }
        }
      } else {
        await addDoc(collection(db, "lectures"), lectureData);
        customAlert("Lecture published!");
      }

      cancelEdit();
    } catch (error) {
      console.error("Error uploading:", error);
      customAlert("Action failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- BATCH MANAGEMENT ----


  const handleMigrateLegacyBatches = async () => {
    if (!await customConfirm("This will assign all students without a batch to 'General Batch'. Proceed?")) return;
    setLoading(true);
    try {
      const batchRef = writeBatch(db);
      let count = 0;
      students.forEach(s => {
        if (!s.batch && s.role === 'STUDENT') {
          batchRef.update(doc(db, "users", s.id), { batch: "General Batch" });
          count++;
        }
      });
      if (count > 0) {
        await batchRef.commit();
        customAlert(`Migrated ${count} students successfully.`, "Success");
      } else {
        customAlert("All students already have a batch assigned.", "Info");
      }
    } catch (e) {
      console.error(e);
      customAlert("Migration failed: " + e.message, "Error");
    } finally {
      setLoading(false);
    }
  };
  const handleInitializePlaylists = async () => {
    if (await customConfirm("This will create a YouTube Playlist for every existing institute that doesn't have one yet. Proceed?", "Initialize Playlists", false)) {
      try {
        setLoading(true);
        const initializeFn = httpsCallable(functions, 'initializeAllInstitutePlaylists');
        const result = await initializeFn();
        const { created, skipped } = result.data;
        customAlert(`Success! Created: ${created}, Already existed: ${skipped}`);
      } catch (e) {
        console.error(e);
        customAlert("Migration failed: " + e.message);
      } finally {
        setLoading(false);
      }
    }
  };


  const handleBackfillLecturePlaylists = async () => {
    if (await customConfirm("This will move all existing YouTube lecture videos into their respective institute playlists. This might take a few minutes. Proceed?", "Migrate Videos", false)) {
      try {
        setLoading(true);
        const migrateFn = httpsCallable(functions, 'backfillLecturePlaylists');
        const result = await migrateFn();
        const { migrated, failed } = result.data;
        customAlert(`Success! Migrated: ${migrated}, Failed: ${failed}`);
      } catch (e) {
        console.error(e);
        customAlert("Migration failed: " + e.message);
      } finally {
        setLoading(false);
      }
    }
  };




  // ---- RENDERERS ----



  if (authLoading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#94a3b8' }}>Loading System...</div>;
  if (!user) {
    if (showLogin) return <AdminLogin onBack={() => setShowLogin(false)} />;
    return <LandingPage onLoginClick={() => setShowLogin(true)} />;
  }

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
      <ErrorBoundary>
        <Sidebar
          isSuperAdmin={isSuperAdmin}
          allTenants={allTenants}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          tenantData={tenantData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={stats}
          cancelEdit={cancelEdit}
          signOut={signOut}
          auth={auth}
          isOnline={isOnline}
          isConnecting={isConnecting}
        />
      </ErrorBoundary>
      <main className="main-content" style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <ErrorBoundary>
          <>
          <header className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn btn-ghost menu-toggle" 
              onClick={() => setIsSidebarOpen(true)}
              style={{ padding: '8px', marginRight: '4px' }}
            >
              <Menu size={24} />
            </button>
            <h1>
              {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'lectures' && 'Content Management'}
            {activeTab === 'doubts' && 'Student Community'}
            {activeTab === 'polls' && 'Live Classroom Polls'}
            {activeTab === 'exams' && 'Scheduled Exams'}
            {activeTab === 'attendance' && 'Daily Attendance'}
            {activeTab === 'homework' && 'Manage Homework'}
            {activeTab === 'timetable' && 'Class Timetable'}
            {activeTab === 'fees' && 'Fees Management'}
            {activeTab === 'students' && 'Manage Students'}
            {activeTab === 'deletion' && 'Account Deletion Requests'}
            {activeTab === 'settings' && 'System Configuration'}
              {activeTab === 'superadmin' && 'Super Admin Panel'}
              {activeTab === 'integrity' && 'Data Integrity & Cleanup'}
              {activeTab === 'timetable' && 'Schedule Management'}
            {activeTab === 'campaigns' && 'Campaigns'}
            {activeTab === 'signals' && 'Signals Management'}
            </h1>
            {isSuperAdmin && tabFeaturesMap[activeTab] && tenantData?.features?.[tabFeaturesMap[activeTab]] === false && (
              <div style={{ padding: '4px 12px', background: 'var(--danger-glass)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1rem' }}>🔒</span> FEATURE DISABLED FOR THIS TENANT
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-glass)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}></span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>System Online</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-glass)', padding: '6px 16px 6px 6px', borderRadius: '30px', border: '1px solid var(--border)' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold', color: 'white' }}>
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="user-email-text" style={{ display: 'flex', flexDirection: 'column' }}>
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
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Global Grade Filter */}
        {['students', 'attendance', 'homework', 'exams', 'doubts'].includes(activeTab) && (
          <div className="global-filter-container" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px', 
              marginBottom: '32px', 
              position: 'sticky', 
              top: '68px', 
              zIndex: 40, 
              background: '#0f172a', 
              padding: '16px 24px', 
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              margin: '0 -24px 32px -24px',
              width: 'calc(100% + 48px)'
          }}>
            <div className="animate-fade-in" style={{ display: 'flex', gap: '8px', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', marginBottom: 0, paddingBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '8px' }}>Active Class:</span>
              {['All', ...grades].map(g => (
                <button
                  key={g}
                  onClick={() => { setSelectedGradeFilter(g); setSelectedBatchFilter('All'); }}
                  className={`btn ${selectedGradeFilter === g ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    padding: '6px 16px',
                    fontSize: '0.85rem',
                    borderRadius: 'var(--radius-full)',
                    background: selectedGradeFilter === g ? 'var(--accent-gradient)' : 'transparent',
                    border: selectedGradeFilter === g ? 'none' : '1px solid var(--border)',
                    boxShadow: selectedGradeFilter === g ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                    flexShrink: 0
                  }}
                >
                  {g}
                </button>
              ))}
            </div>

            {selectedGradeFilter !== 'All' && (
              <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto', maxWidth: 'fit-content' }}>
                <button
                  onClick={() => setSelectedBatchFilter("All")}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius-full)',
                    background: selectedBatchFilter === 'All' ? 'var(--accent-gradient)' : 'transparent',
                    border: selectedBatchFilter === 'All' ? 'none' : '1px solid var(--border)',
                    opacity: selectedBatchFilter === 'All' ? 1 : 0.7,
                    flexShrink: 0
                  }}
                >
                  All Batches
                </button>
                {(batches[selectedGradeFilter] || ["General Batch"]).map(b => (
                  <button
                    key={b}
                    onClick={() => setSelectedBatchFilter(b)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-full)',
                      background: selectedBatchFilter === b ? 'var(--accent-gradient)' : 'transparent',
                      border: selectedBatchFilter === b ? 'none' : '1px solid var(--border)',
                      opacity: selectedBatchFilter === b ? 1 : 0.7,
                      flexShrink: 0
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {(!isSuperAdmin && tabFeaturesMap[activeTab] && tenantData?.features?.[tabFeaturesMap[activeTab]] === false) ? (
            <LockedFeatureView featureName={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} />
          ) : (
            <>
              {activeTab === 'dashboard' && (
            <DashboardView 
              user={user} 
              stats={stats} 
              recentUploads={allLectures.slice(0, 5)} 
              setActiveTab={setActiveTab} 
              setIsLectureFormExpanded={setIsLectureFormExpanded} 
              tenantData={tenantData} 
            />
          )}
          {activeTab === 'deletion' && <DeletionRequestsView adminTenantId={adminTenantId} handleRejectDeletion={handleRejectDeletion} handleApproveDeletion={handleApproveDeletion} />}
          {activeTab === 'password_resets' && <PasswordResetRequestsView adminTenantId={adminTenantId} tenantData={tenantData} customConfirm={customConfirm} customAlert={customAlert} customPrompt={customPrompt} />}
          {activeTab === 'superadmin' && isSuperAdmin && <SuperAdminView allTenants={allTenants} handleApproveTenant={handleApproveTenant} handleRejectTenant={handleRejectTenant} handleDeleteTenant={handleDeleteTenant} setAdminTenantId={setAdminTenantId} setActiveTab={setActiveTab} customAlert={customAlert} customConfirm={customConfirm} db={db} />}
          {activeTab === 'integrity' && isSuperAdmin && <IntegrityView customAlert={customAlert} customConfirm={customConfirm} />}
          {activeTab === 'signals' && (isSuperAdmin || adminTenantId) && (
            <SignalsView 
              adminTenantId={isSuperAdmin ? null : adminTenantId} 
              customAlert={customAlert} 
              customConfirm={customConfirm} 
            />
          )}
          {activeTab === 'fees' && <FeesManager tenantId={adminTenantId} onAlert={customAlert} onConfirm={customConfirm} grades={grades} batches={batches} students={students} filterGrade={selectedGradeFilter} filterBatch={selectedBatchFilter} />}
          
          {activeTab === 'settings' && (
            <SettingsView 
              adminTenantId={adminTenantId}
              tenantData={tenantData}
              setTenantData={setTenantData}
              isEditingTenant={isEditingTenant}
              setIsEditingTenant={setIsEditingTenant}
              tenantEditForm={tenantEditForm}
              setTenantEditForm={setTenantEditForm}
              handleUpdateTenantInfo={handleUpdateTenantInfo}
              handleLogoChange={handleLogoChange}
              file={file}
              loading={loading}
              grades={grades}
              subjects={subjects}
              topics={topics}
              activities={activities}
              batches={batches}
              addItem={addItem}
              removeItem={removeItem}
              handleMigrateLegacyBatches={handleMigrateLegacyBatches}
              handleInitializePlaylists={handleInitializePlaylists}
              handleBackfillLecturePlaylists={handleBackfillLecturePlaylists}
              handleAddBatch={handleAddBatch}
              handleRemoveBatch={handleRemoveBatch}
            />
          )}

          {activeTab === 'doubts' && (
            <DoubtsView 
              doubts={doubts}
              replyText={replyText}
              setReplyText={setReplyText}
              handleAiSolve={handleAiSolve}
              postAdminReply={postAdminReply}
              loading={loading}
            />
          )}

          {activeTab === 'polls' && (
            <PollsView 
              pollFormData={pollFormData}
              setPollFormData={setPollFormData}
              handleCreatePoll={handleCreatePoll}
              polls={polls}
              togglePollStatus={togglePollStatus}
              deletePoll={deletePoll}
              loading={loading}
              grades={grades}
              batches={batches}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView tenantId={tenantData?.id} />
          )}

          {activeTab === 'exams' && (
            <ExamsView 
              exams={exams}
              examForm={examForm}
              setExamForm={setExamForm}
              loading={loading}
              grades={grades}
              batches={batches}
              subjects={subjects}
              topics={topics}
              saveExam={saveExam}
              deleteExam={deleteExam}
              customAlert={customAlert}
            />
          )}

          {activeTab === 'attendance' && (
            <AttendanceManager 
              filterGrade={selectedGradeFilter} 
              filterBatch={selectedBatchFilter} 
              students={students.filter(s => s.role === 'STUDENT')} 
              tenantId={adminTenantId} 
              onAlert={customAlert} 
              onConfirm={customConfirm}
              grades={grades}
              batches={batches}
            />
          )}

          {activeTab === 'homework' && (
            <HomeworkManager 
              filterGrade={selectedGradeFilter} 
              filterBatch={selectedBatchFilter} 
              batches={batches} 
              grades={grades} 
              subjects={subjects} 
              topics={topics} 
              students={students} 
              tenantId={adminTenantId} 
              onAlert={customAlert} 
            />
          )}

          {activeTab === 'timetable' && (
            <TimetableView 
              adminTenantId={adminTenantId}
              grades={grades}
              batches={batches}
              subjects={subjects}
              activities={activities}
              customAlert={customAlert}
              customConfirm={customConfirm}
              db={db}
            />
          )}

          {activeTab === 'live' && (
            <LiveInstructorPanel
              adminTenantId={adminTenantId}
              grades={grades}
              subjects={subjects}
              batches={batches}
              topics={topics}
              loading={loading}
              isGeneratingAI={isGeneratingAI}
              handleGenerateAI={handleGenerateAI}
            />
          )}

          {activeTab === 'students' && (
            <StudentsView 
              students={students}
              grades={grades}
              batches={batches}
              adminTenantId={adminTenantId}
              tenantData={tenantData}
              selectedGradeFilter={selectedGradeFilter}
              selectedBatchFilter={selectedBatchFilter}
              customAlert={customAlert}
              customConfirm={customConfirm}
              loading={loading}
              setLoading={setLoading}
            />
          )}

          {activeTab === 'lectures' && (
            <LecturesView 
              lectures={allLectures}
              lectureSubTab={lectureSubTab}
              setLectureSubTab={setLectureSubTab}
              isLectureFormExpanded={isLectureFormExpanded}
              setIsLectureFormExpanded={setIsLectureFormExpanded}
              editingId={editingId}
              formData={formData}
              handleChange={handleChange}
              handleUpload={handleUpload}
              existingVideoUrl={existingVideoUrl}
              quizzes={quizzes}
              setQuizzes={setQuizzes}
              handleDelete={handleDelete}
              handleEdit={handleEdit}
              grades={grades}
              batches={batches}
              subjects={subjects}
              topics={topics}
              loading={loading}
              isGeneratingAI={isGeneratingAI}
              handleGenerateAI={handleGenerateAI}
            />
            )}
            </>
          )}
          </>
        </ErrorBoundary>
      </main>

      <ConfirmModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        isDangerous={modalState.isDangerous}
        initialValue={modalState.initialValue}
        onConfirm={(val) => handleModalResult(val !== undefined ? val : true)}
        onCancel={() => handleModalResult(false)}
      />
      </div>
  );
}

export default App;
