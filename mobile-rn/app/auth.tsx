import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInAnonymously } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { doc, setDoc, query, collection, where, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
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
    const [isAdminMode, setIsAdminMode] = useState(false); // NEW: Admin Mode

    const validateTenant = async () => {
        if (!inputTenantId) { console.warn('Please enter an Institute Code'); return; }
        setLoading(true);
        try {
            const q = query(collection(db, "tenants"), where("code", "==", inputTenantId));
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
                Alert.alert('Invalid Code', 'No institute found with this code.');
            }
        } catch (e: any) {
            console.error("Validation Error:", e);
            Alert.alert('Error', `Failed to validate code: ${e.message}`);
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
                Alert.alert("Login Failed", e.message);
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
                    profileData.linkedStudentPhone = linkedStudentPhone;
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

                if (isParent) {
                    userData.role = 'PARENT'; // Ensure role context
                }

                // CHECK BIOMETRICS
                checkBiometrics(userData);
            }
        } catch (error: any) {
            console.error(error);

            // FALLBACK: Manual Firestore Password Check (For Admin-created users or Updated passwords)
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                try {
                    const q = query(collection(db, "users"), where("phoneNumber", "==", cleanPhone));
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const userDoc = snapshot.docs[0];
                        const userData = userDoc.data();
                        // Verify Password
                        if (userData.password && userData.password === password) {
                            console.log("Logged in via Firestore Password Fallback");
                            await signInAnonymously(auth);

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

            let msg = error.message;
            if (error.code === 'auth/invalid-email') msg = "Invalid Phone Number.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = "Invalid Mobile or Password.";
            if (error.code === 'auth/email-already-in-use') msg = "This mobile number is already registered. Please Login.";
            if (error.code === 'auth/weak-password') msg = "Password must be at least 6 characters.";
            Alert.alert("Authentication Failed", msg);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigation = (userData: any) => {
        if (userData.role === 'PARENT') {
            if (userData.status === 'PENDING') router.replace('/approval-pending');
            else router.replace('/parent-dashboard');
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
                                style={[styles.toggleButton, !isSignUp && !isParent && styles.toggleButtonActive]}
                                onPress={() => { setIsSignUp(false); setIsParent(false); setAuthStage('FORM'); }}
                            >
                                <Text style={[styles.toggleText, !isSignUp && !isParent && styles.toggleTextActive]}>Login</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleButton, isSignUp && isParent && styles.toggleButtonActive]}
                                onPress={() => { setIsSignUp(true); setIsParent(true); setAuthStage('TENANT'); }}
                            >
                                <Text style={[styles.toggleText, isSignUp && isParent && styles.toggleTextActive]}>Parent Join</Text>
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
                                        <Text style={styles.label}>Student's Mobile Number (to link)</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="+1 555 987 6543"
                                            placeholderTextColor={colors.textSecondary}
                                            keyboardType="phone-pad"
                                            value={linkedStudentPhone}
                                            onChangeText={setLinkedStudentPhone}
                                        />
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
