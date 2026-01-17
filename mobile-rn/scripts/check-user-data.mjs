import { db } from '../services/firebaseConfig.js';
import { doc, getDoc } from 'firebase/firestore';

async function checkUser() {
    const uid = '5P9YTvuDmIeeL8nxVtWRxQbzFDY2';
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
        console.log('User Data:', JSON.stringify(snap.data(), null, 2));
    } else {
        console.log('User not found');
    }
}

checkUser().catch(console.error);
