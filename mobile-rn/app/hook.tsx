import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
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

export default function VideoPlayerScreen() {
    const router = useRouter();
    const { grade, topic } = useLocalSearchParams<{ grade: string; topic: string }>();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const videoRef = useRef<Video>(null);
    const [status, setStatus] = useState<AVPlaybackStatusSuccess | null>(null);

    const [videoUrl, setVideoUrl] = useState("");
    const [videoTitle, setVideoTitle] = useState("Loading...");
    const [overview, setOverview] = useState("Loading overview...");
    const [notes, setNotes] = useState("Loading notes...");

    const [loading, setLoading] = useState(true);

    const [quizzes, setQuizzes] = useState<QuizData[]>([]);
    const [activeQuiz, setActiveQuiz] = useState<QuizData | null>(null);
    const [showOverlay, setShowOverlay] = useState(false);

    const [selectedTab, setSelectedTab] = useState("Overview");

    useEffect(() => {
        const fetchVideo = async () => {
            try {
                console.log(`Fetching video for ${grade} - ${topic}`);
                const q = query(
                    collection(db, 'lectures'),
                    where('grade', '==', grade),
                    where('topic', '==', topic),
                    where('tenantId', '==', tenantId || 'default'),
                    limit(1)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const docData = snapshot.docs[0].data();
                    setVideoUrl(docData.videoUrl || "http://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4");
                    setVideoTitle(docData.title || topic);
                    setOverview(docData.overview || "No overview available.");
                    setNotes(docData.notes || "No notes available.");

                    if (docData.quizzes && Array.isArray(docData.quizzes)) {
                        const loadedQuizzes = docData.quizzes.map((q: any, i: number) => ({
                            ...q,
                            id: `quiz-${i}`,
                            shown: false
                        }));
                        setQuizzes(loadedQuizzes);
                    } else if (docData.quiz) {
                        setQuizzes([{ ...docData.quiz, id: 'quiz-0', shown: false }]);
                    }
                } else {
                    setVideoUrl("http://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4");
                    setVideoTitle(topic || "Demo Lesson");
                    setOverview("This is a demo lesson since no content was found.");
                    setNotes("- Point 1\n- Point 2");
                    setQuizzes([{
                        id: 'demo-1',
                        question: "Demo: What is this?",
                        options: ["Video", "Image", "Text"],
                        correctIndex: 0,
                        triggerPercentage: 10,
                        shown: false
                    }]);
                }
            } catch (e) {
                console.error("Error fetching video:", e);
                setVideoTitle("Error Loading Content");
            } finally {
                setLoading(false);
            }
        };
        fetchVideo();
    }, [grade, topic]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        setStatus(status as AVPlaybackStatusSuccess);

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

    const handleQuizAnswer = (index: number) => {
        if (!activeQuiz) return;
        setShowOverlay(false);
        setActiveQuiz(null);
        videoRef.current?.playAsync();
    };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }


    return (
        <SafeAreaView style={styles.container}>
            {/* Video Area */}
            <View style={styles.videoContainer}>
                {videoUrl ? (
                    <Video
                        ref={videoRef}
                        style={styles.video}
                        source={{ uri: videoUrl }}
                        useNativeControls={!showOverlay}
                        resizeMode={ResizeMode.CONTAIN}
                        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                        shouldPlay={true}
                    />
                ) : (
                    <Text style={{ color: 'white' }}>No Video</Text>
                )}

                {/* Overlay */}
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

            {/* Details */}
            <ScrollView style={styles.detailsContainer}>
                <Text style={styles.videoTitle}>{videoTitle}</Text>
                <Text style={styles.videoMeta}>{grade} • 5 mins</Text>

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
                    <Text style={styles.description}>
                        {overview}
                    </Text>
                )}

                {selectedTab === "Notes" && (
                    <Text style={[styles.description, styles.notesContainer]}>
                        {notes}
                    </Text>
                )}

                {selectedTab === "Q & A" && (
                    <Text style={styles.description}>
                        Ask your doubt in the 'Doubt Solver' section or review the AI generated questions from the video context.
                    </Text>
                )}

                {/* Skip Button for Test */}
                <TouchableOpacity
                    style={styles.skipButton}
                    onPress={() => router.push({ pathname: '/reward', params: { topic } })}
                >
                    <Text style={{ color: colors.textSecondary }}>Skip to Reward (Dev)</Text>
                </TouchableOpacity>
            </ScrollView>

        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    videoContainer: {
        width: '100%',
        height: width * (9 / 16),
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    quizHeader: {
        color: colors.primary,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    quizQuestion: {
        color: 'white',
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
    },
    optionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10
    },
    optionButton: {
        backgroundColor: colors.primaryLight,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        margin: 5,
        borderWidth: 1,
        borderColor: colors.primary
    },
    optionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    },
    detailsContainer: {
        flex: 1,
        padding: 20,
    },
    videoTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text
    },
    videoMeta: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
        marginBottom: 24
    },
    tabs: {
        flexDirection: 'row',
    },
    tabItem: {
        marginRight: 24,
        paddingBottom: 8,
    },
    tabText: {
        color: colors.textSecondary,
        fontSize: 16,
        fontWeight: '500'
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: 'bold'
    },
    activeLine: {
        height: 2,
        backgroundColor: colors.primary,
        marginTop: 4,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginBottom: 16
    },
    description: {
        fontSize: 14,
        color: colors.text,
        lineHeight: 22
    },
    notesContainer: {
        fontFamily: 'monospace',
        fontSize: 13,
        backgroundColor: colors.card,
        padding: 12,
        borderRadius: 8,
        color: colors.text
    },
    skipButton: {
        marginTop: 40,
        alignSelf: 'center',
        padding: 10,
        borderRadius: 5
    }
});
