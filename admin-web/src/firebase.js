import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDNj2bw0iJCifqatHqb4qrrafl-wxrmjuA",
    authDomain: "midnightcuriosity.firebaseapp.com",
    projectId: "midnightcuriosity",
    storageBucket: "midnightcuriosity.firebasestorage.app",
    messagingSenderId: "191248941616",
    appId: "1:191248941616:web:placeholder" // We might need to update this if it fails
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
