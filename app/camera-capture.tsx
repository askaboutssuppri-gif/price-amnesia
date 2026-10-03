import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Camera as CameraIcon } from 'lucide-react-native';
import { Colors } from '@/lib/theme';

export default function CameraCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.text}>
          We need your camera to scan receipts.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      router.push({
        pathname: '/processing',
        params: { photoUri: photo?.uri ?? '', photoBase64: photo?.base64 ?? '' },
      });
    } catch {
      Alert.alert('Error', 'Could not take photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <X size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.hint}>Point at the receipt</Text>
          <View style={styles.spacer} />
        </View>
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.shutter}
            onPress={takePhoto}
            disabled={busy}
          >
            <CameraIcon size={28} color={Colors.navy[900]} />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy[950],
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: Colors.white,
    marginBottom: 8,
  },
  text: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.gray[400],
    textAlign: 'center',    marginBottom: 24,
  },
  button: {
    backgroundColor: Colors.amber[400],
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.navy[900],
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.white,
  },
  spacer: {
    width: 44,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.amber[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
