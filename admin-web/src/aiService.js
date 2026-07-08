import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// This service integrates with Google Gemini API to generate educational content.
// Since this is a client-side app, we ask for the API Key or use a placeholder/proxy.

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export const getApiKey = () => {
    // Priority: 1. User specified key in LocalStorage, 2. Env variable
    const localKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (localKey) return localKey;

    return import.meta.env.VITE_GEMINI_API_KEY || "";
};
export const setApiKey = (key) => localStorage.setItem(API_KEY_STORAGE_KEY, key);

// Helper to upload file to Gemini File API (supports larger files)
const uploadToGemini = async (file, key) => {
    console.log("Starting Video Upload to Gemini...", file.name, file.size);

    // 1. Initiate Resumable Upload
    const initResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: file.name } })
    });

    if (!initResponse.ok) {
        const err = await initResponse.text();
        console.error("Upload Init Error:", err);
        throw new Error("Failed to initiate upload: " + err);
    }

    const uploadUrl = initResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL received");

    // 2. Upload Bytes
    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Length': file.size.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: file
    });

    if (!uploadResponse.ok) throw new Error("Failed to upload file bytes");

    const uploadResult = await uploadResponse.json();
    return uploadResult.file;
};

// Helper: Wait for file processing to be ACTIVE
const waitForTotalProcessing = async (uri, key) => {
    console.log("Waiting for video processing...");
    let file = null;
    // Timeout after 60s
    const startTime = Date.now();

    while (Date.now() - startTime < 60000) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${uri}?key=${key}`);
        file = await res.json();

        if (file.state === 'ACTIVE') break;
        if (file.state === 'FAILED') throw new Error("Video processing failed on server side.");

        console.log("Processing state:", file.state);
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
    }
    if (file?.state !== 'ACTIVE') throw new Error("Video processing timed out.");
    return file;
};

export const extractYoutubeId = (input) => {
    if (!input) return "";
    const trimmed = input.trim();
    
    // 1. Check for standard patterns
    const patterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,           // youtu.be/ID
        /watch\?v=([a-zA-Z0-9_-]{11})/,            // youtube.com/watch?v=ID
        /embed\/([a-zA-Z0-9_-]{11})/,              // youtube.com/embed/ID
        /shorts\/([a-zA-Z0-9_-]{11})/,             // youtube.com/shorts/ID
        /live\/([a-zA-Z0-9_-]{11})/,               // youtube.com/live/ID
        /v=([a-zA-Z0-9_-]{11})/,                   // ?v=ID
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match && match[1]) return match[1];
    }

    // 2. Reject if it looks like a YouTube Playback ID (diagnostic-only, typically 16 chars)
    if (trimmed.length > 11 && trimmed.length <= 16 && !trimmed.startsWith('http')) {
        console.warn("Detected likely YouTube Playback ID (diagnostic code), which is not a Video ID.");
        return ""; 
    }

    // 3. Fallback to raw ID check (must be exactly 11 chars and alphanumeric/symbols)
    const rawIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/);
    if (rawIdMatch) return trimmed;

    // Default: Only return trimmed if it's exactly the right length for a YouTube Video ID
    return trimmed.length === 11 ? trimmed : ""; 
};

export const generateLessonContent = async (topic, subject, grade, youtubeVideoId, tenantId, videoUrl = null) => {
    if (!youtubeVideoId && !videoUrl) {
        console.warn("AI Generation requires either youtubeVideoId or videoUrl.");
        return {
            overview: "AI Generation is unavailable.",
            notes: "Please provide a YouTube video or file to generate AI content.",
            transcript: "",
            quizzes: []
        };
    }

    try {
        console.log(`[AI-Service] Calling generateLectureAI (Multimodal: ${!!videoUrl})...`);
        const generateAI = httpsCallable(functions, 'generateLectureAI');
        const result = await generateAI({ youtubeVideoId, tenantId, videoUrl });
        
        if (result.data && result.data.success) {
            return result.data.data;
        } else {
            throw new Error(result.data?.error || "Failed to generate AI content");
        }
    } catch (error) {
        console.error("[AI-Service] Error:", error.message);
        throw error;
    }
};


export const generateDoubtAnswer = async (doubtText) => {
    return "The AI Doubt Assistant is currently undergoing maintenance. Please reach out to your teacher or check the lesson notes for help!";
};


