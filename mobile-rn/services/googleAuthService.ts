import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, linkWithCredential } from 'firebase/auth';
import { auth } from './firebaseConfig';

// Initialize Google Sign-In automatically upon module import
GoogleSignin.configure({
    // iOS Client ID from GoogleService-Info.plist (Required for iOS native configuration)
    iosClientId: process.env.EXPO_PUBLIC_APP_ENV === 'production'
        ? '259510471140-01npk2n6l17k00i3i6dulcef6lcuqjfv.apps.googleusercontent.com'
        : '191248941616-9tlqa2stjeo3k5f7mtka5htp7d9qg418.apps.googleusercontent.com',
    // Web Client ID from google-services.json for OAuth Verification (Required for Android & token verification)
    webClientId: process.env.EXPO_PUBLIC_APP_ENV === 'production'
        ? '259510471140-oeho7c02f10vv5meidpcahtlco2k9fob.apps.googleusercontent.com'
        : '191248941616-bc0m4skruhe8s650v70qaa299ah63ep5.apps.googleusercontent.com',
    offlineAccess: true,
});

// Deprecated configuration exporter (no-op now as configuration runs automatically)
export const configureGoogleSignIn = () => {};

export const signInWithGoogle = async () => {
    try {
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        
        // In newer versions of the library, the token is in userInfo.data
        const idToken = userInfo.data?.idToken || (userInfo as any).idToken;
        if (!idToken) throw new Error("No ID Token returned from Google Sign-In");

        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        return userCredential.user;
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        throw error;
    }
};

export const linkGoogleAccount = async () => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("No user is currently logged in.");

        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();

        const idToken = userInfo.data?.idToken || (userInfo as any).idToken;
        if (!idToken) throw new Error("No ID Token returned from Google Sign-In");

        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await linkWithCredential(currentUser, credential);
        return userCredential.user;
    } catch (error) {
        console.error("Google Account Linking Error:", error);
        throw error;
    }
};
