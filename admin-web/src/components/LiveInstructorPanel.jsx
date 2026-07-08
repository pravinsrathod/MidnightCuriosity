import React, { useState, useEffect } from 'react';
import { db, auth, functions, realtimeDb } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { ref, onValue, set, push, serverTimestamp, off } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { 
    StopCircle, 
    Copy, 
    CheckCircle, 
    MessageSquare, 
    HandMetal, 
    MicOff, 
    ExternalLink,
    HelpCircle,
    Send,
    Users,
    Cast,
    ShieldAlert,
    Video,
    Hash,
    Globe
} from 'lucide-react';
import './LiveInstructorPanel.css';

const LiveInstructorPanel = ({ adminTenantId, grades, subjects, batches, topics }) => {
    // Session State
    const [isLive, setIsLive] = useState(false);
    const [youtubeInfo, setYoutubeInfo] = useState(null);
    const [channelName, setChannelName] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedBatch, setSelectedBatch] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    
    // Interaction State
    const [raisedHands, setRaisedHands] = useState([]);
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [copySuccess, setCopySuccess] = useState({ rtmp: false, key: false });
    const [loading, setLoading] = useState(false);

    // RTDB Listeners (Hands & Chat)
    useEffect(() => {
        if (isLive && channelName) {
            const handsRef = ref(realtimeDb, `liveSessions/${channelName}/raisedHands`);
            const chatRef = ref(realtimeDb, `liveSessions/${channelName}/chat`);

            onValue(handsRef, (snapshot) => {
                const data = snapshot.val();
                setRaisedHands(data ? Object.entries(data).map(([uid, info]) => ({ uid, ...info })) : []);
            });

            const chatUnsub = onValue(chatRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const chatList = Object.entries(data).map(([id, msg]) => ({ id, ...msg }))
                        .sort((a, b) => a.timestamp - b.timestamp);
                    setMessages(chatList);
                } else {
                    setMessages([]);
                }
            });

            return () => {
                off(handsRef);
                off(chatRef);
            };
        }
    }, [isLive, channelName]);

    // Session Recovery (on batch/grade selection)
    useEffect(() => {
        const checkActiveSession = async () => {
            if (selectedBatch && selectedGrade) {
                const normalizedGrade = selectedGrade.trim().replace(/\s+/g, '_');
                const normalizedBatch = selectedBatch.trim().replace(/\s+/g, '_');
                const batchChannel = `${adminTenantId}_${normalizedGrade}_${normalizedBatch}`;
                
                try {
                    const sessionDoc = await getDoc(doc(db, "liveSessions_private", batchChannel));
                    if (sessionDoc.exists()) {
                        const data = sessionDoc.data();
                        setChannelName(batchChannel);
                        setYoutubeInfo({
                            videoId: data.youtubeVideoId,
                            streamKey: data.streamKey,
                            rtmpUrl: data.rtmpUrl
                        });
                        setIsLive(true);
                        console.log("Session recovered for:", batchChannel);
                    }
                } catch (error) {
                    console.error("Recovery check failed:", error);
                }
            }
        };

        if (!isLive) {
            checkActiveSession();
        }
    }, [selectedBatch, selectedGrade, isLive, adminTenantId]);

    const extractYouTubeId = (url) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const startLive = async () => {
        if (!selectedBatch || !selectedGrade || !selectedSubject || !selectedTopic) {
            alert("Please select Class, Batch, Subject and Topic first.");
            return;
        }

        const videoId = extractYouTubeId(youtubeUrl) || youtubeUrl.trim();
        if (!videoId || videoId.length !== 11) {
            alert("Please provide a valid YouTube Live Stream URL or 11-character Video ID.");
            return;
        }

        const normalizedGrade = selectedGrade.trim().replace(/\s+/g, '_');
        const normalizedBatch = selectedBatch.trim().replace(/\s+/g, '_');
        const batchChannel = `${adminTenantId}_${normalizedGrade}_${normalizedBatch}`;
        setChannelName(batchChannel);
        setLoading(true);

        try {
            // 1. Create Manual Broadcast
            const startManualLive = httpsCallable(functions, 'startManualLiveSession');
            const { data: ytData } = await startManualLive({ 
                title: `${selectedSubject}: ${selectedTopic}`,
                subject: selectedSubject,
                topic: selectedTopic,
                grade: selectedGrade,
                batch: selectedBatch,
                youtubeVideoId: videoId,
                tenantId: adminTenantId
            });

            setYoutubeInfo(ytData);
            setIsLive(true);
        } catch (error) {
            console.error("Failed to start manual live session:", error);
            alert("Error starting stream: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const endLive = async () => {
        if (!window.confirm("Are you sure you want to end the lecture? This will archive the session on the platform.")) return;
        setLoading(true);

        try {
            // End Manual Broadcast
            const endManualLive = httpsCallable(functions, 'endManualLiveSession');
            await endManualLive({ 
                grade: selectedGrade,
                batch: selectedBatch,
                tenantId: adminTenantId
            });
            
            setIsLive(false);
            setYoutubeInfo(null);
            setChannelName('');
            alert("Session ended and archived.");
        } catch (error) {
            console.error("Failed to end live session:", error);
            alert("Error ending session: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(prev => ({ ...prev, [type]: true }));
        setTimeout(() => setCopySuccess(prev => ({ ...prev, [type]: false })), 2000);
    };

    const toggleMuteAll = async () => {
        if (!channelName) return;
        const muteRef = ref(realtimeDb, `liveSessions/${channelName}/commands`);
        await set(muteRef, { type: 'mute_all', timestamp: Date.now() });
        alert("Mute All command sent to all student devices.");
    };

    const handleAcknowledge = async (studentUid) => {
        if (!channelName) return;
        const handRef = ref(realtimeDb, `liveSessions/${channelName}/raisedHands/${studentUid}`);
        await set(handRef, null); 
    };

    const sendChatMessage = async () => {
        if (!chatInput.trim() || !channelName) return;
        try {
            const chatRef = ref(realtimeDb, `liveSessions/${channelName}/chat`);
            const newMessageRef = push(chatRef);
            await set(newMessageRef, {
                sender: 'Instructor',
                senderUid: auth.currentUser?.uid || 'instructor',
                text: chatInput,
                timestamp: serverTimestamp()
            });
            setChatInput('');
        } catch (error) {
            console.error("Chat failure:", error);
        }
    };

    return (
        <div className="live-panel">
            <div className="panel-header">
                <div className="header-title">
                    <Video className={isLive ? "text-red-500 animate-pulse" : ""} />
                    <h2>Live Instructor Portal</h2>
                </div>
                {isLive && <div className="live-status-tag">SESSION ACTIVE</div>}
            </div>

            <div className="main-content-grid">
                {/* Left Side: Stream Configuration & Controls */}
                <div className="stream-section glass-panel">
                    {!isLive ? (
                        <div className="setup-container animate-fade-in">
                            <div className="setup-header">
                                <h3><Cast size={20} /> New Lecture Setup</h3>
                                <p>Select session details to generate your YouTube stream keys.</p>
                            </div>

                            <div className="setup-grid">
                                <div className="form-group">
                                    <label>Target Class</label>
                                    <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
                                        <option value="">Select Class</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Target Batch</label>
                                    <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
                                        <option value="">Select Batch</option>
                                        {batches[selectedGrade]?.map(b => <option key={b} value={b}>{b}</option>) || 
                                         Object.values(batches).flat().map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Subject Domain</label>
                                    <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                                        <option value="">Select Subject</option>
                                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Lecture Topic</label>
                                    <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                                        <option value="">Select Topic</option>
                                        {topics.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>YouTube Live Stream URL</label>
                                    <input 
                                        type="text" 
                                        placeholder="https://www.youtube.com/watch?v=..." 
                                        value={youtubeUrl} 
                                        onChange={(e) => setYoutubeUrl(e.target.value)} 
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: '#fff' }}
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={startLive} 
                                className="btn-primary-large"
                                disabled={!selectedTopic || !youtubeUrl || loading}
                            >
                                {loading ? 'Initializing Session...' : (
                                    <>
                                        <Cast size={20} />
                                        Initialize Live Session
                                    </>
                                )}
                            </button>
                            
                            <div className="obs-hint">
                                <ShieldAlert size={16} />
                                <p>After initializing, you will receive stream keys to paste into OBS or your preferred streaming software.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="live-controls-container animate-fade-in">
                            <div className="live-header">
                                <div className="live-title-box">
                                    <span className="live-indicator">LIVE</span>
                                    <div>
                                        <h4>{selectedSubject}: {selectedTopic}</h4>
                                        <p>{selectedGrade} • {selectedBatch}</p>
                                    </div>
                                </div>
                                <button onClick={endLive} className="btn-danger-sm" disabled={loading}>
                                    <StopCircle size={16} /> End & Archive
                                </button>
                            </div>

                            <div className="external-links" style={{ marginTop: '20px' }}>
                                <a href={`https://youtu.be/${youtubeInfo?.videoId}`} target="_blank" rel="noreferrer" className="yt-watch-btn">
                                    <Video size={16} /> View on YouTube
                                </a>
                                <button onClick={toggleMuteAll} className="btn-secondary-sm">
                                    <MicOff size={16} /> Mute All Students
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Interaction (Chat & Hands) */}
                <div className="interaction-section">
                    <div className="sidebar-card glass-panel hands-panel">
                        <h3><HandMetal size={18} /> Hand Raises <span>{raisedHands.length}</span></h3>
                        <div className="hands-list">
                            {raisedHands.map(hand => (
                                <div key={hand.uid} className="hand-item">
                                    <span>{hand.name}</span>
                                    <button onClick={() => handleAcknowledge(hand.uid)}>Acknowledge</button>
                                </div>
                            ))}
                            {raisedHands.length === 0 && (
                                <div className="empty-state">
                                    <HandMetal size={32} opacity={0.1} />
                                    <p>No active queries</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sidebar-card glass-panel chat-panel">
                        <h3><MessageSquare size={18} /> Student Chat</h3>
                        <div className="chat-log" id="chat-log">
                            {messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`message ${msg.senderUid === auth.currentUser?.uid ? 'me' : ''}`}>
                                    <span className="sender">{msg.sender}</span>
                                    <p>{msg.text}</p>
                                </div>
                            ))}
                        </div>
                        <div className="chat-input-row">
                            <input 
                                value={chatInput} 
                                onChange={e => setChatInput(e.target.value)}
                                placeholder="Send message..."
                                onKeyPress={e => e.key === 'Enter' && sendChatMessage()}
                            />
                            <button onClick={sendChatMessage} className="send-btn">
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveInstructorPanel;
