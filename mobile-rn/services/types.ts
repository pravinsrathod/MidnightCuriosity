export interface QuizData {
    question: string;
    options: string[];
    correctIndex: number;
    triggerPercentage: number;
}

export interface Lecture {
    id?: string; // Firestore Doc ID
    grade: string;
    subject: string;
    topic: string;
    title: string;
    videoUrl: string;
    description?: string;
    quiz?: QuizData;
    createdAt?: any;
}

export interface UserProfile {
    uid: string;
    name: string;
    grade: string;
    completedTopics: string[]; // List of Topic Names or IDs
}
