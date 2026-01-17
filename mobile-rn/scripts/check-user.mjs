import { db } from '../services/firebaseConfig.js';
import { doc, getDoc } from 'firebase/firestore';

async function checkUser() {
    const uid = '5P9YTvuDmIeeL8nxVtWRxQbzFDY2';
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
        const data = snap.data();
        console.log(`User: ${data.name}, Role: ${data.role}, Phone: ${data.phoneNumber}, Linked: ${data.linkedStudentPhone}, Tenant: ${data.tenantId}`);
    } else {
        console.log('User not found');
    }
}

checkUser().catch(console.error);
