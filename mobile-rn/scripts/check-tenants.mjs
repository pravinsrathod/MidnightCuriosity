
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import 'dotenv/config'; // Loads .env file

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkTenants() {
    console.log("Checking tenants...");
    try {
        const querySnapshot = await getDocs(collection(db, "tenants"));
        if (querySnapshot.empty) {
            console.log("No tenants found in 'tenants' collection.");
        } else {
            console.log(`Found ${querySnapshot.size} tenants:`);
            querySnapshot.forEach((doc) => {
                console.log(`- ID: ${doc.id}, Code: ${doc.data().code}, Name: ${doc.data().name}`);
            });
        }
    } catch (error) {
        console.error("Error fetching tenants:", error);
    }
}

checkTenants().then(() => process.exit(0));
