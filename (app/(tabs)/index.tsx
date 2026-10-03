import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, TrendingDown, TrendingUp, Search } from 'lucide-react-native';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { PriceEntry } from '@/lib/types';

interface Mover {
  item_name: string;
  latest: number;
  previous: number;
  pct: number;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentItems, setRecentItems] = useState<PriceEntry[]>([]);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('receipts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setReceiptCount(count ?? 0);

    const { data: recent } = await supabase
      .from('price_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentItems((recent as PriceEntry[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.amber[400]}
          />
        }
      >
        <Text style={styles.title}>Price Amnesia</Text>
        <Text style={styles.subtitle}>
          Never wonder "was this a good price?" again.
        </Text>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => router.push('/camera-capture')}
          activeOpacity={0.85}
        >
          <Camera size={22} color={Colors.navy[900]} strokeWidth={2} />
          <Text style={styles.scanButtonText}>Snap a receipt</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={Colors.amber[400]}
            style={styles.loader}
          />
