import React, { useState } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    StyleSheet, 
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image
} from 'react-native';
const botAvatar = require('../assets/images/bot-avatar.png');
import { sendSignal } from '../services/signalService';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBotResponse, BotResponse } from '../utils/supportBotUtils';
import { useTenant } from '../context/TenantContext';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
    id: string;
    text: string;
    sender: 'bot' | 'user';
    isEscalation?: boolean;
    suggestions?: string[];
}

interface SupportModalProps {
    visible: boolean;
    onClose: () => void;
}



// Simple module-level persistence for the current app session
let sessionMessages: Message[] = [];

const SupportModal: React.FC<SupportModalProps> = ({ visible, onClose }) => {
    const [messages, setMessages] = useState<Message[]>(sessionMessages);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState('User');
    const { tenantId, tenantName, tenantLogo } = useTenant() || {};
    const pathname = usePathname();
    const scrollViewRef = React.useRef<ScrollView>(null);

    const [userRole, setUserRole] = useState('STUDENT');

    // Fetch User Name & Role
    React.useEffect(() => {
        const fetchUser = async () => {
            let uid = auth.currentUser?.uid;
            if (!uid) {
                uid = await AsyncStorage.getItem('user_uid') || undefined;
            }
            if (uid) {
                try {
                    const userSnap = await getDoc(doc(db, 'users', uid));
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserName(data.name || 'User');
                        setUserRole(data.role || 'STUDENT');
                    }
                } catch (e) {
                    console.warn("Could not fetch user info for bot:", e);
                }
            }
        };
        fetchUser();
    }, []);

    // Initial bot message and sync
    React.useEffect(() => {
        const safeTenantName = tenantName || 'EduPro';
        if (visible && messages.length === 0) {
            const initialText = `Hi ${userName}! Welcome to ${safeTenantName}. I'm your support bot. I see you're on the ${pathname} screen. How can I help you today?`;
            const initialMsg: Message = { id: '1', text: initialText, sender: 'bot' };
            setMessages([initialMsg]);
            sessionMessages = [initialMsg];
        } else if (visible) {
            // Ensure scroll points to end when re-opening with history
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
            }, 100);
        }
    }, [visible, tenantName, userName]);

    // Update global session store whenever messages change
    React.useEffect(() => {
        if (messages.length > 0) {
            sessionMessages = messages;
        }
    }, [messages]);

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: 'user'
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInputValue('');
        setLoading(true);
        // Get Bot response (Super-fast local logic)
        const response: BotResponse = getBotResponse(
            inputValue, 
            pathname, 
            userRole,
            tenantName || "EduPro", 
            userName
        );
        
        const botMsg: Message = {
            id: (Date.now() + 1).toString(),
            text: response.text,
            sender: 'bot',
            isEscalation: response.shouldEscalate,
            suggestions: response.suggestions
        };
        
        // Artificial delay for 'Thinking' feel
        setTimeout(() => {
            setMessages(prev => [...prev, botMsg]);
            setLoading(false);
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }, 600);
    };

    const handleSuggestionPress = (suggestion: string) => {
        setInputValue(suggestion);
        // We'll call handleSendMessage directly but since it's an async closure we should be careful.
        // Actually, let's just trigger it.
        setTimeout(() => handleSendMessage(), 10);
    };

    const handleReportBug = async (isManualTicket = false) => {
        setLoading(true);
        try {
            const lastUserMsg = isManualTicket 
                ? messages[messages.length - 1]?.text || "Manual Support Ticket"
                : [...messages].reverse().find(m => m.sender === 'user')?.text || "Bug reported from chat";
            
            await sendSignal(
                pathname, 
                lastUserMsg, 
                isManualTicket ? 'ticket' : 'signal',
                tenantId,
                tenantName
            );
            
            const successMsg: Message = {
                id: Date.now().toString(),
                text: isManualTicket 
                    ? "Your support ticket has been raised successfully! Our team will get back to you shortly."
                    : "Thank you! I've sent a technical snapshot (logs & device info) to our team for investigation.",
                sender: 'bot'
            };
            setMessages(prev => [...prev, successMsg]);
        } catch (error) {
            alert("Error sending report. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <Image source={botAvatar} style={styles.logo} />
                            <View>
                                <Text style={styles.title}>{tenantName || 'Support Bot'}</Text>
                                <Text style={styles.subtitle}>Super-charged powered AI</Text>
                            </View>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity 
                                style={styles.ticketHeaderButton}
                                onPress={() => handleReportBug(true)}
                                disabled={loading || messages.length < 2}
                            >
                                <Ionicons name="ticket" size={20} color={messages.length < 2 ? "#CCC" : "#28A745"} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={{ marginLeft: 15 }}>
                                <Ionicons name="close" size={24} color="#666" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView 
                        ref={scrollViewRef}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    >
                        {messages.map((msg) => (
                            msg.sender === 'user' ? (
                                <View key={msg.id} style={[styles.messageBubble, styles.userBubble]}>
                                    <Text style={[styles.messageText, styles.userText]}>{msg.text}</Text>
                                </View>
                            ) : (
                                <View key={msg.id} style={[styles.messageBubble, styles.botBubble, { flexDirection: 'row', alignItems: 'flex-start' }]}>
                                            <Image source={botAvatar} style={styles.bubbleLogo} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.messageText, styles.botText]}>{msg.text}</Text>
                                                
                                                {msg.suggestions && msg.suggestions.length > 0 && (
                                                    <View style={styles.suggestionsContainer}>
                                                        {msg.suggestions.map((s, i) => (
                                                            <TouchableOpacity 
                                                                key={i} 
                                                                style={styles.suggestionChip}
                                                                onPress={() => handleSuggestionPress(s)}
                                                            >
                                                                <Text style={styles.suggestionText}>{s}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                )}

                                                {msg.isEscalation && !loading && (
                                                    <TouchableOpacity 
                                                        style={styles.escalateButton}
                                                        onPress={() => handleReportBug(false)}
                                                    >
                                                        <Ionicons name="bug-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
                                                        <Text style={styles.escalateButtonText}>Escalate to Technical Team</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                            )
                        ))}
                        {loading && (
                            <View style={[styles.messageBubble, styles.botBubble, { flexDirection: 'row', alignItems: 'center' }]}>
                                <Image source={botAvatar} style={styles.bubbleLogo} />
                                <ActivityIndicator size="small" color="#28A745" />
                            </View>
                        )}
                    </ScrollView>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="Ask me something..."
                            value={inputValue}
                            onChangeText={setInputValue}
                            onSubmitEditing={handleSendMessage}
                        />
                        <TouchableOpacity 
                            style={[styles.sendButton, !inputValue.trim() && styles.sendButtonDisabled]} 
                            onPress={handleSendMessage}
                            disabled={!inputValue.trim()}
                        >
                            <Ionicons name="send" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#F8F9FA',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        height: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    subtitle: {
        fontSize: 12,
        color: '#888',
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
    },
    bubbleLogo: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 8,
        marginTop: 2,
    },
    ticketHeaderButton: {
        padding: 8,
        backgroundColor: '#F0F0F0',
        borderRadius: 20,
    },
    messageBubble: {
        padding: 12,
        borderRadius: 16,
        marginBottom: 10,
        maxWidth: '85%',
    },
    botBubble: {
        backgroundColor: '#FFF',
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    userBubble: {
        backgroundColor: '#28A745',
        alignSelf: 'flex-end',
        borderBottomRightRadius: 4,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    botText: {
        color: '#333',
    },
    userText: {
        color: '#FFF',
    },
    escalateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DC3545',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginTop: 10,
    },
    escalateButtonText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '600',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#EEE',
    },
    input: {
        flex: 1,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        marginRight: 10,
        maxHeight: 100,
    },
    sendButton: {
        backgroundColor: '#28A745',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#CCC',
    },
    suggestionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 10,
        gap: 6,
    },
    suggestionChip: {
        backgroundColor: '#F0F7F2',
        borderWidth: 1,
        borderColor: '#BFE5C9',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    suggestionText: {
        color: '#28A745',
        fontSize: 12,
        fontWeight: '500',
    },
});

export default SupportModal;
