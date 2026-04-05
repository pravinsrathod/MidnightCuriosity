import { initializeApp, getApp, getApps } from "firebase/app";
import { Platform } from 'react-native';
import { 
    initializeAuth, 
    getAuth, 
    Auth, 
    connectAuthEmulator,
    // @ts-ignore - Valid in RN environment but types might not be resolved correctly by TS
    getReactNativePersistence
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// 2. Initialize Firebase App
let app;
if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

// 3. Initialize Auth with direct persistence (Metro will now resolve this correctly)
let auth: Auth;
if (Platform.OS === 'web') {
    auth = getAuth(app);
} else {
    // For Native, we MUST use initializeAuth once to set persistence.
    // We try to initialize it first. If it was already initialized, we get the existing instance.
    try {
        auth = initializeAuth(app, { 
            persistence: getReactNativePersistence(AsyncStorage) 
        });
    } catch (e: any) {
        // Fallback if already initialized (v9 modular SDK throws if duplicate)
        auth = getAuth(app);
    }
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const realtimeDb = getDatabase(app);

// Emulator Support
if (__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === "true") {
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    console.log(`Connecting to Firebase Emulators at ${host}...`);

    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectDatabaseEmulator(realtimeDb, host, 9000);
    connectStorageEmulator(storage, host, 9199);
}
