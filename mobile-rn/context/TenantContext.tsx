import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TenantContextType = {
    tenantId: string;
    setTenantId: (id: string) => void;
    loading: boolean;
};

const TenantContext = createContext<TenantContextType>({
    tenantId: 'default',
    setTenantId: () => { },
    loading: true,
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tenantId, setTenantIdState] = useState('default');
    const [loading, setLoading] = useState(true);

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
        <TenantContext.Provider value={{ tenantId, setTenantId, loading }}>
            {children}
        </TenantContext.Provider>
    );
};
