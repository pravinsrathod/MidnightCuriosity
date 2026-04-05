import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../services/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';

type TenantContextType = {
    tenantId: string;
    tenantName: string;
    tenantLogo: string | null;
    grades: string[];
    subjects: string[];
    topics: string[];
    features: Record<string, boolean>;
    setTenantId: (id: string) => Promise<void>;
    loading: boolean;
};

const TenantContext = createContext<TenantContextType>({
    tenantId: 'default',
    tenantName: 'EduPro',
    tenantLogo: null,
    grades: [],
    subjects: [],
    topics: [],
    features: {},
    setTenantId: async () => { },
    loading: true,
});

export const useTenant = () => useContext(TenantContext);

export const useFeature = (featureKey: string) => {
    const { features } = useTenant();
    // Default allow: if the feature key is not explicitly set to false, it is enabled
    return features ? features[featureKey] !== false : true;
};

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tenantId, setTenantIdState] = useState('default');
    const [tenantName, setTenantName] = useState('EduPro');
    const [tenantLogo, setTenantLogo] = useState<string | null>(null);
    const [grades, setGrades] = useState<string[]>([]);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [topics, setTopics] = useState<string[]>([]);
    const [features, setFeatures] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tenantId === 'default') {
            setTenantName('EduPro');
            setTenantLogo(null);
            setGrades([]);
            setSubjects([]);
            setTopics([]);
            setFeatures({});
            return;
        }

        // Real-time listener for Tenant metadata
        const unsubTenant = onSnapshot(doc(db, "tenants", tenantId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setTenantName(data.name || 'EduPro');
                setTenantLogo(data.logoUrl || null);
                setFeatures(data.features || {});
            }
        }, (error) => {
            console.error("Error listening to tenant document:", error);
        });

        // Real-time listener for lists metadata (grades, subjects, topics)
        const unsubLists = onSnapshot(doc(db, "tenants", tenantId, "metadata", "lists"), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setGrades(data.grades || []);
                setSubjects(data.subjects || []);
                setTopics(data.topics || []);
            }
        }, (error) => {
            console.error("Error listening to lists metadata:", error);
        });

        return () => {
            unsubTenant();
            unsubLists();
        };
    }, [tenantId]);

    useEffect(() => {
        const loadTenant = async () => {
            try {
                const stored = await AsyncStorage.getItem('tenant_id');
                if (stored) {
                    setTenantIdState(stored);
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
            features,
            setTenantId,
            loading
        }}>
            {children}
        </TenantContext.Provider>
    );
};

