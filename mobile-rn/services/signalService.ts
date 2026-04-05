import { db, auth } from './firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface SignalContext {
    type: 'signal' | 'ticket';
    pathname: string;
    userId?: string;
    userEmail?: string;
    tenantId?: string;
    tenantName?: string;
    appVersion: string;
    platform: string;
    timestamp: any;
    userComment?: string;
    deviceInfo: {
        brand?: string;
        modelName?: string;
        osVersion?: string;
    };
    logs?: string[];
}

// Simple in-memory log buffer for the prototype
const LOG_LIMIT = 50;
const logBuffer: string[] = [];

export const captureLog = (message: string) => {
    const timestamp = new Date().toISOString();
    logBuffer.push(`[${timestamp}] ${message}`);
    if (logBuffer.length > LOG_LIMIT) {
        logBuffer.shift();
    }
};

export const sendSignal = async (
    pathname: string, 
    userComment?: string, 
    type: 'signal' | 'ticket' = 'signal',
    tenantId?: string,
    tenantName?: string
) => {
    try {
        const user = auth.currentUser;
        const signalData: SignalContext = {
            type,
            pathname,
            userId: user?.uid,
            userEmail: user?.email || 'anonymous',
            tenantId,
            tenantName,
            appVersion: Constants.expoConfig?.version || 'unknown',
            platform: Platform.OS,
            timestamp: serverTimestamp(),
            userComment,
            deviceInfo: {
                brand: Device.brand ?? undefined,
                modelName: Device.modelName ?? undefined,
                osVersion: Device.osVersion ?? undefined,
            },
            logs: [...logBuffer]
        };

        const docRef = await addDoc(collection(db, 'signals'), signalData);
        console.log(`Signal (${type}) sent with ID: `, docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error sending signal: ', error);
        throw error;
    }
};

import * as Device from 'expo-device';
