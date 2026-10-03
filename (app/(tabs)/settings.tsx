import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Trash2, Crown } from 'lucide-react-native';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [clearing, setClearing] = useState(false);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleClearData = () => {
    Alert.alert(
      'Delete all data',
      'This removes all your receipts and price history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setClearing(true);
            await supabase.from('price_entries').delete().eq('user_id', user.id);
            await supabase.from('receipts').delete().eq('user_id', user.id);
            await supabase
              .from('profiles')
              .update({ free_receipts_used: 0 })
              .eq('id', user.id);
            await refreshProfile();
            setClearing(false);
            Alert.alert('Done', 'All data deleted.');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>Settings</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{user?.email ?? '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Free receipts used</Text>
          <Text style={styles.value}>
            {profile?.free_receipts_used ?? 0} / 5 this month
          </Text>
        </View>

        <TouchableOpacity style={styles.proButton} activeOpacity={0.85}>
          <Crown size={20} color={Colors.navy[900]} />
          <Text style={styles.proButtonText}>Go Unlimited — $4.99/mo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleClearData}
          disabled={clearing}
          activeOpacity={0.7}
        >
          <Trash2 size={18} color={Colors.error} />
          <Text style={styles.dangerText}>
            {clearing ? 'Deleting…' : 'Delete all my data'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <LogOut size={18} color={Colors.gray[400]} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Price Amnesia tracks prices you log. Informational only — not
          financial advice.
        </Text>      </ScrollView>
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
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.navy[800],
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.navy[700],
  },
  label: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.gray[500],
    marginBottom: 4,
  },
  value: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: Colors.white,
  },
  proButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.amber[400],
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  proButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.navy[900],
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  dangerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.error,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  signOutText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.gray[400],
  },
  disclaimer: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
