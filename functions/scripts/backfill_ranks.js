import admin from 'firebase-admin';
admin.initializeApp();

async function run() {
    console.log("Starting manual rank backfill...");
    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef.get();
    
    const studentsByGroup = {};
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const role = data.role?.toUpperCase() || 'STUDENT';
        
        if (role === 'PARENT' || role === 'ADMIN' || data.isAdmin) return;
        
        const tenantId = data.tenantId || 'default';
        const grade = data.grade || 'Unknown';
        const groupKey = `${tenantId}_${grade}`;
        
        if (!studentsByGroup[groupKey]) {
            studentsByGroup[groupKey] = [];
        }
        
        const completedCount = data.completedTopics ? data.completedTopics.length : 0;
        
        let avgScore = 0;
        if (data.assignmentResults) {
            const scores = Object.values(data.assignmentResults).filter(v => typeof v === 'number');
            if (scores.length > 0) {
                const sum = scores.reduce((a, b) => a + b, 0);
                avgScore = sum / scores.length;
            }
        }
        
        studentsByGroup[groupKey].push({
            ref: doc.ref,
            completedCount,
            avgScore
        });
    });
    
    let updateCount = 0;
    
    for (const groupKey in studentsByGroup) {
        const students = studentsByGroup[groupKey];
        
        students.sort((a, b) => {
            if (b.completedCount !== a.completedCount) {
                return b.completedCount - a.completedCount;
            }
            return b.avgScore - a.avgScore;
        });
        
        let batch = admin.firestore().batch();
        let operationsInBatch = 0;
        
        for (let i = 0; i < students.length; i++) {
            const rank = i + 1;
            batch.update(students[i].ref, { rank });
            updateCount++;
            operationsInBatch++;
            
            if (operationsInBatch === 400) {
                await batch.commit();
                batch = admin.firestore().batch();
                operationsInBatch = 0;
            }
        }
        
        if (operationsInBatch > 0) {
            await batch.commit();
        }
    }
    
    console.log(`Successfully backfilled ranks for ${updateCount} students.`);
}

run().catch(console.error).finally(() => process.exit(0));
