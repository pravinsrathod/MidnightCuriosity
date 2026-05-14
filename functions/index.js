import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import admin from "firebase-admin";
import axios from "axios";
import { google } from "googleapis";

import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import { fetchTranscript as fetchTranscriptPlus } from 'youtube-transcript-plus';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { Innertube } from "youtubei.js";
import fs from "fs";
import path from "path";
import os from "os";

admin.initializeApp();

// Set global options to allow cross-origin requests and specify region if needed
setGlobalOptions({ region: "us-central1" });

/**
 * Helper to ensure an institute has a dedicated YouTube Playlist.
 */
async function getOrCreatePlaylist(youtube, tenantId) {
    const tenantRef = admin.firestore().collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    
    if (!tenantSnap.exists) return null;
    const data = tenantSnap.data();
    
    if (data.youtubePlaylistId) return data.youtubePlaylistId;

    console.log(`[YouTube] Creating new playlist for tenant: ${data.name || tenantId}`);
    try {
        const playlist = await youtube.playlists.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: `${data.name || 'Institute'} - Live Lectures`,
                    description: `Automated archive of live sessions for ${data.name || tenantId}.`,
                },
                status: {
                    privacyStatus: 'unlisted'
                }
            }
        });

        const playlistId = playlist.data.id;
        await tenantRef.update({ youtubePlaylistId: playlistId });
        return playlistId;
    } catch (e) {
        console.error("Failed to create playlist:", e.message);
        return null;
    }
}
/**
 * Helper to check if a user has admin or superadmin permissions.
 * Supports hardcoded superadmin email and Firestore roles.
 */
async function checkAdminPermission(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const SUPERADMIN_EMAIL = 'prowintechs@gmail.com';
    const isSuperAdminEmail = request.auth.token.email === SUPERADMIN_EMAIL;

    // Fast track for superadmin email
    if (isSuperAdminEmail) return true;

    try {
        const userDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
        if (userDoc.exists) {
            const role = userDoc.data().role?.toUpperCase();
            if (role === 'ADMIN' || role === 'SUPERADMIN' || role === 'SUPER ADMIN') return true;
        }
    } catch (e) {
        console.error("Permission check failed:", e.message);
    }

    throw new HttpsError("permission-denied", "Unauthorized access.");
}

/**
 * Cloud Function to create an automated Unlisted YouTube Broadcast.
 */
export const createYouTubeBroadcast = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const tenantId = request.data.tenantId || 'default';
    const { title, subject, topic, grade, batch } = request.data;
    
    const normalizedGrade = grade.trim().replace(/\s+/g, '_');
    const normalizedBatch = batch.trim().replace(/\s+/g, '_');
    const channelName = `${tenantId}_${normalizedGrade}_${normalizedBatch}`;

    // Role check
    const userDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
    const isTeacher = userDoc.exists && (userDoc.data().role === 'admin' || userDoc.data().role === 'teacher');
    if (!isTeacher) {
        throw new HttpsError("permission-denied", "Only teachers can start broadcasts.");
    }

    let YT_CLIENT_ID = process.env.YT_CLIENT_ID;
    let YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
    let YT_REFRESH_TOKEN = process.env.YT_REFRESH_TOKEN;

    // Fetch tenant-specific credentials if available
    if (tenantId && tenantId !== 'default') {
        const tenantDoc = await admin.firestore().collection("tenants").doc(tenantId).get();
        if (tenantDoc.exists) {
            const data = tenantDoc.data();
            if (data.youtubeConfig) {
                console.log(`[YouTube] Using tenant-specific configuration for ${tenantId}`);
                YT_CLIENT_ID = data.youtubeConfig.clientId || YT_CLIENT_ID;
                YT_CLIENT_SECRET = data.youtubeConfig.clientSecret || YT_CLIENT_SECRET;
                YT_REFRESH_TOKEN = data.youtubeConfig.refreshToken || YT_REFRESH_TOKEN;
            }
        }
    }

    if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
        console.error("YouTube OAuth credentials missing.");
        throw new HttpsError("failed-precondition", "YouTube configuration is missing for this institute.");
    }

    try {
        const oauth2Client = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
        oauth2Client.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // 1. Create Broadcast (Unlisted)
        console.log(`[YouTube] Creating broadcast for ${channelName}...`);
        const broadcast = await youtube.liveBroadcasts.insert({
            part: 'snippet,status,contentDetails',
            requestBody: {
                snippet: {
                    title: title || `Live: ${subject} - ${topic}`,
                    description: `Live Session for ${grade} ${batch} on EduPro.`,
                    scheduledStartTime: new Date().toISOString(),
                },
                status: {
                    privacyStatus: 'unlisted',
                    selfDeclaredMadeForKids: false,
                },
                contentDetails: {
                    enableAutoStart: true,
                    enableAutoStop: true,
                }
            }
        });

        const videoId = broadcast.data.id;

        // 2. Create Stream (RTMP)
        console.log(`[YouTube] Creating stream for broadcast ${videoId}...`);
        const stream = await youtube.liveStreams.insert({
            part: 'snippet,cdn',
            requestBody: {
                snippet: { title: `Stream for ${videoId}` },
                cdn: {
                    frameRate: '30fps',
                    ingestionType: 'rtmp',
                    resolution: '720p',
                }
            }
        });

        const streamId = stream.data.id;
        const streamKey = stream.data.cdn.ingestionInfo.streamName;
        const rtmpUrl = stream.data.cdn.ingestionInfo.ingestionAddress;

        // 3. Bind Stream to Broadcast
        console.log(`[YouTube] Binding stream ${streamId} to broadcast ${videoId}...`);
        await youtube.liveBroadcasts.bind({
            id: videoId,
            streamId: streamId,
            part: 'id,contentDetails'
        });

        // 4. Update Public Live Session (for students)
        await admin.firestore().collection("liveSessions").doc(channelName).set({
            title: title || `Live: ${subject} - ${topic}`,
            subject,
            topic,
            grade,
            batch,
            youtubeVideoId: videoId,
            status: 'live',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            instructorUid: request.auth.uid,
            tenantId: tenantId || 'default'
        });

        // 5. Update Private Live Session (for instructor only)
        await admin.firestore().collection("liveSessions_private").doc(channelName).set({
            streamKey,
            rtmpUrl,
            youtubeVideoId: videoId,
            grade,
            batch,
            instructorUid: request.auth.uid,
            tenantId: tenantId || 'default'
        });

        // 6. Add Video to Institute Playlist (Option 1)
        if (tenantId && tenantId !== 'default') {
            try {
                const playlistId = await getOrCreatePlaylist(youtube, tenantId);
                if (playlistId) {
                    console.log(`[YouTube] Adding video ${videoId} to playlist ${playlistId}...`);
                    await youtube.playlistItems.insert({
                        part: 'snippet',
                        requestBody: {
                            snippet: {
                                playlistId: playlistId,
                                resourceId: {
                                    kind: 'youtube#video',
                                    videoId: videoId
                                }
                            }
                        }
                    });
                }
            } catch (playlistErr) {
                console.warn("[YouTube] Failed to add to playlist, but continuing session:", playlistErr.message);
            }
        }

        return {
            videoId,
            streamKey,
            rtmpUrl
        };

    } catch (error) {
        console.error("YouTube Integration Error:", error.response?.data || error.message);
        throw new HttpsError("internal", "Failed to setup YouTube broadcast.");
    }
});

/**
 * Cloud Function to send push notifications via Expo.
 * Usage: call from frontend via Firebase SDK.
 */
export const sendPushNotification = onCall(async (request) => {
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

/**
 * Cloud Function to end a YouTube session and archive it to lectures.
 */
export const endYouTubeBroadcast = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const tenantId = request.data.tenantId || 'default';
    const { grade, batch } = request.data;

    const normalizedGrade = grade.trim().replace(/\s+/g, '_');
    const normalizedBatch = batch.trim().replace(/\s+/g, '_');
    const channelName = `${tenantId}_${normalizedGrade}_${normalizedBatch}`;

    console.log(`[YouTube] Ending session for ${channelName}...`);

    try {
        const sessionDoc = await admin.firestore().collection("liveSessions").doc(channelName).get();
        if (!sessionDoc.exists) {
            throw new HttpsError("not-found", "No active session found for this batch.");
        }

        const sessionData = sessionDoc.data();

        // 1. Move to lectures collection (Merges into curriculum)
        console.log(`[YouTube] Archiving session ${sessionData.youtubeVideoId} to lectures...`);
        await admin.firestore().collection("lectures").add({
            title: sessionData.title,
            grade: sessionData.grade,
            subject: sessionData.subject,
            topic: sessionData.topic,
            batch: sessionData.batch,
            videoUrl: `https://www.youtube.com/watch?v=${sessionData.youtubeVideoId}`,
            youtubeVideoId: sessionData.youtubeVideoId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: 'video',
            source: 'youtube_live',
            duration: 'Live Session',
            tenantId: sessionData.tenantId || 'default'
        });

        // 2. Clear active session status (Public & Private)
        await admin.firestore().collection("liveSessions").doc(channelName).delete();
        await admin.firestore().collection("liveSessions_private").doc(channelName).delete();

        // 3. Clear RTDB Interactions (Chat & Hands)
        console.log(`[YouTube] Cleaning up RTDB for ${channelName}...`);
        const rtdbPath = `liveSessions/${channelName}`;
        await admin.database().ref(rtdbPath).remove();

        return { success: true };

    } catch (error) {
        console.error("YouTube End Session Error:", error.message);
        throw new HttpsError("internal", "Failed to end YouTube session.");
    }
});
/**
 * Cloud Function to backfill YouTube Playlists for all existing institutes.
 * Only callable by Super Admins.
 */
export const initializeAllInstitutePlaylists = onCall(async (request) => {
    // Role check (Super Admin or Admin)
    await checkAdminPermission(request);

    const YT_CLIENT_ID = process.env.YT_CLIENT_ID;
    const YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
    const YT_REFRESH_TOKEN = process.env.YT_REFRESH_TOKEN;

    if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
        throw new HttpsError("failed-precondition", "Global YouTube credentials missing.");
    }

    try {
        const oauth2Client = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
        oauth2Client.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        const tenantsSnap = await admin.firestore().collection("tenants").get();
        let createdCount = 0;
        let skippedCount = 0;

        for (const doc of tenantsSnap.docs) {
            const data = doc.data();
            if (!data.youtubePlaylistId) {
                const playlistId = await getOrCreatePlaylist(youtube, doc.id);
                if (playlistId) createdCount++;
            } else {
                skippedCount++;
            }
        }

        return { success: true, created: createdCount, skipped: skippedCount };
    } catch (error) {
        console.error("Backfill Error:", error.message);
        throw new HttpsError("internal", "Migration failed: " + error.message);
    }
});

/**
 * Cloud Function to backfill all existing lectures into their respective YouTube Playlists.
 */
export const backfillLecturePlaylists = onCall(async (request) => {
    await checkAdminPermission(request);

    const YT_CLIENT_ID = process.env.YT_CLIENT_ID;
    const YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
    const YT_REFRESH_TOKEN = process.env.YT_REFRESH_TOKEN;

    try {
        const oauth2Client = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
        oauth2Client.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        const lecturesSnap = await admin.firestore().collection("lectures").get();
        const tenantCache = {}; // Cache playlist IDs
        let migratedCount = 0;
        let failedCount = 0;

        for (const doc of lecturesSnap.docs) {
            const lec = doc.data();
            if (lec.youtubeVideoId && lec.tenantId && lec.tenantId !== 'default') {
                let playlistId = tenantCache[lec.tenantId];
                if (!playlistId) {
                    const tenantDoc = await admin.firestore().collection("tenants").doc(lec.tenantId).get();
                    playlistId = tenantDoc.exists ? tenantDoc.data().youtubePlaylistId : null;
                    if (playlistId) tenantCache[lec.tenantId] = playlistId;
                }

                if (playlistId) {
                    try {
                        console.log(`[YouTube] Migration: Adding ${lec.youtubeVideoId} to ${playlistId}`);
                        await youtube.playlistItems.insert({
                            part: 'snippet',
                            requestBody: {
                                snippet: {
                                    playlistId: playlistId,
                                    resourceId: { kind: 'youtube#video', videoId: lec.youtubeVideoId }
                                }
                            }
                        });
                        migratedCount++;
                    } catch (e) {
                        console.warn(`[YouTube] Failed to add ${lec.youtubeVideoId}:`, e.message);
                        failedCount++;
                    }
                }
            }
        }

        return { success: true, migrated: migratedCount, failed: failedCount };
    } catch (error) {
        console.error("Lecture Backfill Error:", error.message);
        throw new HttpsError("internal", "Migration failed: " + error.message);
    }
});

/**
 * Cloud Function for Admins to reset a student's password.
 */
export const adminResetPassword = onCall(async (request) => {
    // 1. Check authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { phoneNumber, newPassword, tenantId, requestId } = request.data;
    if (!phoneNumber || !newPassword || !tenantId) {
        throw new HttpsError("invalid-argument", "phoneNumber, newPassword, and tenantId are required.");
    }

    // 2. Role check (Admin only) for the current tenant
    const userDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const isAdmin = userData && (userData.role === 'admin' || userData.role === 'ADMIN');
    const isSameTenant = userData && userData.tenantId === tenantId;

    if (!isAdmin || !isSameTenant) {
        throw new HttpsError("permission-denied", "Only administrators of this institute can reset passwords.");
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const virtualEmail = `${cleanPhone}@midnightcuriosity.com`;

    try {
        // 3. Admin Safeguard: Verify target user is NOT an admin
        const targetUserQuery = await admin.firestore().collection("users")
            .where("phoneNumber", "==", cleanPhone)
            .where("tenantId", "==", tenantId)
            .limit(1)
            .get();

        if (!targetUserQuery.empty) {
            const targetUserData = targetUserQuery.docs[0].data();
            if (targetUserData.role === 'admin' || targetUserData.role === 'ADMIN') {
                throw new HttpsError("permission-denied", "Automated reset is not allowed for administrator accounts. Please use the standard reset flow.");
            }
        }

        // 4. Find Auth User
        console.log(`[AdminReset] Attempting to reset password for: ${virtualEmail}`);
        const userRecord = await admin.auth().getUserByEmail(virtualEmail);
        const uid = userRecord.uid;

        // 5. Update Auth Password
        await admin.auth().updateUser(uid, { password: newPassword });

        // 6. Update Firestore User Document (Keep in sync)
        await admin.firestore().collection("users").doc(uid).set({
            password: newPassword, // Sync current password
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 7. Mark Request as DONE if ID provided
        if (requestId) {
            await admin.firestore().collection("password_reset_requests").doc(requestId).update({
                status: 'DONE',
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                resolvedBy: request.auth.uid,
                autoResolved: true
            });
        }

        return { success: true, message: `Password for ${phoneNumber} was reset successfully.` };

    } catch (error) {
        console.error("Admin Password Reset Error:", error.message);
        if (error instanceof HttpsError) throw error;
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError("not-found", "No user found with this mobile number. Ensure they have registered.");
        }
        throw new HttpsError("internal", "Failed to reset password: " + error.message);
    }
});

/**
 * Cloud Function for Students/Parents to request a password reset.
 * Automatically looks up the correct tenantId to prevent data leakage.
 */
export const requestPasswordReset = onCall(async (request) => {
    const { phoneNumber, studentName, type, tenantId: providedTenantId } = request.data;

    if (!phoneNumber) {
        throw new HttpsError("invalid-argument", "phoneNumber is required.");
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

    try {
        // 1. Find the user in Firestore to get their actual tenantId
        const usersRef = admin.firestore().collection("users");
        
        let userQuery;
        if (providedTenantId) {
            // Strict check: User must belong to the institute they are currently viewing
            userQuery = await usersRef
                .where("phoneNumber", "==", cleanPhone)
                .where("tenantId", "==", providedTenantId)
                .limit(1)
                .get();
        } else {
            // Fallback for older clients (though we should encourage tenantId)
            userQuery = await usersRef
                .where("phoneNumber", "==", cleanPhone)
                .limit(1)
                .get();
        }

        if (userQuery.empty) {
            const errorMsg = providedTenantId 
                ? "No account found with this phone number in this institute. Please verify your number or select the correct institute."
                : "No account found with this phone number. Please check your number or contact your institute.";
            throw new HttpsError("not-found", errorMsg);
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const tenantId = userData.tenantId;

        if (!tenantId) {
            throw new HttpsError("failed-precondition", "Your account is not associated with any institute. Please contact support.");
        }

        // 2. Deduplication: Check if a PENDING request already exists
        const existingRequest = await admin.firestore().collection("password_reset_requests")
            .where("phoneNumber", "==", cleanPhone)
            .where("tenantId", "==", tenantId)
            .where("status", "==", "PENDING")
            .limit(1)
            .get();

        if (!existingRequest.empty) {
            throw new HttpsError("already-exists", "You already have a pending reset request. Please wait for your administrator to resolve it.");
        }

        // 3. Look up the institute name
        const tenantRef = admin.firestore().collection("tenants").doc(tenantId);
        const tenantSnap = await tenantRef.get();
        const instituteName = tenantSnap.exists ? tenantSnap.data().name : "Unknown Institute";

        // 4. Create the password reset request using authoritative data from Firestore
        await admin.firestore().collection("password_reset_requests").add({
            studentName: userData.name || "Unknown User", // Authoritative
            phoneNumber: cleanPhone,
            tenantId: tenantId,
            userId: userDoc.id, // For better traceability
            instituteName: instituteName,
            status: 'PENDING',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: userData.role || 'STUDENT' // Authoritative
        });

        return { success: true, message: "Password reset request sent to your institute administrator." };

    } catch (error) {
        console.error("Request Password Reset Error:", error.message);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Failed to process request: " + error.message);
    }
});

/**
 * Cloud Function to identify orphaned Auth users (missing from Firestore)
 * and rejected users in the production environment.
 */
export const getOrphanedUsers = onCall(async (request) => {
    await checkAdminPermission(request);

    try {
        console.log("[Integrity] Starting User Audit...");
        
        // 1. Fetch all Auth users
        const authUsers = [];
        let nextPageToken;
        do {
            const listResult = await admin.auth().listUsers(1000, nextPageToken);
            authUsers.push(...listResult.users);
            nextPageToken = listResult.pageToken;
        } while (nextPageToken);

        // 2. Fetch all Firestore UIDs
        const firestoreUsersSnap = await admin.firestore().collection("users").select().get();
        const firestoreUids = new Set(firestoreUsersSnap.docs.map(doc => doc.id));

        // 3. Identify Orphans
        const orphans = authUsers
            .filter(user => !firestoreUids.has(user.uid) && user.email?.endsWith("@midnightcuriosity.com"))
            .map(user => ({
                uid: user.uid,
                email: user.email,
                phoneNumber: user.phoneNumber,
                createdAt: user.metadata.creationTime,
                lastLogin: user.metadata.lastSignInTime
            }));

        // 4. Identify Rejected users in Firestore
        const rejectedUsersSnap = await admin.firestore().collection("users")
            .where("status", "==", "REJECTED")
            .get();
            
        const rejected = rejectedUsersSnap.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));

        return { 
            success: true, 
            orphans, 
            rejected, 
            counts: {
                totalAuth: authUsers.length,
                totalFirestore: firestoreUids.size,
                orphans: orphans.length,
                rejected: rejected.length
            }
        };
    } catch (error) {
        console.error("Audit Error:", error.message);
        throw new HttpsError("internal", "Audit failed: " + error.message);
    }
});

/**
 * Cloud Function to delete a specific Auth user record.
 * This is used to cleanup orphans or allow rejected users to re-register.
 */
export const deleteAuthUser = onCall(async (request) => {
    await checkAdminPermission(request);

    const { uid } = request.data;
    if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

    try {
        console.log(`[Integrity] Deleting Auth record for UID: ${uid}`);
        await admin.auth().deleteUser(uid);
        return { success: true, message: `Auth record for ${uid} deleted.` };
    } catch (error) {
        console.error("Delete Auth Error:", error.message);
        throw new HttpsError("internal", "Failed to delete Auth record: " + error.message);
    }
});

/**
 * Helper to download YouTube audio to /tmp
 */
async function downloadYouTubeAudio(videoId) {
    const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);
    console.log(`[AI-Gen] Extracting audio for ${videoId} to ${filePath}...`);
    
    // Fallback chain of clients to try
    const clients = ['IOS', 'ANDROID', 'WEB'];
    let lastError = null;

    for (const client of clients) {
        try {
            console.log(`[AI-Gen] Trying extraction with ${client} client...`);
            const youtube = await Innertube.create({ client_type: client });
            const info = await youtube.getBasicInfo(videoId);
            
            // Find best audio format
            const format = info.chooseFormat({ type: 'audio', quality: 'best' });
            if (!format) {
                console.warn(`[AI-Gen] No suitable audio format for client ${client}`);
                continue;
            }

            const stream = await info.download(format);
            const fileStream = fs.createWriteStream(filePath);
            
            // In Node 22, we can iterate over the web stream directly with for-await
            for await (const chunk of stream) {
                fileStream.write(Buffer.from(chunk));
            }
            fileStream.end();

            return new Promise((resolve, reject) => {
                fileStream.on('finish', () => {
                    console.log(`[AI-Gen] Successfully extracted audio using ${client} client.`);
                    resolve(filePath);
                });
                fileStream.on('error', (err) => reject(err));
            });
        } catch (err) {
            lastError = err;
            console.error(`[AI-Gen] Attempt with ${client} client failed: ${err.message}`);
            // If it's a 404 or Streaming error, try the next client
            continue;
        }
    }

    throw lastError || new Error("All YouTube clients failed to provide streaming data.");
}

/**
 * Cloud Function to generate AI-powered lecture content (Transcript -> Summary, Notes, Quizzes).
 */
export const generateLectureAI = onCall({ 
    timeoutSeconds: 300,
    memory: "512MiB" 
}, async (request) => {
    // 1. Auth check
    await checkAdminPermission(request);

    const tenantId = request.data.tenantId || 'default';
    const { youtubeVideoId, videoUrl } = request.data;
    if (!youtubeVideoId && !videoUrl) throw new HttpsError("invalid-argument", "Either youtubeVideoId or videoUrl is required.");

    try {
        console.log(`[AI-Gen] Processing lecture for ${youtubeVideoId} (Tenant: ${tenantId})...`);

        // 2. Fetch Institute Gemini API Key
        const tenantDoc = await admin.firestore().collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) {
            throw new HttpsError("not-found", "Institute not found.");
        }
        
        const apiKey = tenantDoc.data().geminiApiKey;
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "Gemini API Key is not configured for this institute. Please add it in System Settings.");
        }

        // 3. Extract Video ID (Clean input)
        const extractId = (idOrUrl) => {
            const trimmed = idOrUrl.trim();
            const patterns = [
                /youtu\.be\/([a-zA-Z0-9_-]{11})/,
                /watch\?v=([a-zA-Z0-9_-]{11})/,
                /embed\/([a-zA-Z0-9_-]{11})/,
                /shorts\/([a-zA-Z0-9_-]{11})/,
                /live\/([a-zA-Z0-9_-]{11})/,
                /v=([a-zA-Z0-9_-]{11})/
            ];
            for (const pattern of patterns) {
                const match = trimmed.match(pattern);
                if (match && match[1]) return match[1];
            }
            return trimmed.length === 11 ? trimmed : null;
        };

        // 4. Fetch Transcript (with Fallbacks)
        let transcriptText = "";
        let cleanVideoId = "";

        if (youtubeVideoId) {
            cleanVideoId = extractId(youtubeVideoId);
            if (cleanVideoId) {
                console.log(`[AI-Gen] Attempting transcript fetch for ID: ${cleanVideoId}...`);
                try {
                    // Try primary library
                    const transcriptArray = await YoutubeTranscript.fetchTranscript(cleanVideoId);
                    transcriptText = transcriptArray.map(p => p.text).join(' ');
                    console.log(`[AI-Gen] Primary fetch success (${transcriptText.length} chars)`);
                } catch (e1) {
                    console.warn("[AI-Gen] Primary fetch failed, trying fallback...", e1.message);
                    try {
                        // Try fallback library (robust InnerTube scraper)
                        const fallbackTranscript = await fetchTranscriptPlus(cleanVideoId);
                        transcriptText = fallbackTranscript.map(p => p.text).join(' ');
                        console.log(`[AI-Gen] Fallback fetch success (${transcriptText.length} chars)`);
                    } catch (e2) {
                        console.error("[AI-Gen] Both transcript fetchers failed.");
                    }
                }
            }
        }

        // 5. Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 6. MULTIMODAL FALLBACK: If no transcript, try Audio Extraction or use direct media URL
        let multimodalContent = [];
        let tempFilePath = null;

        if (!transcriptText) {
            if (youtubeVideoId && cleanVideoId) {
                console.log(`[AI-Gen] No transcript found. Attempting automatic Audio Extraction for: ${cleanVideoId}`);
                try {
                    tempFilePath = await downloadYouTubeAudio(cleanVideoId);
                    const uploadResult = await fileManager.uploadFile(tempFilePath, {
                        mimeType: "audio/mp4",
                        displayName: `YouTube Audio ${cleanVideoId}`
                    });
                    
                    console.log(`[AI-Gen] Audio uploaded to Gemini File API: ${uploadResult.file.uri}`);
                    
                    // Wait for the file to be "ACTIVE"
                    let file = await fileManager.getFile(uploadResult.file.name);
                    while (file.state === "PROCESSING") {
                        process.stdout.write(".");
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                        file = await fileManager.getFile(uploadResult.file.name);
                    }

                    if (file.state === "FAILED") {
                        throw new Error("Gemini audio processing failed.");
                    }

                    multimodalContent = [
                        {
                            fileData: {
                                fileUri: uploadResult.file.uri,
                                mimeType: uploadResult.file.mimeType
                            }
                        },
                        { text: `Listen to this video's audio and transcribe it verbatim. Then use that transcript as context for the following instructions.` }
                    ];
                } catch (audioErr) {
                    console.error("[AI-Gen] Audio extraction fallback failed:", audioErr.message);
                    // Pass a more descriptive error back to the user
                    if (audioErr.message.includes("bot") || audioErr.message.includes("Sign in")) {
                        throw new HttpsError("permission-denied", "YouTube has blocked this automated request. Please try uploading the direct MP4 file instead.");
                    }
                    throw audioErr;
                } finally {
                    // Cleanup /tmp file
                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                }
            }

            // If audio extraction failed but we have a direct videoUrl, use that
            if (multimodalContent.length === 0 && videoUrl) {
                console.log(`[AI-Gen] Using direct media URL as fallback: ${videoUrl}`);
                multimodalContent = [
                    {
                        fileData: {
                            fileUri: videoUrl,
                            mimeType: "video/mp4"
                        }
                    },
                    { text: `Analyze the content of this video directly and use it as context for the following instructions.` }
                ];
            }
        }

        if (!transcriptText && multimodalContent.length === 0) {
            throw new HttpsError("not-found", "Failed to retrieve transcript or audio. AI generation requires meaningful content. Please provide a video with captions or a direct media file.");
        }

        const prompt = `
            You are an expert educator and content architect.
            Based on the provided ${transcriptText ? 'transcript' : 'video content'}, generate:
            1. 'overview': A concise executive summary (max 3 sentences).
            2. 'notes': Detailed, pedagogical study notes in clear Markdown format. Include sections, bold key terms, and bullet points.
            3. 'quizzes': An array of 3-5 high-quality multiple choice questions.
               Each quiz object MUST have:
               - 'question': The inquiry text.
               - 'options': Array of exactly 3 possible answers.
               - 'correctIndex': Integer (0, 1, or 2) representing the correct option.
               - 'triggerPercentage': Integer (between 10 and 90) representing when this quiz should pop up during the video.

            Return only a JSON object with keys 'overview', 'notes', and 'quizzes'.

            ${transcriptText ? `TRANSCRIPT:\n${transcriptText.substring(0, 50000)}` : "CONTENT: [See attached multimodal video file]"}
        `;

        if (multimodalContent.length > 0) {
            multimodalContent.push({ text: prompt });
        } else {
            multimodalContent = [prompt];
        }

        console.log(`[AI-Gen] Invoking Gemini for synthesis (Multimodal: ${multimodalContent.length > 1})...`);
        const result = await model.generateContent(multimodalContent);
        const response = await result.response;
        const text = response.text();

        try {
            const parsedData = JSON.parse(text);
            return {
                success: true,
                data: {
                    ...parsedData,
                    transcript: transcriptText
                }
            };
        } catch (parseErr) {
            console.error("[AI-Gen] Result parsing failed:", text);
            throw new HttpsError("internal", "Failed to structure AI response.");
        }

    } catch (error) {
        console.error("AI Generation Error:", error.message);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", error.message || "Failed to generate AI content.");
    }
});

/**
 * Automatically clean up Firebase Auth when a user is rejected.
 */
export const onUserStatusUpdate = onDocumentUpdated("users/{uid}", async (event) => {
    const newValue = event.data.after.data();
    const oldValue = event.data.before.data();
    
    // If status changed to REJECTED, delete the Firestore document.
    // This will in turn trigger onUserDeleted to clean up Auth.
    if (newValue && oldValue && newValue.status === 'REJECTED' && oldValue.status !== 'REJECTED') {
        const uid = event.params.uid;
        console.log(`[Trigger] User ${uid} rejected. Deleting Firestore document...`);
        try {
            await event.data.after.ref.delete();
        } catch (error) {
            console.error(`[Trigger] Error deleting rejected doc ${uid}:`, error);
        }
    }
});

/**
 * Automatically clean up Firebase Auth when a user document is deleted.
 * This prevents orphaned Auth records during manual deletion or rejection.
 */
export const onUserDeleted = onDocumentDeleted("users/{uid}", async (event) => {
    const uid = event.params.uid;
    console.log(`[Trigger] User ${uid} deleted from Firestore. Syncing with Auth...`);
    try {
        await admin.auth().deleteUser(uid);
        console.log(`[Trigger] Successfully deleted Auth record for ${uid}`);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`[Trigger] Auth record for ${uid} already gone.`);
        } else {
            console.error(`[Trigger] Error deleting Auth record for ${uid}:`, error);
        }
    }
});

/**
 * Cloud Function to permanently delete an institute and ALL its data.
 * Purges Firestore collections, Storage assets, and provides an audit trail.
 */
export const deepDeleteTenant = onCall({
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // 1. Security Check
    await checkAdminPermission(request);

    const { tenantId, tenantName } = request.data;
    if (!tenantId) throw new HttpsError("invalid-argument", "tenantId is required.");

    console.log(`[DEEP-CLEAN] Starting purge for: ${tenantName} (${tenantId})`);

    try {
        // Multi-tenant collections to scrub
        const collections = [
            "users", "lectures", "polls", "exams", "attendance", "doubts", 
            "homework", "submissions", "fees", "feeStructures", 
            "paymentReceipts", "liveSessions", "liveSessions_private", 
            "password_reset_requests", "announcements", "results", "staff", "students"
        ];

        // 1. FIRESTORE SCRUB (Batch deletion for reliability and scale)
        for (const colName of collections) {
            const snap = await admin.firestore().collection(colName).where("tenantId", "==", tenantId).get();
            if (snap.empty) continue;

            // Batch docs in chunks of 500 (Firestore limit)
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = admin.firestore().batch();
                const chunk = docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            console.log(`[DEEP-CLEAN] Purged ${snap.size} docs from ${colName}`);
        }

        // 2. STORAGE SCRUB (Recursive prefix deletion)
        const bucket = admin.storage().bucket();
        const prefixes = [
            `logos/${tenantId}/`, 
            `lectures/${tenantId}/`, 
            `homework/${tenantId}/`, 
            `exams/${tenantId}/`
        ];
        
        for (const prefix of prefixes) {
            try {
                // deleteFiles handles recursion and large counts internally
                await bucket.deleteFiles({ prefix });
                console.log(`[DEEP-CLEAN] Storage purged for: ${prefix}`);
            } catch (err) {
                console.warn(`[DEEP-CLEAN] Storage deletion warn for ${prefix}:`, err.message);
            }
        }

        // 3. FINAL TENANT DELETION
        await admin.firestore().collection("tenants").doc(tenantId).delete();

        // 4. AUDIT LOGGING
        await admin.firestore().collection("system_logs").add({
            action: "TENANT_DEEP_CLEAN",
            tenantId,
            tenantName,
            executedBy: request.auth.token.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: "SUCCESS"
        });

        return { 
            success: true, 
            message: `Institute '${tenantName}' and all associated assets have been permanently destroyed.` 
        };

    } catch (error) {
        console.error("[DEEP-CLEAN] Critical Failure:", error);
        
        // Log failure
        await admin.firestore().collection("system_logs").add({
            action: "TENANT_DEEP_CLEAN_FAILURE",
            tenantId,
            error: error.message,
            executedBy: request.auth.token.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        throw new HttpsError("internal", "Deep clean process failed. Some data might persist. Error: " + error.message);
    }
});

/**
 * Cloud Function to get a smarter, context-aware AI response for the Support Bot.
 * Uses Gemini-1.5-Flash for low latency and high accuracy.
 */
export const getSupportBotResponse = onCall(async (request) => {
    // 1. Auth check
    if (!request.auth) {
        console.error("[SupportBot] Unauthorized request");
        throw new HttpsError("unauthenticated", "User must be logged in to access support.");
    }

    const { query, pathname, tenantId, history, userName, role } = request.data || {};
    
    console.log(`[SupportBot] Incoming request:`, { tenantId, userName, role, pathname, queryLength: query?.length });

    if (!tenantId) throw new HttpsError("invalid-argument", "tenantId is required.");
    if (!query) throw new HttpsError("invalid-argument", "query is required.");

    try {
        // 2. Fetch Tenant Config (Name and API Key)
        const tenantDoc = await admin.firestore().collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) {
            console.error(`[SupportBot] Tenant not found: ${tenantId}`);
            throw new HttpsError("not-found", "Institute configuration not found.");
        }
        
        const tenantData = tenantDoc.data();
        const apiKey = tenantData.geminiApiKey;
        const tenantName = tenantData.name || "Institute";

        if (!apiKey) {
            console.warn(`[SupportBot] No Gemini API Key for ${tenantId}.`);
            throw new HttpsError("failed-precondition", "AI Support is not enabled for this institute.");
        }

        // 3. Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Gemini history must start with a 'user' message. 
        // If the client sends history starting with a bot greeting, we must skip it.
        let filteredHistory = (history || []).map(h => ({
            role: h.role === 'bot' ? 'model' : 'user',
            parts: [{ text: h.text }]
        })).filter(h => h.parts[0].text);

        const firstUserIndex = filteredHistory.findIndex(h => h.role === "user");
        if (firstUserIndex > -1) {
            filteredHistory = filteredHistory.slice(firstUserIndex);
        } else {
            filteredHistory = [];
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: `You are "EduBot", the intelligent assistant for the ${tenantName} mobile application.
            Your goal is to provide exceptional, role-specific support to students, parents, and administrative users.
            
            CONTEXT:
            - CURRENT SCREEN: ${pathname || "Home Dashboard"}
            - USER NAME: ${userName || "Valued User"}
            - USER ROLE: ${role || "Student/Parent"}
            - INSTITUTE: ${tenantName}
 
            ROLE-SPECIFIC GUIDANCE:
            - PARENTS: They access attendance, fees, and child progress. If they ask about child dashboard access, explain they can view 'Child Details' and 'Attendance' tabs.
            - STUDENTS: They focus on lectures, homework, and knowledge graphs. If a student tries to access parent-only pages (detected by their role being STUDENT while asking about Parent-Fees), politely guide them back to 'Daily Classes' or 'Grade' dashboard.
            - ADMINS: They manage the entire institute. Focus on broadcasting, student record management, and system status.
 
            GUIDELINES:
            1. PERSONA: Be helpful, professional, and slightly encouraging.
            2. TECHNICAL ISSUES: If they mention a bug or error, ask for a brief description and suggest they 'Send Feedback' from the profile menu.
            3. HOMEWORK POLICY: Do NOT provide direct answers to academic questions. Instead, explain how to find the relevant course material or 'Doubts' section.
            4. PERMISSIONS: If any non-admin asks to change grades, delete users, or modify institute settings, explain that these actions require administrative privileges and they should contact the school office.
            5. NAVIGATION HELP: Based on CURRENT SCREEN, offer relevant tips. 
               - If on /fees, explain the 'Status' badge (PAID/UNPAID).
               - If on /attendance, explain the check-in time and date selection.
            6. INSTITUTE BRANDING: Always refer to the institute as '${tenantName}'.
 
            If data is missing or you can't satisfy a request, provide the school office contact suggestion as a professional fallback.`
        });

        const chat = model.startChat({
            history: filteredHistory,
        });

        console.log(`[SupportBot] Starting chat with ${filteredHistory.length} turns in history.`);
        const result = await chat.sendMessage(query);
        const response = await result.response;
        const text = response.text();

        // 5. Determine if we should escalate (for UI indicators)
        const escalationKeywords = ['bug', 'error', 'broken', 'not working', 'fix', 'problem', 'crash'];
        const shouldEscalate = escalationKeywords.some(kw => query.toLowerCase().includes(kw));

        return { 
            response: text,
            shouldEscalate: shouldEscalate,
            isAIGenerated: true
        };

    } catch (e) {
        // If it's already an HttpsError, just rethrow it
        if (e instanceof HttpsError) throw e;
        
        console.error("[SupportBot] Critical Error:", e.message);
        // Special case for Gemini errors
        if (e.message?.includes("API_KEY_INVALID") || e.message?.includes("blocked")) {
            throw new HttpsError("aborted", "AI service is currently unavailable for this institute.");
        }
        throw new HttpsError("internal", "Failed to reach AI support assistant: " + e.message);
    }
});
