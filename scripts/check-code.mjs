
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

console.log("Using Project ID:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkCode() {
    const code = "ProWinTech";
    console.log(`Searching for: "${code}" (Length: ${code.length})`);
    const q = query(collection(db, "tenants"), where("code", "==", code));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        console.log(`No tenant found with code: ${code}`);
    } else {
        console.log(`Tenant FOUND with code: ${code}`);
        snapshot.forEach(d => {
            const data = d.data();
            console.log(`- ID: ${d.id}`);
            console.log(`- Code in DB: "${data.code}" (Length: ${data.code?.length})`);
            console.log(`- Name: ${data.name}`);
        });
    }
}

checkCode().catch(console.error);
