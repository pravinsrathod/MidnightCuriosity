
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "firebase/firestore";

// Use environment variables or fallback
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDNj2bw0iJCifqatHqb4qrrafl-wxrmjuA",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "midnightcuriosity.firebaseapp.com",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "midnightcuriosity",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "midnightcuriosity.firebasestorage.app",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "191248941616",
    appId: process.env.VITE_FIREBASE_APP_ID || "1:191248941616:web:placeholder"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkLatestLecture() {
    try {
        const q = query(collection(db, "lectures"), orderBy("createdAt", "desc"), limit(1));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log("No lectures found.");
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log("Latest Lecture Found:");
            console.log("ID:", doc.id);
            console.log("Title:", data.title);
            console.log("Topic:", data.topic);
            console.log("Has Video?", !!data.videoUrl);
            console.log("Has Notes?", !!data.notes && data.notes.length > 0);
            console.log("Has Quiz?", !!data.quizzes && data.quizzes.length > 0);

            if (data.notes) {
                console.log("\n--- Preview Notes ---");
                console.log(data.notes.substring(0, 100) + "...");
            }
        });
    } catch (e) {
        console.error("Error fetching documents: ", e);
    }
}

checkLatestLecture();
