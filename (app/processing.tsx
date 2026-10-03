import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ProcessingScreen() {
  const { photoBase64 } = useLocalSearchParams<{
    photoUri: string;
    photoBase64: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState('Reading your receipt…');

  useEffect(() => {
    const process = async () => {
      if (!user || !photoBase64) {
        Alert.alert('Error', 'No photo to process.');
        router.back();
        return;
      }

      const freeUsed = profile?.free_receipts_used ?? 0;
      if (freeUsed >= 5) {
        Alert.alert(
          'Limit reached',
          'You have used your 5 free receipts. Upgrade for unlimited.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
        return;
      }

      try {
        setStatus('Extracting prices…');
        const { data, error } = await supabase.functions.invoke(
          'extract-receipt',
          { body: { imageBase64: photoBase64 } }
        );

        if (error) throw new Error(error.message);
        const { store, date, items } = data as {
          store: string | null;
          date: string | null;
          items: { name: string; price: number; quantity?: number; unit?: string }[];
        };

        setStatus('Saving…');
        const { data: receipt, error: rErr } = await supabase
          .from('receipts')
          .insert({
            user_id: user.id,
            store_name: store,
            receipt_date: date,
            item_count: items.length,
          })
          .select()
          .single();
        if (rErr) throw rErr;

        if (items.length > 0) {
          await supabase.from('price_entries').insert(
            items.map((it) => ({
              receipt_id: receipt.id,
              user_id: user.id,
              item_name: it.name.toLowerCase().trim(),
              price: it.price,
              quantity: it.quantity ?? null,
              unit: it.unit ?? null,
            }))
          );
        }

        await supabase
          .from('profiles')
          .update({ free_receipts_used: freeUsed + 1 })
          .eq('id', user.id);
        await refreshProfile();

        router.replace('/(tabs)/receipts');
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Could not read the receipt. Try again.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    };

    process();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <ActivityIndicator size="large" color={Colors.amber[400]} />
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.hint}>This usually takes a few seconds.</Text>    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy[900],
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  status: {
    fontFamily: 'Inter-Bold',
    fontSize: 19,
    color: Colors.white,
    marginTop: 24,
    marginBottom: 8,
  },
  hint: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.gray[500],
  },
});
