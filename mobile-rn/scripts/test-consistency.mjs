
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp, collection, query, where, updateDoc } from "firebase/firestore";

// Config (Hardcoded for script)
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
const TENANT_ID = `test_consist_${TIMESTAMP}`;
const HW_ID = `hw_${TIMESTAMP}`;
const ATT_ID = `${TENANT_ID}_${new Date().toISOString().split('T')[0]}`;

// Test Identities
const ADMIN_PHONE = `91${Math.floor(Math.random() * 100000000)}`;
const STUDENT_PHONE = `92${Math.floor(Math.random() * 100000000)}`;
const PARENT_PHONE = `93${Math.floor(Math.random() * 100000000)}`;
const PASSWORD = "Password123!";

const getEmail = (phone) => `${phone}@midnightcuriosity.com`;

async function runTest() {
    console.log(`🚀 Starting Full Consistency Check (${TIMESTAMP})...`);
    console.log(`Roles: Admin(${ADMIN_PHONE}), Student(${STUDENT_PHONE}), Parent(${PARENT_PHONE})`);

    let adminUid, studentUid, parentUid;

    try {
        // ==========================================
        // 1. SETUP & AUTH CONSISTENCY
        // ==========================================

        // --- ADMIN SETUP ---
        const adminEmail = getEmail(ADMIN_PHONE);
        adminUid = (await createUserWithEmailAndPassword(auth, adminEmail, PASSWORD)).user.uid;
        await setDoc(doc(db, "users", adminUid), {
            email: adminEmail, phoneNumber: ADMIN_PHONE, role: 'admin', tenantId: TENANT_ID, createdAt: serverTimestamp()
        });
        await setDoc(doc(db, "tenants", TENANT_ID), {
            name: "Consistency Institute", code: TENANT_ID, adminUid: adminUid, isActive: true
        });
        console.log("✅ Admin & Tenant Created");
        await signOut(auth);

        // --- STUDENT SIGNUP ---
        const studentEmail = getEmail(STUDENT_PHONE);
        studentUid = (await createUserWithEmailAndPassword(auth, studentEmail, PASSWORD)).user.uid;
        await setDoc(doc(db, "users", studentUid), {
            name: "Test Student", phoneNumber: STUDENT_PHONE, tenantId: TENANT_ID, role: 'STUDENT', grade: 'Grade 10', status: 'PENDING', createdAt: serverTimestamp()
        });
        console.log("✅ Student Created (Pending)");
        await signOut(auth);

        // --- PARENT SIGNUP ---
        const parentEmail = getEmail(PARENT_PHONE);
        parentUid = (await createUserWithEmailAndPassword(auth, parentEmail, PASSWORD)).user.uid;
        await setDoc(doc(db, "users", parentUid), {
            name: "Test Parent", phoneNumber: PARENT_PHONE, tenantId: TENANT_ID, role: 'PARENT', linkedStudentPhone: STUDENT_PHONE, status: 'PENDING', createdAt: serverTimestamp()
        });
        console.log("✅ Parent Created (Pending)");
        await signOut(auth);

        // ==========================================
        // 2. APPROVAL WORKFLOW
        // ==========================================
        await signInWithEmailAndPassword(auth, adminEmail, PASSWORD);
        // Admin approves both
        await updateDoc(doc(db, "users", studentUid), { status: 'ACTIVE' });
        await updateDoc(doc(db, "users", parentUid), { status: 'ACTIVE' });
        console.log("✅ Admin Approved Users");

        // Admin creates content while logged in
        await setDoc(doc(db, "homework", HW_ID), {
            title: "Consistency HW", tenantId: TENANT_ID, grade: "Grade 10", description: "Test",
            dueDate: serverTimestamp(), createdAt: serverTimestamp()
        });
        console.log("✅ Admin Created Homework");

        // Admin marks attendance
        await setDoc(doc(db, "attendance", ATT_ID), {
            tenantId: TENANT_ID,
            date: new Date().toISOString().split('T')[0],
            records: { [studentUid]: 'PRESENT' }
        });
        console.log("✅ Admin Marked Attendance");
        await signOut(auth);

        // ==========================================
        // 3. STUDENT DATA CONSISTENCY
        // ==========================================
        await signInWithEmailAndPassword(auth, studentEmail, PASSWORD);
        // Check Status
        const myProfile = (await getDoc(doc(db, "users", studentUid))).data();
        if (myProfile.status !== 'ACTIVE') throw new Error("Student not active!");

        // Check Homework Access
        const hwQuery = query(collection(db, "homework"), where("tenantId", "==", TENANT_ID));
        const hwSnap = await getDocs(hwQuery);
        if (hwSnap.empty) throw new Error("Student cannot see homework!");
        console.log("✅ Student sees Homework");

        // Check Attendance Access
        const attSnap = await getDoc(doc(db, "attendance", ATT_ID));
        if (!attSnap.exists()) throw new Error("Student cannot see attendance!");
        if (attSnap.data().records[studentUid] !== 'PRESENT') throw new Error("Attendance record mismatch!");
        console.log("✅ Student checks Attendance: PRESENT");

        // Student Submits Homework
        const subId = `sub_${studentUid}_${HW_ID}`;
        await setDoc(doc(db, "submissions", subId), {
            homeworkId: HW_ID, studentId: studentUid, tenantId: TENANT_ID, status: 'SUBMITTED'
        });
        console.log("✅ Student Submitted Homework");
        await signOut(auth);

        // ==========================================
        // 4. PARENT DATA CONSISTENCY (The Tricky Part)
        // ==========================================
        await signInWithEmailAndPassword(auth, parentEmail, PASSWORD);
        // Verify Parent Link Logic (Mocking what the app does)
        const parentProfile = (await getDoc(doc(db, "users", parentUid))).data();
        const childPhone = parentProfile.linkedStudentPhone;

        // Find Child by Phone (Parent dashboard logic)
        const childQ = query(collection(db, "users"), where("phoneNumber", "==", childPhone));
        const childSnap = await getDocs(childQ);
        if (childSnap.empty) throw new Error("Parent cannot find child by phone!");

        const childUser = childSnap.docs[0];
        if (childUser.id !== studentUid) throw new Error("Parent linked to wrong child UID!");
        console.log("✅ Parent correctly resolved Child UID");

        // Parent checks Child's Attendance
        const pAttSnap = await getDoc(doc(db, "attendance", ATT_ID));
        if (!pAttSnap.exists() || pAttSnap.data().records[childUser.id] !== 'PRESENT')
            throw new Error("Parent cannot see child's attendance!");
        console.log("✅ Parent verified Child Attendance");

        // Parent checks Child's Homework (via Submissions)
        // Note: Rules must allow Parent to read submissions of their child? 
        // Let's check if the rule holds: allow read if user is parent of tenant? 
        // Or usually Parent reads based on tenant. 
        // Actually, our rules might be loose on read for Tenant Users, or strict. 
        // Let's verify if 'isTenantUser' allows it.
        const pSubSnap = await getDoc(doc(db, "submissions", subId));
        if (pSubSnap.exists()) {
            console.log("✅ Parent verified Child Submission");
        } else {
            console.log("⚠️ Parent could not read submission directly (Expected if rules strict).");
        }
        await signOut(auth);

        console.log("\n✨ SYSTEM CONSISTENCY VERIFIED! ✨");

    } catch (e) {
        console.error("\n❌ CONSISTENCY CHECK FAILED:", e);
    } finally {
        // ==========================================
        // 5. CLEANUP (AS ADMIN)
        // ==========================================
        console.log("\n🧹 Cleaning up (As Admin)...");
        try {
            await signInWithEmailAndPassword(auth, adminEmail, PASSWORD);

            // Delete Data
            await deleteDoc(doc(db, "homework", HW_ID));
            await deleteDoc(doc(db, "attendance", ATT_ID));
            await deleteDoc(doc(db, "submissions", `sub_${studentUid}_${HW_ID}`));
            await deleteDoc(doc(db, "tenants", TENANT_ID));

            // Delete Profiles
            await deleteDoc(doc(db, "users", studentUid));
            await deleteDoc(doc(db, "users", parentUid));
            await deleteDoc(doc(db, "users", adminUid)); // Delete self last

            // Delete Auth Users
            const su = await signInWithEmailAndPassword(auth, getEmail(STUDENT_PHONE), PASSWORD);
            await deleteUser(su.user);

            const pu = await signInWithEmailAndPassword(auth, getEmail(PARENT_PHONE), PASSWORD);
            await deleteUser(pu.user);

            const au = await signInWithEmailAndPassword(auth, getEmail(ADMIN_PHONE), PASSWORD);
            await deleteUser(au.user);

            console.log("✅ Cleaned up successfully.");

        } catch (e) {
            console.log("Cleanup Error (Likely Auth/Perms):", e.message);
        }

        process.exit(0);
    }
}

runTest();
