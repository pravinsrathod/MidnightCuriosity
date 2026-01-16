import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList, Modal, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { sendPushNotification } from '../services/notificationService';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../services/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AdminDashboard() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId, tenantName, tenantLogo } = useTenant();
    const [grades, setGrades] = useState(Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1)));

    // Fetch Institute Config
    useEffect(() => {
        if (!tenantId) return;
        getDoc(doc(db, "tenants", tenantId, "metadata", "lists")).then(snap => {
            if (snap.exists() && snap.data().grades && Array.isArray(snap.data().grades)) {
                setGrades(snap.data().grades);
            }
        }).catch(e => console.log("Config fetch error", e));
    }, [tenantId]);
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [activeTab, setActiveTab] = useState('STUDENTS'); // STUDENTS, HOMEWORK, ATTENDANCE
    const [studentSubTab, setStudentSubTab] = useState('STUDENTS');
    const [selectedGradeFilter, setSelectedGradeFilter] = useState("All");

    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // ATTENDANCE STATE
    const [attendanceDate, setAttendanceDate] = useState(new Date());
    const [attendanceMap, setAttendanceMap] = useState<any>({});
    const [saving, setSaving] = useState(false);

    // HOMEWORK STATE
    const [assignments, setAssignments] = useState<any[]>([]);

    // SUBMISSIONS STATE
    const [submissions, setSubmissions] = useState<any>({});
    const [expandedHomeworkId, setExpandedHomeworkId] = useState<string | null>(null);

    // Fetch Submissions
    useEffect(() => {
        if (activeTab === 'HOMEWORK' && tenantId) {
            const q = query(collection(db, "submissions"), where("tenantId", "==", tenantId));
            const unsub = onSnapshot(q, (snapshot) => {
                const map: any = {};
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    if (!map[data.homeworkId]) map[data.homeworkId] = {};
                    map[data.homeworkId][data.studentId] = { id: d.id, ...data };
                });
                setSubmissions(map);
            });
            return () => unsub();
        }
    }, [activeTab, tenantId]);

    const verifySubmission = async (homeworkId: string, studentId: string, status: string) => {
        try {
            const sub = submissions[homeworkId]?.[studentId];
            if (sub && sub.id) {
                await updateDoc(doc(db, "submissions", sub.id), {
                    status,
                    checkedAt: new Date()
                });
            } else {
                // Create manual submission/record
                await import('firebase/firestore').then(({ addDoc, collection, serverTimestamp }) => {
                    addDoc(collection(db, "submissions"), {
                        homeworkId,
                        studentId,
                        tenantId,
                        status,
                        checkedAt: serverTimestamp(),
                        submittedAt: null
                    });
                });
            }

            // --- Send Push Notifications to Parent ---
            try {
                const studentDoc = await getDoc(doc(db, "users", studentId));
                if (studentDoc.exists()) {
                    const studentData = studentDoc.data();
                    const studentPhone = studentData.phoneNumber;

                    if (studentPhone) {
                        const cleanStudentPhone = studentPhone.replace(/[^0-9]/g, '');
                        const parentQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                        const parentSnaps = await getDocs(parentQuery);

                        const tokens = parentSnaps.docs
                            .map(d => d.data())
                            .filter(p => p.pushToken && (p.linkedStudentPhone || '').replace(/[^0-9]/g, '') === cleanStudentPhone)
                            .map(p => p.pushToken);

                        if (tokens.length > 0) {
                            const statusLabel = status === 'CHECKED' ? 'Verified ✅' : 'Incomplete / Redo ❌';
                            await sendPushNotification(
                                tokens,
                                `📝 Homework Reviewed: ${studentData.name || 'Student'}`,
                                `Homework status: ${statusLabel}.`,
                                {
                                    screen: 'homework/[id]',
                                    params: { id: homeworkId }
                                }
                            );
                        }
                    }
                }
            } catch (notifyErr) {
                console.warn("Review notification failed", notifyErr);
            }
        } catch (e) {
            Alert.alert("Error", "Failed to update status");
        }
    };

    // MODAL STATE
    const [addStudentVisible, setAddStudentVisible] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', phoneNumber: '', grade: '', password: '' });

    const saveNewStudent = async () => {
        if (!newStudent.name || !newStudent.phoneNumber || !newStudent.grade) {
            Alert.alert("Error", "Please fill required fields (Name, Phone, Grade)");
            return;
        }
        setLoading(true);
        try {
            await import('firebase/firestore').then(({ addDoc, collection, serverTimestamp }) => {
                addDoc(collection(db, "users"), {
                    ...newStudent,
                    phoneNumber: newStudent.phoneNumber.replace(/[^0-9]/g, ''),
                    role: 'STUDENT', // Strict role
                    tenantId,
                    status: 'ACTIVE',
                    createdAt: serverTimestamp(),
                });
            });
            Alert.alert("Success", "Student Added!");
            setAddStudentVisible(false);
            setNewStudent({ name: '', phoneNumber: '', grade: '', password: '' });
        } catch (e: any) {
            Alert.alert("Error", "Failed to add student. Please check the details.");
        } finally {
            setLoading(false);
        }
    };

    // EDIT STATE
    const [editStudentVisible, setEditStudentVisible] = useState(false);
    const [editingStudent, setEditingStudent] = useState<any>(null);

    const openEditStudent = (student: any) => {
        setEditingStudent({ ...student });
        setEditStudentVisible(true);
    };

    const saveEditStudent = async () => {
        if (!editingStudent?.name || !editingStudent?.grade) return;
        setLoading(true);
        try {
            const updates: any = {
                name: editingStudent.name || '',
                phoneNumber: (editingStudent.phoneNumber || '').replace(/[^0-9]/g, ''),
                grade: editingStudent.grade || ''
            };
            if (editingStudent.password) updates.password = editingStudent.password;

            await updateDoc(doc(db, "users", editingStudent.id), updates);
            Alert.alert("Success", "Student Updated");
            setEditStudentVisible(false);
        } catch (e: any) {
            Alert.alert("Error", "Failed to update student profile.");
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (id: string) => {
        Alert.alert("Confirm Delete", "Are you sure you want to delete this student?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        await deleteDoc(doc(db, "users", id));
                    } catch (e) { Alert.alert("Error", "Failed to delete"); }
                }
            }
        ]);
    };

    // HOMEWORK CREATE STATE
    const [createHomeworkVisible, setCreateHomeworkVisible] = useState(false);
    const [newHomework, setNewHomework] = useState({ title: '', description: '', subject: '', grade: '', dueDate: new Date().toISOString().split('T')[0], file: null as string | null });
    const [uploading, setUploading] = useState(false);
    const [homeworkDateFilter, setHomeworkDateFilter] = useState(new Date().toISOString().split('T')[0]);

    const pickAttachment = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            setNewHomework({ ...newHomework, file: result.assets[0].uri });
        }
    };

    const uploadFile = async (uri: string) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        const filename = uri.substring(uri.lastIndexOf('/') + 1);
        const storageRef = ref(storage, `homework_attachments/${tenantId}/${filename}`);
        await uploadBytes(storageRef, blob);
        return await getDownloadURL(storageRef);
    };

    const saveNewHomework = async () => {
        if (!newHomework.title || !newHomework.subject || !newHomework.grade) return Alert.alert("Error", "Fill required fields");

        // Date check (Local Time Validation)
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const todayStr = new Date(today.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];

        if (newHomework.dueDate < todayStr) {
            return Alert.alert("Error", "Due date cannot be in the past");
        }

        setLoading(true);
        try {
            let fileUrl = null;
            if (newHomework.file) {
                setUploading(true);
                fileUrl = await uploadFile(newHomework.file);
                setUploading(false);
            }

            const hwRef = await import('firebase/firestore').then(({ addDoc, collection, serverTimestamp }) => {
                return addDoc(collection(db, "homework"), {
                    ...newHomework,
                    attachmentUrl: fileUrl,
                    tenantId,
                    createdAt: serverTimestamp(),
                    status: 'OPEN'
                });
            });

            // --- Send Push Notifications to Parents ---
            try {
                // 1. Get all students in this grade
                const studentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("grade", "==", newHomework.grade));
                const studentSnaps = await getDocs(studentsQuery);
                const studentPhones = studentSnaps.docs.map(d => d.data().phoneNumber).filter(Boolean);

                if (studentPhones.length > 0) {
                    // 2. Get all parents for this tenant
                    const parentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                    const parentSnaps = await getDocs(parentsQuery);

                    // 3. Filter parents linked to these students and get tokens
                    const tokens = parentSnaps.docs
                        .map(d => d.data())
                        .filter(p => p.pushToken && studentPhones.includes(p.linkedStudentPhone))
                        .map(p => p.pushToken);

                    if (tokens.length > 0) {
                        await sendPushNotification(
                            tokens,
                            `📚 New Homework: ${newHomework.subject}`,
                            `${newHomework.title} assigned for ${newHomework.grade}.`,
                            {
                                screen: 'homework/[id]',
                                params: { id: hwRef.id }
                            }
                        );
                    }
                }
            } catch (notifyErr) {
                console.warn("Notification failed, but homework was saved", notifyErr);
            }

            Alert.alert("Success", "Homework Created!");
            setCreateHomeworkVisible(false);
            setNewHomework({ title: '', description: '', subject: '', grade: '', dueDate: new Date().toISOString().split('T')[0], file: null });
        } catch (e: any) {
            Alert.alert("Error", "Failed to create homework. Please try again.");
        } finally {
            setLoading(false);
            setUploading(false);
        }
    };

    // Fetch Students
    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        const q = query(collection(db, "users"), where("tenantId", "==", tenantId));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = list.filter((u: any) => u.role !== 'admin' && u.role !== 'ADMIN');
            setStudents(filtered);
            setLoading(false);
        });

        return () => unsub();
    }, [tenantId]);

    // Fetch Assignments when tab is HOMEWORK
    useEffect(() => {
        if (activeTab === 'HOMEWORK' && tenantId) {
            const q = query(collection(db, "homework"), where("tenantId", "==", tenantId));
            const unsub = onSnapshot(q, (snapshot) => {
                setAssignments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            });
            return () => unsub();
        }
    }, [activeTab, tenantId]);

    // Fetch Attendance Record when Date/Tab changes
    useEffect(() => {
        if (activeTab === 'ATTENDANCE' && tenantId) {
            const dateStr = attendanceDate.toISOString().split('T')[0];
            const docId = `${tenantId}_${dateStr}`;
            const unsub = onSnapshot(doc(db, "attendance", docId), (docSnap) => {
                if (docSnap.exists()) {
                    setAttendanceMap(docSnap.data().records || {});
                } else {
                    setAttendanceMap({});
                }
            });
            return () => unsub();
        }
    }, [activeTab, attendanceDate, tenantId]);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            await AsyncStorage.removeItem('biometric_enabled');
            router.replace('/auth');
        } catch (e) {
            console.error(e);
        }
    };

    const handleApprove = async (id: string, name: string) => {
        try {
            await updateDoc(doc(db, "users", id), { status: 'ACTIVE' });
            Alert.alert("Success", `Approved ${name}`);
        } catch (e) {
            Alert.alert("Error", "Failed to approve.");
        }
    };

    const handleReject = async (id: string) => {
        try {
            await updateDoc(doc(db, "users", id), { status: 'REJECTED' });
        } catch (e) {
            Alert.alert("Error", "Failed to reject.");
        }
    };

    // ATTENDANCE FUNCTIONS
    const activeStudentList = students.filter(s => s.status === 'ACTIVE' && (s.role === 'student' || s.role === 'STUDENT') && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter));

    const changeDate = (days: number) => {
        const newDate = new Date(attendanceDate);
        newDate.setDate(newDate.getDate() + days);
        setAttendanceDate(newDate);
    };

    const markStatus = (studentId: string, status: string) => {
        setAttendanceMap((prev: any) => ({ ...prev, [studentId]: status }));
    };

    const markAll = (status: string) => {
        const newMap: any = {};
        activeStudentList.forEach(s => {
            newMap[s.id] = status;
        });
        setAttendanceMap(newMap);
    };

    const saveAttendance = async () => {
        if (activeStudentList.length === 0) return;
        setSaving(true);
        try {
            const dateStr = attendanceDate.toISOString().split('T')[0];
            const docId = `${tenantId}_${dateStr}`;

            // Calculate stats
            const records = attendanceMap;
            const total = activeStudentList.length;
            const present = Object.values(records).filter(v => v === 'PRESENT').length;
            const absent = Object.values(records).filter(v => v === 'ABSENT').length;

            await import('firebase/firestore').then(({ setDoc, serverTimestamp }) => {
                setDoc(doc(db, "attendance", docId), {
                    tenantId,
                    date: dateStr,
                    records,
                    totalStudents: total,
                    presentCount: present,
                    absentCount: absent,
                    updatedAt: serverTimestamp(),
                    markedBy: auth.currentUser?.uid || 'admin'
                });
            });

            // --- Send Attendance Notifications ---
            try {
                const affectedStudentIds = Object.keys(records).filter(id => records[id] === 'ABSENT' || records[id] === 'LATE');
                if (affectedStudentIds.length > 0) {
                    const parentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "PARENT"));
                    const parentSnaps = await getDocs(parentsQuery);

                    const studentsQuery = query(collection(db, "users"), where("tenantId", "==", tenantId));
                    const studentSnaps = await getDocs(studentsQuery);
                    const studentMap = Object.fromEntries(studentSnaps.docs.map(d => [d.id, d.data()]));

                    for (const parentDoc of parentSnaps.docs) {
                        const parent = parentDoc.data();
                        if (parent.pushToken && parent.linkedStudentPhone) {
                            // Find the student this parent is linked to
                            const studentEntry = Object.entries(studentMap).find(([id, s]: [string, any]) => {
                                const cleanStudentPhone = (s.phoneNumber || '').replace(/[^0-9]/g, '');
                                const cleanParentLink = (parent.linkedStudentPhone || '').replace(/[^0-9]/g, '');
                                return cleanStudentPhone === cleanParentLink && affectedStudentIds.includes(id);
                            });
                            if (studentEntry) {
                                const [sId, sData] = studentEntry;
                                const status = records[sId];
                                await sendPushNotification(
                                    parent.pushToken,
                                    `⚠️ Attendance Alert: ${sData.name}`,
                                    `${sData.name} was marked ${status} today (${dateStr}).`,
                                    { screen: 'parent-dashboard' }
                                );
                            }
                        }
                    }
                }
            } catch (notifyErr) {
                console.warn("Attendance notifications failed", notifyErr);
            }

            Alert.alert("Success", "Attendance Saved!");
        } catch (e: any) {
            Alert.alert("Error", "Failed to save attendance record.");
        } finally {
            setSaving(false);
        }
    };

    const renderStudentItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                    <Text style={styles.cardTitle}>{item.name || "Unknown"}</Text>
                    <Text style={styles.cardSubtitle}>{item.phoneNumber}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <View style={[styles.badge, { backgroundColor: colors.border }]}>
                            <Text style={styles.badgeText}>{item.grade || "No Grade"}</Text>
                        </View>
                        <View style={[styles.badge, {
                            backgroundColor: item.status === 'ACTIVE' ? colors.success + '20' :
                                (item.status === 'PENDING' ? colors.warning + '20' : colors.danger + '20')
                        }]}>
                            <Text style={[styles.badgeText, {
                                color: item.status === 'ACTIVE' ? colors.success :
                                    (item.status === 'PENDING' ? colors.warning : colors.danger)
                            }]}>{item.status}</Text>
                        </View>
                    </View>
                </View>
                {item.status === 'PENDING' ? (
                    <View style={{ gap: 8 }}>
                        <TouchableOpacity onPress={() => handleApprove(item.id, item.name)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleReject(item.id)} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
                            <Ionicons name="close" size={16} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ gap: 8 }}>
                        <TouchableOpacity onPress={() => openEditStudent(item)} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                            <Ionicons name="pencil" size={16} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDelete(item.id)} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
                            <Ionicons name="trash" size={16} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );

    const renderAttendanceItem = ({ item }: { item: any }) => {
        const status = attendanceMap[item.id] || 'UNMARKED';
        return (
            <View style={[styles.card, { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={[styles.cardSubtitle, { fontSize: 10 }]}>{item.grade}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'PRESENT')}
                        style={[styles.attBtn, status === 'PRESENT' && { backgroundColor: colors.success, borderColor: colors.success }]}
                    >
                        <Text style={[styles.attBtnText, status === 'PRESENT' && { color: '#FFF' }]}>P</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'ABSENT')}
                        style={[styles.attBtn, status === 'ABSENT' && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                    >
                        <Text style={[styles.attBtnText, status === 'ABSENT' && { color: '#FFF' }]}>A</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => markStatus(item.id, 'LATE')}
                        style={[styles.attBtn, status === 'LATE' && { backgroundColor: colors.warning, borderColor: colors.warning }]}
                    >
                        <Text style={[styles.attBtnText, status === 'LATE' && { color: '#FFF' }]}>L</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const pendingStudents = students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter));
    const activeStudents = students.filter(s => s.status !== 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter));

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {tenantLogo ? (
                        <Image source={{ uri: tenantLogo }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                    ) : (
                        <Text style={{ fontSize: 24 }}>🚀</Text>
                    )}
                    <View>
                        <Text style={styles.headerTitle}>{tenantName || "Admin Console"}</Text>
                        <Text style={styles.headerSubtitle}>Tenant: {tenantId}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                    <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                </TouchableOpacity>
            </View>

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                {['STUDENTS', 'HOMEWORK', 'ATTENDANCE'].map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab.charAt(0) + tab.slice(1).toLowerCase()}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.content}>
                <View style={{ marginBottom: 15, marginTop: 5 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 5 }}>
                        {['All', ...grades].map(g => (
                            <TouchableOpacity
                                key={g}
                                onPress={() => setSelectedGradeFilter(g)}
                                style={{
                                    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1,
                                    borderColor: selectedGradeFilter === g ? colors.primary : colors.border,
                                    backgroundColor: selectedGradeFilter === g ? colors.primary : 'transparent'
                                }}
                            >
                                <Text style={{ color: selectedGradeFilter === g ? '#FFF' : colors.text, fontSize: 13, fontWeight: '500' }}>{g}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <>
                        {activeTab === 'STUDENTS' && (
                            <>
                                {/* Student/Parent Sub-tabs */}
                                <View style={{ flexDirection: 'row', marginBottom: 10, paddingHorizontal: 5, gap: 10 }}>
                                    <TouchableOpacity
                                        style={[styles.subTab, studentSubTab === 'STUDENTS' && styles.activeSubTab]}
                                        onPress={() => setStudentSubTab('STUDENTS')}>
                                        <Text style={[styles.subTabText, studentSubTab === 'STUDENTS' && styles.activeSubTabText]}>Students</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.subTab, studentSubTab === 'PARENTS' && styles.activeSubTab]}
                                        onPress={() => setStudentSubTab('PARENTS')}>
                                        <Text style={[styles.subTabText, studentSubTab === 'PARENTS' && styles.activeSubTabText]}>Parents</Text>
                                    </TouchableOpacity>
                                </View>

                                <FlatList
                                    data={
                                        studentSubTab === 'STUDENTS'
                                            ? [...pendingStudents, ...activeStudents].filter(s => !s.role || s.role === 'student' || s.role === 'STUDENT')
                                            : students.filter(s => s.role === 'PARENT' || s.role === 'parent')
                                    }
                                    keyExtractor={item => item.id}
                                    renderItem={renderStudentItem}
                                    ListHeaderComponent={() => (
                                        <View style={{ marginBottom: 10 }}>
                                            <TouchableOpacity
                                                style={[styles.saveBtn, { marginBottom: 15, flexDirection: 'row', justifyContent: 'center', gap: 10 }]}
                                                onPress={() => setAddStudentVisible(true)}
                                            >
                                                <Ionicons name="person-add" size={20} color="#FFF" />
                                                <Text style={styles.saveBtnText}>Add New {studentSubTab === 'STUDENTS' ? 'Student' : 'Parent'}</Text>
                                            </TouchableOpacity>
                                            {studentSubTab === 'STUDENTS' && pendingStudents.length > 0 && <Text style={styles.sectionHeader}>Pending Approvals ({pendingStudents.length})</Text>}
                                        </View>
                                    )}
                                    contentContainerStyle={{ paddingBottom: 20 }}
                                />
                            </>
                        )}

                        {activeTab === 'HOMEWORK' && (
                            <View style={styles.section}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={styles.sectionTitle}>Assignments</Text>
                                    <TouchableOpacity style={{ padding: 5 }} onPress={() => setCreateHomeworkVisible(true)}>
                                        <Ionicons name="add-circle" size={28} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <Text style={{ color: colors.textSecondary }}>Filter Date:</Text>
                                    <TextInput
                                        value={homeworkDateFilter}
                                        onChangeText={setHomeworkDateFilter}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.textSecondary}
                                        style={{ borderWidth: 1, borderColor: colors.border, padding: 5, borderRadius: 5, color: colors.text, width: 120, textAlign: 'center' }}
                                    />
                                    <TouchableOpacity onPress={() => setHomeworkDateFilter(new Date().toISOString().split('T')[0])}>
                                        <Text style={{ color: colors.primary, fontSize: 12 }}>Today</Text>
                                    </TouchableOpacity>
                                </View>

                                {assignments.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <Text style={{ color: colors.textSecondary }}>No assignments found.</Text>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={
                                            (selectedGradeFilter === 'All' ? assignments : assignments.filter(a => a.grade === selectedGradeFilter))
                                                .filter(a => a.dueDate === homeworkDateFilter)
                                        }
                                        keyExtractor={item => item.id}
                                        renderItem={({ item }) => {
                                            const expanded = expandedHomeworkId === item.id;
                                            return (
                                                <View style={styles.card}>
                                                    <TouchableOpacity onPress={() => setExpandedHomeworkId(expanded ? null : item.id)}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Text style={styles.cardTitle}>{item.title}</Text>
                                                            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                                                            <Text style={{ fontWeight: 'bold', color: colors.primary }}>{item.subject || 'General'}</Text>
                                                            <Text style={styles.cardSubtitle}>Due: {item.dueDate}</Text>
                                                        </View>
                                                        <Text numberOfLines={expanded ? undefined : 2} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{item.description}</Text>
                                                    </TouchableOpacity>

                                                    {/* STUDENT LIST (EXPANDED) */}
                                                    {expanded && (
                                                        <View style={{ marginTop: 15, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
                                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }}>SUBMISSIONS ({item.grade})</Text>
                                                            {students.filter(s => s.grade === item.grade && s.status === 'ACTIVE' && (s.role === 'student' || s.role === 'STUDENT')).map(student => {
                                                                const sub = submissions[item.id]?.[student.id];
                                                                const isChecked = sub?.status === 'CHECKED';
                                                                const isIncomplete = sub?.status === 'INCOMPLETE';
                                                                return (
                                                                    <View key={student.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isChecked ? colors.success : (isIncomplete ? colors.danger : colors.border) }} />
                                                                            <Text style={{ color: colors.text, fontSize: 14 }}>{student.name}</Text>
                                                                        </View>
                                                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                                                            <TouchableOpacity onPress={() => verifySubmission(item.id, student.id, 'CHECKED')} style={{ padding: 4, borderWidth: 1, borderColor: isChecked ? colors.success : colors.border, borderRadius: 4, backgroundColor: isChecked ? colors.success + '20' : 'transparent' }}>
                                                                                <Ionicons name="checkmark" size={16} color={isChecked ? colors.success : colors.textSecondary} />
                                                                            </TouchableOpacity>
                                                                            <TouchableOpacity onPress={() => verifySubmission(item.id, student.id, 'INCOMPLETE')} style={{ padding: 4, borderWidth: 1, borderColor: isIncomplete ? colors.danger : colors.border, borderRadius: 4, backgroundColor: isIncomplete ? colors.danger + '20' : 'transparent' }}>
                                                                                <Ionicons name="close" size={16} color={isIncomplete ? colors.danger : colors.textSecondary} />
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    </View>
                                                                );
                                                            })}
                                                            {students.filter(s => s.grade === item.grade && (s.role === 'student' || s.role === 'STUDENT')).length === 0 && (
                                                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No students found in {item.grade}</Text>
                                                            )}
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        }}
                                        style={{ flex: 1 }}
                                        contentContainerStyle={{ paddingBottom: 20 }}
                                    />
                                )}
                            </View>
                        )}

                        {activeTab === 'ATTENDANCE' && (
                            <View style={styles.section}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: colors.card, padding: 10, borderRadius: 12 }}>
                                    <TouchableOpacity onPress={() => changeDate(-1)} style={{ padding: 5 }}>
                                        <Ionicons name="chevron-back" size={24} color={colors.primary} />
                                    </TouchableOpacity>
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={{ fontWeight: 'bold', color: colors.text, fontSize: 16 }}>
                                            {attendanceDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                            {new Date().toDateString() === attendanceDate.toDateString() ? 'Today' : ''}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => changeDate(1)} style={{ padding: 5 }}>
                                        <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                {loading ? (
                                    <ActivityIndicator />
                                ) : (
                                    <>
                                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10, gap: 10 }}>
                                            <TouchableOpacity onPress={() => markAll('PRESENT')}><Text style={{ color: colors.success, fontWeight: 'bold' }}>All Present</Text></TouchableOpacity>
                                            <TouchableOpacity onPress={() => markAll('ABSENT')}><Text style={{ color: colors.danger, fontWeight: 'bold' }}>All Absent</Text></TouchableOpacity>
                                        </View>

                                        <FlatList
                                            data={activeStudentList}
                                            keyExtractor={item => item.id}
                                            renderItem={renderAttendanceItem}
                                            contentContainerStyle={{ paddingBottom: 20 }}
                                            style={{ flex: 1 }}
                                        />
                                    </>
                                )}

                                <TouchableOpacity
                                    style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                                    onPress={saveAttendance}
                                    disabled={saving}
                                >
                                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Attendance</Text>}
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </View>

            {/* ADD STUDENT MODAL */}
            <Modal visible={addStudentVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Add New Student</Text>
                        <TextInput
                            placeholder="Student Name"
                            placeholderTextColor={colors.textSecondary}
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={newStudent.name}
                            onChangeText={t => setNewStudent({ ...newStudent, name: t })}
                        />
                        <TextInput
                            placeholder="Phone (e.g. 9876543210)"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="phone-pad"
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={newStudent.phoneNumber}
                            onChangeText={t => setNewStudent({ ...newStudent, phoneNumber: t })}
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                            {grades.map(g => (
                                <TouchableOpacity
                                    key={g}
                                    onPress={() => setNewStudent({ ...newStudent, grade: g })}
                                    style={{
                                        padding: 8, borderRadius: 8, borderWidth: 1,
                                        borderColor: newStudent.grade === g ? colors.primary : colors.border,
                                        backgroundColor: newStudent.grade === g ? colors.primary + '20' : 'transparent'
                                    }}
                                >
                                    <Text style={{ color: colors.text, fontSize: 12 }}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput
                            placeholder="Password (Optional)"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 20 }}
                            value={newStudent.password}
                            onChangeText={t => setNewStudent({ ...newStudent, password: t })}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => setAddStudentVisible(false)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: colors.text }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveNewStudent} style={{ flex: 1, padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* EDIT STUDENT MODAL */}
            <Modal visible={editStudentVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Edit Student</Text>
                        <TextInput
                            placeholder="Student Name"
                            placeholderTextColor={colors.textSecondary}
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={editingStudent?.name}
                            onChangeText={t => setEditingStudent({ ...editingStudent, name: t })}
                        />
                        <TextInput
                            placeholder="Phone"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="phone-pad"
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={editingStudent?.phoneNumber}
                            onChangeText={t => setEditingStudent({ ...editingStudent, phoneNumber: t })}
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                            {grades.map(g => (
                                <TouchableOpacity
                                    key={g}
                                    onPress={() => setEditingStudent({ ...editingStudent, grade: g })}
                                    style={{
                                        padding: 8, borderRadius: 8, borderWidth: 1,
                                        borderColor: editingStudent?.grade === g ? colors.primary : colors.border,
                                        backgroundColor: editingStudent?.grade === g ? colors.primary + '20' : 'transparent'
                                    }}
                                >
                                    <Text style={{ color: colors.text, fontSize: 12 }}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput
                            placeholder="New Password (Optional)"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 20 }}
                            value={editingStudent?.password}
                            onChangeText={t => setEditingStudent({ ...editingStudent, password: t })}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => setEditStudentVisible(false)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: colors.text }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveEditStudent} style={{ flex: 1, padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Update</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* CREATE HOMEWORK MODAL */}
            <Modal visible={createHomeworkVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Assign Homework</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                            <TextInput
                                placeholder="Due Date (YYYY-MM-DD)"
                                placeholderTextColor={colors.textSecondary}
                                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text }}
                                value={newHomework.dueDate}
                                onChangeText={t => setNewHomework({ ...newHomework, dueDate: t })}
                            />
                        </View>
                        <TextInput
                            placeholder="Title"
                            placeholderTextColor={colors.textSecondary}
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={newHomework.title}
                            onChangeText={t => setNewHomework({ ...newHomework, title: t })}
                        />
                        <TextInput
                            placeholder="Subject"
                            placeholderTextColor={colors.textSecondary}
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10 }}
                            value={newHomework.subject}
                            onChangeText={t => setNewHomework({ ...newHomework, subject: t })}
                        />

                        <Text style={{ color: colors.textSecondary, marginBottom: 5, fontSize: 12 }}>Select Grade:</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
                            {grades.map(g => (
                                <TouchableOpacity
                                    key={g}
                                    onPress={() => setNewHomework({ ...newHomework, grade: g })}
                                    style={{
                                        padding: 8, borderRadius: 8, borderWidth: 1,
                                        borderColor: newHomework.grade === g ? colors.primary : colors.border,
                                        backgroundColor: newHomework.grade === g ? colors.primary + '20' : 'transparent'
                                    }}
                                >
                                    <Text style={{ color: colors.text, fontSize: 12 }}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput
                            placeholder="Description"
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            numberOfLines={3}
                            style={{ borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 8, color: colors.text, marginBottom: 10, height: 80 }}
                            value={newHomework.description}
                            onChangeText={t => setNewHomework({ ...newHomework, description: t })}
                        />

                        <TouchableOpacity onPress={pickAttachment} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, borderStyle: 'dashed' }}>
                            <Ionicons name="attach" size={24} color={colors.primary} />
                            <Text style={{ color: colors.textSecondary }}>{newHomework.file ? "File Attached" : "Attach Image (Optional)"}</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => setCreateHomeworkVisible(false)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: colors.text }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveNewHomework} style={{ flex: 1, padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Assign</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
    },
    headerSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
        fontFamily: 'monospace'
    },
    logoutButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: colors.background,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        padding: 10,
        justifyContent: 'space-around',
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    activeTab: {
        backgroundColor: colors.primary + '20',
    },
    tabText: {
        color: colors.textSecondary,
        fontWeight: '600',
        fontSize: 12
    },
    activeTabText: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    subTab: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: 'transparent'
    },
    activeSubTab: {
        backgroundColor: colors.primary + '20',
        borderColor: colors.primary,
    },
    subTabText: {
        fontSize: 12,
        color: colors.textSecondary
    },
    activeSubTabText: {
        color: colors.primary,
        fontWeight: 'bold'
    },
    content: {
        flex: 1,
        padding: 20,
    },
    section: {
        marginBottom: 20,
        flex: 1, // Ensure it takes space
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 10,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.warning,
        marginBottom: 10,
        marginTop: 10
    },
    card: {
        backgroundColor: colors.card,
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text
    },
    cardSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.text
    },
    actionBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        opacity: 0.7
    },
    attBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background
    },
    attBtnText: {
        fontWeight: 'bold',
        color: colors.textSecondary
    },
    saveBtn: {
        backgroundColor: colors.primary,
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20
    },
    saveBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16
    }
});
