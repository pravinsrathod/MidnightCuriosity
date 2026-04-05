import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';

type AuthContextType = {
    user: User | null;
    profile: any | null;
    selectedChildId: string | null;
    setSelectedChildId: (id: string) => Promise<void>;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    selectedChildId: null,
    setSelectedChildId: async () => { },
    loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<any | null>(null);
    const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // 1. Listen to Auth State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            setUser(u);
            if (!u) {
                setProfile(null);
                setLoading(false);
                setSelectedChildIdState(null);
                AsyncStorage.removeItem('selected_child_id');
            }
        });
        return unsubscribe;
    }, []);

    // 2. Listen to User Profile (Firestore)
    useEffect(() => {
        if (!user) return;

        const unsubProfile = onSnapshot(doc(db, "users", user.uid), async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setProfile({ id: snapshot.id, ...data });

                // If parent, initialize child selection
                if ((data.role === 'PARENT' || data.role === 'parent')) {
                    const storedChildId = await AsyncStorage.getItem('selected_child_id');
                    if (storedChildId) {
                        setSelectedChildIdState(storedChildId);
                    } else {
                        // Fallback to first linked student phone if any
                        const phones = data.linkedStudentPhones || (data.linkedStudentPhone ? [data.linkedStudentPhone] : []);
                        if (phones.length > 0 && !storedChildId) {
                            // Note: We can't easily resolve UID from phone here without another query, 
                            // so we'll let the screen handle the default UID selection if not in storage yet.
                        }
                    }
                }
            }
            setLoading(false);
        }, (err) => {
            console.error("Profile sync error", err);
            setLoading(false);
        });

        return unsubProfile;
    }, [user]);

    const setSelectedChildId = useCallback(async (id: string) => {
        try {
            await AsyncStorage.setItem('selected_child_id', id);
            setSelectedChildIdState(id);
        } catch (e) {
            console.error("Failed to save child ID", e);
        }
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            selectedChildId,
            setSelectedChildId,
            loading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
