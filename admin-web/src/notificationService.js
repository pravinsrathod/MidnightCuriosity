import { functions } from './firebase';
import { httpsCallable } from 'firebase/functions';

export async function sendPushNotification(to, title, body, data = {}) {
    console.log('Sending Notification via Cloud Function:', { to, title });

    try {
        const sendPush = httpsCallable(functions, 'sendPushNotification');
        const result = await sendPush({
            to,
            title,
            body,
            data
        });

        console.log('Notification result:', result.data);
        return result.data;
    } catch (error) {
        console.error('Error sending push notification via Cloud Function:', error);
        return { success: false, error: error.message };
    }
}
