import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert, Share, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { solveHomeworkFromImage, solveHomeworkFromText } from '../services/gemini';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SolverScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [image, setImage] = useState<string | null>(null);
    const [solution, setSolution] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState("Analyzing...");
    const [selectedSubject, setSelectedSubject] = useState("General");
    const [textQuery, setTextQuery] = useState("");

    const subjects = ["General", "Math", "Physics", "Chemistry", "Biology"];

    const pickImage = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'We need access to your gallery to pick homework images.');
                return;
            }

            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.7,
                allowsMultipleSelection: false,
            });

            if (!result.canceled && result.assets && result.assets[0].uri) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                processAndAnalyze(result.assets[0].uri, result.assets[0].mimeType);
            }
        } catch (e: any) {
            console.log("Error", "Could not pick image: " + e.message);
            setError("Failed to select image. Please try again.");
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required to snap homework!');
            return;
        }

        try {
            let result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled && result.assets && result.assets[0].uri) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                processAndAnalyze(result.assets[0].uri, result.assets[0].mimeType);
            }
        } catch (e: any) {
            console.log("Error", "Camera failed: " + e.message);
            setError("Camera error. Please try again.");
        }
    };

    const processAndAnalyze = async (uri: string, originalMimeType?: string) => {
        try {
            setError(null);
            setImage(uri);
            setSolution("");
            setStatusMessage("Processing image...");

            // Resize image to ensure payload is optimized
            const manipulated = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: 1024 } }], // Slightly higher res for better OCR
                { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            if (manipulated.base64) {
                analyzeImage(manipulated.base64, "image/jpeg");
            } else {
                throw new Error("Failed to process image data");
            }

        } catch (e: any) {
            console.error("Image Processing Error:", e);
            setError("Failed to process image. Make sure it's a valid photo.");
            setImage(null);
        }
    };

    const analyzeImage = async (base64: string, mimeType: string) => {
        setLoading(true);
        setStatusMessage("AI is thinking...");
        try {
            const answer = await solveHomeworkFromImage(base64, mimeType, selectedSubject, textQuery);
            setSolution(answer);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
            console.error("Analysis failed:", e);
            setError("AI could not read this image. Please try a clearer photo.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    };

    const handleSolveTextOnly = async () => {
        if (!textQuery.trim()) return;
        setLoading(true);
        setError(null);
        setSolution("");
        setStatusMessage("Solving your question...");
        try {
            const answer = await solveHomeworkFromText(textQuery, selectedSubject);
            setSolution(answer);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
            console.error("Text solve failed:", e);
            setError("AI could not solve this question. Try rephrasing it.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!solution) return;
        try {
            await Share.share({
                message: `Check out this solution from Midnight Curiosity:\n\n${solution}`,
            });
        } catch (error) {
            console.error(error);
        }
    };

    const formatText = (text: string) => {
        return text.split('\n').map((line, idx) => {
            const isHeader = line.startsWith('###') || line.startsWith('**');
            const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-');

            return (
                <Text key={idx} style={[
                    styles.solutionText,
                    isHeader && styles.solutionHeaderItem,
                    isBullet && styles.solutionBulletItem
                ]}>
                    {line.replace(/###|\*\*/g, '').replace(/^\* |^- /g, '• ')}
                </Text>
            );
        });
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Solver</Text>
                </View>
                <TouchableOpacity
                    style={styles.historyBtn}
                    onPress={() => router.push('/solver-history')}
                >
                    <Ionicons name="time-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Subject Selection */}
                <View style={styles.subjectContainer}>
                    <Text style={styles.inputLabel}>Select Subject</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectScroll}>
                        {subjects.map(subj => (
                            <TouchableOpacity
                                key={subj}
                                style={[styles.subjectChip, selectedSubject === subj && styles.selectedChip]}
                                onPress={() => {
                                    setSelectedSubject(subj);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <Text style={[styles.chipText, selectedSubject === subj && styles.selectedChipText]}>{subj}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Optional Text Query */}
                <View style={styles.textQueryContainer}>
                    <Text style={styles.inputLabel}>Add context or type question (Optional)</Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Solve for x..."
                        placeholderTextColor={colors.textSecondary}
                        value={textQuery}
                        onChangeText={setTextQuery}
                        multiline
                    />
                </View>

                {/* Image Preview Area */}
                <View style={styles.previewSection}>
                    {image ? (
                        <View style={styles.imageCard}>
                            <Image source={{ uri: image }} style={styles.previewImage} />
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.7)']}
                                style={styles.imageOverlay}
                            />
                            <TouchableOpacity
                                style={styles.removeBtn}
                                onPress={() => {
                                    setImage(null);
                                    setSolution("");
                                    setError(null);
                                }}
                            >
                                <Ionicons name="trash-outline" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickImage}>
                            <LinearGradient
                                colors={[colors.card, colors.background]}
                                style={styles.placeholderGradient}
                            >
                                <View style={styles.placeholderIconCircle}>
                                    <Ionicons name="scan-outline" size={40} color={colors.primary} />
                                </View>
                                <Text style={styles.placeholderTitle}>Ready to Solve?</Text>
                                <Text style={styles.placeholderDesc}>
                                    Upload or snap a photo of your math problem or question.
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Text Only Solve Button */}
                {!image && textQuery.trim().length > 0 && (
                    <TouchableOpacity
                        style={[styles.cameraBtnMain, { marginBottom: 20, flex: 0 }]}
                        onPress={handleSolveTextOnly}
                    >
                        <LinearGradient
                            colors={['#10B981', '#059669']}
                            style={styles.cameraBtnGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Ionicons name="sparkles" size={24} color="#fff" />
                            <Text style={styles.cameraBtnText}>Solve Question</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* Primary Actions */}
                {!image && (
                    <View style={styles.mainActions}>
                        <TouchableOpacity style={styles.galleryBtn} onPress={pickImage}>
                            <Ionicons name="images" size={24} color={colors.primary} />
                            <Text style={styles.galleryBtnText}>Open Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cameraBtnMain} onPress={takePhoto}>
                            <LinearGradient
                                colors={[colors.primary, '#4F46E5']}
                                style={styles.cameraBtnGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="camera" size={24} color="#fff" />
                                <Text style={styles.cameraBtnText}>Take Photo</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.loadingWrapper}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.loadingStatus}>{statusMessage}</Text>
                        <Text style={styles.loadingSub}>Our AI is calculating the best steps for you.</Text>
                    </View>
                )}

                {/* Error State */}
                {error && !loading && (
                    <View style={styles.errorCard}>
                        <View style={styles.errorHeader}>
                            <Ionicons name="alert-circle" size={24} color={colors.danger} />
                            <Text style={styles.errorTitle}>Hmm, that didn't work</Text>
                        </View>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={takePhoto}>
                            <Text style={styles.retryBtnText}>Try Clearer Photo</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Solution Area */}
                {solution && !loading && (
                    <View style={styles.solutionWrapper}>
                        <View style={styles.solutionCardHeader}>
                            <View style={styles.aiBadge}>
                                <Ionicons name="sparkles" size={14} color="#fff" />
                                <Text style={styles.aiBadgeText}>AI SOLVED</Text>
                            </View>
                            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                                <Ionicons name="share-outline" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.solutionContent}>
                            {formatText(solution)}
                        </View>

                        <TouchableOpacity
                            style={styles.doneBtn}
                            onPress={() => {
                                setImage(null);
                                setSolution("");
                            }}
                        >
                            <Text style={styles.doneBtnText}>Solve Another One</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.footerInfo}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.footerText}>AI can provide incorrect results. Always verify important calculations.</Text>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: colors.background,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: colors.primary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    backBtn: { padding: 8, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginRight: 15 },
    historyBtn: { padding: 8, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },

    content: { padding: 20, paddingBottom: 100 },

    previewSection: { marginBottom: 25 },

    subjectContainer: { marginBottom: 20 },
    inputLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    subjectScroll: { gap: 10, paddingRight: 20 },
    subjectChip: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text, fontWeight: '600' },
    selectedChipText: { color: '#fff' },

    textQueryContainer: { marginBottom: 25 },
    textInput: {
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        fontSize: 16,
        minHeight: 80,
        textAlignVertical: 'top'
    },

    imageCard: {
        height: 280,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#000',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
    removeBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(239, 68, 68, 0.9)', borderRadius: 12, padding: 8 },

    uploadPlaceholder: {
        height: 220,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: colors.border,
        borderStyle: 'dashed'
    },
    placeholderGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    placeholderIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
    placeholderTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
    placeholderDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    mainActions: { flexDirection: 'row', gap: 15, marginBottom: 20 },
    galleryBtn: { flex: 0.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    galleryBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
    cameraBtnMain: { flex: 0.55, height: 60, borderRadius: 20, overflow: 'hidden' },
    cameraBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    cameraBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    loadingWrapper: { alignItems: 'center', paddingVertical: 40 },
    loadingStatus: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 15 },
    loadingSub: { fontSize: 14, color: colors.textSecondary, marginTop: 5, textAlign: 'center' },

    errorCard: { backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)', marginBottom: 20 },
    errorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    errorTitle: { fontSize: 16, fontWeight: 'bold', color: colors.danger },
    errorText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 15 },
    retryBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.danger },
    retryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    solutionWrapper: { marginTop: 10 },
    solutionCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
    aiBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
    shareBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.primaryLight },

    solutionContent: { backgroundColor: colors.card, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.border },
    solutionText: { color: colors.text, fontSize: 16, lineHeight: 26, marginBottom: 10 },
    solutionHeaderItem: { fontSize: 18, fontWeight: '700', color: colors.primary, marginTop: 15, marginBottom: 10 },
    solutionBulletItem: { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primaryLight },

    doneBtn: { marginTop: 25, backgroundColor: colors.card, padding: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    doneBtnText: { color: colors.primary, fontWeight: 'bold', fontSize: 16 },

    footerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 20, opacity: 0.6 },
    footerText: { fontSize: 12, color: colors.textSecondary, flex: 1 },
});
