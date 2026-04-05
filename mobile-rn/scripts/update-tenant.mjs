import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBRx15wkYwA89X8fCEwvslxKE9-Ig9HgIg",
    authDomain: "midnightcuriosity.firebaseapp.com",
    projectId: "midnightcuriosity",
    storageBucket: "midnightcuriosity.firebasestorage.app",
    messagingSenderId: "191248941616",
    appId: "1:191248941616:web:a0aa23ef786eb24fd8a3f5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateTenantFeatures() {
    const tenantId = "inst_brbz2";
    const tenantRef = doc(db, "tenants", tenantId);
    
    await updateDoc(tenantRef, {
        features: {
            enableAttendance: false,
            enableHomework: true,
            enableFees: true
        }
    });
    console.log("Tenant features updated successfully!");
    process.exit(0);
}

updateTenantFeatures().catch(e => {
    console.error(e);
    process.exit(1);
});
