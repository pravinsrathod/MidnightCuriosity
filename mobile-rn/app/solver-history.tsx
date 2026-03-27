import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SolverHistoryScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Solver History</Text>
            </View>
            <View style={styles.content}>
                <Ionicons name="time-outline" size={64} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your history is coming soon!</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    backBtn: { marginRight: 15 },
    title: { fontSize: 24, fontWeight: 'bold' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyText: { marginTop: 20, fontSize: 16, textAlign: 'center' }
});
