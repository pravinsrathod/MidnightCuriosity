import { db } from "./firebase";
import { collection, addDoc, doc, setDoc, serverTimestamp, updateDoc, arrayUnion } from "firebase/firestore";

const VIDEO_URLS = [
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
];

const SAMPLE_QUIZ = (topic) => ([
    {
        question: `What is a key concept in ${topic}?`,
        options: ["Concept A", "Concept B", "Concept C"],
        correctIndex: 0,
        triggerPercentage: 50
    },
    {
        question: `True or False: ${topic} is important for Grade 11.`,
        options: ["True", "False"],
        correctIndex: 0,
        triggerPercentage: 90
    }
]);

export const seedDemoData = async (tenantId = 'default') => {
    console.log("Starting Seed for Tenant:", tenantId);

    // 0. Ensure Tenant Metadata Doc Exists
    const metadataRef = doc(db, "tenants", tenantId, "metadata", "lists");
    await setDoc(metadataRef, {
        updatedAt: serverTimestamp(),
        grades: arrayUnion("Grade 11"),
        subjects: arrayUnion("Physics", "Chemistry"),
        topics: arrayUnion("Kinematics", "Laws of Motion", "Atomic Structure", "Chemical Bonding")
    }, { merge: true });

    // 1. Create Students
    const students = [
        {
            id: "demo_student_1",
            name: "Alice Johnson",
            grade: "Grade 11",
            completedTopics: ["Kinematics"],
            assignmentResults: { "Kinematics": 80 }
        },
        {
            id: "demo_student_2",
            name: "Bob Smith",
            grade: "Grade 11",
            completedTopics: []
        },
        {
            id: "demo_student_3",
            name: "Charlie Brown",
            grade: "Grade 11",
            completedTopics: []
        }
    ];

    for (const s of students) {
        await setDoc(doc(db, "users", s.id), {
            name: s.name,
            grade: s.grade,
            completedTopics: s.completedTopics,
            assignmentResults: s.assignmentResults || {},
            tenantId: tenantId,
            status: 'ACTIVE', // Seeded students are active
            createdAt: serverTimestamp(),
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`
        }, { merge: true });
    }
    console.log("Students created.");

    // 2. Create Topics (Lectures)
    const subjects = [
        {
            name: "Physics",
            topics: ["Kinematics", "Laws of Motion", "Work Energy Power", "Gravitation", "Thermodynamics"]
        },
        {
            name: "Chemistry",
            topics: ["Atomic Structure", "Chemical Bonding", "Thermodynamics", "Equilibrium", "Redox Reactions"]
        }
    ];

    for (const sub of subjects) {
        let vIndex = 0;
        for (const topic of sub.topics) {
            await addDoc(collection(db, "lectures"), {
                title: `${topic} - Introduction`,
                grade: "Grade 11",
                subject: sub.name,
                topic: topic,
                videoUrl: VIDEO_URLS[vIndex % VIDEO_URLS.length],
                overview: `A comprehensive guide to ${topic} for Grade 11 students.`,
                notes: `• Introduction to ${topic}\n• Key definitions\n• Important formulas\n• Summary`,
                quizzes: SAMPLE_QUIZ(topic),
                tenantId: tenantId,
                createdAt: serverTimestamp()
            });
            vIndex++;
        }
    }
    console.log("Lectures created.");

    // 3. Create Doubts
    const doubts = [
        {
            question: "I don't understand the third law of motion. Can you explain?",
            userName: "Alice Johnson",
            userId: "demo_student_1",
            subject: "Physics",
            grade: "Grade 11",
            solved: false,
            replies: []
        },
        {
            question: "How do I calculate the bond order in Chemical Bonding?",
            userName: "Bob Smith",
            userId: "demo_student_2",
            subject: "Chemistry",
            grade: "Grade 11",
            solved: true,
            replies: [
                {
                    userId: "admin",
                    userName: "Admin (Teacher)",
                    text: "Bond Order = (Number of bonding electrons - Number of antibonding electrons) / 2",
                    isCorrect: true,
                    createdAt: new Date().toISOString()
                }
            ]
        },
        {
            question: "Is Thermodynamics in Physics different from Chemistry?",
            userName: "Charlie Brown",
            userId: "demo_student_3",
            subject: "Combined",
            grade: "Grade 11",
            solved: false,
            replies: []
        }
    ];

    for (const d of doubts) {
        await addDoc(collection(db, "doubts"), {
            ...d,
            tenantId: tenantId, // Multi-tenancy
            createdAt: new Date().toISOString()
        });
    }
    console.log("Doubts created.");

    // No reload, just success return
    return true;
};
