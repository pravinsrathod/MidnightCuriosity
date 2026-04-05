import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import * as Linking from 'expo-linking';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParentHeader } from '../components/ParentHeader';
import { useTenant } from '../context/TenantContext';
import React, { useMemo, useState, useEffect } from 'react';

export default function ParentHomeworkDetailScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [parentName, setParentName] = useState('');
    const [studentName, setStudentName] = useState('');
    const { tenantLogo } = useTenant();

    const {
        title,
        description,
        dueDate,
        status,
        fileUrl,
        teacherComment,
        teacherFileUrl,
        submittedAt
    } = params;

    const StatusBadge = ({ status }: { status: string }) => {
        let color = colors.warning;
        let text = "Pending";
        let icon: any = "time-outline";

        if (status === 'SUBMITTED') {
            color = colors.primary;
            text = "Submitted";
            icon = "checkmark-circle-outline";
        } else if (status === 'CHECKED') {
            color = colors.success;
            text = "Verified";
            icon = "checkmark-done-circle-outline";
        } else if (status === 'INCOMPLETE') {
            color = colors.danger;
            text = "Redo / Incomplete";
            icon = "alert-circle-outline";
        }

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: color + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' }}>
                <Ionicons name={icon} size={16} color={color} style={{ marginRight: 4 }} />
                <Text style={{ color: color, fontWeight: 'bold', fontSize: 12 }}>{text}</Text>
            </View>
        );
    };

    const submissionDateText = useMemo(() => {
        if (!submittedAt) return null;
        try {
            const date = new Date(parseInt(submittedAt as string) * 1000);
            return date.toLocaleString();
        } catch {
            return null;
        }
    }, [submittedAt]);

    useEffect(() => {
        const fetchIdentity = async () => {
            try {
                const user = auth.currentUser;
                let uid = user?.uid;
                if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
                if (!uid) return;

                const userDoc = await getDoc(doc(db, "users", uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    setParentName(userData.firstName || userData.displayName || 'Parent');
                }

                const selectedChildPhone = await AsyncStorage.getItem('selectedChildPhone');
                if (selectedChildPhone) {
                    const q = query(collection(db, "users"), where("phoneNumber", "==", selectedChildPhone));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const child = snap.docs[0].data();
                        setStudentName(child.firstName || child.displayName || 'Student');
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchIdentity();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <ParentHeader 
                parentName={parentName}
                studentName={studentName}
                onSelectStudent={() => router.push('/(tabs)/parent-home')}
                onBack={() => router.back()}
                tenantLogo={tenantLogo}
                showActions={false}
                showWelcome={false}
            />

            <ScrollView contentContainerStyle={styles.content}>
                {/* HEADLINES */}
                <View style={styles.card}>
                    <Text style={styles.hwTitle}>{title}</Text>
                    <Text style={styles.hwDescription}>{description}</Text>
                    <View style={styles.infoRow}>
                        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.infoText}>Due Date: {dueDate}</Text>
                    </View>
                    <View style={{ marginTop: 10 }}>
                        <StatusBadge status={status as string || 'PENDING'} />
                    </View>
                </View>

                {/* TEACHER FEEDBACK */}
                {(status === 'CHECKED' || teacherComment) && (
                    <View style={[styles.card, { borderColor: colors.success }]}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="school-outline" size={20} color={colors.success} />
                            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Teacher&apos;s Comments</Text>
                        </View>

                        <Text style={styles.feedbackText}>
                            {teacherComment && teacherComment !== 'null' ? teacherComment : "Good job! Assigned as complete."}
                        </Text>

                        {teacherFileUrl && teacherFileUrl !== 'null' && (
                            <TouchableOpacity
                                style={styles.attachmentBtn}
                                onPress={() => Linking.openURL(teacherFileUrl as string)}
                            >
                                <Ionicons name="attach" size={20} color={colors.text} />
                                <Text style={{ color: colors.text, fontWeight: '600' }}>View Teacher&apos;s Correction</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* STUDENT SUBMISSION AREA */}
                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Child&apos;s Submission</Text>
                    </View>

                    {fileUrl && fileUrl !== 'null' ? (
                        <View>
                            {submissionDateText && (
                                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>
                                    Submitted on: {submissionDateText}
                                </Text>
                            )}
                            <TouchableOpacity
                                style={styles.imagePreviewContainer}
                                onPress={() => Linking.openURL(fileUrl as string)}
                            >
                                <Image
                                    source={{ uri: fileUrl as string }}
                                    style={styles.imagePreview}
                                    resizeMode="cover"
                                />
                                <View style={styles.overlay}>
                                    <Ionicons name="expand-outline" size={24} color={colors.background} />
                                    <Text style={{ color: colors.background, fontWeight: '600', marginTop: 4 }}>Tap to View Full</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emptySubmission}>
                            <Ionicons name="help-circle-outline" size={40} color={colors.border} />
                            <Text style={{ color: colors.textSecondary, marginTop: 10, textAlign: 'center' }}>
                                No work has been submitted yet for this homework.
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 40 },
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
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    infoText: {
        fontSize: 14,
        color: colors.textSecondary,
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
    imagePreviewContainer: {
        width: '100%',
        height: 250,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptySubmission: {
        alignItems: 'center',
        paddingVertical: 20,
    }
});
