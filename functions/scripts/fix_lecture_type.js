import admin from 'firebase-admin';

admin.initializeApp();

async function run() {
    console.log("Starting script to fix lecture types back to live...");
    const db = admin.firestore();
    const lecturesRef = db.collection('lectures');
    
    // Find lectures with source: 'youtube_live'
    const snapshot = await lecturesRef.where('source', '==', 'youtube_live').get();
    
    if (snapshot.empty) {
        console.log("No lectures found with source: 'youtube_live'. Nothing to update.");
        return;
    }

    console.log(`Found ${snapshot.size} lectures to update.`);
    
    let batch = db.batch();
    let operationsInBatch = 0;
    let updateCount = 0;
    
    for (const doc of snapshot.docs) {
        batch.update(doc.ref, { type: 'live' });
        updateCount++;
        operationsInBatch++;
        
        if (operationsInBatch === 400) {
            await batch.commit();
            batch = db.batch();
            operationsInBatch = 0;
        }
    }
    
    if (operationsInBatch > 0) {
        await batch.commit();
    }
    
    console.log(`Successfully updated ${updateCount} lectures to 'live'.`);
}

run().catch(console.error).finally(() => process.exit(0));
