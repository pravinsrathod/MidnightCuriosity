import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, SafeAreaView, ActivityIndicator, Image, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, serverTimestamp, getDoc, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useTenant } from '../../context/TenantContext';

interface Reply {
    id: string; // usually timestamp_uid to be unique locally
    userId: string;
    userName: string;
    text: string;
    isCorrect: boolean;
    createdAt: any;
}

interface Doubt {
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    subject: string;
    question: string;
    createdAt: any;
    replies: Reply[];
    solved: boolean;
}

export default function DoubtsScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [doubts, setDoubts] = useState<Doubt[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [newQuestion, setNewQuestion] = useState("");
    const [selectedSubject, setSelectedSubject] = useState("General");

    // For replying
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");

    // Current User Info
    const [currentUserName, setCurrentUserName] = useState("Anonymous");
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {

        // Fetch User Info 
        const fetchUser = async () => {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                const storedUid = await AsyncStorage.getItem('user_uid');
                if (storedUid) uid = storedUid;
            }
            setCurrentUserId(uid || "anon");
            if (uid) {
                try {
                    const userDoc = await getDoc(doc(db, "users", uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        if (userData.name) {
                            setCurrentUserName(userData.name);
                        }
                    }
                } catch (e) {
                    console.log("Error fetching user name:", e);
                }
            }
        };
        fetchUser();

        // Realtime Listener for Doubts
        const q = query(
            collection(db, "doubts"),
            where("tenantId", "==", tenantId || "default")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Doubt[];

            // In-memory sort by createdAt (Handle both ISO strings and Firestore Timestamps)
            const sorted = list.sort((a, b) => {
                const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
                const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
                return timeB - timeA; // desc
            });

            setDoubts(sorted);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const postDoubt = async () => {
        if (!newQuestion.trim()) return;

        try {
            // Use the fetched currentUserName
            const name = currentUserName || auth.currentUser?.displayName || "Fellow Student";

            await addDoc(collection(db, "doubts"), {
                userId: currentUserId,
                userName: name,
                userAvatar: auth.currentUser?.photoURL || null,
                subject: selectedSubject,
                question: newQuestion,
                tenantId: tenantId || "default", // Multi-tenancy
                createdAt: serverTimestamp(),
                replies: [],
                solved: false
            });
            setModalVisible(false);
            setNewQuestion("");
        } catch (e) {
            console.error(e);
        }
    };

    const postReply = async (doubtId: string) => {
        if (!replyText.trim()) return;

        const reply: Reply = {
            id: Date.now().toString(),
            userId: currentUserId || "anon",
            userName: currentUserName || auth.currentUser?.displayName || "Student",
            text: replyText,
            isCorrect: false,
            createdAt: new Date().toISOString() // Using ISO for array storage simplicity
        };

        const doubtRef = doc(db, "doubts", doubtId);
        await updateDoc(doubtRef, {
            replies: arrayUnion(reply)
        });

        setReplyText("");
        setReplyingTo(null);
    };

    const markCorrect = async (doubtId: string, reply: Reply, index: number) => {
        // Limitation: Firestore arrayUnion/Remove is tricky for updating a *field within an object in an array*.
        // Correct approach: Read entire array, modify item, Write entire array back.
        // THIS IS EXPENSIVE traffic-wise but necessary for MVP without subcollections.

        // For efficiency in a real app, 'replies' should be a subcollection.
        // MVP HACK: We will just toggle the "solved" status of the Doubt itself for now, 
        // to avoid complex array manipulation code payload.

        // Let's implement the simpler version: Just mark the thread as SOLVED.
        // Awarding points would happen here.

        const doubtRef = doc(db, "doubts", doubtId);
        await updateDoc(doubtRef, {
            solved: true
        });

        // Also award points to the replier (if user != author)
        if (reply.userId !== currentUserId) {
            // awardPoints(reply.userId, 10);
            console.log(` awarded 10 points to ${reply.userId}`);
        }
    };


    const renderItem = ({ item }: { item: Doubt }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                    <Image
                        source={{ uri: item.userAvatar || `https://api.dicebear.com/7.x/avataaars/png?seed=${item.userId}` }}
                        style={styles.avatar}
                    />
                    <View>
                        <Text style={styles.userName}>{item.userName}</Text>
                        <Text style={styles.timestamp}>Just now</Text>
                    </View>
                </View>
                <View style={[styles.subjectTag, { backgroundColor: item.solved ? colors.successLight : colors.primaryLight }]}>
                    <Text style={[styles.subjectText, { color: item.solved ? colors.success : colors.primary }]}>
                        {item.solved ? 'Solved' : item.subject}
                    </Text>
                </View>
            </View>

            <Text style={styles.questionText}>{item.question}</Text>

            {/* Replies Section */}
            {item.replies && item.replies.length > 0 && (
                <View style={styles.repliesList}>
                    {item.replies.map((reply, idx) => (
                        <View key={idx} style={styles.replyCard}>
                            <Text style={styles.replyUser}>{reply.userName}</Text>
                            <Text style={styles.replyText}>{reply.text}</Text>
                            {/* Only the author of the doubt can mark as correct */}
                            {!item.solved && item.userId === currentUserId && (
                                <TouchableOpacity onPress={() => markCorrect(item.id, reply, idx)}>
                                    <Text style={styles.markCorrectLink}>Mark as Answer</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            )}

            {/* Reply Input */}
            <View style={styles.footerActions}>
                {replyingTo === item.id ? (
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.replyInput}
                            placeholder="Type answer..."
                            placeholderTextColor={colors.textSecondary}
                            value={replyText}
                            onChangeText={setReplyText}
                        />
                        <TouchableOpacity onPress={() => postReply(item.id)}>
                            <Ionicons name="send" size={24} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setReplyingTo(item.id)}>
                        <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                        <Text style={styles.actionText}>{item.replies?.length || 0} Answers</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Doubt Solver</Text>
                <TouchableOpacity onPress={() => setModalVisible(true)}>
                    <Ionicons name="add-circle" size={32} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={doubts}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No doubts yet. Be the first!</Text>
                        </View>
                    }
                />
            )}

            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Ask a Doubt</Text>

                        <View style={styles.subjectRow}>
                            {['Maths', 'Physics', 'Chemistry'].map(subj => (
                                <TouchableOpacity
                                    key={subj}
                                    style={[styles.subjectChip, selectedSubject === subj && styles.selectedChip]}
                                    onPress={() => setSelectedSubject(subj)}
                                >
                                    <Text style={[styles.chipText, selectedSubject === subj && styles.selectedChipText]}>
                                        {subj}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={styles.textArea}
                            placeholder="Type your question here..."
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            numberOfLines={4}
                            value={newQuestion}
                            onChangeText={setNewQuestion}
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={postDoubt} style={styles.postBtn}>
                                <Text style={styles.postText}>Post</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 10,
        backgroundColor: colors.border
    },
    userName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.text,
    },
    timestamp: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    subjectTag: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
    },
    subjectText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    questionText: {
        fontSize: 16,
        color: colors.text,
        marginBottom: 16,
        lineHeight: 22,
    },
    repliesList: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 12,
        gap: 8,
    },
    replyCard: {
        backgroundColor: colors.background, // Nested diff
        padding: 10,
        borderRadius: 8,
    },
    replyUser: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: 2,
    },
    replyText: {
        fontSize: 14,
        color: colors.text,
    },
    markCorrectLink: {
        fontSize: 12,
        color: colors.success,
        fontWeight: 'bold',
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    footerActions: {
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionText: {
        marginLeft: 6,
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '500'
    },
    inputContainer: {
        flexDirection: 'row',
        flex: 1,
        alignItems: 'center',
        backgroundColor: colors.background,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: colors.border
    },
    replyInput: {
        flex: 1,
        marginRight: 10,
        color: colors.text,
        height: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: colors.text,
    },
    subjectRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 20,
        gap: 10,
    },
    subjectChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border
    },
    selectedChip: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    chipText: {
        color: colors.text,
    },
    selectedChipText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    textArea: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: 16,
        height: 120,
        textAlignVertical: 'top',
        fontSize: 16,
        color: colors.text,
        marginBottom: 20,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.background,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border
    },
    postBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: 'center',
    },
    cancelText: {
        color: colors.text,
        fontWeight: 'bold',
    },
    postText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 50,
    },
    emptyText: {
        color: colors.textSecondary,
        fontSize: 16,
    }
});
