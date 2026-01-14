import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc } from "firebase/firestore";

// Load environment variables if running in Node check
// Node 20.6+ supports --env-file=.env, otherwise use dotenv or export manually
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDNj2bw0iJCifqatHqb4qrrafl-wxrmjuA", // Fallback for script if env not set, but warned
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "midnightcuriosity.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "midnightcuriosity",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "midnightcuriosity.firebasestorage.app",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "191248941616",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:191248941616:android:b80f9750c2512d80d8a3f5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const subjects = [
    {
        name: "Maths",
        topics: ["Linear Equations", "Quadratic Equations", "Trigonometry", "Circles", "Statistics"]
    },
    {
        name: "Physics",
        topics: ["Motion", "Force", "Work & Energy", "Gravitation", "Sound"]
    },
    {
        name: "Chemistry",
        topics: ["Acids Bases", "Metals & Non-Metals", "Carbon Compounds", "Periodic Table"]
    }
];

const grade11 = [
    { name: "Maths", topics: ["Sets", "Relations & Functions", "Trigonometric Functions", "Complex Numbers"] },
    { name: "Physics", topics: ["Units & Measurements", "Motion in a Plane", "Laws of Motion", "Work, Energy & Power"] },
    { name: "Chemistry", topics: ["Some Basic Concepts", "Structure of Atom", "Classification of Elements"] }
];

async function seed() {
    console.log("Seeding data...");

    // Seed Grade 10
    await seedGrade("Grade 10", subjects);
    // Seed Grade 11
    await seedGrade("Grade 11", grade11);

    console.log("Seeding complete.");
    process.exit(0);
}

const videoPool = [
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
];

const subjectVideoMap = {
    "Maths": [0, 2, 4],
    "Physics": [1, 3, 5, 8],
    "Chemistry": [6, 7]
};

async function seedGrade(gradeName, subjectList) {
    console.log(`Seeding for ${gradeName}...`);
    for (const subject of subjectList) {
        for (let i = 0; i < subject.topics.length; i++) {
            const topic = subject.topics[i];

            // Deterministic selection based on subject and index
            const map = subjectVideoMap[subject.name] || [0];
            const videoIndex = map[i % map.length];
            const videoUrl = videoPool[videoIndex];

            // Check if exists
            const q = query(
                collection(db, "lectures"),
                where("grade", "==", gradeName),
                where("subject", "==", subject.name),
                where("topic", "==", topic)
            );
            const snapshot = await getDocs(q);

            const lectureData = {
                grade: gradeName,
                subject: subject.name,
                topic,
                title: `Introduction to ${topic}`,
                videoUrl: videoUrl,
                description: `Learn the basics of ${topic}.`,
                createdAt: new Date(Date.now() + i * 1000),
                quiz: {
                    question: `What is the fundamental concept of ${topic}?`,
                    options: ["Concept A", "Concept B", "Concept C", "Concept D"],
                    correctIndex: 0,
                    triggerPercentage: 50
                }
            };

            if (snapshot.empty) {
                await addDoc(collection(db, "lectures"), lectureData);
                console.log(`Added: ${gradeName} - ${topic} [Video: ${videoUrl.split('/').pop()}]`);
            } else {
                // UPDATE existing entries to ensure video diversity
                const docRef = snapshot.docs[0].ref;
                await updateDoc(docRef, { videoUrl: videoUrl });
                console.log(`Updated: ${gradeName} - ${topic} [Video: ${videoUrl.split('/').pop()}]`);
            }
        }
    }
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
