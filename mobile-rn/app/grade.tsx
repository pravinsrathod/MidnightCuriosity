import React, { useState, useCallback, useEffect, useMemo } from 'react'; // v2
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db, storage } from '../services/firebaseConfig';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { linkGoogleAccount } from '../services/googleAuthService';
import LiveClassroomView from '../components/LiveClassroomView';
import CampaignCarousel from '../components/CampaignCarousel';

export default function GradeSelectionScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, toggleTheme, isDark } = useTheme();
    const { tenantId, tenantName, tenantLogo, features } = useTenant();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    // Use default-allow strategy
    const hasFeature = useCallback((key: string) => features ? features[key] !== false : true, [features]);

    const [userName, setUserName] = useState("Student");
    const [userGrade, setUserGrade] = useState("Grade 10");
    const [userBatch, setUserBatch] = useState("General Batch");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [avgScore, setAvgScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [rank, setRank] = useState(0);
    
    const [isGoogleLinked, setIsGoogleLinked] = useState(false);

    const handleLinkGoogle = async () => {
        try {
            const user = await linkGoogleAccount();
            setIsGoogleLinked(true);
            
            const uid = user.uid;
            await updateDoc(doc(db, "users", uid), {
                authProvider: 'google.com',
                email: user.email
            });
            
            Alert.alert("Success", "Your Google account has been linked successfully! You can now log in using Google.");
        } catch (e: any) {
            console.error("Linking error:", e);
            if (e.code === 'auth/credential-already-in-use') {
                Alert.alert("Account Already Linked", "This Google account is already linked to another user. Please contact your Institute Administrator to resolve this, or use a different Google account.");
                return;
            }
            const isCancel = e.message?.includes('developer') || e.code === 'SIGN_IN_CANCELLED' || e.code === '12501';
            if (!isCancel) {
                Alert.alert("Linking Failed", e.message || "Failed to link Google account.");
            }
        }
    };

    // Poll State
    const [activePoll, setActivePoll] = useState<any>(null);
    const [hasVoted, setHasVoted] = useState(false);

    // Fees State
    const [pendingFees, setPendingFees] = useState<any[]>([]);
    const [feesTotalDue, setFeesTotalDue] = useState(0);
    // Live Session State
    const [liveSession, setLiveSession] = useState<any>(null);
    const [isJoining, setIsJoining] = useState(false);

    const showLivePolls = hasFeature('enableLivePolls');
    const showLiveLectures = hasFeature('enableLiveLectures');
    const showFees = hasFeature('enableFees');

    // Listen for Active Polls
    // Listen for Active Polls (Multi-tenant)
    useEffect(() => {
        if (!tenantId || !showLivePolls) return;
        const q = query(
            collection(db, "polls"),
            where("active", "==", true),
            where("tenantId", "==", tenantId),
            where("grade", "in", ["All", userGrade])
        );
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const filteredPolls = snapshot.docs
                    .map(d => ({ id: d.id, ...d.data() } as any))
                    .filter(p => !p.batch || p.batch === "All" || p.batch === userBatch);

                if (filteredPolls.length > 0) {
                    setActivePoll(filteredPolls[0]);
                    setHasVoted(false);
                } else {
                    setActivePoll(null);
                }
            } else {
                setActivePoll(null);
            }
        }, (err) => {
            console.error("Poll snapshot error", err);
        });
        return () => unsub();
    }, [tenantId, userGrade, userBatch]);

    // Listen for Live Sessions
    useEffect(() => {
        if (!tenantId || !userGrade || !userBatch || !showLiveLectures) return;
        const normalizedGrade = userGrade.trim().replace(/\s+/g, '_');
        const normalizedBatch = userBatch.trim().replace(/\s+/g, '_');
        const sessionKey = `${tenantId}_${normalizedGrade}_${normalizedBatch}`;
        
        console.log(`[StudentApp] Listening for live session: ${sessionKey} (Tenant: ${tenantId})`);
        
        const unsub = onSnapshot(doc(db, "liveSessions", sessionKey), (docSnap) => {
            const data = docSnap.data();
            if (docSnap.exists() && data && (data.status === 'active' || data.status === 'live')) {
                console.log(`[StudentApp] Active live session found!`, data);
                setLiveSession({ id: docSnap.id, ...docSnap.data() });
            } else {
                setLiveSession(null);
            }
        });
        return () => unsub();
    }, [tenantId, userGrade, userBatch]);


    // Listen for Pending Fees
    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid || !showFees) return;
        const q = query(
            collection(db, 'fees'),
            where('studentId', '==', uid)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const today = new Date().toISOString().split('T')[0];
            const list = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter(f => {
                    if (f.status === 'PENDING' && f.dueDate < today) f.status = 'OVERDUE';
                    return ['PENDING', 'OVERDUE', 'PARTIAL'].includes(f.status);
                });
            setPendingFees(list);
            setFeesTotalDue(list.reduce((s: number, f: any) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0));
        }, (err) => {
            console.error("Grade fees snapshot error:", err);
        });
        return () => unsub();
    }, []);

    const handleVote = async (optionIndex: number) => {
        if (!activePoll) return;
        setHasVoted(true); // Optimistic update

        const newOptions = [...activePoll.options];
        newOptions[optionIndex].votes = (newOptions[optionIndex].votes || 0) + 1;

        // Update Firestore
        try {
            await updateDoc(doc(db, "polls", activePoll.id), {
                options: newOptions,
                totalVotes: (activePoll.totalVotes || 0) + 1
            });
        } catch (e) {
            console.error("Vote failed", e);
        }
    };



    // Real-time Profile Listener
    useEffect(() => {
        let unsubUser: any;

        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            // Cleanup previous listener
            if (unsubUser) {
                unsubUser();
                unsubUser = undefined;
            }

            let uid = user?.uid;

            if (user) {
                const linked = user.providerData.some(p => p.providerId === 'google.com');
                setIsGoogleLinked(linked);
            }

            // Fallback to stored ID for demo/mock users (only if not really authenticated)
            if (!uid) {
                try {
                    const stored = await AsyncStorage.getItem('user_uid');
                    if (stored && (stored.startsWith('demo_') || stored.startsWith('mock_'))) {
                        uid = stored;
                    }
                } catch (e) { /* ignore */ }
            }

            if (!uid) return;

            const userRef = doc(db, 'users', uid);

            // Listen to User Doc
            unsubUser = onSnapshot(userRef, async (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUserName(data.name || "Student");
                    setUserGrade(data.grade || "Class 10");
                    setUserBatch(data.batch || "General Batch");
                    if (data.photoURL) setAvatarUrl(data.photoURL);

                    // 1. Avg Score Logic (from actual quiz results)
                    const results = data.assignmentResults || {};
                    const scores = Object.values(results).filter(v => typeof v === 'number') as number[];
                    if (scores.length > 0) {
                        const sum = scores.reduce((a, b) => a + b, 0);
                        setAvgScore(Math.round(sum / scores.length));
                    } else {
                        setAvgScore(0);
                    }

                    // 2. Streak Logic (from profile)
                    setStreak(data.streak || 0);

                    // 3. Rank Logic (Grade-Specific & Data-Driven)
                    // PERFORMANCE NOTE: This fetches all students in the grade for ranking.
                    // For large-scale institutes, this should be moved to a scheduled Cloud Function
                    // that populates a 'rank' field on the user document periodically.
                    const calculateGradeRank = async () => {
                        try {
                            const tenant = data.tenantId || tenantId || 'default';
                            const grade = data.grade || 'Class 10';
                            
                            const qRank = query(
                                collection(db, 'users'),
                                where('tenantId', '==', tenant),
                                where('grade', '==', grade)
                            );
                            
                            const snapRank = await getDocs(qRank);
                            const studentProgress = snapRank.docs
                                .map((d: any) => {
                                    const dData = d.data();
                                    const role = dData.role?.toUpperCase();
                                    // Exclude non-students
                                    if (role === 'PARENT' || role === 'ADMIN' || dData.isAdmin) return null;
                                    
                                    return {
                                        id: d.id,
                                        count: dData.completedTopics ? dData.completedTopics.length : 0
                                    };
                                })
                                .filter((s: any) => s !== null) as { id: string, count: number }[];

                            const sorted = studentProgress.sort((a, b) => b.count - a.count);
                            const myRankIndex = sorted.findIndex((s: any) => s.id === uid);
                            setRank(myRankIndex !== -1 ? myRankIndex + 1 : 0);
                        } catch (e) {
                            console.error("Rank calculation error:", e);
                        }
                    };
                    calculateGradeRank();

                    // Self-Healing Redirection: If a parent somehow lands here, send them to Parent Dashboard
                    if (data.role?.toUpperCase() === 'PARENT') {
                        router.replace('/(tabs)/parent-home');
                    }
                } else {
                    // Doc doesn't exist? Create it automatically (Self-Healing)
                    // Only attempt if we have a valid authenticated user to avoid permission errors
                    if (user) {
                        console.log("User doc missing, creating default...");
                        try {
                            await setDoc(userRef, {
                                name: "New Student",
                                grade: "Grade 10",
                                tenantId: tenantId || "default", // Ensure tenant alignment
                                completedTopics: [],
                                createdAt: new Date().toISOString()
                            }, { merge: true });
                        } catch (e) {
                            console.warn("Auto-create profile failed:", e);
                        }
                    }
                }
            }, (error) => {
                // Gracefully handle permission errors (common during auth transitions)
                if (error.code === 'permission-denied') {
                    console.log("Profile listen: Permission denied (waiting for auth).");
                } else {
                    console.error("Profile listen error:", error);
                }
            });
        });

        return () => {
            if (unsubUser) unsubUser();
            unsubAuth();
        };
    }, []);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            uploadImage(result.assets[0].uri);
        }
    };

    const uploadImage = async (uri: string) => {
        setUploading(true);
        try {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                uid = await AsyncStorage.getItem('user_uid') || "anonymous";
            }

            const response = await fetch(uri);
            const blob = await response.blob();

            const fileRef = ref(storage, `avatars/${uid}.jpg`);
            await uploadBytes(fileRef, blob);

            const downloadUrl = await getDownloadURL(fileRef);
            setAvatarUrl(downloadUrl);

            // Update Firestore
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, { photoURL: downloadUrl });
            console.log("Profile Photo Updated:", downloadUrl);

        } catch (e) {
            console.error("Error uploading image:", e);
            alert("Failed to upload image. Please try again.");
        } finally {
            setUploading(false);
        }
    };


    const handleStartLearning = () => {
        router.push('/knowledge-graph');
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
            await AsyncStorage.removeItem('user_uid');
            await AsyncStorage.removeItem('biometric_enabled');
            router.replace('/auth');
        } catch (e) {
            console.error("Logout failed", e);
        }
    };

    const handleDeleteAccount = async () => {
        Alert.alert(
            "Delete Account",
            "Are you absolutely sure you want to delete your account? This action is permanent and will remove all your learning progress, completed topics, and profile data. You cannot undo this.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Request Deletion",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setUploading(true);
                            const user = auth.currentUser;
                            const uid = user?.uid || await AsyncStorage.getItem('user_uid');

                            if (uid) {
                                // 1. Flag for Deletion Request in Firestore
                                await setDoc(doc(db, "users", uid), {
                                    deletionRequested: true,
                                    deletionRequestedAt: new Date().toISOString(),
                                    status: 'DELETION_PENDING'
                                }, { merge: true });

                                // 2. Sign out (Lock out the user)
                                await auth.signOut();
                                await AsyncStorage.removeItem('user_uid');
                                await AsyncStorage.removeItem('biometric_enabled');
                                await AsyncStorage.clear();

                                router.replace('/auth');
                                Alert.alert("Request Sent", "Your account deletion request has been sent to the institute. Your access has been disabled, and your data will be permanently removed once approved by the administrator.");
                            }
                        } catch (e) {
                            console.error("Deletion failed", e);
                            Alert.alert("Error", "Failed to delete account. Please try logging out and back in, then try again.");
                        } finally {
                            setUploading(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            {liveSession && isJoining && (
                <View style={[styles.liveOverlay, { backgroundColor: colors.modalOverlay }]}>
                    <LiveClassroomView 
                        batchId={liveSession.id} 
                        onEnd={() => setIsJoining(false)} 
                    />
                </View>
            )}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerProfileContainer}>
                        <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
                            {uploading ? (
                                <ActivityIndicator color={colors.primary} />
                            ) : avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
                            ) : (
                                <View style={styles.headerPlaceholderAvatar}>
                                    <Ionicons name="person" size={24} color={colors.icon} />
                                </View>
                            )}
                            <View style={styles.headerEditIcon}>
                                <Ionicons name="camera" size={12} color={colors.background} />
                            </View>
                        </TouchableOpacity>

                        <View style={styles.headerProfileText}>
                            <Text style={styles.headerHeroText}>
                                Hi, {userName} 👋
                            </Text>
                            <Text style={styles.headerSubHeroText}>
                                {userGrade} • {tenantName || "EduPro"}
                            </Text>
                            {isGoogleLinked ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                                    <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>Google Secured</Text>
                                </View>
                            ) : (
                                <TouchableOpacity 
                                    onPress={handleLinkGoogle} 
                                    style={{ 
                                        flexDirection: 'row', 
                                        alignItems: 'center', 
                                        marginTop: 6, 
                                        gap: 6, 
                                        backgroundColor: colors.primary + '15',
                                        paddingVertical: 4,
                                        paddingHorizontal: 8,
                                        borderRadius: 8,
                                        alignSelf: 'flex-start'
                                    }}
                                >
                                    <Ionicons name="logo-google" size={12} color={colors.primary} />
                                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>Link Google</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={toggleTheme}>
                            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                        </TouchableOpacity>
                    </View>
                </View>


                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <View style={[styles.iconBox, { backgroundColor: colors.dangerLight }]}>
                            <Ionicons name="flame" size={20} color={colors.danger} />
                        </View>
                        <Text style={styles.statValue}>{streak}</Text>
                        <Text style={styles.statLabel}>Streak</Text>
                    </View>

                    <TouchableOpacity style={styles.statCard} onPress={() => router.push('/leaderboard')} activeOpacity={0.7}>
                        <View style={[styles.iconBox, { backgroundColor: colors.successLight }]}>
                            <Ionicons name="trophy" size={20} color={colors.success} />
                        </View>
                        <Text style={styles.statValue}>#{rank > 0 ? rank : '-'}</Text>
                        <Text style={styles.statLabel}>Rank</Text>
                    </TouchableOpacity>

                    <View style={styles.statCard}>
                        <View style={[styles.iconBox, { backgroundColor: colors.warningLight }]}>
                            <Ionicons name="star" size={20} color={colors.warning} />
                        </View>
                        <Text style={styles.statValue}>{avgScore}%</Text>
                        <Text style={styles.statLabel}>Avg</Text>
                    </View>
                </View>


                {/* Live Session Banner - Prominent and High Priority */}
                {liveSession && showLiveLectures && (
                    <TouchableOpacity
                        style={[styles.pollBanner, { 
                            borderColor: colors.danger, 
                            backgroundColor: colors.dangerLight,
                            marginBottom: 20,
                            borderWidth: 2,
                            shadowColor: colors.danger,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 8,
                            elevation: 5
                        }]}
                        onPress={() => setIsJoining(true)}
                    >
                        <View style={styles.pollBannerContent}>
                            <View style={styles.pollBadgeContainer}>
                                <View style={[styles.pollDot, { backgroundColor: colors.danger }]} />
                                <Text style={[styles.pollBadgeText, { color: colors.danger, fontWeight: '800' }]}>LIVE NOW</Text>
                            </View>
                            <Text style={[styles.pollBannerTitle, { color: colors.danger, fontSize: 18, fontWeight: '700' }]}>
                                {liveSession.title || "Your Live Class is Active!"}
                            </Text>
                            <Text style={styles.pollBannerSubtitle}>
                                Instructor: {liveSession.instructorName || "Teacher"} • Join now to participate
                            </Text>
                        </View>
                        <View style={{ backgroundColor: colors.danger, borderRadius: 20, padding: 8 }}>
                            <Ionicons name="videocam" size={24} color={colors.onPrimary} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* LIVE POLL BANNER */}
                {activePoll && showLivePolls && (
                    <TouchableOpacity
                        style={styles.pollBanner}
                        onPress={() => router.push('/poll')}
                    >
                        <View style={styles.pollBannerContent}>
                            <View style={styles.pollBadgeContainer}>
                                <View style={styles.pollDot} />
                                <Text style={styles.pollBadgeText}>LIVE POLL</Text>
                            </View>
                            <Text style={styles.pollBannerTitle} numberOfLines={1}>
                                {activePoll.question}
                            </Text>
                            <Text style={styles.pollBannerSubtitle}>
                                Tap to participate now!
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}



                {/* Quick Actions Grid */}
                <View style={styles.quickActionsContainer}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.quickActionRow}>
                        {hasFeature('enableTimetable') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/timetable')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="time-outline" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.quickActionText}>Timetable</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableLectures') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={handleStartLearning}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="book" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.quickActionText}>Study Material</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableAttendance') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/attendance')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.infoLight }]}>
                                    <Ionicons name="calendar-outline" size={24} color={colors.info} />
                                </View>
                                <Text style={styles.quickActionText}>Attendance</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableHomework') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/homework')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.infoLight }]}>
                                    <Ionicons name="pencil" size={24} color={colors.info} />
                                </View>
                                <Text style={styles.quickActionText}>Homework</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableExams') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/assignments')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.purpleLight }]}>
                                    <Ionicons name="checkbox-outline" size={24} color={colors.purple} />
                                </View>
                                <Text style={styles.quickActionText}>Quizzes</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableDoubts') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/doubts')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.pinkLight }]}>
                                    <Ionicons name="chatbubbles" size={24} color={colors.pink} />
                                </View>
                                <Text style={styles.quickActionText}>Doubts</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableExams') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/exam')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.orangeLight }]}>
                                    <Ionicons name="clipboard" size={24} color={colors.orange} />
                                </View>
                                <Text style={styles.quickActionText}>Exams</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableLivePolls') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/poll-history')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.successLight }]}>
                                    <Ionicons name="stats-chart" size={24} color={colors.success} />
                                </View>
                                <Text style={styles.quickActionText}>Polls</Text>
                            </TouchableOpacity>
                        )}

                        {hasFeature('enableFees') && (
                            <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/fees')}>
                                <View style={[styles.actionIcon, { backgroundColor: colors.warningLight }]}>
                                    <Ionicons name="card" size={24} color={colors.warning} />
                                    {pendingFees.length > 0 && <View style={styles.dot} />}
                                </View>
                                <Text style={styles.quickActionText}>Fees</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {hasFeature('enableCampaigns') && <CampaignCarousel audience="STUDENT" />}

                {/* Account Deletion (Apple Compliance) */}
                <TouchableOpacity
                    style={styles.deleteAccountBtn}
                    onPress={handleDeleteAccount}
                >
                    <Text style={styles.deleteAccountText}>
                        Delete Educational Account
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View >
    );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: insets.bottom + 24,
    },
    content: {
        flex: 1,
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    brand: {
        color: colors.text,
        fontWeight: 'bold',
        fontSize: 22,
    },
    headerBrand: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    tenantLogo: {
        width: 30,
        height: 30,
        borderRadius: 6
    },
    brandEmoji: {
        fontSize: 20
    },
    headerActions: {
        flexDirection: 'row',
        gap: 16,
        alignItems: 'center'
    },
    liveOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: colors.modalOverlay,
        overflow: 'hidden'
    },
    headerProfileContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 16,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
    },
    headerPlaceholderAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerEditIcon: {
        position: 'absolute',
        bottom: -2,
        right: 8,
        backgroundColor: colors.primary,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.background,
    },
    headerProfileText: {
        flex: 1,
        justifyContent: 'center',
    },
    headerHeroText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    headerSubHeroText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    statCard: {
        width: '31%',
        backgroundColor: colors.card,
        padding: 12,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500'
    },
    quickActionsContainer: {
        marginTop: 0,
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    viewAllText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: 'bold',
    },
    hwCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        padding: 16,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    hwInfo: {
        flex: 1,
    },
    hwTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    hwSubject: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    emptyHwCard: {
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyHwText: {
        marginTop: 8,
        fontSize: 14,
        color: colors.textSecondary,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: colors.text,
    },
    quickActionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
    },
    quickActionCard: {
        width: '30%',
        backgroundColor: colors.card,
        padding: 12,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    quickActionText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    dot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.danger,
        borderWidth: 2,
        borderColor: colors.card,
    },
    deleteAccountBtn: {
        marginTop: 20,
        marginBottom: 40,
        alignSelf: 'center',
        padding: 10
    },
    deleteAccountText: {
        color: colors.danger,
        fontSize: 13,
        textDecorationLine: 'underline',
        opacity: 0.7
    },
    pollBanner: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: colors.primary,
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
            },
            android: {
                elevation: 3,
            },
            web: {
                boxShadow: `0px 2px 6px ${colors.primary}33`, // Approx 20% opacity
            }
        }),
    },
    pollBannerContent: {
        flex: 1,
        marginRight: 10,
    },
    pollBannerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    pollBannerSubtitle: {
        color: colors.textSecondary,
        fontSize: 13,
    },
    pollBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    pollBadgeText: {
        color: colors.danger,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    pollDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.danger,
        marginRight: 6,
    },
});
