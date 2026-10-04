import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, RotateCcw, X } from 'lucide-react-native';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

interface FoundItem {
  name: string;
  price: number;
  quantity: number | null;
}

type Status = 'reading' | 'saving' | 'done' | 'error';

export default function ProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ photoUri?: string; photoBase64?: string }>();
  const [status, setStatus] = useState<Status>('reading');
  const [items, setItems] = useState<FoundItem[]>([]);
  const [store, setStore] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    processReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processReceipt = async () => {
    try {
      setErrorMsg('');
      const base64 = params.photoBase64;
      if (!base64) throw new Error('No photo data received. Please take the photo again.');
      if (!GEMINI_KEY) throw new Error('Missing AI key. Add EXPO_PUBLIC_GEMINI_API_KEY in the Expo dashboard and rebuild.');
      if (!user) throw new Error('You are not signed in.');

      setStatus('reading');
      const prompt =
        'You are a grocery receipt reader. Extract every purchased item from this receipt photo. ' +
        'Reply with ONLY raw JSON (no markdown, no backticks, no explanation) in exactly this shape: ' +
        '{"store": "store name or null", "date": "YYYY-MM-DD or null", ' +
        '"items": [{"name": "item name", "price": 0.00, "quantity": 1}]}. ' +
        'Use the line total as price. Skip taxes, subtotals, and totals.';

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      });
      if (!res.ok) {
        throw new Error(`AI request failed (${res.status}). Check the API key and try again.`);
      }
      const json = await res.json();
      let text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      text = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      const found: FoundItem[] = (parsed.items ?? [])
        .map((it: any) => ({
          name: String(it.name ?? 'Item').slice(0, 120),
          price: Number(it.price ?? 0),
          quantity: it.quantity != null && !isNaN(Number(it.quantity)) ? Number(it.quantity) : null,
        }))
        .filter((it: FoundItem) => it.name && it.price > 0);
      if (found.length === 0) {
        throw new Error('No items found on the receipt. Try a clearer, well-lit photo.');
      }
      setItems(found);
      setStore(parsed.store ?? null);

      setStatus('saving');
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          store_name: parsed.store ?? null,
          receipt_date: parsed.date ?? null,
          item_count: found.length,
        })
        .select('id')
        .single();
      if (receiptError) throw new Error('Could not save receipt: ' + receiptError.message);

      const rows = found.map((it) => ({
        receipt_id: receipt.id,
        user_id: user.id,
        item_name: it.name,
        price: it.price,
        quantity: it.quantity,
      }));
      const { error: entriesError } = await supabase.from('price_entries').insert(rows);
      if (entriesError) throw new Error('Could not save prices: ' + entriesError.message);

      setStatus('done');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong.');
      setStatus('error');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {params.photoUri ? (
          <Image source={{ uri: params.photoUri }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {(status === 'reading' || status === 'saving') && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.amber[400]} />
            <Text style={styles.statusTitle}>
              {status === 'reading' ? 'Reading your receipt…' : 'Saving prices…'}
            </Text>
            <Text style={styles.statusText}>
              {status === 'reading'
                ? 'The AI is extracting every item and price.'
                : 'Storing them in your price memory.'}
            </Text>
          </View>
        )}

        {status === 'done' && (
          <View style={styles.centerBox}>
            <View style={styles.doneBadge}>
              <Check size={28} color={Colors.navy[900]} />
            </View>
            <Text style={styles.statusTitle}>
              Saved {items.length} item{items.length === 1 ? '' : 's'}!
            </Text>
            {store ? <Text style={styles.statusText}>{store}</Text> : null}
            <View style={styles.list}>
              {items.map((it, i) => (
                <View key={`${it.name}-${i}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.quantity && it.quantity !== 1 ? `${it.quantity} × ` : ''}{it.name}
                  </Text>
                  <Text style={styles.itemPrice}>${it.price.toFixed(2)}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.primary} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.centerBox}>
            <View style={styles.errorBadge}>
              <X size={28} color={Colors.white} />
            </View>
            <Text style={styles.statusTitle}>Couldn't read it</Text>
            <Text style={styles.statusText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.primary} onPress={processReceipt}>
              <RotateCcw size={18} color={Colors.navy[900]} />
              <Text style={styles.primaryText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => router.replace('/camera-capture')}>
              <Text style={styles.ghostText}>Take a new photo</Text>
            </TouchableOpacity>
          </View>
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
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 28,
    backgroundColor: Colors.navy[800],
  },
  centerBox: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 12,
  },
  statusTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: Colors.white,
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  doneBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.amber[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  itemRow: {
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
  itemName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.white,
    textTransform: 'capitalize',
    flex: 1,
    marginRight: 12,
  },
  itemPrice: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.amber[400],
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.amber[400],
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 16,
    minWidth: 200,
  },
  primaryText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.navy[900],
  },
  ghost: {
    marginTop: 12,
    paddingVertical: 12,
  },
  ghostText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.amber[400],
  },
});
