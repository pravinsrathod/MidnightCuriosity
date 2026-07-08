import admin from 'firebase-admin';

// Essential for connecting to the local emulator
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

admin.initializeApp({
  projectId: 'midnightcuriosity',
});

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  const tenantId = 'inst_test';
  const email = 'prowintechs@gmail.com';
  const password = 'password';

  console.log('--- SEEDING LOCAL EMULATOR ---');

  // 1. Create or Update Tenant
  console.log(`[Firestore] Seeding tenant: ${tenantId}...`);
  await db.collection('tenants').doc(tenantId).set({
    name: 'Test Institute',
    code: 'inst_test',
    geminiApiKey: 'MOCK_API_KEY', // Placeholder, will fail AI call but confirm function hit
    status: 'APPROVED',
    isActive: true,
    createdAt: new Date().toISOString()
  });

  // 2. Create or Update Auth User
  console.log(`[Auth] Creating/Updating user: ${email}...`);
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`Found existing user with UID: ${user.uid}`);
  } catch (e) {
    user = await auth.createUser({
      email,
      password,
      emailVerified: true,
    });
    console.log(`Created new user with UID: ${user.uid}`);
  }

  // 3. Create or Update User Document
  console.log(`[Firestore] Seeding user doc for: ${user.uid}...`);
  await db.collection('users').doc(user.uid).set({
    email,
    role: 'admin',
    tenantId: tenantId,
    status: 'APPROVED',
    createdAt: new Date().toISOString()
  });

  console.log('--- SEEDING COMPLETE ---');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
