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
          />        ) : receiptCount === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No prices tracked yet</Text>
            <Text style={styles.emptyText}>
              Snap your first grocery receipt and we'll start building your
              price memory.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Recently tracked</Text>
            {recentItems.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.item_name}
                  </Text>
                  <Text style={styles.itemDate}>
                    {new Date(item.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy[900],
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: Colors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.gray[400],
    marginBottom: 24,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.amber[400],
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 28,
  },
  scanButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: Colors.navy[900],
  },
  loader: {
    marginTop: 40,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 19,
    color: Colors.white,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: Colors.white,
    marginBottom: 12,
  },  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.navy[800],
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.navy[700],
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.white,
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  itemDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.gray[500],
  },
  itemPrice: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.amber[400],
  },
});
