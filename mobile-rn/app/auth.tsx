import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInAnonymously } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync, savePushTokenToUser } from '../services/notificationService';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, limit } from 'firebase/firestore';
import * as LocalAuthentication from 'expo-local-authentication';

export default function AuthScreen() {
    const router = useRouter();
    const { colors, toggleTheme, isDark } = useTheme();
    const { tenantId, setTenantId, tenantName, tenantLogo } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [isSignUp, setIsSignUp] = useState(true);
    const [isParent, setIsParent] = useState(false); // New Parent Mode
    const [authStage, setAuthStage] = useState<'TENANT' | 'FORM' | 'OTP'>('TENANT');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [linkedStudentPhone, setLinkedStudentPhone] = useState(''); // Parent Mode: Student to link
    const [inputTenantId, setInputTenantId] = useState('');
    const [resolvedTenantId, setResolvedTenantId] = useState(''); // Store the actual DocID
    const [instituteName, setInstituteName] = useState('');
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [selectedGrade, setSelectedGrade] = useState("");
    const [otpCode, setOtpCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const params = useLocalSearchParams();

    // Student Search State
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState<any[]>([]);
    const [studentListCache, setStudentListCache] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [isSearchingStudent, setIsSearchingStudent] = useState(false);

    // Fetch students when entering Parent Form
    useEffect(() => {
        if (authStage === 'FORM' && isParent && resolvedTenantId && studentListCache.length === 0) {
            const fetchStudents = async () => {
                console.log(`[Auth] Fetching students for tenant: ${resolvedTenantId}`);
                try {
                    // Ensure we are authenticated (anonymously) to read Firestore
                    if (!auth.currentUser) {
                        console.log("[Auth] Signing in anonymously for search access...");
                        await signInAnonymously(auth);
                    }

                    // Fetch all users for tenant to avoid case-sensitivity issues in 'role'
                    const q = query(
                        collection(db, "users"),
                        where("tenantId", "==", resolvedTenantId)
                    );
                    const snap = await getDocs(q);
                    console.log(`[Auth] Fetched ${snap.size} users from Firestore`);

                    const list = snap.docs
                        .map(d => ({ id: d.id, ...d.data() } as any))
                        .filter(u => {
                            const r = u.role?.toUpperCase();
                            // Include if role is explicitly STUDENT, or if no role/admin flags present (legacy/simple users)
                            return r === 'STUDENT' || (!r && !u.isAdmin);
                        });

                    console.log(`[Auth] Caching ${list.length} students after filtering`);
                    setStudentListCache(list);
                } catch (e) {
                    console.error("[Auth] Failed to load students for search", e);
                }
            };
            fetchStudents();
        }
    }, [authStage, isParent, resolvedTenantId]);

    const handleStudentSearch = (text: string) => {
        setStudentSearchQuery(text);
        if (!text || text.length < 2) {
            setStudentSearchResults([]);
            return;
        }

        console.log(`[Auth] Searching for "${text}" in ${studentListCache.length} cached students`);
        const lower = text.toLowerCase();
        const matches = studentListCache.filter((s: any) =>
            s.name?.toLowerCase().includes(lower) ||
            s.phoneNumber?.includes(text)
        ).slice(0, 5); // Limit results

        console.log(`[Auth] Found ${matches.length} matches`);
        setStudentSearchResults(matches);
    };

    const selectStudent = (student: any) => {
        setSelectedStudent(student);
        setLinkedStudentPhone(student.phoneNumber || ''); // Auto-fill phone
        setStudentSearchQuery('');
        setStudentSearchResults([]);
        Keyboard.dismiss();
    };

    const validateTenant = async () => {
        const trimmedCode = inputTenantId.trim();
        if (!trimmedCode) { Alert.alert('Error', 'Please enter an Institute Code'); return; }
        setLoading(true);
        try {
            // DEBUG ALERT - REMOVE LATER
            // Alert.alert('DEBUG', `Project: ${db.app.options.projectId}\nSearching for: "${trimmedCode}"`);

            const q = query(collection(db, "tenants"), where("code", "==", trimmedCode));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const tenantDoc = snapshot.docs[0];
                const tenantId = tenantDoc.id;
                setResolvedTenantId(tenantId);
                setInstituteName(tenantDoc.data().name || tenantDoc.data().institute_name || "Your Institute");

                const configDoc = await getDoc(doc(db, "tenants", tenantId, "metadata", "lists"));
                if (configDoc.exists()) {
                    const grades = configDoc.data().grades || [];
                    setAvailableGrades(grades);
                    if (grades.length > 0) setSelectedGrade(grades[0]);
                }

                setAuthStage('FORM');
            } else {
                // FETCH ALL CODES FOR DEBUGGING
                let debugCodes = "";
                let directText = "";
                try {
                    const allQ = query(collection(db, "tenants"), limit(5));
                    const allSnap = await getDocs(allQ);
                    debugCodes = allSnap.docs.map(d => d.data().code || d.id).join(", ");

                    // Try direct ID lookup
                    const directSnap = await getDoc(doc(db, "tenants", "inst_3abw0"));
                    directText = directSnap.exists() ? `Direct ID (inst_3abw0) FOUND: ${directSnap.data().code}` : "Direct ID (inst_3abw0) NOT FOUND";
                } catch (err: any) {
                    debugCodes = "Error: " + err.message;
                }

                Alert.alert('Invalid Code',
                    `No institute found with code: "${trimmedCode}"\n\n` +
                    `Project: ${db.app.options.projectId}\n` +
                    `Direct Check: ${directText}\n` +
                    `Available: ${debugCodes || "NONE"}`
                );
            }
        } catch (e: any) {
            console.error("Validation Error:", e);
            let msg = 'Could not connect to the server. Please check your internet.';
            if (e.message.includes('permission-denied')) msg = 'Access denied while validating institute.';
            Alert.alert('Institute Validation Failed', msg);
        } finally {
            setLoading(false);
        }
    };

    const [password, setPassword] = useState('');

    const handleAuthAction = async () => {
        // ADMIN LOGIN FLOW
        if (isAdminMode) {
            if (!phoneNumber || !password) {
                Alert.alert("Error", "Please enter Email and Password.");
                return;
            }
            setLoading(true);
            try {
                const userCredential = await signInWithEmailAndPassword(auth, phoneNumber, password); // phoneNumber holds Email here

                // Verify Role
                const uid = userCredential.user.uid;
                const userDoc = await getDoc(doc(db, "users", uid));
                if (userDoc.exists() && (userDoc.data().role === 'admin' || userDoc.data().role === 'ADMIN')) {
                    await setTenantId(userDoc.data().tenantId);
                    await AsyncStorage.setItem('user_uid', uid);
                    router.replace('/admin-dashboard');
                } else {
                    Alert.alert("Access Denied", "You do not have Admin privileges.");
                    await auth.signOut();
                }
            } catch (e: any) {
                console.error("Admin Login Error:", e);
                let msg = "Check your email and password.";
                if (e.code === 'auth/invalid-email') msg = "Invalid email format.";
                if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') msg = "Invalid admin email or password.";
                Alert.alert("Admin Login Failed", msg);
            } finally {
                setLoading(false);
            }
            return;
        }

        // ... EXISTING FLOW ...
        if (!phoneNumber || !password) {
            Alert.alert("Error", "Please fill in all fields (Mobile & Password).");
            return;
        }

        // Standardize "Username" to Email for Firebase Auth
        // Ensure phone number is just digits or standard format for the email prefix
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 8) {
            Alert.alert("Error", "Please enter a valid mobile number.");
            return;
        }
        const virtualEmail = `${cleanPhone}@midnightcuriosity.com`;

        setLoading(true);
        try {
            if (isSignUp) {
                // --- SIGN UP FLOW ---
                if (!isParent && (!name || !selectedGrade)) {
                    Alert.alert('Error', 'Please fill all student details');
                    setLoading(false);
                    return;
                } else if (isParent && (!name || !linkedStudentPhone)) {
                    Alert.alert('Error', 'Please fill all parent details');
                    setLoading(false);
                    return;
                }

                // 1. Create Auth User
                const userCredential = await createUserWithEmailAndPassword(auth, virtualEmail, password);
                const user = userCredential.user;
                const userUid = user.uid;

                // 2. Prepare Device ID
                let deviceId = "unknown";
                if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
                else if (Platform.OS === 'android') deviceId = await Application.getAndroidId() || "android-unknown";

                // 3. Create Firestore Profile
                const profileData: any = {
                    name: name,
                    phoneNumber: cleanPhone, // Store raw phone for display/logic
                    tenantId: resolvedTenantId,
                    instituteCode: inputTenantId,
                    deviceId: deviceId,
                    createdAt: new Date().toISOString(),
                    status: 'PENDING'
                };

                if (isParent) {
                    profileData.role = 'PARENT';
                    profileData.linkedStudentPhone = linkedStudentPhone.replace(/[^0-9]/g, '');
                } else {
                    profileData.role = 'STUDENT';
                    profileData.grade = selectedGrade;
                }

                // Save User Doc
                await setDoc(doc(db, "users", userUid), profileData);
                await setTenantId(resolvedTenantId);
                await AsyncStorage.setItem('user_uid', userUid);

                // Update Display Name
                try { await updateProfile(user, { displayName: name }); } catch (e) { }

                router.replace('/approval-pending');

            } else {
                // --- LOGIN FLOW ---
                const userCredential = await signInWithEmailAndPassword(auth, virtualEmail, password);
                const user = userCredential.user;
                const userUid = user.uid;

                // Fetch Profile
                const userDoc = await getDoc(doc(db, "users", userUid));
                if (!userDoc.exists()) {
                    Alert.alert("Error", "User profile not found. Contact Admin.");
                    await auth.signOut();
                    return;
                }

                const userData = userDoc.data();

                // Allow Admin to login via Standard Form too if they try? 
                // Redirect if Admin
                if (userData.role === 'admin' || userData.role === 'ADMIN') {
                    await setTenantId(userData.tenantId);
                    await AsyncStorage.setItem('user_uid', userUid);
                    router.replace('/admin-dashboard');
                    return;
                }

                // Device Binding Check
                let deviceId = "unknown";
                if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
                else if (Platform.OS === 'android') deviceId = await Application.getAndroidId() || "android-unknown";

                if (!userData.deviceId) {
                    // Start binding on first login if missing
                    await setDoc(doc(db, "users", userUid), { deviceId: deviceId }, { merge: true });
                } else if (userData.deviceId !== deviceId) {
                    Alert.alert("Login Blocked", "You are logged in on another device. Contact Admin to reset.");
                    await auth.signOut();
                    return;
                }

                // Check Status
                if (userData.status === 'BLOCKED' || userData.status === 'REJECTED') {
                    Alert.alert("Access Denied", "Your account is disabled.");
                    await auth.signOut();
                    return;
                }

                await AsyncStorage.setItem('user_uid', userUid);
                await setTenantId(userData.tenantId);

                if (isParent || userData.role?.toUpperCase() === 'PARENT') {
                    userData.role = 'PARENT'; // Standardize
                }

                // CHECK BIOMETRICS
                checkBiometrics(userData);
            }
        } catch (error: any) {
            console.error(error);

            // FALLBACK: Manual Firestore Password Check (For Admin-created users or Updated passwords)
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                try {
                    // Sign in anonymously first so Firestore rules allow the read
                    if (!auth.currentUser) {
                        await signInAnonymously(auth);
                    }

                    const q = query(collection(db, "users"), where("phoneNumber", "==", cleanPhone));
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const userDoc = snapshot.docs[0];
                        const userData = userDoc.data();
                        // Verify Password
                        if (userData.password && userData.password === password) {
                            console.log("Logged in via Firestore Password Fallback");

                            const userUid = userDoc.id;

                            if (userData.role === 'admin' || userData.role === 'ADMIN') {
                                await setTenantId(userData.tenantId);
                                await AsyncStorage.setItem('user_uid', userUid);
                                router.replace('/admin-dashboard');
                                return;
                            }

                            let deviceId = "unknown";
                            if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
                            else if (Platform.OS === 'android') deviceId = await Application.getAndroidId() || "android-unknown";

                            if (!userData.deviceId) await setDoc(doc(db, "users", userUid), { deviceId: deviceId }, { merge: true });
                            else if (userData.deviceId !== deviceId) {
                                Alert.alert("Login Blocked", "Logged in on another device.");
                                await auth.signOut();
                                return;
                            }

                            if (userData.status === 'BLOCKED' || userData.status === 'REJECTED') {
                                Alert.alert("Access Denied", "Account disabled.");
                                await auth.signOut();
                                return;
                            }

                            await AsyncStorage.setItem('user_uid', userUid);
                            await setTenantId(userData.tenantId);

                            checkBiometrics(userData);
                            return;
                        }
                    }
                } catch (fallbackError) {
                    console.error("Fallback login failed", fallbackError);
                }
            }

            let msg = "Check your mobile number and password.";
            if (error.code === 'auth/invalid-email') msg = "Invalid phone number format.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = "Incorrect mobile number or password.";
            if (error.code === 'auth/email-already-in-use') msg = "This mobile number is already registered. Try logging in instead.";
            if (error.code === 'auth/weak-password') msg = "Password is too weak. Please use at least 6 characters.";
            if (error.code === 'auth/network-request-failed') msg = "Network error. Please check your connection.";

            Alert.alert("Authentication Failed", msg);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        const checkSupport = async () => {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            const bioEnabled = await AsyncStorage.getItem('biometric_enabled');
            setIsBiometricSupported(hasHardware && isEnrolled && bioEnabled === 'true');

            if (params.autoauth === 'true' && hasHardware && isEnrolled && bioEnabled === 'true' && auth.currentUser) {
                performBiometricAuth();
            }
        };
        checkSupport();
    }, [params.autoauth]);

    const performBiometricAuth = async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: `Login to ${process.env.EXPO_PUBLIC_APP_NAME || "EduPro"}`,
                fallbackLabel: 'Use Password',
            });

            if (result.success) {
                if (auth.currentUser) {
                    setLoading(true);
                    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                    if (userDoc.exists()) {
                        handleNavigation(userDoc.data());
                    } else {
                        Alert.alert("Error", "User profile not found.");
                        setAuthStage('FORM'); // Show login if profile missing
                    }
                    setLoading(false);
                }
            }
        } catch (e) {
            console.error("Biometric auth error:", e);
        }
    };


    const handleNavigation = async (userData: any) => {
        // --- Setup Push Notifications ---
        try {
            const currentUid = auth.currentUser?.uid || userData.id;
            if (currentUid) {
                registerForPushNotificationsAsync().then(token => {
                    if (token) savePushTokenToUser(currentUid, token);
                });
            }
        } catch (e) { console.warn("Push token setup failed", e); }

        const role = userData.role?.toUpperCase();
        if (role === 'PARENT') {
            if (userData.status === 'PENDING') router.replace('/approval-pending');
            else router.replace('/parent-dashboard');
        } else if (role === 'ADMIN') {
            router.replace('/admin-dashboard');
        } else {
            if (userData.status === 'PENDING') router.replace('/approval-pending');
            else router.replace('/grade');
        }
    };

    const checkBiometrics = async (userData: any) => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (hasHardware && isEnrolled) {
                Alert.alert(
                    "Enable Biometrics? 🔒",
                    "Would you like to enable FaceID / TouchID for faster login next time?",
                    [
                        {
                            text: "No",
                            style: "cancel",
                            onPress: () => handleNavigation(userData)
                        },
                        {
                            text: "Yes",
                            onPress: async () => {
                                const result = await LocalAuthentication.authenticateAsync();
                                if (result.success) {
                                    await AsyncStorage.setItem('biometric_enabled', 'true');
                                    await AsyncStorage.setItem('biometric_uid', auth.currentUser?.uid || userData.id || ""); // Store UID for safety
                                    Alert.alert("Success", "Biometric Login Enabled! ✅");
                                }
                                handleNavigation(userData);
                            }
                        }
                    ]
                );
            } else {
                handleNavigation(userData);
            }
        } catch (e) {
            console.warn("Biometric check failed", e);
            handleNavigation(userData);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Admin Toggle */}
                <TouchableOpacity
                    style={[styles.themeToggle, { right: undefined, left: 20, flexDirection: 'row', gap: 5, width: 'auto' }]}
                    onPress={() => {
                        setIsAdminMode(!isAdminMode);
                        if (!isAdminMode) {
                            setAuthStage('FORM');
                            setIsSignUp(false);
                            setIsParent(false);
                            setPhoneNumber("");
                            setPassword("");
                        } else {
                            setAuthStage('TENANT');
                            setPhoneNumber("");
                        }
                    }}
                >
                    <Ionicons name={isAdminMode ? "business" : "settings-outline"} size={20} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Admin</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
                    <Ionicons name={isDark ? "sunny" : "moon"} size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerSpacer} />

                <View style={styles.logoContainer}>
                    {tenantLogo ? (
                        <Image source={{ uri: tenantLogo }} style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 10 }} />
                    ) : (
                        <Text style={styles.brandEmoji}>🚀</Text>
                    )}
                    <Text style={styles.brandTitle}>{tenantName || "EduPro"}</Text>
                </View>

                <View style={styles.card}>
                    {!isAdminMode && (
                        <View style={styles.toggleContainer}>
                            <TouchableOpacity
                                style={[styles.toggleButton, isSignUp && !isParent && styles.toggleButtonActive]}
                                onPress={() => { setIsSignUp(true); setIsParent(false); setAuthStage('TENANT'); }}
                            >
                                <Text style={[styles.toggleText, isSignUp && !isParent && styles.toggleTextActive]}>Student Join</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleButton, isSignUp && isParent && styles.toggleButtonActive]}
                                onPress={() => { setIsSignUp(true); setIsParent(true); setAuthStage('TENANT'); }}
                            >
                                <Text style={[styles.toggleText, isSignUp && isParent && styles.toggleTextActive]}>Parent Join</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
                                onPress={() => { setIsSignUp(false); setAuthStage('FORM'); }}
                            >
                                <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Login</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.headerTitle}>
                        {isAdminMode ? 'Admin Console' : (isParent ? 'Parent Portal' : (isSignUp ? 'Create Account' : 'Welcome Back'))}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {isAdminMode ? 'Login to manage institute' : (authStage === 'TENANT' ? 'Validate your Institute' :
                            isParent ? 'Track your child\'s progress' : 'Enter your details to start learning')}
                    </Text>

                    <View style={styles.inputContainer}>
                        {/* STAGE 1: TENANT CHECK (Skipped if Admin) */}
                        {authStage === 'TENANT' && !isAdminMode && (
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Institute Code</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter Code (e.g. ProWin_id)"
                                    placeholderTextColor={colors.textSecondary}
                                    value={inputTenantId}
                                    onChangeText={setInputTenantId}
                                    autoCapitalize="none"
                                />
                            </View>
                        )}

                        {/* STAGE 2: FORM */}
                        {authStage === 'FORM' && (
                            <>
                                {!isAdminMode && instituteName ? (
                                    <View style={[styles.infoBox, { backgroundColor: colors.primary + '10', marginBottom: 20, padding: 12, borderRadius: 12 }]}>
                                        <Text style={{ color: colors.primary, fontWeight: 'bold', textAlign: 'center' }}>🏫 {instituteName}</Text>
                                    </View>
                                ) : null}

                                {isSignUp && !isAdminMode && (
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Full Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="John Doe"
                                            placeholderTextColor={colors.textSecondary}
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>
                                )}

                                <View style={styles.inputWrapper}>
                                    <Text style={styles.label}>{isAdminMode ? "Admin Email" : "Mobile Number"}</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder={isAdminMode ? "admin@example.com" : "+1 555 123 4567"}
                                        placeholderTextColor={colors.textSecondary}
                                        keyboardType={isAdminMode ? "email-address" : "phone-pad"}
                                        autoCapitalize="none"
                                        value={phoneNumber}
                                        onChangeText={setPhoneNumber}
                                    />
                                </View>

                                {isSignUp && isParent && !isAdminMode && (
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Select Your Child</Text>

                                        {selectedStudent ? (
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: colors.primary + '15',
                                                padding: 12,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: colors.primary
                                            }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.text }}>{selectedStudent.name}</Text>
                                                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Grade: {selectedStudent.grade} • Mobile: {selectedStudent.phoneNumber?.slice(-4).padStart(10, '*')}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => { setSelectedStudent(null); setLinkedStudentPhone(''); }}>
                                                    <Ionicons name="close-circle" size={24} color={colors.primary} />
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View>
                                                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', padding: 10 }]}>
                                                    <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                                                    <TextInput
                                                        style={{ flex: 1, color: colors.text, fontSize: 16 }}
                                                        placeholder="Search by Name"
                                                        placeholderTextColor={colors.textSecondary}
                                                        value={studentSearchQuery}
                                                        onChangeText={handleStudentSearch}
                                                    />
                                                </View>

                                                {studentSearchResults.length > 0 && (
                                                    <View style={{
                                                        backgroundColor: colors.card,
                                                        borderWidth: 1,
                                                        borderColor: colors.border,
                                                        borderTopWidth: 0,
                                                        borderRadius: 8,
                                                        marginTop: 4,
                                                        maxHeight: 200
                                                    }}>
                                                        {studentSearchResults.map((student) => (
                                                            <TouchableOpacity
                                                                key={student.id}
                                                                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                                                                onPress={() => selectStudent(student)}
                                                            >
                                                                <Text style={{ fontWeight: '600', color: colors.text }}>{student.name}</Text>
                                                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Grade: {student.grade || 'N/A'}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        )}

                                        {/* Hidden Input for Logic Compatibility */}
                                        {/* <TextInput value={linkedStudentPhone} style={{ height: 0 }} /> */}
                                    </View>
                                )}

                                {isSignUp && !isParent && !isAdminMode && availableGrades.length > 0 && (
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Select Grade</Text>
                                        <View style={styles.gradeContainer}>
                                            {availableGrades.map((g) => (
                                                <TouchableOpacity
                                                    key={g}
                                                    style={[styles.gradeChip, selectedGrade === g && styles.gradeChipActive]}
                                                    onPress={() => setSelectedGrade(g)}
                                                >
                                                    <Text style={[styles.gradeText, selectedGrade === g && styles.gradeTextActive]}>
                                                        {g}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                )}
                            </>
                        )}

                        {/* STAGE 3: PASSWORD (Merged into FORM) */}
                        {authStage === 'FORM' && (
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Password</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter Password"
                                    placeholderTextColor={colors.textSecondary}
                                    secureTextEntry
                                    value={password}
                                    onChangeText={setPassword}
                                />
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.mainButton}
                        onPress={() => {
                            if (authStage === 'TENANT' && !isAdminMode) validateTenant();
                            else handleAuthAction();
                        }}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.mainButtonText}>
                                {isAdminMode ? 'Login as Admin' : (authStage === 'TENANT' ? 'Validate Institute' :
                                    isSignUp ? 'Sign Up' : 'Login')}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {isBiometricSupported && !isSignUp && authStage === 'FORM' && (
                        <TouchableOpacity
                            style={[styles.mainButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary, marginTop: 0 }]}
                            onPress={performBiometricAuth}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Ionicons name="finger-print" size={24} color={colors.primary} />
                                <Text style={[styles.mainButtonText, { color: colors.primary }]}>Login with Biometrics</Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {authStage !== 'TENANT' && !isAdminMode && (
                        <TouchableOpacity onPress={() => { setAuthStage('TENANT'); setPassword(''); }}>
                            <Text style={styles.changeNumberText}>Change Institute / Back</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        paddingBottom: 100,
    },
    themeToggle: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        padding: 8,
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border
    },
    headerSpacer: {
        height: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    brandEmoji: {
        fontSize: 48,
        marginBottom: 10,
    },
    brandTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.text,
        letterSpacing: 1,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        width: '100%',
        borderWidth: 1,
        borderColor: colors.border,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
            },
            android: {
                elevation: 10,
            },
            web: {
                boxShadow: `0px 4px 10px ${colors.primary}1A`,
            }
        }),
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 16,
        padding: 4,
        marginBottom: 24,
        width: '100%',
        borderWidth: 1,
        borderColor: colors.border,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: 'transparent'
    },
    toggleButtonActive: {
        backgroundColor: colors.card, // or just rely on transparency vs background
        borderWidth: 1,
        borderColor: colors.border
    },
    toggleText: {
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    toggleTextActive: {
        color: colors.text,
        fontWeight: 'bold',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 32,
        textAlign: 'center',
    },
    inputContainer: {
        width: '100%',
        marginBottom: 8,
    },
    inputWrapper: {
        marginBottom: 20,
    },
    label: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 8,
        marginLeft: 4,
        fontWeight: '500',
    },
    input: {
        backgroundColor: colors.background, // fallback from inputBackground
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: colors.text,
        width: '100%',
    },
    inputDisabled: {
        backgroundColor: colors.card,
        color: colors.textSecondary,
    },
    mainButton: {
        backgroundColor: colors.primary,
        width: '100%',
        height: 52,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 8,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
            web: {
                boxShadow: `0px 4px 8px ${colors.primary}4D`,
            }
        }),
    },
    mainButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    changeNumberText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 0,
    },
    gradeContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    gradeChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    gradeChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    gradeText: {
        color: colors.textSecondary,
        fontSize: 13,
        fontWeight: '500',
    },
    gradeTextActive: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
    },
});
