import { initializeApp, getApp, getApps } from "firebase/app";
import { Platform } from 'react-native';
import { initializeAuth, getAuth, Auth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
    apiKey: "AIzaSyDNj2bw0iJCifqatHqb4qrrafl-wxrmjuA",
    authDomain: "midnightcuriosity.firebaseapp.com",
    projectId: "midnightcuriosity",
    storageBucket: "midnightcuriosity.firebasestorage.app",
    messagingSenderId: "191248941616",
    appId: "1:191248941616:android:b80f9750c2512d80d8a3f5"
};

let app;
let auth: Auth;

if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);

    if (Platform.OS === 'web') {
        auth = initializeAuth(app, {
            persistence: browserLocalPersistence
        });
    } else {
        // Only import and use React Native persistence on native platforms
        const { getReactNativePersistence } = require('firebase/auth');
        auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage)
        });
    }
} else {
    app = getApp();
    auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
