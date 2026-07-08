import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking, FlatList, Dimensions, ActivityIndicator } from 'react-native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85;

export interface Campaign {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    actionLink?: string;
    targetAudience: string[];
    isActive: boolean;
    tenantId: string;
    startDate?: string;
    endDate?: string;
    sequence?: number;
}

interface CampaignCarouselProps {
    audience: 'STUDENT' | 'PARENT';
}

const CampaignCarousel: React.FC<CampaignCarouselProps> = ({ audience }) => {
    const { colors, isDark } = useTheme();
    const { tenantId } = useTenant();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenantId) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'campaigns'),
            where('tenantId', '==', tenantId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched: Campaign[] = [];
            const today = new Date().toISOString().split('T')[0];
            
            snapshot.forEach((doc) => {
                const data = doc.data() as Campaign;
                let isWithinDateRange = true;
                
                if (data.startDate && today < data.startDate) {
                    isWithinDateRange = false;
                }
                if (data.endDate && today > data.endDate) {
                    isWithinDateRange = false;
                }
                
                if (data.isActive && isWithinDateRange && data.targetAudience && data.targetAudience.includes(audience)) {
                    fetched.push({ ...data, id: doc.id });
                }
            });
            
            // Sort by sequence explicitly
            fetched.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
            
            setCampaigns(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching campaigns:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId, audience]);

    const handlePress = (link?: string) => {
        if (link) {
            Linking.openURL(link).catch((err) => console.error("Failed to open link:", err));
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    if (campaigns.length === 0) {
        return null; // Don't show anything if no campaigns
    }

    const renderItem = ({ item }: { item: Campaign }) => {
        return (
            <TouchableOpacity 
                style={[
                    styles.card, 
                    { 
                        backgroundColor: item.imageUrl ? 'transparent' : (isDark ? colors.card : colors.primaryLight), 
                        borderColor: item.imageUrl ? 'transparent' : colors.border,
                        borderWidth: item.imageUrl ? 0 : 1
                    }
                ]} 
                onPress={() => handlePress(item.actionLink)}
                activeOpacity={item.actionLink ? 0.8 : 1}
            >
                {item.imageUrl && (
                    <Image source={{ uri: item.imageUrl }} style={[styles.image, { height: 180 }]} resizeMode="cover" />
                )}
                {!item.imageUrl && (
                    <View style={styles.textContent}>
                        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>{item.content}</Text>
                        {item.actionLink && (
                            <View style={styles.actionRow}>
                                <Text style={[styles.actionText, { color: colors.primary }]}>Learn More</Text>
                                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                            </View>
                        )}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Announcements</Text>
            <FlatList
                data={campaigns}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_WIDTH + 16}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 8,
        marginBottom: 24,
        marginHorizontal: -24, // Escapes the parent ScrollView padding
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 24,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    listContent: {
        paddingHorizontal: 24,
        paddingRight: 48, // Extra padding for scrolling past the last item
    },
    card: {
        width: CARD_WIDTH,
        marginRight: 16,
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: 160,
    },
    textContent: {
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    body: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default CampaignCarousel;
