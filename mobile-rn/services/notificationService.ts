import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
    }

    // Get the token
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Expo Push Token:', token);
    } catch (e) {
        console.warn('Could not get push token:', e);
    }

    return token;
}

export async function sendPushNotification(to: string | string[], title: string, body: string, data: any = {}) {
    const message = {
        to,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        const result = await response.json();
        console.log('Notification result:', result);
        return result;
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}


export async function savePushTokenToUser(uid: string, token: string) {
    try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
            pushToken: token,
            pushTokenUpdatedAt: new Date().toISOString()
        });
        console.log('Push token saved to Firestore for user:', uid);
    } catch (error) {
        console.error('Error saving push token to Firestore:', error);
    }
}
