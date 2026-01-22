const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// Set global options to allow cross-origin requests and specify region if needed
setGlobalOptions({ region: "us-central1" });

/**
 * Cloud Function to send push notifications via Expo.
 * Usage: call from frontend via Firebase SDK.
 */
exports.sendPushNotification = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "The function must be called while authenticated."
        );
    }

    const { to, title, body, data } = request.data;

    // Basic validation
    if (!to || !title || !body) {
        throw new HttpsError(
            "invalid-argument",
            "Missing required fields: to, title, or body."
        );
    }

    console.log(`Sending notification to: ${to}, Title: ${title}`);

    const message = {
        to,
        sound: "default",
        title,
        body,
        data: data || {},
        priority: "high",
    };

    try {
        const response = await axios.post("https://exp.host/--/api/v2/push/send", message, {
            headers: {
                "Accept": "application/json",
                "Accept-encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
        });

        console.log("Expo Push Response:", JSON.stringify(response.data));
        return { success: true, result: response.data };
    } catch (error) {
        console.error("Error sending push notification:", error.response?.data || error.message);
        throw new HttpsError(
            "internal",
            "Failed to send push notification via Expo.",
            error.response?.data
        );
    }
});
