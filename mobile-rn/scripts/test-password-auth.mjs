
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";

// Config from .env (Hardcoded for script)
const firebaseConfig = {
    apiKey: "AIzaSyDNj2bw0iJCifqatHqb4qrrafl-wxrmjuA",
    authDomain: "midnightcuriosity.firebaseapp.com",
    projectId: "midnightcuriosity",
    storageBucket: "midnightcuriosity.firebasestorage.app",
    messagingSenderId: "191248941616",
    appId: "1:191248941616:android:b80f9750c2512d80d8a3f5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TIMESTAMP = Date.now();
const TENANT_ID = `test_tenant_auth_${TIMESTAMP}`;

// Test Users (Mobile as Username)
const ADMIN_PHONE = `99990${Math.floor(Math.random() * 100000)}`;
const STUDENT_PHONE = `88880${Math.floor(Math.random() * 100000)}`;
const PARENT_PHONE = `77770${Math.floor(Math.random() * 100000)}`;
const PASSWORD = "Password123!";

// Helper to convert phone to virtual email
const getEmail = (phone) => `${phone}@midnightcuriosity.com`;

async function runTest() {
    console.log(`🚀 Starting Comprehensive Auth Testing (${TIMESTAMP})...`);
    console.log(`Config: Admin: ${ADMIN_PHONE}, Student: ${STUDENT_PHONE}, Parent: ${PARENT_PHONE}`);

    let adminUid, studentUid, parentUid;

    try {
        // ==========================================
        // 1. ADMIN FLOW (Web Portal Logic)
        // ==========================================
        console.log("\n--- 1. ADMIN SIGNUP & LOGIN ---");

        // A. Admin Signup
        console.log(`📝 Admin Signup with Phone: ${ADMIN_PHONE}`);
        const adminEmail = getEmail(ADMIN_PHONE);
        const adminCred = await createUserWithEmailAndPassword(auth, adminEmail, PASSWORD);
        adminUid = adminCred.user.uid;

        // Create Tenant & Profile
        await setDoc(doc(db, "users", adminUid), {
            email: adminEmail,
            phoneNumber: ADMIN_PHONE,
            role: 'admin',
            tenantId: TENANT_ID,
            createdAt: serverTimestamp()
        });
        await setDoc(doc(db, "tenants", TENANT_ID), {
            name: "Test Institute",
            code: TENANT_ID,
            adminUid: adminUid,
            isActive: true
        });
        console.log("✅ Admin Signed Up & Tenant Created");
        await signOut(auth);

        // B. Admin Login
        console.log(`🔑 Admin Login with Phone: ${ADMIN_PHONE}`);
        await signInWithEmailAndPassword(auth, adminEmail, PASSWORD);
        if (auth.currentUser.uid !== adminUid) throw new Error("Admin Login Failed: UID Mismatch");
        console.log("✅ Admin Logged In Successfully");
        await signOut(auth);


        // ==========================================
        // 2. STUDENT FLOW (Mobile App Logic)
        // ==========================================
        console.log("\n--- 2. STUDENT SIGNUP & LOGIN ---");

        // A. Student Signup
        console.log(`📝 Student Signup with Phone: ${STUDENT_PHONE}`);
        const studentEmail = getEmail(STUDENT_PHONE);
        const studentCred = await createUserWithEmailAndPassword(auth, studentEmail, PASSWORD);
        studentUid = studentCred.user.uid;

        await setDoc(doc(db, "users", studentUid), {
            name: "Test Student",
            phoneNumber: STUDENT_PHONE,
            tenantId: TENANT_ID,
            role: 'STUDENT',
            grade: 'Grade 10',
            status: 'PENDING', // Initially pending
            createdAt: serverTimestamp()
        });
        console.log("✅ Student Signed Up");
        await signOut(auth);

        // B. Student Login & Logic Check
        console.log(`🔑 Student Login with Phone: ${STUDENT_PHONE}`);
        await signInWithEmailAndPassword(auth, studentEmail, PASSWORD);

        const studentDoc = await getDoc(doc(db, "users", studentUid));
        if (!studentDoc.exists()) throw new Error("Student Profile Missing");
        if (studentDoc.data().role !== 'STUDENT') throw new Error("Role Mismatch");
        if (studentDoc.data().status !== 'PENDING') throw new Error("Status Incorrect");

        console.log("✅ Student Logged In & Profile Verified (Pending)");
        await signOut(auth);


        // ==========================================
        // 3. PARENT FLOW (Mobile App Logic)
        // ==========================================
        console.log("\n--- 3. PARENT SIGNUP & LOGIN ---");

        // A. Parent Signup (Linking to Student)
        console.log(`📝 Parent Signup with Phone: ${PARENT_PHONE} (Linking to ${STUDENT_PHONE})`);
        const parentEmail = getEmail(PARENT_PHONE);
        const parentCred = await createUserWithEmailAndPassword(auth, parentEmail, PASSWORD);
        parentUid = parentCred.user.uid;

        await setDoc(doc(db, "users", parentUid), {
            name: "Test Parent",
            phoneNumber: PARENT_PHONE,
            tenantId: TENANT_ID,
            role: 'PARENT',
            linkedStudentPhone: STUDENT_PHONE,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });
        console.log("✅ Parent Signed Up");
        await signOut(auth);

        // B. Parent Login
        console.log(`🔑 Parent Login with Phone: ${PARENT_PHONE}`);
        await signInWithEmailAndPassword(auth, parentEmail, PASSWORD);

        const parentDoc = await getDoc(doc(db, "users", parentUid));
        if (parentDoc.data().role !== 'PARENT') throw new Error("Parent Role Mismatch");
        if (parentDoc.data().linkedStudentPhone !== STUDENT_PHONE) throw new Error("Link Mismatch");

        console.log("✅ Parent Logged In & Verified");
        await signOut(auth);


        // ==========================================
        // 4. ADMIN APPROVAL (Integration Check)
        // ==========================================
        console.log("\n--- 4. APPROVAL CHECK ---");
        // Login as Admin to Approve
        await signInWithEmailAndPassword(auth, adminEmail, PASSWORD);

        // Approve Student
        await setDoc(doc(db, "users", studentUid), { status: 'ACTIVE' }, { merge: true });
        console.log("✅ Admin Approved Student");

        // Approve Parent
        await setDoc(doc(db, "users", parentUid), { status: 'ACTIVE' }, { merge: true });
        console.log("✅ Admin Approved Parent");
        await signOut(auth);

        // Re-check Student Login (Active Status)
        await signInWithEmailAndPassword(auth, studentEmail, PASSWORD);
        const activeStudent = await getDoc(doc(db, "users", studentUid));
        if (activeStudent.data().status !== 'ACTIVE') throw new Error("Student Approval Failed");
        console.log("✅ Student Status is now ACTIVE");
        await signOut(auth);

        console.log("\n✨ ALL AUTH TESTS PASSED SUCCESSFULLY! ✨");


    } catch (e) {
        console.error("\n❌ TEST FAILED:", e);
    } finally {
        console.log("\n🧹 Cleaning up...");
        if (auth.currentUser) await signOut(auth);

        // Delete users in reverse order
        const cleanupUser = async (email, uid, label) => {
            try {
                if (!uid) return;
                await signInWithEmailAndPassword(auth, email, PASSWORD);
                const user = auth.currentUser;
                await deleteDoc(doc(db, "users", uid));
                await deleteUser(user);
                console.log(`Deleted ${label}`);
            } catch (e) {
                console.log(`Failed to delete ${label}: ${e.message}`);
                // If it fails (e.g. auth error), try to just delete doc if we are admin?
                // For this script, simplicity is fine.
            }
        };

        await cleanupUser(PARENT_PHONE + "@midnightcuriosity.com", parentUid, "Parent");
        await cleanupUser(STUDENT_PHONE + "@midnightcuriosity.com", studentUid, "Student");

        // Admin Cleanup (delete Tenant too)
        try {
            if (adminUid) {
                await signInWithEmailAndPassword(auth, ADMIN_PHONE + "@midnightcuriosity.com", PASSWORD);
                await deleteDoc(doc(db, "tenants", TENANT_ID));
                await deleteDoc(doc(db, "users", adminUid));
                await deleteUser(auth.currentUser);
                console.log("Deleted Admin & Tenant");
            }
        } catch (e) { console.log("Final cleanup errored", e.message); }

        process.exit(0);
    }
}

runTest();
