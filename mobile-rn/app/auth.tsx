import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../services/firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInAnonymously, sendPasswordResetEmail } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync, savePushTokenToUser } from '../services/notificationService';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebaseConfig';
import * as LocalAuthentication from 'expo-local-authentication';
import { configureGoogleSignIn, signInWithGoogle } from '../services/googleAuthService';

export default function AuthScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, toggleTheme, isDark } = useTheme();
    const { tenantId, setTenantId, tenantName, tenantLogo } = useTenant();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    const [isSignUp, setIsSignUp] = useState(true);
    const [isParent, setIsParent] = useState(false); // New Parent Mode
    const [authStage, setAuthStage] = useState<'TENANT' | 'FORM' | 'OTP'>('TENANT');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [linkedStudentPhone, setLinkedStudentPhone] = useState(''); // Parent Mode: Student to link
    const [inputTenantId, setInputTenantId] = useState('');
    const [resolvedTenantId, setResolvedTenantId] = useState(''); // Store the actual DocID
    const [instituteName, setInstituteName] = useState('');
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);
    const [batchList, setBatchList] = useState<Record<string, string[]>>({});
    const [name, setName] = useState('');
    const [selectedGrade, setSelectedGrade] = useState("");
    const [selectedBatch, setSelectedBatch] = useState<string>("General Batch");
    const [loading, setLoading] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [isInstituteSignUp, setIsInstituteSignUp] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const params = useLocalSearchParams();

    // Effect to auto-select batch when grade changes
    useEffect(() => {
        if (selectedGrade && batchList[selectedGrade] && batchList[selectedGrade].length > 0) {
            if (!batchList[selectedGrade].includes(selectedBatch)) {
                setSelectedBatch(batchList[selectedGrade][0]);
            }
        } else if (selectedBatch !== "General Batch") {
            setSelectedBatch("General Batch");
        }
    }, [selectedGrade, batchList, selectedBatch]);

    // Student Search State
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState<any[]>([]);
    const [studentListCache, setStudentListCache] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [isSearchingStudent, setIsSearchingStudent] = useState(false);

    // Institute Search State
    const [tenantSearchQuery, setTenantSearchQuery] = useState('');
    const [tenantSearchResults, setTenantSearchResults] = useState<any[]>([]);
    const [tenantListCache, setTenantListCache] = useState<any[]>([]);
    const [isSearchingTenant, setIsSearchingTenant] = useState(false);
    const [showManualCode, setShowManualCode] = useState(false);
    const [isForgot, setIsForgot] = useState(false);

    // Initialize Google Sign-In
    useEffect(() => {
        configureGoogleSignIn();
    }, []);

    // Fetch institutes when in TENANT stage
    useEffect(() => {
        if (authStage === 'TENANT' && !isAdminMode && tenantListCache.length === 0) {
            const fetchInstitutes = async () => {
                setIsSearchingTenant(true);
                try {
                    // Check if authenticated to read, else sign in anonymously
                    if (!auth.currentUser) {
                        try {
                            await signInAnonymously(auth);
                            console.log("[Auth] Signed in anonymously for public read.");
                        } catch (anonErr) {
                            console.warn("[Auth] Anonymous sign-in failed, proceeding with public read:", anonErr);
                        }
                    }
                    // Query for isActive true as primary filter, status might be missing on older records
                    const q = query(collection(db, "tenants"), where("isActive", "==", true));
                    const snap = await getDocs(q);
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setTenantListCache(list);
                } catch (e) {
                    console.error("[Auth] Failed to load institutes", e);
                } finally {
                    setIsSearchingTenant(false);
                }
            };
            fetchInstitutes();
        }
    }, [authStage, isAdminMode, tenantListCache.length]);

    const handleTenantSearch = (text: string) => {
        setTenantSearchQuery(text);
        if (!text || text.length < 2) {
            setTenantSearchResults([]);
            return;
        }
        const lowerText = text.toLowerCase();
        const matches = tenantListCache.filter((t: any) => 
            (t.name?.toLowerCase() || '').includes(lowerText) || 
            (t.code?.toLowerCase() || '').includes(lowerText)
        ).slice(0, 5);
        setTenantSearchResults(matches);
    };

    const selectTenant = async (tenant: any) => {
        setLoading(true);
        try {
            setResolvedTenantId(tenant.id);
            setInstituteName(tenant.name || tenant.institute_name || "Your Institute");

            const configDoc = await getDoc(doc(db, "tenants", tenant.id, "metadata", "lists"));
            if (configDoc.exists()) {
                const data = configDoc.data();
                const grades = data.grades || [];
                const batches = data.batches || {};
                setAvailableGrades(grades);
                setBatchList(batches);
                if (grades.length > 0) {
                    setSelectedGrade(grades[0]);
                    const initialBatches = batches[grades[0]] || ["General Batch"];
                    if (initialBatches.length > 0) setSelectedBatch(initialBatches[0]);
                }
            }
            Keyboard.dismiss();
            setAuthStage('FORM');
        } catch (e) {
            console.error("Error setting up tenant defaults:", e);
            Alert.alert("Error", "Could not load institute configuration.");
        } finally {
            setLoading(false);
        }
    };

    // Fetch students when entering Parent Form
    useEffect(() => {
        if (authStage === 'FORM' && isParent && resolvedTenantId && studentListCache.length === 0) {
            const fetchStudents = async () => {
                console.log(`[Auth] Fetching students for tenant: ${resolvedTenantId}`);
                try {
                    // Ensure we are authenticated (anonymously) to read Firestore if needed
                    if (!auth.currentUser) {
                        try {
                            console.log("[Auth] Signing in anonymously for search access...");
                            await signInAnonymously(auth);
                        } catch (anonErr) {
                            console.warn("[Auth] Anonymous sign-in failed (students search), proceeding anyway:", anonErr);
                        }
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
    }, [authStage, isParent, resolvedTenantId, studentListCache.length]);

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
        // Fallback for direct code entry if still needed (or remove the button entirely)
        // We will keep it just as a hidden Easter egg for direct login
        const trimmedCode = inputTenantId.trim();
        if (!trimmedCode) { Alert.alert('Error', 'Please enter an Institute Code or search above'); return; }
        setLoading(true);
        try {
            const q = query(collection(db, "tenants"), where("code", "==", trimmedCode));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const tenantDoc = snapshot.docs[0];
                await selectTenant({ id: tenantDoc.id, ...tenantDoc.data() });
            } else {
                Alert.alert('Invalid Code', `No institute found with code: "${trimmedCode}"`);
            }
        } catch (e) {
            console.error("Validation Error:", e);
            Alert.alert('Institute Validation Failed', 'Could not connect to the server.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoading(true);
        try {
            const firebaseUser = await signInWithGoogle();
            if (!firebaseUser) throw new Error("Google login succeeded but no Firebase user returned.");

            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                await AsyncStorage.setItem('user_uid', firebaseUser.uid);
                await setTenantId(userData.tenantId);

                let deviceId = "unknown";
                try {
                    if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
                    else if (Platform.OS === 'android') deviceId = await Application.getAndroidId() || "android-unknown";
                    await setDoc(doc(db, "users", firebaseUser.uid), { deviceId: deviceId }, { merge: true });
                } catch (devErr) {
                    console.warn("[Auth] Failed to update device ID:", devErr);
                }

                if (userData.status === 'BLOCKED' || userData.status === 'REJECTED') {
                    Alert.alert("Access Denied", "Your account is disabled.");
                    await auth.signOut();
                    return;
                }

                checkBiometrics(userData);
            } else {
                router.replace('/complete-profile' as any);
            }
        } catch (e: any) {
            console.error("Google auth error:", e);
            const isCancel = e.message?.includes('developer') || e.code === 'SIGN_IN_CANCELLED' || e.code === '12501';
            if (!isCancel) {
                Alert.alert("Google Authentication Failed", e.message || "Failed to log in with Google.");
            }
        } finally {
            setLoading(false);
        }
    };

    const [password, setPassword] = useState('');

    const handleAuthAction = async () => {
        // ADMIN FLOW
        if (isAdminMode) {
            if (isInstituteSignUp) {
                // --- INSTITUTE SIGN UP ---
                if (!instituteName || !name || !phoneNumber || !password) {
                    Alert.alert("Error", "Please fill in all fields (Institute Name, Owner Name, Email/Phone, Password).");
                    return;
                }
                setLoading(true);
                try {
                    const isPhone = /^\+?[0-9\s]+$/.test(phoneNumber) && !phoneNumber.includes('@');
                    let emailToUse = phoneNumber;
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

                    if (isPhone) {
                        if (cleanPhone.length < 8) {
                            Alert.alert("Error", "Invalid phone number length.");
                            setLoading(false);
                            return;
                        }
                        emailToUse = `${cleanPhone}@midnightcuriosity.com`;
                    }

                    // 1. Create Auth User
                    const userCredential = await createUserWithEmailAndPassword(auth, emailToUse, password);
                    const user = userCredential.user;

                    // 2. Generate Tenant ID (matches web portal logic)
                    const generatedTenantId = `inst_${Math.random().toString(36).substring(2, 7)}`;

                    // 3. Create Admin Profile
                    const userData: any = {
                        email: emailToUse,
                        name: name,
                        role: 'admin',
                        tenantId: generatedTenantId,
                        status: 'PENDING_APPROVAL',
                        createdAt: serverTimestamp()
                    };
                    if (isPhone) userData.phoneNumber = cleanPhone;

                    await setDoc(doc(db, "users", user.uid), userData);

                    // 4. Create Tenant Document
                    await setDoc(doc(db, "tenants", generatedTenantId), {
                        name: instituteName,
                        code: generatedTenantId,
                        adminUid: user.uid,
                        createdAt: serverTimestamp(),
                        isActive: false,
                        status: 'PENDING_APPROVAL'
                    });

                    await setTenantId(generatedTenantId);
                    await AsyncStorage.setItem('user_uid', user.uid);
                    
                    try { await updateProfile(user, { displayName: name }); } catch { }

                    router.replace('/approval-pending');

                } catch (e: any) {
                    console.error("Institute Signup Error:", e);
                    let msg = e.message;
                    if (e.code === 'auth/email-already-in-use') msg = "This email/phone is already registered.";
                    Alert.alert("Registration Failed", msg);
                } finally {
                    setLoading(false);
                }
                return;
            }

            // --- ADMIN LOGIN ---
            if (!phoneNumber || !password) {
                Alert.alert("Error", "Please enter Email/Phone and Password.");
                return;
            }
            setLoading(true);
            try {
                const isPhone = /^\+?[0-9\s]+$/.test(phoneNumber) && !phoneNumber.includes('@');
                let emailToUse = phoneNumber;
                if (isPhone) {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    emailToUse = `${cleanPhone}@midnightcuriosity.com`;
                }

                const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);

                // Verify Role
                const uid = userCredential.user.uid;
                const userDoc = await getDoc(doc(db, "users", uid));
                if (userDoc.exists() && (userDoc.data().role === 'admin' || userDoc.data().role === 'ADMIN')) {
                    const userData = userDoc.data();
                    await setTenantId(userData.tenantId);
                    await AsyncStorage.setItem('user_uid', uid);
                    
                    if (userData.status === 'PENDING_APPROVAL' || userData.status === 'PENDING') {
                        router.replace('/approval-pending');
                    } else {
                        router.replace('/admin-dashboard');
                    }
                } else {
                    Alert.alert("Access Denied", "You do not have Admin privileges.");
                    await auth.signOut();
                }
            } catch (e: any) {
                console.error("Admin Login Error:", e);
                let msg = "Check your email/phone and password.";
                if (e.code === 'auth/invalid-email' || e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') msg = "Invalid admin credentials.";
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
                    profileData.batch = selectedBatch || 'General Batch';
                }

                // Save User Doc
                await setDoc(doc(db, "users", userUid), profileData);
                await setTenantId(resolvedTenantId);
                await AsyncStorage.setItem('user_uid', userUid);

                // Update Display Name
                try { await updateProfile(user, { displayName: name }); } catch { }

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

                // Update binding when user authenticates successfully
                await setDoc(doc(db, "users", userUid), { deviceId: deviceId }, { merge: true });

                // Check Status
                if (userData.status === 'BLOCKED' || userData.status === 'REJECTED') {
                    Alert.alert("Access Denied", "Your account is disabled.");
                    await auth.signOut();
                    return;
                }

                await AsyncStorage.setItem('user_uid', userUid);
                await setTenantId(userData.tenantId);

                // FIX: Only use isParent state for NEW signups. For existing users (login),
                // we MUST trust the Firestore role exclusively to avoid role-leaking.
                if (!userData.role) {
                    if (isParent) userData.role = 'PARENT';
                    else userData.role = 'STUDENT';
                } else {
                     userData.role = userData.role.toUpperCase();
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

                            // Update binding when user authenticates successfully
                            await setDoc(doc(db, "users", userUid), { deviceId: deviceId }, { merge: true });

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
    const performBiometricAuth = React.useCallback(async () => {
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
    }, [auth.currentUser, router]);

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
    }, [params.autoauth, performBiometricAuth]);


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
            else router.replace('/(tabs)/parent-home');
        } else if (role === 'ADMIN') {
            router.replace('/admin-dashboard');
        } else {
            if (userData.status === 'PENDING') router.replace('/approval-pending');
            else router.replace('/grade');
        }
    };

    const handleForgotPassword = async () => {
        const identifier = isAdminMode ? phoneNumber : phoneNumber.replace(/[^0-9]/g, '');
        if (!identifier) {
            Alert.alert("Error", "Please enter your " + (isAdminMode ? "Email" : "Mobile Number") + " first.");
            return;
        }

        setLoading(true);
        try {
            if (isAdminMode) {
                await sendPasswordResetEmail(auth, identifier);
                Alert.alert("Success", "Password reset email sent! Please check your inbox.");
            } else {
                if (!name.trim()) {
                    Alert.alert("Required", "Please enter your Full Name so the Administrator can identify you.");
                    return;
                }
                
                const requestPasswordReset = httpsCallable(functions, 'requestPasswordReset');
                await requestPasswordReset({ 
                    phoneNumber: identifier, 
                    studentName: name, 
                    type: isParent ? 'PARENT' : 'STUDENT',
                    tenantId: resolvedTenantId
                });
                
                Alert.alert(
                    "Request Sent", 
                    "We've notified your Institute Administrator. \n\nThey will reset your password and contact you via WhatsApp shortly."
                );
            }
            setIsForgot(false);
        } catch (e: any) {
            console.error("Reset Error:", e);
            Alert.alert("Error", "Failed to process request. " + (e.message || ""));
        } finally {
            setLoading(false);
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
                            setIsInstituteSignUp(false); 
                            setIsParent(false);
                            setPhoneNumber("");
                            setPassword("");
                        } else {
                            setAuthStage('TENANT');
                            setIsInstituteSignUp(false);
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
                    {isAdminMode ? (
                        <View style={styles.toggleContainer}>
                            <TouchableOpacity
                                style={[styles.toggleButton, !isInstituteSignUp && styles.toggleButtonActive]}
                                onPress={() => setIsInstituteSignUp(false)}
                            >
                                <Text style={[styles.toggleText, !isInstituteSignUp && styles.toggleTextActive]}>Admin Login</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleButton, isInstituteSignUp && styles.toggleButtonActive]}
                                onPress={() => setIsInstituteSignUp(true)}
                            >
                                <Text style={[styles.toggleText, isInstituteSignUp && styles.toggleTextActive]}>Register Institute</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
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
                                onPress={() => { 
                                    setIsSignUp(false); 
                                    setIsParent(false); // Reset isParent when going to Login
                                    setAuthStage('FORM'); 
                                }}
                            >
                                <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Login</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.headerTitle}>
                        {isForgot ? 'Reset Password' : (isAdminMode ? (isInstituteSignUp ? 'Institute Registration' : 'Admin Console') : (isParent ? 'Parent Portal' : (isSignUp ? 'Create Account' : 'Welcome Back')))}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {isForgot ? 'Get back into your account' : (isAdminMode ? (isInstituteSignUp ? 'Grow your education brand' : 'Login to manage institute') : (authStage === 'TENANT' ? 'Validate your Institute' :
                            isParent ? 'Track your child\'s progress' : 'Enter your details to start learning'))}
                    </Text>

                    <View style={styles.inputContainer}>
                        {/* STAGE 1: TENANT CHECK (Skipped if Admin) */}
                        {authStage === 'TENANT' && !isAdminMode && (
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Search Institute</Text>
                                <View style={[styles.input, { padding: 0, justifyContent: 'center' }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                                        <Ionicons name="search" size={20} color={colors.textSecondary} />
                                        <TextInput
                                            style={{ flex: 1, padding: 12, color: colors.text }}
                                            placeholder="Enter Institute Name..."
                                            placeholderTextColor={colors.textSecondary}
                                            value={tenantSearchQuery}
                                            onChangeText={handleTenantSearch}
                                            autoCapitalize="words"
                                            autoCorrect={false}
                                        />
                                        {isSearchingTenant && <ActivityIndicator size="small" color={colors.primary} />}
                                    </View>
                                </View>

                                {tenantSearchResults.length > 0 && (
                                    <View style={{ backgroundColor: colors.card, borderRadius: 12, marginTop: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                                        {tenantSearchResults.map((t, idx) => (
                                            <TouchableOpacity 
                                                key={t.id} 
                                                onPress={() => selectTenant(t)}
                                                style={{ padding: 16, borderBottomWidth: idx < tenantSearchResults.length - 1 ? 1 : 0, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}
                                            >
                                                <Ionicons name="business" size={24} color={colors.primary} style={{ marginRight: 12 }} />
                                                <View>
                                                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{t.name}</Text>
                                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Code: {t.code}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                {tenantSearchQuery.length > 0 && tenantSearchResults.length === 0 && !isSearchingTenant && !showManualCode && (
                                    <View style={{ padding: 16, alignItems: 'center' }}>
                                        <Text style={{ color: colors.textSecondary }}>No institutes found matching &quot;{tenantSearchQuery}&quot;.</Text>
                                        <TouchableOpacity onPress={() => setShowManualCode(true)}>
                                          <Text style={{ color: colors.primary, marginTop: 8, fontSize: 13, fontWeight: '600' }}>Have an Institute Code? Enter manually ⌨️</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {showManualCode && (
                                    <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20 }}>
                                        <Text style={styles.label}>Institute Code (Manual)</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Enter Code (e.g. ProWin_id)"
                                            placeholderTextColor={colors.textSecondary}
                                            value={inputTenantId}
                                            onChangeText={setInputTenantId}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity 
                                            onPress={() => setShowManualCode(false)}
                                            style={{ marginTop: 10, alignSelf: 'center' }}
                                        >
                                            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Back to Search</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.mainButton, { marginTop: 20 }]}
                                            onPress={validateTenant}
                                            disabled={loading}
                                        >
                                            {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.mainButtonText}>Validate Code</Text>}
                                        </TouchableOpacity>
                                    </View>
                                )}
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

                                { (isSignUp || (isAdminMode && isInstituteSignUp)) && (
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>{isAdminMode ? "Owner Name" : "Full Name"}</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="John Doe"
                                            placeholderTextColor={colors.textSecondary}
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>
                                )}

                                {isAdminMode && isInstituteSignUp && (
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Institute Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="e.g. Curiosity Academy"
                                            placeholderTextColor={colors.textSecondary}
                                            value={instituteName}
                                            onChangeText={setInstituteName}
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
                                                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Class: {selectedStudent.grade} • Mobile: {selectedStudent.phoneNumber?.slice(-4).padStart(10, '*')}</Text>
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
                                                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Class: {student.grade || 'N/A'}</Text>
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
                                    <>
                                        <View style={styles.inputWrapper}>
                                            <Text style={styles.label}>Select Class</Text>
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
                                        
                                        <View style={styles.inputWrapper}>
                                            <Text style={styles.label}>Select Batch</Text>
                                            <View style={styles.gradeContainer}>
                                                {(batchList[selectedGrade] || ["General Batch"]).map((b: string) => (
                                                    <TouchableOpacity
                                                        key={b}
                                                        style={[styles.gradeChip, selectedBatch === b && styles.gradeChipActive]}
                                                        onPress={() => setSelectedBatch(b)}
                                                    >
                                                        <Text style={[styles.gradeText, selectedBatch === b && styles.gradeTextActive]}>
                                                            {b}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </>
                                )}
                            </>
                        )}

                        {/* STAGE 3: PASSWORD (Merged into FORM) */}
                        {authStage === 'FORM' && !isForgot && (
                            <View style={styles.inputWrapper}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={[styles.label, { marginBottom: 0 }]}>Password</Text>
                                    {!isSignUp && (
                                        <TouchableOpacity onPress={() => setIsForgot(true)}>
                                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Forgot?</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
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

                        {/* FORGOT PASSWORD VIEW */}
                        {isForgot && (
                            <View style={styles.inputWrapper}>
                                {!isAdminMode && (
                                    <>
                                        <Text style={styles.label}>Full Name</Text>
                                        <TextInput
                                            style={[styles.input, { marginBottom: 12 }]}
                                            placeholder="Enter your name"
                                            placeholderTextColor={colors.textSecondary}
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </>
                                )}
                                <Text style={styles.label}>{isAdminMode ? "Confirm Admin Email" : "Confirm Mobile Number"}</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={isAdminMode ? "admin@example.com" : "9876543210"}
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType={isAdminMode ? "email-address" : "phone-pad"}
                                    value={phoneNumber}
                                    onChangeText={setPhoneNumber}
                                />
                                {!isAdminMode && (
                                    <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.primary + '10', borderRadius: 8 }}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                                            Note: Your request will be sent to the Institute Administrator. They will reach out to you via WhatsApp once your password is reset.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Show Main Button ONLY if not in TENANT stage (search selects automatically) or if manual code is shown */}
                    {(authStage !== 'TENANT' || isAdminMode) && (
                        <TouchableOpacity
                            style={styles.mainButton}
                            onPress={isForgot ? handleForgotPassword : handleAuthAction}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.background} />
                            ) : (
                                <Text style={styles.mainButtonText}>
                                    {isForgot ? 'Send Reset Link' : (isAdminMode ? (isInstituteSignUp ? 'Register Institute' : 'Login as Admin') : (isSignUp ? 'Sign Up' : 'Login'))}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}

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
                        <TouchableOpacity onPress={isForgot ? () => setIsForgot(false) : () => { setAuthStage('TENANT'); setPassword(''); }}>
                            <Text style={styles.changeNumberText}>
                                {isForgot ? 'Back to Login' : 'Change Institute / Back'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {isAdminMode && isForgot && (
                        <TouchableOpacity onPress={() => setIsForgot(false)}>
                            <Text style={styles.changeNumberText}>Back to Login</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {!isAdminMode && !isForgot && (
                    <View style={{ width: '100%', alignItems: 'center', marginTop: 20 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                            <Text style={{ color: colors.textSecondary, marginHorizontal: 16, fontSize: 14, fontWeight: '600' }}>OR</Text>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                        </View>
                        <TouchableOpacity
                            style={[styles.mainButton, { 
                                backgroundColor: colors.card, 
                                borderWidth: 1, 
                                borderColor: colors.border, 
                                marginTop: 0,
                                flexDirection: 'row',
                                gap: 12,
                                justifyContent: 'center',
                                alignItems: 'center',
                                shadowColor: 'transparent',
                                elevation: 0
                            }]}
                            onPress={handleGoogleAuth}
                            disabled={loading}
                        >
                            <Ionicons name="logo-google" size={22} color={colors.text} />
                            <Text style={[styles.mainButtonText, { color: colors.text, fontSize: 16 }]}>
                                Continue with Google
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 40,
    },
    themeToggle: {
        position: 'absolute',
        top: insets.top + 10,
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
        color: colors.background,
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
        color: colors.background,
        fontWeight: 'bold',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
    },
});
