import React, { useEffect, useState, useRef } from 'react';
import { 
    View, 
    StyleSheet, 
    Text, 
    TouchableOpacity, 
    Platform, 
    ScrollView, 
    TextInput, 
    KeyboardAvoidingView, 
    Dimensions,
    Animated,
    StatusBar,
    ActivityIndicator,
    useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import YoutubePlayer from "react-native-youtube-iframe";
import { auth, realtimeDb, db } from '../services/firebaseConfig';
import { ref, set, onValue, remove, push, serverTimestamp } from 'firebase/database';
import { doc, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';


interface Props {
  batchId: string;
  onEnd: () => void;
}

const LiveClassroomView: React.FC<Props> = ({ batchId, onEnd }) => {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const styles = getStyles(width, height, insets);
    const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('Live Class');
    const [isLoading, setIsLoading] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(true);
    const [playing, setPlaying] = useState(true);
    
    const chatAnim = useRef(new Animated.Value(height)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const watermarkAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const [userName] = useState(auth.currentUser?.displayName || 'Student');

    useEffect(() => {
        // Listen for Session Data (Title, Video ID)
        const sessionUnsub = onSnapshot(doc(db, 'liveSessions', batchId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setSessionTitle(data.title || 'Live Class');
                if (data.youtubeVideoId) {
                    setYoutubeVideoId(data.youtubeVideoId);
                    setIsLoading(false);
                }
            } else {
                setYoutubeVideoId(null);
                setIsLoading(true);
            }
        });

        // Chat Listener
        const chatRef = ref(realtimeDb, `liveSessions/${batchId}/chat`);
        const unsubChat = onValue(chatRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const chatList = Object.entries(data).map(([id, msg]: any) => ({
                    id,
                    ...msg
                })).sort((a, b) => a.timestamp - b.timestamp);
                setMessages(chatList);
            } else {
                setMessages([]);
            }
        });

        return () => {
            sessionUnsub();
            unsubChat();
            if (auth.currentUser) {
                const handRef = ref(realtimeDb, `liveSessions/${batchId}/raisedHands/${auth.currentUser.uid}`);
                remove(handRef).catch(console.error);
            }
        };
    }, [batchId]);

    // Live Pulse Animation
    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [pulseAnim]);

    // Watermark Floating Animation
    useEffect(() => {
        let isCancelled = false;
        const moveWatermark = () => {
            if (isCancelled) return;
            Animated.timing(watermarkAnim, {
                toValue: {
                    x: Math.random() * (width - 150),
                    y: Math.random() * (isFullScreen ? height - 50 : (height * 0.4) - 50)
                },
                duration: 5000,
                useNativeDriver: true
            }).start(() => {
                if (!isCancelled) moveWatermark();
            });
        };
        moveWatermark();
        return () => {
            isCancelled = true;
            watermarkAnim.stopAnimation();
        };
    }, [width, height, isFullScreen, watermarkAnim]);

    useEffect(() => {
        // Auto-Rotate logic
        const toggleOrientation = async () => {
            try {
                if (!ScreenOrientation || !ScreenOrientation.lockAsync) {
                    console.warn("ScreenOrientation native module not available. Please rebuild the app.");
                    return;
                }

                if (isFullScreen) {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                    StatusBar.setHidden(true);
                } else {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                    StatusBar.setHidden(false);
                }
            } catch (err) {
                console.error("Failed to lock orientation:", err);
            }
        };

        toggleOrientation();

        return () => {
            if (ScreenOrientation && ScreenOrientation.lockAsync) {
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
            }
        };
    }, [isFullScreen]);

    useEffect(() => {
        Animated.spring(chatAnim, {
            toValue: showChat ? height * 0.4 : height,
            useNativeDriver: true,
            friction: 8,
            tension: 40
        }).start();
    }, [showChat, height, chatAnim]);

    const toggleRaiseHand = async () => {
        if (!auth.currentUser) return;
        const handRef = ref(realtimeDb, `liveSessions/${batchId}/raisedHands/${auth.currentUser.uid}`);
        if (isHandRaised) {
            await remove(handRef);
            setIsHandRaised(false);
        } else {
            await set(handRef, { name: auth.currentUser.displayName || "Student", timestamp: Date.now() });
            setIsHandRaised(true);
        }
    };

    const sendChat = async () => {
        if (!chatInput.trim() || !auth.currentUser) return;
        try {
            const chatRef = ref(realtimeDb, `liveSessions/${batchId}/chat`);
            await set(push(chatRef), {
                sender: auth.currentUser.displayName || "Student",
                senderUid: auth.currentUser.uid,
                text: chatInput,
                timestamp: serverTimestamp()
            });
            setChatInput('');
        } catch (error) {
            console.error("Chat error:", error);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar hidden />
            
            {/* Immersive Video Layer - YouTube */}
            <View style={[styles.videoContainer, isFullScreen && styles.fullScreenContainer]}>
                {youtubeVideoId ? (
                    <View style={[styles.youtubeWrapper, isFullScreen && styles.fullScreenWrapper]}>
                        <View style={styles.playerWrapper} pointerEvents="auto">
                            <YoutubePlayer
                                height={isFullScreen ? height : width * 9 / 16}
                                width={width}
                                play={playing}
                                videoId={youtubeVideoId}
                                onChangeState={(state: any) => {
                                    if (state === 'playing') setPlaying(true);
                                    if (state === 'paused') setPlaying(false);
                                    if (state === 'ended') setPlaying(false);
                                }}
                                initialPlayerParams={{
                                    loop: false,
                                    rel: false,
                                    controls: true, // Let native controls work for play/pause
                                }}
                            />
                        </View>

                        {/* Security Overlay - Blocks only the corner interactions with invisible touch interceptors */}
                        <View style={styles.securityOverlay} pointerEvents="box-none">
                            {/* Exit Full Screen Button - Top Left (Above everything) */}
                            {isFullScreen && (
                                <TouchableOpacity 
                                    style={styles.exitFullScreenButton} 
                                    onPress={() => setIsFullScreen(false)}
                                >
                                    <View style={styles.exitIconCircle}>
                                        <Ionicons name="contract" size={24} color="#fff" />
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Invisible Corner Blockers - Transparent but captures touches to kill sharing options */}
                            {/* Top Left - Covers Channel Logo & Share area */}
                            <View style={[styles.blocker, { top: 0, left: 0, width: 220, height: 140 }]} />
                            
                            {/* Bottom Right - COVERS YOUTUBE LOGO & "Watch on YouTube" */}
                            <View style={[styles.blocker, { bottom: 0, right: 0, width: 240, height: 100 }]} />
                            
                            {/* Top Right - Blocks Share/Options */}
                            <View style={[styles.blocker, { top: 0, right: 0, width: 140, height: 120 }]} />

                            {/* Bottom Left - Blocks player info */}
                            <View style={[styles.blocker, { bottom: 0, left: 0, width: 160, height: 100 }]} />
                            
                            {/* Watermark Overlay (Allows clicks through to player center) */}
                            <Animated.View 
                                style={[
                                    styles.watermarkContainer, 
                                    { transform: watermarkAnim.getTranslateTransform() }
                                ]}
                                pointerEvents="none"
                            >
                                <Text style={styles.watermarkText}>{userName} • LIVE</Text>
                            </Animated.View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.placeholder}>
                        <ActivityIndicator size="large" color="#6366f1" />
                        <Text style={styles.placeholderText}>
                            {isLoading ? "Connecting to Instructor..." : "Waiting for Broadcast..."}
                        </Text>
                    </View>
                )}
            </View>

            {/* Gradient Header Overlay */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Animated.View style={[styles.liveBadge, { transform: [{ scale: pulseAnim }] }]}>
                        <Text style={styles.liveBadgeText}>LIVE</Text>
                    </Animated.View>
                    <View style={styles.sessionInfo}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>{sessionTitle}</Text>
                        <View style={styles.recordingIndicator}>
                            <View style={styles.onlineDot} />
                            <Text style={styles.onlineText}>STREAMING</Text>
                        </View>
                    </View>
                </View>
                
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={onEnd} style={styles.closeButton}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Floating Interaction Bar */}
            <View style={styles.footer}>
                <View style={styles.glassBar}>
                    <TouchableOpacity 
                        style={[styles.footerAction, showChat && styles.footerActionActive]} 
                        onPress={() => setShowChat(!showChat)}
                    >
                        <Ionicons name="chatbubbles-outline" size={24} color={showChat ? '#fff' : '#cbd5e1'} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.footerAction, isHandRaised && styles.footerActionActive]} 
                        onPress={toggleRaiseHand}
                    >
                        <Ionicons name={isHandRaised ? "hand-right" : "hand-right-outline"} size={24} color={isHandRaised ? '#fff' : '#cbd5e1'} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.footerAction} 
                        onPress={() => setIsFullScreen(!isFullScreen)}
                    >
                        <Ionicons name={isFullScreen ? "contract-outline" : "expand-outline"} size={24} color="#cbd5e1" />
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity style={styles.leaveAction} onPress={onEnd}>
                        <Ionicons name="log-out-outline" size={24} color="#f87171" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Chat Drawer */}
            <Animated.View style={[styles.chatDrawer, { transform: [{ translateY: chatAnim }] }]}>
                <View style={styles.drawerHandle} />
                <View style={styles.chatHeader}>
                    <Text style={styles.chatHeaderTitle}>Live Chat</Text>
                    <Text style={styles.chatSubtitle}>{messages.length} messages</Text>
                </View>

                <ScrollView 
                    style={styles.chatItems} 
                    contentContainerStyle={{ paddingBottom: 20 }}
                    showsVerticalScrollIndicator={false}
                >
                    {messages.map((msg) => (
                        <View key={msg.id} style={[
                            styles.messageRow, 
                            msg.senderUid === auth.currentUser?.uid && styles.ownMessageRow
                        ]}>
                            {msg.senderUid !== auth.currentUser?.uid && (
                                <Text style={styles.messageSender}>{msg.sender}</Text>
                            )}
                            <View style={[
                                styles.messageBubble,
                                msg.senderUid === auth.currentUser?.uid ? styles.ownBubble : styles.otherBubble
                            ]}>
                                <Text style={[
                                    styles.messageText,
                                    msg.senderUid === auth.currentUser?.uid ? styles.ownText : styles.otherText
                                ]}>{msg.text}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>

                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
                    style={styles.inputWrapper}
                >
                    <View style={styles.inputContainer}>
                        <TextInput 
                            style={styles.textInput}
                            placeholder="Message everyone..."
                            placeholderTextColor="#94a3b8"
                            value={chatInput}
                            onChangeText={setChatInput}
                        />
                        <TouchableOpacity style={styles.sendButton} onPress={sendChat}>
                            <Ionicons name="arrow-up" size={22} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Animated.View>
        </View>
    );
};

const getStyles = (width: number, height: number, insets: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', overflow: 'hidden' },
    videoContainer: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#000',
        overflow: 'hidden'
    },
    youtubeWrapper: {
        width: width,
        height: height * 0.4,
        position: 'relative',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    fullScreenWrapper: {
        height: height,
        width: width,
        overflow: 'hidden',
    },
    playerWrapper: {
        flex: 1,
    },
    securityOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 50, // Higher than center control
    },
    blocker: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.01)', // Very subtle but captures touches definitively
        pointerEvents: 'auto',
    },
    centerControl: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1, // Base layer of overlay
        backgroundColor: 'rgba(0,0,0,0.01)'
    },
    playIconCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(99, 102, 241, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
        opacity: 0, 
    },
    fullScreenContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 100,
        overflow: 'hidden', // Prevent any scrolling
    },
    exitFullScreenButton: {
        position: 'absolute',
        top: insets.top || (Platform.OS === 'ios' ? 40 : 10), // Use insets.top with fallback
        left: 20,
        zIndex: 100, // Top of everything
        padding: 10,
    },
    exitIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b', width: '100%' },
    placeholderText: { color: '#94a3b8', marginTop: 16, fontSize: 16, fontWeight: '500' },

    watermarkContainer: {
        position: 'absolute',
        padding: 8,
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: 4,
        zIndex: 15,
    },
    watermarkText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 100,
        paddingTop: 50,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.4)'
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    liveBadge: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 10
    },
    liveBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    sessionInfo: { flexShrink: 1 },
    sessionTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    recordingIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80', marginRight: 4 },
    onlineText: { color: '#4ade80', fontSize: 10, fontWeight: 'bold' },
    
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    closeButton: { padding: 4 },

    footer: {
        position: 'absolute',
        bottom: 30,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 5
    },
    glassBar: {
        flexDirection: 'row',
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        padding: 8,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10
    },
    footerAction: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4
    },
    footerActionActive: {
        backgroundColor: '#6366f1'
    },
    divider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginHorizontal: 8
    },
    leaveAction: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center'
    },

    chatDrawer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: height * 0.6,
        backgroundColor: '#f8fafc',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        zIndex: 20,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 20
    },
    drawerHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#e2e8f0',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12
    },
    chatHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    chatHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
    chatSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
    
    chatItems: { flex: 1, padding: 20 },
    messageRow: { marginBottom: 16, alignItems: 'flex-start' },
    ownMessageRow: { alignItems: 'flex-end' },
    messageSender: { fontSize: 12, color: '#64748b', marginBottom: 4, marginLeft: 4 },
    messageBubble: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        maxWidth: '80%'
    },
    otherBubble: { backgroundColor: '#f1f5f9', borderTopLeftRadius: 4 },
    ownBubble: { backgroundColor: '#6366f1', borderTopRightRadius: 4 },
    messageText: { fontSize: 15, lineHeight: 20 },
    otherText: { color: '#1e293b' },
    ownText: { color: '#fff' },

    inputWrapper: {
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9'
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderRadius: 24,
        paddingHorizontal: 16,
        marginTop: 12
    },
    textInput: {
        flex: 1,
        height: 48,
        color: '#0f172a',
        fontSize: 15
    },
    sendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#6366f1',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8
    }
});

export default LiveClassroomView;
