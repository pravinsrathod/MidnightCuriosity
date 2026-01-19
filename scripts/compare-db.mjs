
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from 'fs';

async function checkProject(envPath, label) {
    const env = fs.readFileSync(envPath, 'utf8');
    const config = {};
    env.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) config[key.trim()] = value.trim();
    });

    const firebaseConfig = {
        apiKey: config.VITE_FIREBASE_API_KEY || config.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain: config.VITE_FIREBASE_AUTH_DOMAIN || config.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: config.VITE_FIREBASE_PROJECT_ID || config.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET || config.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID || config.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: config.VITE_FIREBASE_APP_ID || config.EXPO_PUBLIC_FIREBASE_APP_ID
    };

    console.log(`\n--- Checking ${label} ---`);
    console.log("Project ID:", firebaseConfig.projectId);

    try {
        const app = initializeApp(firebaseConfig, label);
        const db = getFirestore(app);
        const snapshot = await getDocs(collection(db, "tenants"));
        console.log(`Documents in 'tenants' collection: ${snapshot.size}`);
        snapshot.forEach(d => {
            console.log(` - Code: ${d.data().code}, Name: ${d.data().name}`);
        });
    } catch (e) {
        console.error(`Error checking ${label}:`, e.message);
    }
}

async function run() {
    await checkProject('admin-web/.env.development', 'DEV (Web Config)');
    await checkProject('admin-web/.env.production', 'PROD (Web Config)');
    await checkProject('mobile-rn/.env.production', 'PROD (Mobile Config)');
}

run();
