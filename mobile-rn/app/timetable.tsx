import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../services/firebaseConfig';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const getISOWeekString = (dateObj: Date) => {
    const date = new Date(dateObj.valueOf());
    const dayNum = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayNum + 3);
    const firstThursday = date.valueOf();
    date.setMonth(0, 1);
    if (date.getDay() !== 4) {
      date.setMonth(0, 1 + ((4 - date.getDay()) + 7) % 7);
    }
    const week = 1 + Math.ceil((firstThursday - date.valueOf()) / 604800000);
    return `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
};

const getWeekDates = (dateObj: Date) => {
    const current = new Date(dateObj);
    const week = [];
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
    for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return week;
};

const getLocalDateInTimezone = (timezone: string) => {
    if (!timezone) return new Date();
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(new Date());
        const obj: any = {};
        parts.forEach(p => obj[p.type] = parseInt(p.value, 10));
        return new Date(obj.year, obj.month - 1, obj.day, obj.hour, obj.minute, obj.second);
    } catch (e) {
        return new Date();
    }
};

export default function TimetableScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { tenantId } = useTenant();
    const { profile, selectedChildId } = useAuth();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [loading, setLoading] = useState(true);
    const [generalBaseData, setGeneralBaseData] = useState<any>(null);
    const [batchBaseData, setBatchBaseData] = useState<any>(null);
    const [generalOverrideData, setGeneralOverrideData] = useState<any>(null);
    const [batchOverrideData, setBatchOverrideData] = useState<any>(null);
    const [schedule, setSchedule] = useState<any>({});
    const [timezone, setTimezone] = useState('');
    
    const [activeGrade, setActiveGrade] = useState<string | null>(null);
    const [activeTenant, setActiveTenant] = useState<string | null>(null);
    const [activeBatch, setActiveBatch] = useState<string | null>(null);
    const [missingGrade, setMissingGrade] = useState(false);
    
    const [viewingNextWeek, setViewingNextWeek] = useState(false);
    const baseDate = useMemo(() => {
        const d = getLocalDateInTimezone(timezone);
        if (viewingNextWeek) d.setDate(d.getDate() + 7);
        return d;
    }, [viewingNextWeek, timezone]);
    
    const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
    const currentWeekStr = useMemo(() => getISOWeekString(baseDate), [baseDate]);

    const [selectedDay, setSelectedDay] = useState(() => {
        const d = new Date().getDay();
        return DAYS[d === 0 ? 6 : d - 1]; // 0 is Sunday, so if 0 then 6 (sunday in DAYS)
    });
    const [hasSetTzDay, setHasSetTzDay] = useState(false);

    // Sync selected day to institute timezone on first load
    useEffect(() => {
        if (timezone && !hasSetTzDay) {
            const d = getLocalDateInTimezone(timezone).getDay();
            setSelectedDay(DAYS[d === 0 ? 6 : d - 1]);
            setHasSetTzDay(true);
        }
    }, [timezone, hasSetTzDay]);

    useEffect(() => {
        const effectiveBase = batchBaseData || generalBaseData;
        const effectiveOverride = batchOverrideData || generalOverrideData;
        const activeData = effectiveOverride || effectiveBase;
        
        if (activeData) {
            setSchedule(activeData.schedule || {});
            setTimezone(activeData.timezone || '');
        } else {
            setSchedule({});
            setTimezone('');
        }
    }, [generalBaseData, batchBaseData, generalOverrideData, batchOverrideData]);

    // Effect 1: Fetch Base Timetable and establish Grade/Tenant
    useEffect(() => {
        let unsubGeneralBase: any;
        let unsubBatchBase: any;
        let isMounted = true;

        const fetchBaseTimetable = async () => {
            try {
                let grade = null;
                let tId = tenantId;
                let batch = 'All';

                // Check if Parent
                if (profile?.role?.toUpperCase() === 'PARENT') {
                    if (!selectedChildId) {
                        setLoading(false);
                        return;
                    }
                    const childDoc = await getDoc(doc(db, 'users', selectedChildId));
                    if (childDoc.exists()) {
                        const data = childDoc.data();
                        grade = data.grade;
                        tId = data.tenantId || tenantId;
                        batch = data.batch || 'All';
                    }
                } else {
                    // Student
                    let uid = auth.currentUser?.uid;
                    if (!uid) uid = await AsyncStorage.getItem('user_uid') || undefined;
                    if (!uid) {
                        setLoading(false);
                        return;
                    }
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        grade = data.grade;
                        tId = data.tenantId || tenantId;
                        batch = data.batch || 'All';
                    }
                }

                if (!isMounted) return;

                if (!grade || !tId) {
                    setMissingGrade(true);
                    setLoading(false);
                    return;
                }

                setActiveGrade(grade);
                setActiveTenant(tId);
                setActiveBatch(batch);

                const generalDocId = `${tId}_${grade}`;
                unsubGeneralBase = onSnapshot(doc(db, 'timetables', generalDocId), (docSnap) => {
                    setGeneralBaseData(docSnap.exists() ? docSnap.data() : null);
                    setLoading(false);
                });
                
                if (batch && batch !== 'All') {
                    const formattedBatch = batch.replace(/[^a-zA-Z0-9]/g, '_');
                    const batchDocId = `${tId}_${grade}_${formattedBatch}`;
                    unsubBatchBase = onSnapshot(doc(db, 'timetables', batchDocId), (docSnap) => {
                        setBatchBaseData(docSnap.exists() ? docSnap.data() : null);
                    });
                } else {
                    setBatchBaseData(null);
                }

            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };

        fetchBaseTimetable();

        return () => {
            isMounted = false;
            if (unsubGeneralBase) unsubGeneralBase();
            if (unsubBatchBase) unsubBatchBase();
        };
    }, [profile, selectedChildId, tenantId]);

    // Effect 2: Fetch Override Timetable for the specific week
    useEffect(() => {
        let unsubGeneralOverride: any;
        let unsubBatchOverride: any;
        
        if (activeGrade && activeTenant && currentWeekStr) {
            const generalOverrideId = `${activeTenant}_${activeGrade}_${currentWeekStr}`;
            unsubGeneralOverride = onSnapshot(doc(db, 'timetables', generalOverrideId), (docSnap) => {
                setGeneralOverrideData(docSnap.exists() ? docSnap.data() : null);
            });
            
            if (activeBatch && activeBatch !== 'All') {
                const formattedBatch = activeBatch.replace(/[^a-zA-Z0-9]/g, '_');
                const batchOverrideId = `${activeTenant}_${activeGrade}_${formattedBatch}_${currentWeekStr}`;
                unsubBatchOverride = onSnapshot(doc(db, 'timetables', batchOverrideId), (docSnap) => {
                    setBatchOverrideData(docSnap.exists() ? docSnap.data() : null);
                });
            } else {
                setBatchOverrideData(null);
            }
        }
        return () => {
            if (unsubGeneralOverride) unsubGeneralOverride();
            if (unsubBatchOverride) unsubBatchOverride();
        };
    }, [activeGrade, activeTenant, activeBatch, currentWeekStr]);

    const formatSlotTime = (time: string) => {
        if (!time) return '';
        let [h, m] = time.split(':');
        let hrs = parseInt(h);
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12;
        hrs = hrs ? hrs : 12;
        return `${hrs}:${m} ${ampm}`;
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
            </SafeAreaView>
        );
    }

    if (missingGrade) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Timetable</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={colors.warning} />
                    <Text style={[styles.emptyText, { color: colors.warning }]}>
                        Your profile is missing a Grade assignment. Please contact your administrator to set up your profile.
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const currentSlots = [...(schedule[selectedDay] || [])];
    // Sort slots by start time
    currentSlots.sort((a: any, b: any) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Timetable</Text>
                <TouchableOpacity onPress={() => setViewingNextWeek(!viewingNextWeek)} style={{ padding: 4, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.primary, marginRight: 4, fontWeight: 'bold' }}>
                        {viewingNextWeek ? 'This Week' : 'Next Week'}
                    </Text>
                    <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {overrideData && (
                <View style={{ backgroundColor: colors.warning + '20', padding: 8, alignItems: 'center' }}>
                    <Text style={{ color: colors.warning, fontWeight: 'bold', fontSize: 12 }}>Showing modified schedule for this week</Text>
                </View>
            )}

            <View style={styles.daySelectorContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
                    {DAYS.map((day, index) => {
                        const dateObj = weekDates[index];
                        const dateStr = dateObj.getDate().toString();
                        return (
                            <TouchableOpacity
                                key={day}
                                style={[styles.dayBadge, selectedDay === day && styles.dayBadgeSelected]}
                                onPress={() => setSelectedDay(day)}
                            >
                                <Text style={[styles.dayBadgeText, selectedDay === day && styles.dayBadgeTextSelected]}>
                                    {day.substring(0, 3).toUpperCase()} {dateStr}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scheduleList}>
                {timezone ? (
                    <Text style={styles.timezoneText}>Times are in {timezone}</Text>
                ) : null}

                {currentSlots.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="calendar-outline" size={64} color={colors.border} />
                        <Text style={styles.emptyText}>No classes scheduled for {selectedDay}.</Text>
                    </View>
                ) : (
                    currentSlots.map((slot: any, index: number) => {
                        let typeColor = colors.primary;
                        if (slot.type === 'break') typeColor = colors.warning;
                        if (slot.type === 'activity') typeColor = colors.success;

                        return (
                            <View key={slot.id || index} style={[styles.slotCard, { borderLeftColor: typeColor }]}>
                                <View style={styles.timeBlock}>
                                    <Text style={styles.timeText}>{formatSlotTime(slot.startTime)}</Text>
                                    <View style={styles.timeLine} />
                                    <Text style={styles.timeText}>{formatSlotTime(slot.endTime)}</Text>
                                </View>
                                <View style={styles.slotDetails}>
                                    {slot.type === 'break' ? (
                                        <Text style={[styles.subjectText, { color: colors.warning, fontStyle: 'italic' }]}>Break Time</Text>
                                    ) : (
                                        <>
                                            <Text style={styles.subjectText}>{slot.subject}</Text>
                                            <Text style={styles.typeText}>{slot.type.charAt(0).toUpperCase() + slot.type.slice(1)}</Text>
                                            {(slot.instructor || slot.room) && (
                                                <View style={styles.extraDetails}>
                                                    {slot.instructor && (
                                                        <Text style={styles.extraText}>
                                                            <Ionicons name="person-outline" size={12} color={colors.textSecondary} /> {slot.instructor}
                                                        </Text>
                                                    )}
                                                    {slot.room && (
                                                        <Text style={styles.extraText}>
                                                            <Ionicons name="location-outline" size={12} color={colors.textSecondary} /> {slot.room}
                                                        </Text>
                                                    )}
                                                </View>
                                            )}
                                        </>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderColor: colors.border
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
    daySelectorContainer: {
        borderBottomWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card
    },
    daySelector: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        gap: 12,
    },
    dayBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    dayBadgeSelected: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    dayBadgeText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    dayBadgeTextSelected: {
        color: '#FFFFFF',
    },
    scheduleList: {
        padding: 20,
    },
    timezoneText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 20,
        fontStyle: 'italic',
    },
    slotCard: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderLeftWidth: 6,
        borderColor: colors.border,
    },
    timeBlock: {
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderColor: colors.border,
        paddingRight: 16,
        marginRight: 16,
    },
    timeText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.text,
    },
    timeLine: {
        height: 12,
        width: 2,
        backgroundColor: colors.border,
        marginVertical: 4,
    },
    slotDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    subjectText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 4,
    },
    typeText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginTop: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    extraDetails: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 6,
    },
    extraText: {
        fontSize: 12,
        color: colors.textSecondary,
        display: 'flex',
        alignItems: 'center',
    }
});
