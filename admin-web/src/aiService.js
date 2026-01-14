
// This service integrates with Google Gemini API to generate educational content.
// Since this is a client-side app, we ask for the API Key or use a placeholder/proxy.

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export const getApiKey = () => localStorage.getItem(API_KEY_STORAGE_KEY);
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

export const generateLessonContent = async (topic, subject, grade, videoFile = null) => {
    const key = getApiKey();

    // MOCK MODE if no key provided
    if (!key) {
        console.warn("No API Key found. Using Mock AI Generation.");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    overview: `This lesson provides a comprehensive introduction to ${topic}, covering its fundamental principles and applications in ${subject}. Perfect for ${grade} students.`,
                    notes: `• Introduction to ${topic}\n• Key Formulae and Definitions\n• Real-world examples\n• Common pitfalls to avoid\n• Summary and Next Steps`,
                    quizzes: [
                        {
                            question: `What is the primary definition of ${topic}?`,
                            options: ["Option A", "Option B", "Option C"],
                            correctIndex: 0,
                            triggerPercentage: 25
                        },
                        {
                            question: `Which concept relates most closely to ${topic}?`,
                            options: ["Gravity", "Velocity", "Energy"],
                            correctIndex: 1,
                            triggerPercentage: 50
                        },
                        {
                            question: "Solve this simple application problem...",
                            options: ["10", "20", "30"],
                            correctIndex: 2,
                            triggerPercentage: 75
                        },
                        {
                            question: "Final Review: True or False?",
                            options: ["True", "False", "Both"],
                            correctIndex: 0,
                            triggerPercentage: 90
                        }
                    ]
                });
            }, 1500);
        });
    }

    // REAL AI MODE (Gemini Flash)

    let fileData = null;
    let extraContext = "";

    if (videoFile) {
        try {
            // Upload to Gemini directly
            const file = await uploadToGemini(videoFile, key);
            // Wait for processing
            const activeFile = await waitForTotalProcessing(file.name, key); // file.name is the URI 'files/...'

            fileData = {
                file_data: {
                    file_uri: activeFile.uri,
                    mime_type: activeFile.mimeType
                }
            };
            extraContext = "I have attached the full lecture video. Please analyze its transcript and visual content deeply to generate the notes and quiz.";
        } catch (e) {
            console.warn("Video upload/processing failed, falling back to basic generation.", e);
            alert("Video upload to AI failed (check console). Proceeding with text-only generation.");
        }
    }

    const prompt = `
    You are an expert teacher. I am providing a lecture video.
    
    TASK 1: Generate a detailed transcript of the key points spoken in the video.
    TASK 2: Based on that transcript, create structured educational content.
    
    Subject: ${subject}
    Grade: ${grade}
    Topic: ${topic}
    ${extraContext}
    
    Output JSON ONLY with this structure:
    {
      "transcript_summary": "A brief summary of the transcript (max 3 sentences)",
      "overview": "2 sentence summary of the lesson objective",
      "notes": "5-7 detailed bullet points derived from the video transcript",
      "quizzes": [
        { "question": "Q1 text (based on video)", "options": ["A", "B", "C"], "correctIndex": 0, "triggerPercentage": 25 },
        { "question": "Q2 text (based on video)", "options": ["A", "B", "C"], "correctIndex": 1, "triggerPercentage": 50 },
        { "question": "Q3 text (based on video)", "options": ["A", "B", "C"], "correctIndex": 2, "triggerPercentage": 75 },
        { "question": "Q4 text (based on video)", "options": ["A", "B", "C"], "correctIndex": 0, "triggerPercentage": 90 }
      ]
    }
    `;

    try {
        const reqParts = [{ text: prompt }];
        if (fileData) reqParts.push(fileData);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: reqParts }]
            })
        });

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("AI Generation Error:", error);
        alert("AI Generation failed. Check Console / API Key.");
        throw error;
    }
};

export const generateDoubtAnswer = async (doubtText) => {
    const key = getApiKey();
    if (!key) throw new Error("API Key Missing");

    // Construct prompt
    const prompt = `
    You are a friendly, encouraging, and highly knowledgeable teacher for high school students.
    A student has asked the following question:
    "${doubtText}"

    Please provide a clear, step-by-step explanation. 
    - Keep it concise but complete.
    - Use bullet points if helpful.
    - If the student is confused, encourage them.
    - Format properly with newlines.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const answer = data.candidates[0].content.parts[0].text;
        return answer;

    } catch (e) {
        console.error("AI Doubt Error", e);
        return "I'm having a bit of trouble connecting to my brain right now! Please try again later.";
    }
};

// Generate Exam from PDF
export const generateExamFromPdf = async (pdfFile, apiKey) => {
    if (!apiKey || apiKey === 'mock') {
        console.warn("No API Key. Using MOCK PDF Extraction.");
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([
                    { question: "Mock Q1: Extracted from PDF?", options: ["Yes", "No", "Maybe", "Unknown"], correctAnswer: 0 },
                    { question: "Mock Q2: Is this AI?", options: ["True", "False", "Partially", "Simulation"], correctAnswer: 3 },
                    { question: "Mock Q3: Difficulty Level?", options: ["Easy", "Medium", "Hard", "Expert"], correctAnswer: 1 }
                ]);
            }, 2000);
        });
    }

    // 1. Upload File
    const fileData = await uploadToGemini(pdfFile, apiKey);

    // 2. Wait for processing (PDFs take time)
    let processedFile = fileData;
    console.log("Waiting for PDF processing...");
    while (processedFile.state === "PROCESSING") {
        await new Promise(r => setTimeout(r, 2000));
        const checkResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${processedFile.name}?key=${apiKey}`);
        const checkData = await checkResp.json();
        processedFile = checkData;
        if (processedFile.state === "FAILED") throw new Error("Gemini File Processing Failed");
    }

    // 3. Generate Content
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: "Analyze the uploaded document. Extract ALL multiple choice questions found in the document (up to 50). Format the output STRICTLY as a JSON array of objects, where each object has: 'question' (string), 'options' (array of 4 strings), 'correctAnswer' (index 0-3). Do not include markdown code blocks, just raw JSON." },
                    { file_data: { file_uri: processedFile.uri, mime_type: processedFile.mime_type } }
                ]
            }]
        })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("No exam content generated.");

    // Simple cleanup if MD block is present
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleanText);
    } catch {
        console.error("JSON Parse Error:", text);
        throw new Error("Failed to parse AI response as JSON.");
    }
};
