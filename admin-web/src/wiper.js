
// WARNING: DESTRUCTIVE SCRIPT
// This will DELETE ALL DATA from the specified collections.

import { db } from './firebase';
import { collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';

// Helper to create a custom modal promise
const showCustomConfirm = (message) => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column',
            fontFamily: 'system-ui, sans-serif'
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            backgroundColor: '#1e293b', padding: '30px', borderRadius: '16px',
            border: '2px solid #ef4444', maxWidth: '400px', textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        });

        const title = document.createElement('h3');
        title.innerText = "⚠️ DANGER ZONE";
        Object.assign(title.style, { color: '#ef4444', fontSize: '24px', marginBottom: '16px', marginTop: 0 });

        const msg = document.createElement('p');
        msg.innerText = message;
        Object.assign(msg.style, { fontSize: '16px', lineHeight: '1.5', marginBottom: '24px', color: '#e2e8f0' });

        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, { display: 'flex', gap: '16px', justifyContent: 'center' });

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = "Cancel";
        Object.assign(cancelBtn.style, {
            padding: '10px 20px', borderRadius: '8px', border: '1px solid #475569',
            background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '14px'
        });
        cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(false); };

        const confirmBtn = document.createElement('button');
        confirmBtn.innerText = "DELETE EVERYTHING";
        Object.assign(confirmBtn.style, {
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
        });
        confirmBtn.onclick = () => { document.body.removeChild(overlay); resolve(true); };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        box.appendChild(title);
        box.appendChild(msg);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
};

export const wipeAllData = async () => {
    // 1st Check
    const confirm1 = await showCustomConfirm("Are you ABSOLUTELY SURE request? This will permanently DELETE ALL DATA (Users, Lectures, Exams). This cannot be undone.");
    if (!confirm1) return;

    // 2nd Check
    const confirm2 = await showCustomConfirm("FINAL WARNING: This is a destructive action. Type confirm logic skipped, button click is binding. Really wipe?");
    if (!confirm2) return;

    console.log("Starting System Wipe...");

    // List of collections to wipe
    const sensitiveCollections = [
        'users',
        'lectures',
        'polls',
        'questions', // doubt resolver
        'exams',
        'assignments',
        'tenants'
    ];

    let totalDeleted = 0;

    for (const colName of sensitiveCollections) {
        console.log(`Wiping collection: ${colName}...`);
        const q = collection(db, colName);
        const snapshot = await getDocs(q);

        // Firestore batches can handle up to 500 ops
        const batchSize = 400;
        const chunks = [];
        let currentBatch = writeBatch(db);
        let count = 0;

        snapshot.docs.forEach((doc, index) => {
            currentBatch.delete(doc.ref);
            count++;
            totalDeleted++;

            if (count >= batchSize) {
                chunks.push(currentBatch.commit());
                currentBatch = writeBatch(db);
                count = 0;
            }
        });

        if (count > 0) {
            chunks.push(currentBatch.commit());
        }

        await Promise.all(chunks);
        console.log(`Deleted ${snapshot.size} docs from ${colName}`);
    }

    console.log(`SYSTEM WIPE COMPLETE. Deleted ${totalDeleted} documents.`);

    // Success Modal
    const successOverlay = document.createElement('div');
    Object.assign(successOverlay.style, {
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: '#10b981', color: 'white', padding: '16px 32px', borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 99999, fontWeight: 'bold'
    });
    successOverlay.innerText = `Data Wipe Complete! Deleted ${totalDeleted} items.`;
    document.body.appendChild(successOverlay);
    setTimeout(() => document.body.removeChild(successOverlay), 3000);
};
