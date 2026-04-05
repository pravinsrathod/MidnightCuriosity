import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SupportModal from './SupportModal';

const SupportFAB: React.FC = () => {
    const [modalVisible, setModalVisible] = useState(false);

    return (
        <>
            <TouchableOpacity 
                style={styles.fab} 
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
            >
                <View style={styles.badge} />
                <Ionicons name="chatbubble-ellipses" size={24} color="#FFF" />
            </TouchableOpacity>

            <SupportModal 
                visible={modalVisible} 
                onClose={() => setModalVisible(false)} 
            />
        </>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 90, // Above tab bar if present
        right: 20,
        backgroundColor: '#28A745',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        zIndex: 999, // Ensure it's on top
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FFC107',
        borderWidth: 2,
        borderColor: '#FFF',
    }
});

export default SupportFAB;
