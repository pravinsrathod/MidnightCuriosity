const admin = require('firebase-admin');
const fs = require('fs');

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.HOME + '/.config/gcloud/application_default_credentials.json';

admin.initializeApp({
  projectId: 'midnightcuriosity-prod'
});

async function findOrphans() {
  const authExportPath = '/tmp/auth_users.json';
  if (!fs.existsSync(authExportPath)) {
    console.error("Auth export file not found.");
    return;
  }

  const authData = JSON.parse(fs.readFileSync(authExportPath, 'utf8'));
  const authUids = authData.users.map(u => u.localId);
  console.log(`Loaded ${authUids.length} auth users.`);

  const firestoreUids = new Set();
  const usersRef = admin.firestore().collection('users');
  const snapshot = await usersRef.select().get(); // Only fetch IDs to be efficient
  snapshot.forEach(doc => {
    firestoreUids.add(doc.id);
  });
  console.log(`Loaded ${firestoreUids.size} firestore users.`);

  const orphans = [];
  for (const uid of authUids) {
    if (!firestoreUids.has(uid)) {
      const user = authData.users.find(u => u.localId === uid);
      orphans.push({
        uid: uid,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName
      });
    }
  }

  console.log(`Found ${orphans.length} orphaned auth users.`);
  fs.writeFileSync('/tmp/orphaned_users.json', JSON.stringify(orphans, null, 2));
  console.log("Orphaned users details written to /tmp/orphaned_users.json");
  
  if (orphans.length > 0) {
    console.log("\nSample Orphans:");
    orphans.slice(0, 10).forEach(o => console.log(`- ${o.uid} (${o.email || o.phoneNumber || 'No identifier'})`));
  }
}

findOrphans().catch(console.error);
