import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Dimensions,
    Image,
    Platform,
    Animated,
    TextInput
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import YoutubePlayer from 'react-native-youtube-iframe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

const { width } = Dimensions.get('window');

interface QuizData {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    triggerPercentage: number;
    shown?: boolean;
}

interface Lecture {
    id: string;
    title: string;
    videoUrl?: string;
    youtubeVideoId?: string;
    type?: 'live' | 'uploaded'; // Changed from 'upload' to 'uploaded' to match usage
    overview?: string;
    notes?: string;
    batch?: string;
    quizzes?: any[];
    quiz?: any;
    duration?: string;
}

export default function LectureModule() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { grade, topic } = useLocalSearchParams<{ grade: string; topic: string }>();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

    const videoRef = useRef<Video>(null);
    const playerRef = useRef<any>(null); // For YouTube
    const [playing, setPlaying] = useState(true); // Shared playing state

    const [allLectures, setAllLectures] = useState<Lecture[]>([]);
    const [filteredLectures, setFilteredLectures] = useState<Lecture[]>([]);
    const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'live' | 'uploaded'>('live');
    const [selectedTab, setSelectedTab] = useState("Overview"); // Details tab

    const [quizzes, setQuizzes] = useState<QuizData[]>([]);
    const [activeQuiz, setActiveQuiz] = useState<QuizData | null>(null);
    const [showOverlay, setShowOverlay] = useState(false);
    const [studentBatch, setStudentBatch] = useState("General Batch");
    const [userName, setUserName] = useState(auth.currentUser?.displayName || 'Student');
    const [personalNote, setPersonalNote] = useState("");
    const watermarkAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    const startWatermarkAnimation = useCallback(() => {
        Animated.timing(watermarkAnim, {
            toValue: {
                x: Math.random() * (width - 150),
                y: Math.random() * ((width * 9/16) - 50)
            },
            duration: 8000,
            useNativeDriver: true
        }).start(() => startWatermarkAnimation());
    }, [watermarkAnim]);

    useEffect(() => {
        startWatermarkAnimation();
        // Update user name if it becomes available after auth loads
        if (auth.currentUser?.displayName) {
            setUserName(auth.currentUser.displayName);
        }
    }, [startWatermarkAnimation]);

    // Helper to get thumbnail
    const getThumbnail = (lecture: Lecture) => {
        if (lecture.youtubeVideoId) {
            return `https://img.youtube.com/vi/${lecture.youtubeVideoId}/hqdefault.jpg`;
        }
        // Fallback for direct videos (could use first frame generator if available)
        return null;
    };

    useEffect(() => {
        const fetchLectures = async () => {
            try {
                // 1. Fetch Student Batch
                let uid = null;
                const storedUid = await AsyncStorage.getItem('user_uid');
                if (storedUid && (storedUid.startsWith('demo_') || storedUid.startsWith('mock_'))) {
                    uid = storedUid;
                } else {
                    uid = auth.currentUser?.uid || storedUid;
                }

                let currentBatch = "General Batch";
                if (uid) {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        currentBatch = userDoc.data().batch || "General Batch";
                        setStudentBatch(currentBatch);
                    }
                }

                // 2. Query ALL Lectures for this topic
                const q = query(
                    collection(db, 'lectures'),
                    where('grade', '==', grade),
                    where('topic', '==', topic),
                    where('tenantId', '==', tenantId || 'default')
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const docs = snapshot.docs
                        .map(d => ({ id: d.id, ...d.data() } as Lecture))
                        .filter((d: Lecture) => !d.batch || d.batch === "All" || d.batch === currentBatch);

                    if (docs.length > 0) {
                        setAllLectures(docs);

                        // Default selection
                        const defaultLec = docs[0];
                        setSelectedLecture(defaultLec);

                        // Set active tab based on first lecture's type
                        if (defaultLec.type === 'live' || (!defaultLec.type && defaultLec.youtubeVideoId && !defaultLec.videoUrl)) {
                            setActiveTab('live');
                        } else {
                            setActiveTab('uploaded');
                        }
                    } else {
                        setAllLectures([]);
                    }
                }
            } catch (e) {
                console.error("Error fetching lectures:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLectures();
    }, [grade, topic, tenantId]);

    // Sync Filtered Lectures
    useEffect(() => {
        const filtered = allLectures.filter(l => {
            // Use the stored `type` field as primary. For legacy lectures without type:
            // treat as 'live' if they have a youtubeVideoId but no videoUrl.
            const isLive = l.type === 'live' || (!l.type && l.youtubeVideoId && !l.videoUrl);
            return activeTab === 'live' ? isLive : !isLive;
        });
        setFilteredLectures(filtered);
    }, [activeTab, allLectures]);

    // Sync Quiz and Metadata when selectedLecture changes
    useEffect(() => {
        if (!selectedLecture) return;

        if (selectedLecture.quizzes && Array.isArray(selectedLecture.quizzes)) {
            setQuizzes(selectedLecture.quizzes.map((q: any, i: number) => ({
                ...q,
                id: `${selectedLecture.id}-quiz-${i}`,
                shown: false
            })));
        } else if (selectedLecture.quiz) {
            setQuizzes([{ ...selectedLecture.quiz, id: `${selectedLecture.id}-quiz-0`, shown: false }]);
        } else {
            setQuizzes([]);
        }
    }, [selectedLecture]);

    // YouTube Progress Polling for Quizzes
    useEffect(() => {
        let interval: any = null;

        if (playing && !showOverlay && selectedLecture?.youtubeVideoId) {
            interval = setInterval(async () => {
                const currentTime = await playerRef.current?.getCurrentTime();
                const totalTime = await playerRef.current?.getDuration();

                if (currentTime && totalTime) {
                    // Duration is available but not used by UI yet
                    const progress = (currentTime / totalTime) * 100;

                    const submittableQuiz = quizzes.find(q =>
                        !q.shown &&
                        progress >= q.triggerPercentage &&
                        progress < (q.triggerPercentage + 5)
                    );

                    if (submittableQuiz) {
                        setPlaying(false);
                        setActiveQuiz(submittableQuiz);
                        setShowOverlay(true);
                        setQuizzes(prev => prev.map(q => q.id === submittableQuiz.id ? { ...q, shown: true } : q));
                    }
                }
            }, 1000); // Check every second
        } else {
            clearInterval(interval);
        }

        return () => clearInterval(interval);
    }, [playing, showOverlay, selectedLecture, quizzes]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        // setStatus disabled as it is not used by UI
        if (showOverlay) return;

        const progress = (status.positionMillis / status.durationMillis!) * 100;
        const submittableQuiz = quizzes.find(q =>
            !q.shown &&
            progress >= q.triggerPercentage &&
            progress < (q.triggerPercentage + 5)
        );

        if (submittableQuiz) {
            videoRef.current?.pauseAsync();
            setActiveQuiz(submittableQuiz);
            setShowOverlay(true);
            setQuizzes(prev => prev.map(q => q.id === submittableQuiz.id ? { ...q, shown: true } : q));
        }

        if (status.didJustFinish) {
            router.push({ pathname: '/reward', params: { topic } });
        }
    };

    const onYoutubeStateChange = (state: string) => {
        if (state === 'playing') {
            setPlaying(true);
        } else if (state === 'paused') {
            setPlaying(false);
        } else if (state === 'ended') {
            setPlaying(false);
            router.push({ pathname: '/reward', params: { topic } });
        }
    };

    const handleQuizAnswer = (index: number) => {
        setShowOverlay(false);
        setActiveQuiz(null);
        setPlaying(true); // Resume
    };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }

    if (!selectedLecture && allLectures.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.center}>
                    <Ionicons name="videocam-off-outline" size={48} color={colors.textSecondary} />
                    <Text style={[styles.videoTitle, { marginTop: 16 }]}>No Content Available</Text>
                    <Text style={styles.videoMeta}>We haven&apos;t uploaded lectures for this topic yet.</Text>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Video Area */}
            <View style={styles.videoContainer}>
                {selectedLecture?.youtubeVideoId ? (
                    <View style={styles.youtubeOuterContainer}>
                        <View style={styles.youtubeCropContainer}>
                            <YoutubePlayer
                                ref={playerRef}
                                key={selectedLecture.id}
                                height={(width * (9 / 16)) * 1.25} // Increase crop factor to 25%
                                width={width * 1.2} // Increase width to 20%
                                play={playing}
                                videoId={selectedLecture.youtubeVideoId}
                                onChangeState={onYoutubeStateChange}
                                initialPlayerParams={{
                                    rel: false,
                                    controls: true,
                                }}
                                webViewProps={{
                                    injectedJavaScript: `
                                        (function() {
                                            const style = document.createElement('style');
                                            style.innerHTML = '.ytp-share-button, .ytp-show-share-title, .ytp-share-panel, .ytp-youtube-button, .ytp-logo, .ytp-watermark, .ytp-pause-overlay { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }';
                                            document.head.appendChild(style);
                                            
                                            // Periodically re-apply just in case YouTube's dynamic UI re-inserts them
                                            setInterval(() => {
                                                const shareBtn = document.querySelector('.ytp-share-button');
                                                if (shareBtn) shareBtn.style.display = 'none';
                                                const logoBtn = document.querySelector('.ytp-youtube-button');
                                                if (logoBtn) logoBtn.style.display = 'none';
                                            }, 1000);
                                        })();
                                        true;
                                    `
                                }}
                            />
                        </View>
                        
                        {/* Security Overlay */}
                        <View style={styles.securityOverlay} pointerEvents="box-none">
                            {/* Blockers to intercept corner touches (Share, YouTube Logo, Watch on YouTube) */}
                            
                            {/* Top Bar Blocker - Captures Volume, CC, Settings (Top Right) and Channel/Title (Top Left) */}
                            <View style={[styles.blocker, { top: 0, right: 0, width: width * 0.5, height: 120 }]} />
                            <View style={[styles.blocker, { top: 0, left: 0, width: width * 0.35, height: 120 }]} />
                            
                            {/* Bottom Bar Blocker - Captures Share Arrow (Bottom Left), YouTube Logo (Bottom Right) */}
                            <View style={[styles.blocker, { bottom: 0, right: 0, width: width * 0.5, height: 100 }]} />
                            <View style={[styles.blocker, { bottom: 0, left: 0, width: width * 0.4, height: 100 }]} />

                            {/* Floating Watermark */}
                            <Animated.View 
                                style={[
                                    styles.watermarkContainer,
                                    { transform: watermarkAnim.getTranslateTransform() }
                                ]}
                                pointerEvents="none"
                            >
                                <Text style={styles.watermarkText}>{userName} • {selectedLecture?.title}</Text>
                            </Animated.View>
                        </View>
                    </View>
                ) : selectedLecture?.videoUrl ? (
                    <Video
                        key={selectedLecture.id}
                        ref={videoRef}
                        style={styles.video}
                        source={{ uri: selectedLecture.videoUrl }}
                        useNativeControls={!showOverlay}
                        resizeMode={ResizeMode.CONTAIN}
                        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                        shouldPlay={playing}
                    />
                ) : (
                    <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
                )}

                {/* Overlay Quiz */}
                {showOverlay && activeQuiz && (
                    <View style={styles.overlay}>
                        <Text style={styles.quizHeader}>Quick Check!</Text>
                        <Text style={styles.quizQuestion}>{activeQuiz.question}</Text>
                        <View style={styles.optionsContainer}>
                            {activeQuiz.options.map((opt, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.optionButton}
                                    onPress={() => handleQuizAnswer(idx)}
                                >
                                    <Text style={styles.optionText}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>

            {/* Premium Lecture Module Revamp */}
            <View style={styles.revampContainer}>
                {/* Category Tabs */}
                <View style={styles.categoryContainer}>
                    <TouchableOpacity
                        style={[styles.categoryTab, activeTab === 'live' && styles.categoryTabActive]}
                        onPress={() => setActiveTab('live')}
                    >
                        <Ionicons name="videocam" size={18} color={activeTab === 'live' ? colors.onPrimary : colors.textSecondary} />
                        <Text style={[styles.categoryTabText, activeTab === 'live' && styles.categoryTabTextActive]}>Live Sessions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.categoryTab, activeTab === 'uploaded' && styles.categoryTabActive]}
                        onPress={() => setActiveTab('uploaded')}
                    >
                        <Ionicons name="journal" size={18} color={activeTab === 'uploaded' ? colors.onPrimary : colors.textSecondary} />
                        <Text style={[styles.categoryTabText, activeTab === 'uploaded' && styles.categoryTabTextActive]}>Study Material</Text>
                    </TouchableOpacity>
                </View>

                {/* Horizontal Lecture Selection */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.lectureList}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 10 }}
                >
                    {filteredLectures.map((lec) => {
                        const isSelected = selectedLecture?.id === lec.id;
                        const thumb = getThumbnail(lec);
                        return (
                            <TouchableOpacity
                                key={lec.id}
                                style={[styles.lectureCard, isSelected && styles.lectureCardActive]}
                                onPress={() => setSelectedLecture(lec)}
                            >
                                <View style={styles.cardThumbContainer}>
                                    {thumb ? (
                                        <Image source={{ uri: thumb }} style={styles.cardThumb} />
                                    ) : (
                                        <View style={[styles.cardThumb, { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }]}>
                                            <Ionicons name="play-circle" size={32} color={colors.textSecondary} />
                                        </View>
                                    )}
                                    {lec.type === 'live' && (
                                        <View style={styles.liveBadge}>
                                            <Text style={styles.liveBadgeText}>LIVE</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.cardSmallTitle, isSelected && { color: colors.primary }]} numberOfLines={2}>
                                    {lec.title}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                    {filteredLectures.length === 0 && (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyCardText}>No {activeTab} content for this topic</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

            <View style={styles.divider} />

            {/* Details ScrollView */}
            <ScrollView style={styles.detailsContainer} showsVerticalScrollIndicator={false}>
                <Text style={styles.videoTitle}>{selectedLecture?.title}</Text>
                <Text style={styles.videoMeta}>{grade} • {selectedLecture?.batch || studentBatch}</Text>

                <View style={styles.tabs}>
                    {["Overview", "Q & A", "Notes"].map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={styles.tabItem}
                            onPress={() => setSelectedTab(tab)}
                        >
                            <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>{tab}</Text>
                            {selectedTab === tab && <View style={styles.activeLine} />}
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.divider} />

                {selectedTab === "Overview" && (
                    <View style={styles.tabContentContainer}>
                        <Text style={styles.description}>
                            {selectedLecture?.overview || "No overview available for this specific lecture."}
                        </Text>
                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.sectionTitle}>Resources</Text>
                            <TouchableOpacity style={styles.resourceButton}>
                                <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                                <View style={{ marginLeft: 12 }}>
                                    <Text style={styles.resourceTitle}>Lecture Slides</Text>
                                    <Text style={styles.resourceSub}>PDF Document • 2.4 MB</Text>
                                </View>
                                <Ionicons name="download-outline" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {selectedTab === "Notes" && (
                    <View style={styles.tabContentContainer}>
                        <View style={styles.notesFormContainer}>
                            <Text style={styles.sectionTitle}>My Notes</Text>
                            <TextInput
                                style={styles.notesInput}
                                placeholder="Type your personal notes here... (Saved locally)"
                                placeholderTextColor={colors.textSecondary}
                                multiline
                                value={personalNote}
                                onChangeText={setPersonalNote}
                                textAlignVertical="top"
                            />
                            <TouchableOpacity style={styles.saveNoteButton} onPress={() => alert('Notes saved successfully!')}>
                                <Text style={styles.saveNoteText}>Save Notes</Text>
                            </TouchableOpacity>
                        </View>
                        {selectedLecture?.notes && (
                            <View style={{ marginTop: 24 }}>
                                <Text style={styles.sectionTitle}>Instructor Notes</Text>
                                <Text style={styles.notesContentText}>
                                    {selectedLecture.notes}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {selectedTab === "Q & A" && (
                    <View style={styles.tabContentContainer}>
                        <View style={styles.qaContainer}>
                            <Text style={styles.sectionTitle}>Q & A</Text>
                            <Text style={styles.qaTip}>If you have any doubts, please contact your instructor or check the FAQs below.</Text>
                        </View>

                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.sectionTitle}>Frequently Asked</Text>
                            <View style={styles.faqCard}>
                                <Text style={styles.faqQ}>Q: What is the main takeaway from this section?</Text>
                                <Text style={styles.faqA}>A: Identify the core fundamental building blocks introduced by the lecturer.</Text>
                            </View>
                            <View style={styles.faqCard}>
                                <Text style={styles.faqQ}>Q: Will this be on the final assessment?</Text>
                                <Text style={styles.faqA}>A: Yes, the concepts covered between 05:00 and 12:00 are critical for the assessment.</Text>
                            </View>
                        </View>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.skipButton}
                    onPress={() => router.push({ pathname: '/reward', params: { topic } })}
                >
                    <Text style={{ color: colors.textSecondary }}>Skip to Reward (Dev Mode)</Text>
                </TouchableOpacity>
                <View style={{ height: insets.bottom + 40 }} />
            </ScrollView>
        </View>
    );
}


const makeStyles = (colors: any, insets: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? 0 : insets.top, // Video handles top on iOS sometimes, but for consistency let's be careful
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    backButton: {
        marginTop: 20,
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        elevation: 4,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    videoContainer: {
        width: '100%',
        height: width * (9 / 16),
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    // Premium Revamp Styles
    revampContainer: {
        paddingVertical: 16,
    },
    categoryContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        backgroundColor: colors.border + '40',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    categoryTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    categoryTabActive: {
        backgroundColor: colors.primary,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    categoryTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    categoryTabTextActive: {
        color: colors.onPrimary,
    },
    lectureList: {
        flexDirection: 'row',
    },
    lectureCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
        width: 180,
    },
    lectureCardActive: {
        borderColor: colors.primary,
        borderWidth: 2,
    },
    cardThumbContainer: {
        width: '100%',
        height: 100,
        position: 'relative',
    },
    cardThumb: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
        borderRadius: 12,
    },
    liveBadge: {
        backgroundColor: colors.danger,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    liveBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '900',
    },
    cardSmallTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
        padding: 8,
        height: 48,
    },
    emptyCard: {
        width: width - 40,
        height: 140,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.border + '20',
        borderRadius: 16,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: colors.textSecondary + '40',
    },
    emptyCardText: {
        color: colors.textSecondary,
        fontSize: 14,
    },
    detailsContainer: {
        flex: 1,
        paddingHorizontal: 20,
    },
    videoTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        marginTop: 16,
    },
    videoMeta: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
        marginBottom: 16,
    },
    tabs: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    tabItem: {
        marginRight: 24,
        paddingVertical: 8,
        position: 'relative',
    },
    tabText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.primary,
    },
    activeLine: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: colors.primary,
        borderRadius: 2,
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
    divider: {
        height: 1,
        backgroundColor: colors.border,
        width: '100%',
    },
    description: {
        fontSize: 15,
        color: colors.text,
        lineHeight: 24,
        marginTop: 16,
    },
    notesContainer: {
        marginTop: 16,
        padding: 16,
        backgroundColor: colors.border + '20',
        borderRadius: 12,
    },
    notesText: {
        fontSize: 14,
        color: colors.text,
        lineHeight: 22,
    },
    skipButton: {
        marginTop: 30,
        padding: 16,
        alignItems: 'center',
    },
    overlay: {
        flex: 1,
        backgroundColor: colors.modalOverlay,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    youtubeOuterContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: colors.shadow,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    youtubeCropContainer: {
        width: width,
        height: width * (9 / 16),
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    securityOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 50,
    },
    blocker: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.01)',
        pointerEvents: 'auto',
    },
    watermarkContainer: {
        position: 'absolute',
        padding: 6,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: 4,
    },
    watermarkText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        fontWeight: 'bold',
    },
    quizHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.onPrimary,
        marginBottom: 10,
        textAlign: 'center',
    },
    quizQuestion: {
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
        marginBottom: 30,
    },
    optionsContainer: {
        width: '100%',
    },
    optionButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    optionText: {
        color: colors.onPrimary,
        fontSize: 14,
        textAlign: 'center',
    },
    tabContentContainer: {
        paddingVertical: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 12,
    },
    resourceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    resourceTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    resourceSub: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    notesFormContainer: {
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    notesInput: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        minHeight: 120,
        color: colors.text,
        fontSize: 14,
    },
    saveNoteButton: {
        backgroundColor: colors.primary,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 12,
    },
    saveNoteText: {
        color: colors.onPrimary,
        fontWeight: '600',
        fontSize: 14,
    },
    notesContentText: {
        fontSize: 14,
        lineHeight: 22,
        color: colors.textSecondary,
    },
    qaContainer: {
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    qaInputBox: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    qaInput: {
        flex: 1,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        minHeight: 60,
        color: colors.text,
        marginRight: 10,
        textAlignVertical: 'center'
    },
    sendButton: {
        backgroundColor: colors.primary,
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qaTip: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 10,
        fontStyle: 'italic',
    },
    faqCard: {
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    faqQ: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 6,
    },
    faqA: {
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    aiAnswerCard: {
        marginTop: 16,
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        borderWidth: 1,
        borderColor: colors.border,
    },
});
