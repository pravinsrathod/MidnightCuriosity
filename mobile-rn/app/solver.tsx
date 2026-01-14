import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { solveHomeworkFromImage } from '../services/gemini';
import { useTheme } from '../context/ThemeContext';

export default function SolverScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [image, setImage] = useState<string | null>(null);
    const [solution, setSolution] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const pickImage = async () => {
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.5,
                allowsMultipleSelection: false,
            });

            if (!result.canceled && result.assets && result.assets[0].uri) {
                processAndAnalyze(result.assets[0].uri, result.assets[0].mimeType);
            }
        } catch (e: any) {
            console.log("Error", "Could not pick image: " + e.message);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            console.log('Permission needed', 'Camera access is required to snap homework!');
            return;
        }

        try {
            let result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets[0].uri) {
                processAndAnalyze(result.assets[0].uri, result.assets[0].mimeType);
            }
        } catch (e: any) {
            console.log("Error", "Camera failed: " + e.message);
        }
    };

    const processAndAnalyze = async (uri: string, originalMimeType?: string) => {
        try {
            setImage(uri); // Show preview immediately

            // Resize image to ensure payload < 1MB
            const manipulated = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: 512 } }], // Resize width to 512px (Aggressive optimization)
                { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            if (manipulated.base64) {
                analyzeImage(manipulated.base64, "image/jpeg");
            } else {
                throw new Error("Failed to process image data");
            }

        } catch (e: any) {
            console.error("Image Processing Error:", e);
            // Alert.alert("Error", "Failed to process image. " + e.message); // Removed Native Popup
        }
    };

    const analyzeImage = async (base64: string, mimeType: string) => {
        setLoading(true);
        setSolution("");
        try {
            const answer = await solveHomeworkFromImage(base64, mimeType);
            setSolution(answer);
        } catch (e: any) {
            console.error("Analysis failed:", e);
            // Alert.alert("AI Error", "Could not analyze the image. " + e.message); // Removed Native Popup
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📸 Snap & Solve</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Image Preview */}
                {image ? (
                    <View style={styles.imageContainer}>
                        <Image source={{ uri: image }} style={styles.previewImage} />
                        <TouchableOpacity style={styles.retakeBtn} onPress={() => setImage(null)}>
                            <Ionicons name="close-circle" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.placeholder}>
                        <Ionicons name="scan-outline" size={80} color={colors.textSecondary} />
                        <Text style={styles.placeholderText}>Take a photo of a math problem or question snippet.</Text>
                    </View>
                )}

                {/* Buttons */}
                {!image && (
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.actionBtn} onPress={pickImage}>
                            <Ionicons name="images" size={24} color={colors.text} />
                            <Text style={styles.btnText}>Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.cameraBtn]} onPress={takePhoto}>
                            <Ionicons name="camera" size={24} color="#fff" />
                            <Text style={styles.btnTextInverse}>Camera</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Solution Area */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.loadingText}>Analyzing Problem...</Text>
                    </View>
                )}

                {solution ? (
                    <View style={styles.solutionCard}>
                        <Text style={styles.solutionHeader}>✨ AI Solution</Text>
                        <Text style={styles.solutionText}>{solution}</Text>
                    </View>
                ) : null}

            </ScrollView>
        </View>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 20, paddingTop: 60, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    content: { padding: 20, paddingBottom: 100 },

    placeholder: { alignItems: 'center', justifyContent: 'center', height: 200, backgroundColor: colors.card, borderRadius: 16, marginBottom: 20, borderStyle: 'dashed', borderWidth: 2, borderColor: colors.border },
    placeholderText: { color: colors.textSecondary, marginTop: 15, textAlign: 'center', maxWidth: '70%' },

    imageContainer: { position: 'relative', marginBottom: 20, alignItems: 'center' },
    previewImage: { width: '100%', height: 300, borderRadius: 12, resizeMode: 'contain', backgroundColor: '#000' },
    retakeBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 5 },

    buttonRow: { flexDirection: 'row', gap: 15, justifyContent: 'center' },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    cameraBtn: { backgroundColor: colors.primary, borderColor: colors.primary },

    btnText: { color: colors.text, fontWeight: 'bold', fontSize: 16 },
    btnTextInverse: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },

    loadingContainer: { marginTop: 30, alignItems: 'center' },
    loadingText: { color: colors.textSecondary, marginTop: 10 },

    solutionCard: { marginTop: 20, backgroundColor: colors.card, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    solutionHeader: { color: colors.primary, fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
    solutionText: { color: colors.text, fontSize: 16, lineHeight: 24 },
});
