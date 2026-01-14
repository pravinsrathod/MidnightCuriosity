import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../services/firebaseConfig'; // Ensure auth is imported
import { collection, query, orderBy, onSnapshot, where, doc, updateDoc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

export default function ExamScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [exams, setExams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeExam, setActiveExam] = useState<any>(null); // The exam currently being taken
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, number>>({}); // { questionIndex: optionIndex }
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [endTime, setEndTime] = useState<number | null>(null);

    // Fetch Exams
    useEffect(() => {
        const q = query(
            collection(db, "exams"),
            where("tenantId", "==", tenantId || "default")
        );
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Client-side sort to avoid composite index
            const sorted = list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setExams(sorted);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Timer Logic
    useEffect(() => {
        if (!activeExam || submitted || !endTime) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((endTime - now) / 1000));

            setTimeLeft(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                submitExam(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [endTime, activeExam, submitted]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const startExam = (exam: any) => {
        setActiveExam(exam);
        setCurrentQuestionIndex(0);
        setAnswers({});
        setSubmitted(false);
        setScore(0);

        // Set distinct end timestamp
        const end = Date.now() + exam.duration * 60 * 1000;
        setEndTime(end);
        setTimeLeft(exam.duration * 60);
    };

    const handleAnswer = (optionIndex: number) => {
        setAnswers(prev => ({ ...prev, [currentQuestionIndex]: optionIndex }));
    };

    const submitExam = (auto = false) => {
        console.log("Submit button clicked, auto:", auto);
        const finalize = async () => {
            let correctCount = 0;
            activeExam.questions.forEach((q: any, idx: number) => {
                if (answers[idx] === q.correctAnswer) correctCount++;
            });
            setScore(correctCount);
            setSubmitted(true);
            setEndTime(null); // Stop timer

            // Save to Firestore
            try {
                let uid = auth.currentUser?.uid;
                if (!uid) {
                    uid = await AsyncStorage.getItem('user_uid') || undefined;
                }

                if (uid && activeExam?.id) {
                    console.log("Saving exam result for:", uid, activeExam.id);
                    const userRef = doc(db, 'users', uid);

                    // We use dot notation to update a specific key in the examResults map
                    // Format: examResults: { [examId]: { score: ..., total: ... } }
                    await setDoc(userRef, {
                        examResults: {
                            [activeExam.id]: {
                                score: correctCount,
                                total: activeExam.questions.length,
                                submittedAt: new Date().toISOString(),
                                title: activeExam.title
                            }
                        }
                    }, { merge: true });
                }
            } catch (e) {
                console.error("Error saving exam result:", e);
                Alert.alert("Sync Error", "Result saved locally but failed to sync.");
            }
        };

        if (auto) {
            finalize();
            // REMOVED: Alert.alert("Time's Up!", "Your exam has been automatically submitted.");
        } else {
            // REMOVED: Confirmation popup. Executing directly.
            finalize();
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
            </SafeAreaView>
        );
    }

    // --- TAKING EXAM MODE ---
    if (activeExam) {
        if (submitted) {
            return (
                <SafeAreaView style={styles.container}>
                    <ScrollView contentContainerStyle={styles.resultContainer}>
                        <Ionicons name="trophy" size={80} color={colors.warning} />
                        <Text style={styles.resultTitle}>Exam Completed!</Text>
                        <Text style={styles.resultScore}>You Scored</Text>
                        <Text style={styles.scoreValue}>{score} / {activeExam.questions.length}</Text>
                        <TouchableOpacity style={styles.btnPrimary} onPress={() => setActiveExam(null)}>
                            <Text style={styles.btnText}>Back to Exams</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            );
        }

        const question = activeExam.questions[currentQuestionIndex];
        const isLast = currentQuestionIndex === activeExam.questions.length - 1;

        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={[styles.timer, timeLeft < 60 && { color: colors.danger }]}>
                        Time Remaining: {formatTime(timeLeft)}
                    </Text>
                    <Text style={styles.progress}>Q {currentQuestionIndex + 1} / {activeExam.questions.length}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.questionContainer}>
                    <Text style={styles.questionText}>{question.question}</Text>

                    {question.options.map((opt: string, idx: number) => (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.optionBtn,
                                answers[currentQuestionIndex] === idx && styles.optionSelected
                            ]}
                            onPress={() => handleAnswer(idx)}
                        >
                            <Text style={[styles.optionText, answers[currentQuestionIndex] === idx && styles.optionTextSelected]}>
                                {String.fromCharCode(65 + idx)}. {opt}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <View style={styles.footer}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <TouchableOpacity
                            disabled={currentQuestionIndex === 0}
                            style={[styles.navBtn, currentQuestionIndex === 0 && styles.disabledBtn]}
                            onPress={() => setCurrentQuestionIndex(prev => prev - 1)}
                        >
                            <Text style={styles.navBtnText}>Previous</Text>
                        </TouchableOpacity>

                        {isLast ? (
                            <TouchableOpacity style={[styles.navBtn, styles.submitBtn]} onPress={() => submitExam(false)}>
                                <Text style={styles.navBtnText}>Submit</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentQuestionIndex(prev => prev + 1)}>
                                <Text style={styles.navBtnText}>Next</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // --- LIST MODE ---
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.listHeader}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Scheduled Exams</Text>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
                {exams.map(exam => (
                    <View key={exam.id} style={styles.examCard}>
                        <View style={styles.examInfo}>
                            <Text style={styles.examTitle}>{exam.title}</Text>
                            <Text style={styles.examDate}>📅 {new Date(exam.date).toLocaleString()}</Text>
                            <Text style={styles.examMeta}>⏱ {exam.duration} mins • ❓ {exam.questions?.length || 0} Questions</Text>
                        </View>
                        <TouchableOpacity style={styles.startBtn} onPress={() => startExam(exam)}>
                            <Text style={styles.startBtnText}>Start</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                {exams.length === 0 && (
                    <Text style={styles.emptyText}>No upcoming exams scheduled.</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 15 },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    listContent: { padding: 20 },

    examCard: { backgroundColor: colors.card, borderRadius: 12, padding: 15, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border },
    examInfo: { flex: 1 },
    examTitle: { fontSize: 18, color: colors.text, fontWeight: 'bold', marginBottom: 5 },
    examDate: { color: colors.textSecondary, fontSize: 14, marginBottom: 5 },
    examMeta: { color: colors.textSecondary, fontSize: 12 },
    startBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
    startBtnText: { color: '#FFF', fontWeight: '600' },
    emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 50 },

    // Exam Mode Styles
    header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border },
    timer: { color: colors.warning, fontWeight: 'bold' },
    progress: { color: colors.textSecondary },
    questionContainer: { padding: 20 },
    questionText: { fontSize: 18, color: colors.text, marginBottom: 20, lineHeight: 26 },
    optionBtn: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    optionText: { color: colors.textSecondary, fontSize: 16 },
    optionTextSelected: { color: colors.primary, fontWeight: 'bold' },

    footer: { padding: 20, borderTopWidth: 1, borderColor: colors.border },
    navBtn: { backgroundColor: colors.card, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    submitBtn: { backgroundColor: colors.success, borderColor: colors.success },
    navBtnText: { color: colors.text, fontWeight: '600' },
    disabledBtn: { opacity: 0.5 },

    // Results
    resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    resultTitle: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginTop: 20 },
    resultScore: { fontSize: 16, color: colors.textSecondary, marginTop: 10 },
    scoreValue: { fontSize: 48, fontWeight: 'bold', color: colors.success, marginVertical: 20 },
    btnPrimary: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8 },
    btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
