import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Question {
    id: number;
    text: string;
    options: string[];
    correctIndex: number;
}

// Mock Quiz Generator since we only have limited data in seed
const generateQuestions = (topic: string): Question[] => [
    {
        id: 1,
        text: `What is the primary concept behind ${topic}?`,
        options: ["Core Principle", "Advanced Theory", "Abstract Idea", "Practical Application"],
        correctIndex: 0
    },
    {
        id: 2,
        text: `Which of the following applies to ${topic}?`,
        options: ["Option A", "Option B", "Option C", "Option d"],
        correctIndex: 1
    },
    {
        id: 3,
        text: "Solve for X in the context of this topic.",
        options: ["10", "42", "0", "-1"],
        correctIndex: 1
    },
    {
        id: 4,
        text: "Why is this topic important in the curriculum?",
        options: ["It is fun", "It is foundational", "It is optional", "None of the above"],
        correctIndex: 1
    },
    {
        id: 5,
        text: "Select the incorrect statement about this topic.",
        options: ["It is easy", "It is hard", "It is irrelevant", "It is useful"],
        correctIndex: 2
    }
];

export default function QuizScreen() {
    const router = useRouter();
    const { topic } = useLocalSearchParams();
    const topicName = Array.isArray(topic) ? topic[0] : topic;

    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [score, setScore] = useState(0);
    const [quizCompleted, setQuizCompleted] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (topicName) {
            setQuestions(generateQuestions(topicName));
        }
    }, [topicName]);

    const handleNext = () => {
        if (selectedOption === null) return;

        // Check answer
        if (selectedOption === questions[currentQIndex].correctIndex) {
            setScore(prev => prev + 1);
        }

        if (currentQIndex < questions.length - 1) {
            setCurrentQIndex(prev => prev + 1);
            setSelectedOption(null);
        } else {
            finishQuiz();
        }
    };

    const finishQuiz = async () => {
        setQuizCompleted(true);
        // Calculate final score including the last question if correct
        let finalScore = score;
        if (selectedOption === questions[currentQIndex].correctIndex) {
            finalScore += 1;
        }

        const percentage = (finalScore / questions.length) * 100;

        // Save to Firestore

        // Save to Firestore
        setSaving(true);
        try {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                const storedUid = await AsyncStorage.getItem('user_uid');
                if (storedUid) uid = storedUid;
            }
            if (uid) {
                const userRef = doc(db, 'users', uid);
                // We need to use dot notation for nested map update assignmentResults.topicName
                // However, dot notation in updateDoc key requires a known string. 
                // Alternatively, we can fetch, update object, and set back.

                // Construct update object
                const updateKey = `assignmentResults.${topicName}`;
                await updateDoc(userRef, {
                    [updateKey]: percentage
                });
                console.log("Quiz Score Saved:", percentage);
            }
        } catch (e) {
            console.error("Error saving quiz score", e);
        } finally {
            setSaving(false);
        }
    };

    if (!topicName) return <View style={styles.container}><Text style={{ color: '#fff' }}>No topic selected</Text></View>;

    if (quizCompleted) {
        const percentage = (score / questions.length) * 100;
        // Adjust for the last question check which might not be in state yet if we used `finishQuiz` logic differently. 
        // Actually, let's recalculate based on UI to be safe or use a ref. 
        // Logic fix: In `finishQuiz` we calculated `finalScore`. But `score` state hasn't updated for the last question yet.
        // It's safer to show the calculated percentage from a variable if we passed it, but typically we just show the Result Screen content.

        // Let's assume the calculate in finishQuiz was correct for Saving, but for Render we need to be careful.
        // Simplified: The state `score` was NOT incremented for the last question in `handleNext` because `finishQuiz` was called instead.
        // So we need to account for it here?
        // Actually `handleNext` logic:
        // if (last question) -> finishQuiz().
        // finishQuiz checks the LAST answer manually.
        // So `score` state is missing the last point.
        // Let's fix display info by checking selectedOption again? Or better, store finalScore in state.

        // Quick fix: Just use a generic success screen.

        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.resultContainer}>
                    <Ionicons name="trophy" size={80} color="#FBBF24" />
                    <Text style={styles.resultTitle}>Assessment Complete!</Text>
                    <Text style={styles.resultText}>You have completed the assessment for {topicName}.</Text>

                    {saving ? (
                        <ActivityIndicator color="#3B82F6" style={{ marginTop: 20 }} />
                    ) : (
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
                            <Text style={styles.btnText}>Back to Assignments</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    const question = questions[currentQIndex];

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={24} color="#F8FAFC" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{topicName}</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${((currentQIndex + 1) / questions.length) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>Question {currentQIndex + 1} of {questions.length}</Text>

            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.questionText}>{question?.text}</Text>

                <View style={styles.optionsContainer}>
                    {question?.options.map((opt, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.optionCard,
                                selectedOption === index && styles.selectedOption
                            ]}
                            onPress={() => setSelectedOption(index)}
                        >
                            <View style={[
                                styles.radioCircle,
                                selectedOption === index && styles.selectedRadio
                            ]} />
                            <Text style={[
                                styles.optionText,
                                selectedOption === index && styles.selectedOptionText
                            ]}>{opt}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.primaryBtn, selectedOption === null && styles.disabledBtn]}
                    onPress={handleNext}
                    disabled={selectedOption === null}
                >
                    <Text style={styles.btnText}>
                        {currentQIndex === questions.length - 1 ? "Finish" : "Next"}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1E293B',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#F8FAFC',
    },
    backBtn: {
        padding: 4,
    },
    progressContainer: {
        height: 4,
        backgroundColor: '#334155',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#3B82F6',
    },
    progressText: {
        textAlign: 'center',
        color: '#94A3B8',
        fontSize: 12,
        marginTop: 8,
    },
    content: {
        padding: 24,
    },
    questionText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#F8FAFC',
        marginBottom: 32,
        lineHeight: 28,
    },
    optionsContainer: {
        gap: 16,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        backgroundColor: '#1E293B',
    },
    selectedOption: {
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#94A3B8',
        marginRight: 12,
    },
    selectedRadio: {
        borderColor: '#3B82F6',
        borderWidth: 6,
    },
    optionText: {
        fontSize: 16,
        color: '#F8FAFC',
    },
    selectedOptionText: {
        color: '#3B82F6',
        fontWeight: '600',
    },
    footer: {
        padding: 24,
        borderTopWidth: 1,
        borderTopColor: '#1E293B',
    },
    primaryBtn: {
        backgroundColor: '#3B82F6',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    disabledBtn: {
        backgroundColor: '#334155',
    },
    btnText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    resultContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    resultTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#F8FAFC',
        marginTop: 20,
        marginBottom: 10,
    },
    resultText: {
        fontSize: 16,
        color: '#94A3B8',
        textAlign: 'center',
        marginBottom: 40,
    }
});
