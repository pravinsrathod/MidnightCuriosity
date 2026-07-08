import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Modal, FlatList, TextInput, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ParentHeaderProps {
    parentName: string;
    studentName: string;
    childList?: any[];
    selectedChildId?: string | null;
    onSelectStudent?: (childId: string) => void;
    onAddChild?: (phone: string) => void;
    onLogout?: () => void;
    tenantLogo?: string | null;
    hasNotifications?: boolean;
    showActions?: boolean;
    onBack?: () => void;
    showWelcome?: boolean;
}

export const ParentHeader = ({
    parentName,
    studentName,
    childList,
    selectedChildId,
    onSelectStudent,
    onAddChild,
    onLogout,
    tenantLogo,
    hasNotifications = true,
    showActions = true,
    onBack,
    showWelcome = true,
}: ParentHeaderProps) => {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => makeStyles(colors, insets, isDark), [colors, insets, isDark]);

    const [isSelectionModalVisible, setIsSelectionModalVisible] = useState(false);
    const [isAddChildModalVisible, setIsAddChildModalVisible] = useState(false);
    const [newChildPhone, setNewChildPhone] = useState('');

    const handleSelect = (id: string) => {
        onSelectStudent?.(id);
        setIsSelectionModalVisible(false);
    };

    const handleAddChildClick = () => {
        if (!newChildPhone) return;
        onAddChild?.(newChildPhone);
        setNewChildPhone('');
        setIsAddChildModalVisible(false);
    };

    const renderStudentItem = ({ item }: { item: any }) => (
        <TouchableOpacity 
            style={[
                styles.studentItem, 
                selectedChildId === item.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
            ]}
            onPress={() => handleSelect(item.id)}
        >
            <View style={styles.studentItemAvatar}>
                <Ionicons name="person" size={20} color={selectedChildId === item.id ? colors.primary : colors.textSecondary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.studentItemName, selectedChildId === item.id && { color: colors.primary }]}>
                    {item.name}
                </Text>
                <Text style={styles.studentItemGrade}>{item.grade || 'No Grade'} • {item.batch || 'No Batch'}</Text>
                {item.isPending && (
                    <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>Pending Approval</Text>
                    </View>
                )}
            </View>
            {selectedChildId === item.id && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.headerContainer, { paddingBottom: 15 }]}>
            <View style={[styles.headerTop, { marginBottom: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {onBack && (
                        <TouchableOpacity onPress={onBack} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                        onPress={() => childList && childList.length > 0 && setIsSelectionModalVisible(true)} 
                        style={[styles.studentSelector, (!childList || childList.length === 0) && { opacity: 0.8 }]}
                        disabled={!childList || childList.length === 0}
                    >
                        <View style={styles.studentAvatar}>
                            {tenantLogo ? (
                                <Image source={{ uri: tenantLogo }} style={styles.logoImage} />
                            ) : (
                                <Ionicons name="person-circle" size={32} color={colors.primary} />
                            )}
                        </View>
                        <View style={{ marginLeft: 10 }}>
                            <Text style={styles.studentNameHeader}>Hi, {parentName?.split(' ')[0] || 'Parent'}!</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                <Text style={styles.studentLabel}>Viewing: {studentName || 'Select Student'}</Text>
                                <Ionicons name="chevron-down" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>

                {showActions && onAddChild && (
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={() => Alert.alert('Notifications', 'No new notifications right now.')} style={styles.actionIcon}>
                            <Ionicons name="notifications-outline" size={20} color={colors.text} />
                            {hasNotifications && <View style={styles.notificationBadge} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsAddChildModalVisible(true)} style={styles.actionIcon}>
                            <Ionicons name="person-add-outline" size={20} color={colors.text} />
                        </TouchableOpacity>
                        {onLogout && (
                            <TouchableOpacity onPress={onLogout} style={styles.actionIcon}>
                                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

            {/* Selection Modal */}
            <Modal
                visible={isSelectionModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsSelectionModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Student</Text>
                            <TouchableOpacity onPress={() => setIsSelectionModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={childList || []}
                            keyExtractor={(item) => item.id}
                            renderItem={renderStudentItem}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        />
                        <TouchableOpacity 
                            style={styles.addStudentBtn}
                            onPress={() => {
                                setIsSelectionModalVisible(false);
                                setIsAddChildModalVisible(true);
                            }}
                        >
                            <Ionicons name="add" size={20} color={colors.primary} />
                            <Text style={styles.addStudentText}>Add Another Child</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Child Modal */}
            <Modal
                visible={isAddChildModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsAddChildModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <KeyboardAvoidingView 
                        style={styles.modalOverlay} 
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={[styles.modalContent, { marginTop: 'auto' }]}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Add Your Child</Text>
                                <TouchableOpacity onPress={() => setIsAddChildModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.modalSubtitle}>
                                Enter your child&apos;s registered mobile number to link them to your account.
                            </Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="phone-portrait-outline" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Child's Phone Number"
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType="phone-pad"
                                    value={newChildPhone}
                                    onChangeText={setNewChildPhone}
                                />
                            </View>
                            <TouchableOpacity style={styles.submitBtn} onPress={handleAddChildClick}>
                                <Text style={styles.submitBtnText}>Send Linking Request</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

const makeStyles = (colors: any, insets: any, isDark: boolean) => StyleSheet.create({
    headerContainer: {
        paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 40,
        paddingBottom: 25,
        paddingHorizontal: 20,
        backgroundColor: colors.card,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card + '80',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: colors.border + '50',
    },
    studentSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card + '80',
        padding: 8,
        paddingRight: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border + '50',
    },
    studentAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primary + '20',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    studentLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    studentNameHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.text,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card + '80',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border + '50',
    },
    notificationBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.danger,
        borderWidth: 1.5,
        borderColor: colors.card,
    },
    headerBottom: {
        marginTop: 4,
    },
    welcomeBack: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    parentGreeting: {
        fontSize: 32,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.5,
    },
    // New Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 24,
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 24,
        lineHeight: 20,
    },
    studentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: colors.background,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    studentItemAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
    },
    studentItemName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    studentItemGrade: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    pendingBadge: {
        backgroundColor: colors.warning + '20',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    pendingText: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.warning,
    },
    addStudentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        borderRadius: 16,
        marginTop: 10,
    },
    addStudentText: {
        marginLeft: 8,
        color: colors.primary,
        fontWeight: '600',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    textInput: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
    },
    submitBtn: {
        backgroundColor: colors.primary,
        borderRadius: 16,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
