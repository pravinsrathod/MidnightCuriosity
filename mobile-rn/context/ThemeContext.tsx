import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

type ThemeType = 'light' | 'dark';

type ThemeContextType = {
    theme: ThemeType;
    toggleTheme: () => void;
    colors: typeof Colors.light;
    isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark', // Secure default
    toggleTheme: () => { },
    colors: Colors.dark,
    isDark: true,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const systemScheme = useSystemColorScheme();
    const [theme, setTheme] = useState<ThemeType>('dark');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const storedTheme = await AsyncStorage.getItem('user_theme');
            if (storedTheme === 'light' || storedTheme === 'dark') {
                setTheme(storedTheme);
            } else {
                // If no preference, use system but default to dark if unsure
                setTheme(systemScheme === 'light' ? 'light' : 'dark');
            }
        } catch (e) {
            console.log('Failed to load theme', e);
        } finally {
            setLoaded(true);
        }
    };

    const toggleTheme = async () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        try {
            await AsyncStorage.setItem('user_theme', newTheme);
        } catch (e) {
            console.error("Failed to save theme", e);
        }
    };

    const colors = Colors[theme];

    // Prevent flash of wrong theme? Maybe not critical for MVP.
    // if (!loaded) return null; 

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, colors, isDark: theme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
