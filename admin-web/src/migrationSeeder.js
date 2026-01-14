import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { serviceAccount } from './serviceAccountKey.js'; // You will need to provide this or use implicit auth if running locally with CLI

// Note: For this script to run, you usually need a Service Account Key exported from Firebase Console.
// If running in a local emulator environment or initialized via CLI, implicit auth might work.
// For safety in this environment, I'm writing the logic assuming 'db' is initialized.
// Since I cannot access your actual service account key file directly, 
// I will structure this as a generic script you can run via 'node' if you set up the creds,
// OR you can run it via the Admin Web console logic if adapted.

// Let's create a browser-compatible version that you can run from your running Admin Web console 
// to avoid Node.js admin SDK setup complexity for now.
// We will output a file 'migrationSeeder.js' into 'admin-web/src/' that you can import and run.

/* 
  MIGRATION SCRIPT: SINGLE TO MULTI-TENANT
  Target: Add 'tenantId' = 'default' to all existing collections.
*/

import { db } from './firebase'; // Assumes this imports your client-side initialized DB
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';

export const migrateToMultiTenant = async () => {
    console.log("Starting Migration to Multi-Tenancy...");
    const DEFAULT_TENANT_ID = "default";
    const batch = writeBatch(db);
    let operationCount = 0;

    // 1. Create Default Tenant
    const tenantRef = doc(db, 'tenants', DEFAULT_TENANT_ID);
    batch.set(tenantRef, {
        name: "Default Institute",
        code: DEFAULT_TENANT_ID,
        createdAt: new Date().toISOString(),
        isActive: true
    }, { merge: true });
    operationCount++;

    // 2. Collections to Migrate
    const collectionsToMigrate = [
        'users',
        'lectures',
        'polls',
        'questions', // doubt resolver
        'exams',
        'assignments'
    ];

    for (const colName of collectionsToMigrate) {
        console.log(`Migrating collection: ${colName}...`);
        const snapshot = await getDocs(collection(db, colName));

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Only update if missing
            if (!data.tenantId) {
                batch.update(docSnap.ref, { tenantId: DEFAULT_TENANT_ID });
                operationCount++;
            }
        });
    }

    // Commit
    if (operationCount > 0) {
        await batch.commit();
        console.log(`Successfully migrated ${operationCount} documents to tenant '${DEFAULT_TENANT_ID}'.`);
        alert(`Migration Complete! Updated ${operationCount} docs.`);
    } else {
        console.log("No documents needed migration.");
        alert("System is already up to date.");
    }
};
