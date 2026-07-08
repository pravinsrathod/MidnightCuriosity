import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';

export default function CompleteProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const { setTenantId } = useTenant();
    const { user: firebaseUser, loading: authLoading, profile } = useAuth();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    // Auth check & Redirection
    useEffect(() => {
        if (!authLoading) {
            if (!firebaseUser || firebaseUser.isAnonymous) {
                Alert.alert("Authentication Required", "Please sign in first.");
                router.replace('/auth');
            } else if (profile) {
                // If profile already exists, route them away to their dashboard
                const role = profile.role?.toUpperCase();
                if (role === 'PARENT') {
                    router.replace('/(tabs)/parent-home');
                } else if (role === 'ADMIN') {
                    router.replace('/admin-dashboard');
                } else {
                    router.replace('/grade');
                }
            }
        }
    }, [firebaseUser, authLoading, profile]);

    const [authStage, setAuthStage] = useState<'TENANT' | 'FORM'>('TENANT');
    const [isParent, setIsParent] = useState(false);
    const [name, setName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [linkedStudentPhone, setLinkedStudentPhone] = useState('');
    const [resolvedTenantId, setResolvedTenantId] = useState('');
    const [instituteName, setInstituteName] = useState('');
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);
    const [batchList, setBatchList] = useState<Record<string, string[]>>({});
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedBatch, setSelectedBatch] = useState('General Batch');
    const [loading, setLoading] = useState(false);

    // Pre-fill Name once firebaseUser is loaded
    useEffect(() => {
        if (firebaseUser?.displayName) {
            setName(firebaseUser.displayName);
        }
    }, [firebaseUser]);

    // Search states
    const [tenantSearchQuery, setTenantSearchQuery] = useState('');
    const [tenantSearchResults, setTenantSearchResults] = useState<any[]>([]);
    const [tenantListCache, setTenantListCache] = useState<any[]>([]);
    const [isSearchingTenant, setIsSearchingTenant] = useState(false);

    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState<any[]>([]);
    const [studentListCache, setStudentListCache] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);

    // Fetch tenants
    useEffect(() => {
        const fetchInstitutes = async () => {
            setIsSearchingTenant(true);
            try {
                const q = query(collection(db, "tenants"), where("isActive", "==", true));
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setTenantListCache(list);
            } catch (e) {
                console.error("[CompleteProfile] Failed to load institutes", e);
            } finally {
                setIsSearchingTenant(false);
            }
        };
        fetchInstitutes();
    }, []);

    // Tenant search
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
            setInstituteName(tenant.name || "Your Institute");

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

    // Fetch students when role is parent and tenant is selected
    useEffect(() => {
        if (authStage === 'FORM' && isParent && resolvedTenantId && studentListCache.length === 0) {
            const fetchStudents = async () => {
                try {
                    const q = query(
                        collection(db, "users"),
                        where("tenantId", "==", resolvedTenantId)
                    );
                    const snap = await getDocs(q);
                    const list = snap.docs
                        .map(d => ({ id: d.id, ...d.data() } as any))
                        .filter(u => u.role?.toUpperCase() === 'STUDENT' || (!u.role && !u.isAdmin));
                    setStudentListCache(list);
                } catch (e) {
                    console.error("Failed to load students", e);
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
        const lower = text.toLowerCase();
        const matches = studentListCache.filter((s: any) =>
            s.name?.toLowerCase().includes(lower) ||
            s.phoneNumber?.includes(text)
        ).slice(0, 5);
        setStudentSearchResults(matches);
    };

    const selectStudent = (student: any) => {
        setSelectedStudent(student);
        setLinkedStudentPhone(student.phoneNumber || '');
        setStudentSearchQuery('');
        setStudentSearchResults([]);
        Keyboard.dismiss();
    };

    // Handle grade select auto batch update
    useEffect(() => {
        if (selectedGrade && batchList[selectedGrade] && batchList[selectedGrade].length > 0) {
            if (!batchList[selectedGrade].includes(selectedBatch)) {
                setSelectedBatch(batchList[selectedGrade][0]);
            }
        } else if (selectedBatch !== "General Batch") {
            setSelectedBatch("General Batch");
        }
    }, [selectedGrade, batchList, selectedBatch]);

    const handleSubmitProfile = async () => {
        if (!firebaseUser) return;
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        if (!name.trim()) {
            Alert.alert("Error", "Please enter your Full Name.");
            return;
        }
        if (cleanPhone.length < 8) {
            Alert.alert("Error", "Please enter a valid mobile number.");
            return;
        }
        if (!isParent && !selectedGrade) {
            Alert.alert("Error", "Please select your Class.");
            return;
        }
        if (isParent && (!selectedStudent || !linkedStudentPhone)) {
            Alert.alert("Error", "Please select your child.");
            return;
        }

        setLoading(true);
        try {
            // Check if phone number is already registered under another account
            const phoneQuery = query(
                collection(db, "users"),
                where("phoneNumber", "==", cleanPhone)
            );
            const phoneSnap = await getDocs(phoneQuery);
            if (!phoneSnap.empty) {
                const existingProfiles = phoneSnap.docs.filter(d => d.id !== firebaseUser.uid);
                if (existingProfiles.length > 0) {
                    Alert.alert(
                        "Account Already Exists",
                        "This mobile number is already registered. If you already have an account, please log in with your mobile number and password first, then link your Google account from the settings page to avoid losing your data.",
                        [
                            {
                                text: "Go to Login",
                                onPress: async () => {
                                    try {
                                        await auth.signOut();
                                        await AsyncStorage.removeItem('user_uid');
                                    } catch (e) {
                                        console.warn("Sign out failed", e);
                                    }
                                    router.replace('/auth');
                                }
                            },
                            {
                                text: "Cancel",
                                style: "cancel"
                            }
                        ]
                    );
                    setLoading(false);
                    return;
                }
            }

            let deviceId = "unknown";
            if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync() || "ios-unknown";
            else if (Platform.OS === 'android') deviceId = await Application.getAndroidId() || "android-unknown";

            const profileData: any = {
                name: name.trim(),
                email: firebaseUser.email,
                phoneNumber: cleanPhone,
                tenantId: resolvedTenantId,
                authProvider: 'google.com',
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

            // Save user profile in Firestore
            await setDoc(doc(db, "users", firebaseUser.uid), profileData);

            // Sync contexts & async storage
            await setTenantId(resolvedTenantId);
            await AsyncStorage.setItem('user_uid', firebaseUser.uid);

            router.replace('/approval-pending');
        } catch (e: any) {
            console.error("Complete Profile Save Error:", e);
            Alert.alert("Failed to Save Profile", e.message || "An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || (firebaseUser && profile)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.headerSpacer} />
                
                <View style={styles.logoContainer}>
                    <Text style={styles.brandEmoji}>🎓</Text>
                    <Text style={styles.brandTitle}>Complete Profile</Text>
                    <Text style={styles.brandSubtitle}>Finish setting up your account details</Text>
                </View>

                <View style={styles.card}>
                    {authStage === 'TENANT' ? (
                        <View style={styles.inputWrapper}>
                            <Text style={styles.label}>Select Your Institute</Text>
                            <View style={[styles.input, { padding: 0, justifyContent: 'center' }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                                    <Ionicons name="search" size={20} color={colors.textSecondary} />
                                    <TextInput
                                        style={{ flex: 1, padding: 12, color: colors.text, fontSize: 16 }}
                                        placeholder="Type Institute Name..."
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
                                <View style={styles.searchResultsContainer}>
                                    {tenantSearchResults.map((t, idx) => (
                                        <TouchableOpacity 
                                            key={t.id} 
                                            onPress={() => selectTenant(t)}
                                            style={[styles.searchResultItem, { borderBottomWidth: idx < tenantSearchResults.length - 1 ? 1 : 0 }]}
                                        >
                                            <Ionicons name="business" size={24} color={colors.primary} style={{ marginRight: 12 }} />
                                            <View>
                                                <Text style={styles.searchResultTitle}>{t.name}</Text>
                                                <Text style={styles.searchResultSubtitle}>Code: {t.code}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {tenantSearchQuery.length > 1 && tenantSearchResults.length === 0 && !isSearchingTenant && (
                                <Text style={styles.noResultsText}>No active institutes found.</Text>
                            )}
                        </View>
                    ) : (
                        <>
                            {instituteName ? (
                                <View style={styles.instituteBox}>
                                    <Text style={styles.instituteBoxText}>🏫 {instituteName}</Text>
                                </View>
                            ) : null}

                            {/* Role selector */}
                            <View style={styles.roleContainer}>
                                <TouchableOpacity 
                                    style={[styles.roleButton, !isParent && styles.roleButtonActive]}
                                    onPress={() => setIsParent(false)}
                                >
                                    <Ionicons name="school-outline" size={20} color={!isParent ? colors.onPrimary || '#FFF' : colors.text} />
                                    <Text style={[styles.roleButtonText, !isParent && styles.roleButtonTextActive]}>Student</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.roleButton, isParent && styles.roleButtonActive]}
                                    onPress={() => setIsParent(true)}
                                >
                                    <Ionicons name="people-outline" size={20} color={isParent ? colors.onPrimary || '#FFF' : colors.text} />
                                    <Text style={[styles.roleButtonText, isParent && styles.roleButtonTextActive]}>Parent</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Name Input */}
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>Full Name</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your name"
                                    placeholderTextColor={colors.textSecondary}
                                    value={name}
                                    onChangeText={setName}
                                />
                            </View>

                            {/* Phone Input */}
                            <View style={styles.inputWrapper}>
                                <Text style={styles.label}>WhatsApp / Mobile Number</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="10 digit mobile number"
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType="phone-pad"
                                    value={phoneNumber}
                                    onChangeText={setPhoneNumber}
                                />
                            </View>

                            {/* Student Flow (Grades/Batches) */}
                            {!isParent && availableGrades.length > 0 && (
                                <>
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Select Class</Text>
                                        <View style={styles.chipContainer}>
                                            {availableGrades.map((g) => (
                                                <TouchableOpacity
                                                    key={g}
                                                    style={[styles.chip, selectedGrade === g && styles.chipActive]}
                                                    onPress={() => setSelectedGrade(g)}
                                                >
                                                    <Text style={[styles.chipText, selectedGrade === g && styles.chipTextActive]}>
                                                        {g}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                    
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.label}>Select Batch</Text>
                                        <View style={styles.chipContainer}>
                                            {(batchList[selectedGrade] || ["General Batch"]).map((b: string) => (
                                                <TouchableOpacity
                                                    key={b}
                                                    style={[styles.chip, selectedBatch === b && styles.chipActive]}
                                                    onPress={() => setSelectedBatch(b)}
                                                >
                                                    <Text style={[styles.chipText, selectedBatch === b && styles.chipTextActive]}>
                                                        {b}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Parent Flow (Search student) */}
                            {isParent && (
                                <View style={styles.inputWrapper}>
                                    <Text style={styles.label}>Select Your Child</Text>
                                    {selectedStudent ? (
                                        <View style={styles.selectedStudentBox}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.selectedStudentName}>{selectedStudent.name}</Text>
                                                <Text style={styles.selectedStudentSub}>{selectedStudent.grade || 'No Class'} • {selectedStudent.phoneNumber}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => { setSelectedStudent(null); setLinkedStudentPhone(''); }}>
                                                <Ionicons name="close-circle" size={24} color={colors.primary} />
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View>
                                            <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }]}>
                                                <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                                                <TextInput
                                                    style={{ flex: 1, color: colors.text, fontSize: 16, height: '100%' }}
                                                    placeholder="Search child by name"
                                                    placeholderTextColor={colors.textSecondary}
                                                    value={studentSearchQuery}
                                                    onChangeText={handleStudentSearch}
                                                />
                                            </View>

                                            {studentSearchResults.length > 0 && (
                                                <View style={styles.studentSearchResults}>
                                                    {studentSearchResults.map((student) => (
                                                        <TouchableOpacity
                                                            key={student.id}
                                                            style={styles.studentSearchItem}
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
                                </View>
                            )}

                            {/* Submit Button */}
                            <TouchableOpacity
                                style={styles.submitButton}
                                onPress={handleSubmitProfile}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.submitButtonText}>Submit Profile & Request Approval</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity 
                                onPress={() => { setAuthStage('TENANT'); setResolvedTenantId(''); setInstituteName(''); }}
                                style={styles.backLink}
                            >
                                <Text style={styles.backLinkText}>Change Institute</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
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
        padding: 24,
        paddingBottom: insets.bottom + 40,
    },
    headerSpacer: {
        height: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    brandEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    brandTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 8,
    },
    brandSubtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 4,
    },
    inputWrapper: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.background,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        height: 54,
        paddingHorizontal: 16,
        color: colors.text,
        fontSize: 16,
    },
    searchResultsContainer: {
        backgroundColor: colors.card,
        borderRadius: 16,
        marginTop: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    searchResultItem: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomColor: colors.border,
    },
    searchResultTitle: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
    searchResultSubtitle: {
        color: colors.textSecondary,
        fontSize: 12,
        marginTop: 2,
    },
    noResultsText: {
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 12,
        fontSize: 14,
    },
    instituteBox: {
        backgroundColor: colors.primary + '10',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.primary + '30',
        alignItems: 'center',
    },
    instituteBoxText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 16,
    },
    roleContainer: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 16,
        padding: 4,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    roleButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        gap: 8,
    },
    roleButtonActive: {
        backgroundColor: colors.primary,
    },
    roleButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    roleButtonTextActive: {
        color: '#FFFFFF',
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipActive: {
        backgroundColor: colors.primary + '15',
        borderColor: colors.primary,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    chipTextActive: {
        color: colors.primary,
    },
    selectedStudentBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary + '10',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    selectedStudentName: {
        fontWeight: '700',
        fontSize: 16,
        color: colors.text,
    },
    selectedStudentSub: {
        fontSize: 13,
        color: colors.textSecondary,
        marginTop: 2,
    },
    studentSearchResults: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        marginTop: 6,
        maxHeight: 200,
        overflow: 'hidden',
    },
    studentSearchItem: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    submitButton: {
        backgroundColor: colors.primary,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 4,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    backLink: {
        marginTop: 16,
        alignItems: 'center',
    },
    backLinkText: {
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
});
