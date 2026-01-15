import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Image, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, storage } from '../../services/firebaseConfig';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import * as Linking from 'expo-linking';

interface Submission {
    id: string;
    status: 'SUBMITTED' | 'CHECKED' | 'PENDING';
    fileUrl: string;
    teacherComment?: string;
    teacherFileUrl?: string;
    submittedAt?: any;
}

export default function HomeworkDetailScreen() {
    const { id, title, description } = useLocalSearchParams();
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [image, setImage] = useState<string | null>(null); // Local URI

    // User Info
    const [userData, setUserData] = useState<any>(null);

    useEffect(() => {
        let unsubSubmission: any;

        const init = async () => {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                const storedUid = await AsyncStorage.getItem('user_uid');
                if (storedUid) uid = storedUid;
            }

            if (uid) {
                // Fetch User Data for Name
                const uDoc = await getDoc(doc(db, 'users', uid));
                if (uDoc.exists()) {
                    setUserData({ uid, ...uDoc.data() });
                }

                // Listen for Submission
                const q = query(
                    collection(db, 'submissions'),
                    where('homeworkId', '==', id),
                    where('studentId', '==', uid)
                );

                unsubSubmission = onSnapshot(q, (snapshot) => {
                    if (!snapshot.empty) {
                        const docData = snapshot.docs[0];
                        setSubmission({ id: docData.id, ...docData.data() } as Submission);
                    } else {
                        setSubmission(null);
                    }
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        };

        init();
        return () => {
            if (unsubSubmission) unsubSubmission();
        };
    }, [id]);

    const pickImage = async () => {
        // No permissions request is necessary for launching the image library
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5, // Compress a bit
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission denied', 'Sorry, we need camera permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    }

    const handleSubmit = async () => {
        if (!image) return Alert.alert("No Image", "Please select or take a photo of your homework.");
        if (!userData) return Alert.alert("Error", "User profile not loaded. Please try again.");

        setUploading(true);
        try {
            // 1. Upload Image
            const response = await fetch(image);
            const blob = await response.blob();
            const filename = `homework/${userData.tenantId}/${id}/${userData.uid}_${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, blob);
            const downloadUrl = await getDownloadURL(storageRef);

            // 2. Save Submission Record
            if (submission) {
                // Update existing
                await updateDoc(doc(db, 'submissions', submission.id), {
                    fileUrl: downloadUrl,
                    status: 'SUBMITTED',
                    submittedAt: serverTimestamp(),
                    teacherComment: null
                } as any);
            } else {
                // Create New
                await addDoc(collection(db, 'submissions'), {
                    homeworkId: id,
                    studentId: userData.uid,
                    studentName: userData.name || 'Unknown Student',
                    tenantId: userData.tenantId,
                    fileUrl: downloadUrl,
                    status: 'SUBMITTED',
                    submittedAt: serverTimestamp(),
                    createdAt: serverTimestamp()
                });
            }

            Alert.alert("Success", "Homework submitted successfully! 🚀");
            setImage(null);
        } catch (e: any) {
            console.error(e);
            Alert.alert("Error", "Failed to upload homework. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        let color = colors.warning;
        let text = "Pending";
        let icon: any = "time-outline";

        if (status === 'SUBMITTED') {
            color = colors.primary; // Changed from accent
            text = "Submitted";
            icon = "checkmark-circle-outline";
        } else if (status === 'CHECKED') {
            color = colors.success;
            text = "Verified";
            icon = "checkmark-done-circle-outline";
        }

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: color + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' }}>
                <Ionicons name={icon} size={16} color={color} style={{ marginRight: 4 }} />
                <Text style={{ color: color, fontWeight: 'bold', fontSize: 12 }}>{text}</Text>
            </View>
        );
    };

    if (loading) return <View style={styles.container}><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title} numberOfLines={1}>Homework Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* HEADLINES */}
                <View style={styles.card}>
                    <Text style={styles.hwTitle}>{title}</Text>
                    <Text style={styles.hwDescription}>{description}</Text>
                    <View style={{ marginTop: 10 }}>
                        <StatusBadge status={submission?.status || 'PENDING'} />
                    </View>
                </View>

                {/* TEACHER FEEDBACK (Only if Verified/Checked) */}
                {submission?.status === 'CHECKED' && (
                    <View style={[styles.card, { borderColor: colors.success }]}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="school-outline" size={20} color={colors.success} />
                            <Text style={[styles.sectionTitle, { color: colors.success }]}>Teacher's Feedback</Text>
                        </View>

                        <Text style={styles.feedbackText}>
                            {submission.teacherComment || "Good job! Assigned as complete."}
                        </Text>

                        {submission.teacherFileUrl && (
                            <TouchableOpacity
                                style={styles.attachmentBtn}
                                onPress={() => Linking.openURL(submission.teacherFileUrl!)}
                            >
                                <Ionicons name="attach" size={20} color={colors.text} />
                                <Text style={{ color: colors.text, fontWeight: '600' }}>View Teacher's Correction</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* STUDENT SUBMISSION AREA */}
                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Your Work</Text>
                    </View>

                    {/* Existing Submission Info */}
                    {submission && !image && (
                        <View style={{ marginBottom: 15, padding: 10, backgroundColor: colors.background, borderRadius: 8 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Last submitted on:</Text>
                            <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                                {submission.submittedAt ? new Date(submission.submittedAt.seconds * 1000).toLocaleString() : 'Marked Manually by Teacher'}
                            </Text>
                            {submission.fileUrl && (
                                <TouchableOpacity onPress={() => Linking.openURL(submission.fileUrl)} style={{ marginTop: 5 }}>
                                    <Text style={{ color: colors.primary, textDecorationLine: 'underline' }}>View Uploaded File</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Image Preview */}
                    {image && (
                        <View style={{ alignItems: 'center', marginBottom: 15 }}>
                            <Image source={{ uri: image }} style={{ width: 200, height: 200, borderRadius: 8 }} />
                            <TouchableOpacity onPress={() => setImage(null)} style={{ position: 'absolute', top: -10, right: -10, backgroundColor: colors.danger, borderRadius: 15, padding: 5 }}>
                                <Ionicons name="close" size={16} color="white" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Action Buttons */}
                    {!submission || submission.status !== 'CHECKED' || true ? ( // Always allow resubmit for now?
                        <View style={{ gap: 10 }}>
                            {!image ? (
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={takePhoto}>
                                        <Ionicons name="camera" size={20} color={colors.primary} />
                                        <Text style={styles.btnTextOutline}>Camera</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={pickImage}>
                                        <Ionicons name="images" size={20} color={colors.primary} />
                                        <Text style={styles.btnTextOutline}>Gallery</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit} disabled={uploading}>
                                    {uploading ? <ActivityIndicator color="#fff" /> : (
                                        <>
                                            <Ionicons name="paper-plane" size={20} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.btnTextPrimary}>{submission ? "Resubmit Homework" : "Submit Homework"}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <Text style={{ textAlign: 'center', color: colors.textSecondary, fontStyle: 'italic' }}>
                            This homework has been verified. Great job!
                        </Text>
                    )}

                    {submission?.status === 'CHECKED' && (
                        <TouchableOpacity style={[styles.btnOutline, { marginTop: 15 }]} onPress={() => { setImage(null); pickImage(); }}>
                            <Text style={styles.btnTextOutline}>Resubmit anyway?</Text>
                        </TouchableOpacity>
                    )}
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backBtn: {
        paddingRight: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        flex: 1,
        textAlign: 'center'
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
        ...Platform.select({
            ios: { shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 2 },
        }),
    },
    hwTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8,
    },
    hwDescription: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 15,
        lineHeight: 22,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginLeft: 8,
    },
    feedbackText: {
        fontSize: 16,
        color: colors.text,
        fontStyle: 'italic',
        marginBottom: 15,
        padding: 10,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: colors.success
    },
    attachmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: colors.border + '40',
        borderRadius: 8,
        alignSelf: 'flex-start'
    },
    btnOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: 'transparent',
    },
    btnTextOutline: {
        color: colors.primary,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    btnPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 10,
        backgroundColor: colors.primary,
    },
    btnTextPrimary: {
        color: '#fff',
        fontWeight: 'bold',
    }
});
