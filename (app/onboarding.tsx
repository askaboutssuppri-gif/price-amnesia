import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Receipt, TrendingUp, Bell } from 'lucide-react-native';
import { Colors } from '@/lib/theme';

const FEATURES = [
  {
    icon: Receipt,
    title: 'Snap any receipt',
    text: 'AI reads every item and price automatically.',
  },
  {
    icon: TrendingUp,
    title: 'See price history',
    text: 'Was $4.99 the real price or a "sale"? Now you know.',
  },
  {
    icon: Bell,
    title: 'Catch price drops',
    text: 'Get alerted when your groceries get cheaper.',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <Text style={styles.title}>Price Amnesia</Text>
      <Text style={styles.subtitle}>
        What did eggs cost last month?{'\n'}Now you'll always know.
      </Text>

      <View style={styles.features}>
        {FEATURES.map((f, i) => (
          <View key={i} style={styles.feature}>
            <View style={styles.iconWrap}>
              <f.icon size={22} color={Colors.amber[400]} strokeWidth={2} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => router.push('/sign-in')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryText}>Get started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy[900],
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 34,
    color: Colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: Colors.gray[400],
    lineHeight: 24,
    marginBottom: 36,
  },
  features: {
    gap: 20,
    marginBottom: 40,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.navy[800],
    borderWidth: 1,
    borderColor: Colors.navy[700],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: Colors.white,
    marginBottom: 4,
  },
  featureDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.gray[400],
    lineHeight: 20,
  },
  buttons: {
    marginTop: 'auto',
    paddingBottom: 40,
  },
  primary: {
    backgroundColor: Colors.amber[400],
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: Colors.navy[900],
  },
});
