import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, writeBatch, getDocs, query, where, addDoc } from "firebase/firestore";
import fs from 'fs';
import path from 'path';

// This script expects .env to be present in the root or a subfolder
// We will use the one in mobile-rn/ for simplicity since it's already there
const envFile = path.join(process.cwd(), 'mobile-rn', '.env');
const envContent = fs.readFileSync(envFile, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const firebaseConfig = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID
};

console.log(`🚀 Initializing Seeder for Project: ${firebaseConfig.projectId}`);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TENANT_ID = "edupro-central";
const TENANT_NAME = "EduPro Central Academy";

const subjects = [
    { name: "Mathematics", topics: ["Algebra", "Trigonometry", "Calculus"] },
    { name: "Science", topics: ["Physics", "Chemistry", "Biology"] }
];

async function seed() {
    console.log(`🏢 Seeding Tenant: ${TENANT_NAME} (${TENANT_ID})...`);

    // 1. Create Tenant Metadata
    const tenantRef = doc(db, "tenants", TENANT_ID);
    await setDoc(tenantRef, {
        id: TENANT_ID,
        name: TENANT_NAME,
        logoUrl: "https://images.antigravity.ai/7ab1b269-9771-4065-bf43-ddbf2b49f7e6/edupro_logo_1768750545680.png",
        primaryColor: "#007AFF",
        plan: "pro",
        createdAt: new Date().toISOString(),
        isActive: true
    }, { merge: true });

    console.log("✅ Tenant created.");

    // 2. Clear/Check Lectures for this tenant
    console.log("📚 Seeding Sample Lectures...");
    const lecturesCol = collection(db, "lectures");

    for (const sub of subjects) {
        for (const topic of sub.topics) {
            const q = query(lecturesCol,
                where("tenantId", "==", TENANT_ID),
                where("subject", "==", sub.name),
                where("topic", "==", topic)
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                await addDoc(lecturesCol, {
                    tenantId: TENANT_ID,
                    grade: "Grade 10",
                    subject: sub.name,
                    topic: topic,
                    title: `Mastery in ${topic}`,
                    description: `Comprehensive guide to ${topic} for Grade 10 students.`,
                    videoUrl: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                    createdAt: new Date().toISOString(),
                    thumbnailUrl: "https://via.placeholder.com/300x200",
                    quiz: {
                        question: `Which is the first principle of ${topic}?`,
                        options: ["Option A", "Option B", "Option C", "Option D"],
                        correctIndex: 0,
                        triggerPercentage: 50
                    }
                });
                console.log(`   + Added lecture: ${sub.name} -> ${topic}`);
            }
        }
    }

    console.log("🎉 Seeding completed successfully.");
    process.exit(0);
}

seed().catch(err => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
