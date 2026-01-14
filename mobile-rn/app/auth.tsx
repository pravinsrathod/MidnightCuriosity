import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebaseConfig';

import { signInAnonymously, updateProfile } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { doc, setDoc, query, collection, where, getDocs, getDoc } from 'firebase/firestore';

export default function AuthScreen() {
    const router = useRouter();
    const { colors, toggleTheme, isDark } = useTheme();
    const { setTenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [isSignUp, setIsSignUp] = useState(true);
    const [authStage, setAuthStage] = useState<'TENANT' | 'FORM' | 'OTP'>('TENANT');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [inputTenantId, setInputTenantId] = useState('');
    const [resolvedTenantId, setResolvedTenantId] = useState(''); // Store the actual DocID
    const [instituteName, setInstituteName] = useState('');
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [selectedGrade, setSelectedGrade] = useState("");
    const [otpCode, setOtpCode] = useState('');
    const [loading, setLoading] = useState(false);

    const validateTenant = async () => {
        if (!inputTenantId) { console.warn('Please enter an Institute Code'); return; }
        setLoading(true);
        try {
            // Query by "code" field, not Doc ID
            const q = query(collection(db, "tenants"), where("code", "==", inputTenantId));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const tenantDoc = snapshot.docs[0];
                const tenantId = tenantDoc.id; // Correct Stable ID
                setResolvedTenantId(tenantId);

                setInstituteName(tenantDoc.data().name || tenantDoc.data().institute_name || "Your Institute");

                // Fetch available grades for this tenant using Stable ID
                const configDoc = await getDoc(doc(db, "tenants", tenantId, "metadata", "lists"));
                if (configDoc.exists()) {
                    const grades = configDoc.data().grades || [];
                    setAvailableGrades(grades);
                    if (grades.length > 0) setSelectedGrade(grades[0]);
                }

                setAuthStage('FORM');
            } else {
                console.warn('Invalid Code', 'No institute found with this code.');
            }
        } catch (e) {
            console.error(e);
            console.warn('Error', 'Failed to validate code.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendOtp = async () => {
        if (!phoneNumber) {
            console.warn('Error', 'Please enter a valid phone number');
            return;
        }
        if (isSignUp && (!name || !selectedGrade)) {
            console.warn('Error', 'Please fill all fields');
            return;
        }

        setLoading(true);
        try {
            console.log(`Sending OTP to ${phoneNumber}`);
            setTimeout(() => {
                setAuthStage('OTP');
                setLoading(false);
                console.warn('OTP Sent', 'Code is 123456 (Mock)');
            }, 1000);

        } catch (error: any) {
            setLoading(false);
            console.warn('Error', error.message);
        }
    };

    const handleVerifyOtp = async () => {
        if (otpCode.length !== 6) {
            console.warn('Error', 'Please enter a 6-digit code');
            return;
        }
        setLoading(true);
        try {
            // Mock verify:
            if (otpCode === '123456') {
                console.log("OTP Valid. Signing in anonymously...");
                let userUid;

                // Get Device ID for binding
                let deviceId = "unknown";
                if (Platform.OS === 'ios') {
                    deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
                } else if (Platform.OS === 'android') {
                    deviceId = await Application.getAndroidId() || "android-unknown";
                }

                try {
                    const userCredential = await signInAnonymously(auth);
                    userUid = userCredential.user.uid;
                } catch (signInError: any) {
                    const mockId = "mock_user_" + Math.floor(Math.random() * 1000000);
                    await AsyncStorage.setItem('user_uid', mockId);
                    userUid = mockId;
                }

                if (isSignUp) {
                    if (auth.currentUser) {
                        try { await updateProfile(auth.currentUser, { displayName: name }); } catch (e) { }
                    }

                    if (auth.currentUser) {
                        try { await updateProfile(auth.currentUser, { displayName: name }); } catch (e) { }
                    }

                    // Use Resolved Stable ID
                    await setTenantId(resolvedTenantId);

                    await setDoc(doc(db, "users", userUid), {
                        name: name,
                        phoneNumber: phoneNumber,
                        tenantId: resolvedTenantId,
                        instituteCode: inputTenantId, // Save the code they used for reference
                        grade: selectedGrade,
                        status: 'PENDING', // Requirement: Module C
                        deviceId: deviceId, // Requirement: Module E
                        completedTopics: [],
                        createdAt: new Date().toISOString()
                    }, { merge: true });

                    // Ensure consistency for next reload/session
                    await AsyncStorage.setItem('user_uid', userUid);

                    router.replace('/approval-pending');

                } else {
                    const userQ = query(collection(db, "users"), where("phoneNumber", "==", phoneNumber));

                    // Demo logic moved or removed to allow real users with these numbers
                    // if (phoneNumber.endsWith('001')) demoUid = 'demo_student_1';
                    // if (phoneNumber.endsWith('002')) demoUid = 'demo_student_2';
                    // if (phoneNumber.endsWith('003')) demoUid = 'demo_student_3';

                    // if (demoUid) {
                    //    await AsyncStorage.setItem('user_uid', demoUid);
                    //    router.replace('/grade');
                    //    return;
                    // }

                    const { getDocs } = await import('firebase/firestore');
                    const snapshot = await getDocs(userQ);

                    if (!snapshot.empty) {
                        const existingUser = snapshot.docs[0];
                        const userData = existingUser.data();

                        // DEVICE BINDING LOGIC (Requirement: Module E)
                        if (userData.deviceId && userData.deviceId !== deviceId) {
                            console.warn("Login Blocked", "You are logged in on another device. Contact Admin.");
                            setLoading(false);
                            return;
                        }

                        // If deviceId was null, save it (Binding)
                        if (!userData.deviceId) {
                            await setDoc(doc(db, "users", existingUser.id), { deviceId: deviceId }, { merge: true });
                        }

                        await AsyncStorage.setItem('user_uid', existingUser.id);
                        await setTenantId(userData.tenantId || 'default');

                        // STATUS CHECK (Requirement: Module D)
                        if (userData.status === 'PENDING') {
                            router.replace('/approval-pending');
                        } else if (userData.status === 'REJECTED' || userData.status === 'BLOCKED') {
                            console.warn("Account Disabled", `Your account has been ${userData.status.toLowerCase()}.`);
                        } else {
                            router.replace('/grade');
                        }
                    } else {
                        console.warn("Access Denied", "No student found with this number. Please Sign Up first.");
                        await auth.signOut();
                    }
                }
            } else {
                throw new Error('Invalid OTP');
            }
        } catch (error: any) {
            console.warn('Error', error.message);
        } finally {
            setLoading(false);
        }
    };


    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
                    <Ionicons name={isDark ? "sunny" : "moon"} size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerSpacer} />

                <View style={styles.logoContainer}>
                    <Text style={styles.brandEmoji}>🚀</Text>
                    <Text style={styles.brandTitle}>EduPro</Text>
                </View>

                <View style={styles.card}>
                    {/* Toggle */}
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[styles.toggleButton, isSignUp && styles.toggleButtonActive]}
                            onPress={() => { setIsSignUp(true); setAuthStage('TENANT'); }}
                        >
                            <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>Sign Up</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
                            onPress={() => { setIsSignUp(false); setAuthStage('FORM'); }}
                        >
                            <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Log In</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.headerTitle}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
                    <Text style={styles.headerSubtitle}>
                        {authStage === 'TENANT' ? 'Validate your Institute' : 'Enter your details to start learning'}
                    </Text>

                    <View style={styles.inputContainer}>
                        {/* STAGE 1: TENANT VALIDATION */}
                        {authStage === 'TENANT' && (
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Institute Code</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter Code (e.g. inst_abc)"
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
                                {instituteName ? (
                                    <View style={[styles.infoBox, { backgroundColor: colors.primary + '10', marginBottom: 20, padding: 12, borderRadius: 12 }]}>
                                        <Text style={{ color: colors.primary, fontWeight: 'bold', textAlign: 'center' }}>🏫 {instituteName}</Text>
                                    </View>
                                ) : null}

                                {isSignUp && (
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
                                    <Text style={styles.label}>Mobile Number</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="+1 555 123 4567"
                                        placeholderTextColor={colors.textSecondary}
                                        keyboardType="phone-pad"
                                        value={phoneNumber}
                                        onChangeText={setPhoneNumber}
                                    />
                                </View>

                                {isSignUp && availableGrades.length > 0 && (
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

                        {/* STAGE 3: OTP */}
                        {authStage === 'OTP' && (
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Verification Code</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="123456"
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType="number-pad"
                                    value={otpCode}
                                    onChangeText={setOtpCode}
                                    maxLength={6}
                                />
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.mainButton}
                        onPress={() => {
                            if (authStage === 'TENANT') validateTenant();
                            else if (authStage === 'FORM') handleSendOtp();
                            else handleVerifyOtp();
                        }}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.mainButtonText}>
                                {authStage === 'TENANT' ? 'Validate Institute' :
                                    authStage === 'FORM' ? 'Get OTP' : 'Verify & Login'}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {authStage !== 'TENANT' && (
                        <TouchableOpacity onPress={() => { setAuthStage(isSignUp ? 'TENANT' : 'FORM'); setOtpCode(''); }}>
                            <Text style={styles.changeNumberText}>Go Back</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView >
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
