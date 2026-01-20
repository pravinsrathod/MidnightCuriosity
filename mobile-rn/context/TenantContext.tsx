import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

type TenantContextType = {
    tenantId: string;
    tenantName: string;
    tenantLogo: string | null;
    grades: string[];
    subjects: string[];
    topics: string[];
    setTenantId: (id: string) => void;
    loading: boolean;
};

const TenantContext = createContext<TenantContextType>({
    tenantId: 'default',
    tenantName: 'EduPro',
    tenantLogo: null,
    grades: [],
    subjects: [],
    topics: [],
    setTenantId: () => { },
    loading: true,
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tenantId, setTenantIdState] = useState('default');
    const [tenantName, setTenantName] = useState('EduPro');
    const [tenantLogo, setTenantLogo] = useState<string | null>(null);
    const [grades, setGrades] = useState<string[]>([]);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [topics, setTopics] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTenantMetadata = async (id: string) => {
        if (id === 'default') {
            setTenantName('EduPro');
            setTenantLogo(null);
            setGrades([]);
            setSubjects([]);
            setTopics([]);
            return;
        }
        try {
            const tenantDoc = await getDoc(doc(db, "tenants", id));
            if (tenantDoc.exists()) {
                const data = tenantDoc.data();
                setTenantName(data.name || 'EduPro');
                setTenantLogo(data.logoUrl || null);
            }

            // Fetch Lists
            const listSnap = await getDoc(doc(db, "tenants", id, "metadata", "lists"));
            if (listSnap.exists()) {
                const listData = listSnap.data();
                setGrades(listData.grades || []);
                setSubjects(listData.subjects || []);
                setTopics(listData.topics || []);
            }
        } catch (e) {
            console.error("Error fetching tenant metadata:", e);
        }
    };

    useEffect(() => {
        const loadTenant = async () => {
            try {
                const stored = await AsyncStorage.getItem('tenant_id');
                if (stored) {
                    setTenantIdState(stored);
                    await fetchTenantMetadata(stored);
                }
            } catch (e) {
                console.error("Failed to load tenant ID", e);
            } finally {
                setLoading(false);
            }
        };
        loadTenant();
    }, []);

    const setTenantId = async (id: string) => {
        try {
            await AsyncStorage.setItem('tenant_id', id);
            setTenantIdState(id);
            await fetchTenantMetadata(id);
        } catch (e) {
            console.error("Failed to save tenant ID", e);
        }
    };

    return (
        <TenantContext.Provider value={{
            tenantId,
            tenantName,
            tenantLogo,
            grades,
            subjects,
            topics,
            setTenantId,
            loading
        }}>
            {children}
        </TenantContext.Provider>
    );
};
