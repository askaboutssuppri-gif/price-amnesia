import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Receipt as ReceiptIcon, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/lib/types';

export default function ReceiptsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReceipts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setReceipts((data as Receipt[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadReceipts();
    }, [loadReceipts])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReceipts();
    setRefreshing(false);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>Receipts</Text>
      {loading ? (
        <ActivityIndicator size="large" color={Colors.amber[400]} style={styles.loader} />
      ) : (
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
          {receipts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No receipts yet</Text>
              <Text style={styles.emptyText}>
                Your scanned receipts will appear here.
              </Text>
            </View>
          ) : (
            receipts.map((r) => (
              <TouchableOpacity key={r.id} style={styles.row} activeOpacity={0.7}>
                <View style={styles.iconWrap}>
                  <ReceiptIcon size={18} color={Colors.gray[400]} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.store} numberOfLines={1}>
                    {r.store_name || 'Unknown store'}
                  </Text>
                  <Text style={styles.meta}>
                    {formatDate(r.created_at)} · {r.item_count} items
                  </Text>
                </View>
                <ChevronRight size={16} color={Colors.gray[600]} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy[900],
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: Colors.white,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 40,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: Colors.white,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.gray[400],
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navy[800],
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.navy[700],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.navy[700],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  store: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.white,
    marginBottom: 2,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.gray[500],
  },
});
