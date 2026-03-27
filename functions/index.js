const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");

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
exports.createYouTubeBroadcast = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { title, subject, topic, grade, batch, tenantId } = request.data;
    if (!tenantId) {
        throw new HttpsError("invalid-argument", "tenantId is required for multi-tenant sessions.");
    }
    
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

/**
 * Cloud Function to end a YouTube session and archive it to lectures.
 */
exports.endYouTubeBroadcast = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { grade, batch, tenantId } = request.data;
    if (!tenantId) {
        throw new HttpsError("invalid-argument", "tenantId is required to end a session.");
    }

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
exports.initializeAllInstitutePlaylists = onCall(async (request) => {
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
exports.backfillLecturePlaylists = onCall(async (request) => {
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
exports.adminResetPassword = onCall(async (request) => {
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
        // 3. Find Auth User
        console.log(`[AdminReset] Attempting to reset password for: ${virtualEmail}`);
        const userRecord = await admin.auth().getUserByEmail(virtualEmail);
        const uid = userRecord.uid;

        // 4. Update Auth Password
        await admin.auth().updateUser(uid, { password: newPassword });

        // 5. Update Firestore User Document (Keep in sync)
        await admin.firestore().collection("users").doc(uid).set({
            password: newPassword, // Sync current password
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 6. Mark Request as DONE if ID provided
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
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError("not-found", "No user found with this mobile number. Ensure they have registered.");
        }
        throw new HttpsError("internal", "Failed to reset password: " + error.message);
    }
});

/**
 * Cloud Function to identify orphaned Auth users (missing from Firestore)
 * and rejected users in the production environment.
 */
exports.getOrphanedUsers = onCall(async (request) => {
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
exports.deleteAuthUser = onCall(async (request) => {
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
 * Automatically clean up Firebase Auth when a user is rejected.
 */
exports.onUserStatusUpdate = onDocumentUpdated("users/{uid}", async (event) => {
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
exports.onUserDeleted = onDocumentDeleted("users/{uid}", async (event) => {
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
