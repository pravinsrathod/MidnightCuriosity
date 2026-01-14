
// ⚠️ SECURITY WARNING: In a production app, never store API keys in the client code.
// Use a backend proxy (Firebase Functions) to hide this.
// For this DATA DEMO only, we use it directly.
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Helper to use XHR instead of fetch for reliability
const makeXhrRequest = (url: string, method: string, data: any): Promise<string> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(new Error(`API Request Failed: ${xhr.status} ${xhr.responseText}`));
            }
        };

        xhr.onerror = () => {
            // Pass more details if available
            reject(new Error(`Network request failed via XHR. Status: ${xhr.status}, ReadyState: ${xhr.readyState}`));
        };

        xhr.ontimeout = () => {
            reject(new Error('Request timed out'));
        };

        xhr.send(JSON.stringify(data));
    });
};

export const solveHomeworkFromImage = async (base64Image: string, mimeType: string = "image/jpeg") => {
    try {
        console.log("Analyzing image with Gemini (XHR)...", mimeType);

        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
        const payload = {
            contents: [{
                parts: [
                    { text: "You are an expert tutor. Please analyze this homework problem image. 1) Identify the subject (Math, Physics, etc). 2) Solve the problem step-by-step. 3) Explain the concept clearly. Format the output with clear headers and bullet points." },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: cleanBase64
                        }
                    }
                ]
            }]
        };

        const responseText = await makeXhrRequest(url, 'POST', payload);
        const data = JSON.parse(responseText);

        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
            return data.candidates[0].content.parts[0].text;
        } else {
            console.warn("Unexpected API Response:", data);
            throw new Error("No explanation generated.");
        }

    } catch (error) {
        console.error("Gemini Vision Error:", error);
        throw error;
    }
};
