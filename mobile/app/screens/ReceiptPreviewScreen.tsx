import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiptPreview'>;

const { height: SH } = Dimensions.get('window');

export default function ReceiptPreviewScreen({ navigation, route }: Props) {
  const { capturedImages } = route.params;

  // Display the most recently captured image (last in array).
  // The array structure is intentional — a future milestone will allow
  // adding more pages to the same receipt session.
  const previewUri = capturedImages[capturedImages.length - 1];

  const handleRetake = () => {
    // Navigate back to CameraScreen without losing stack position
    navigation.goBack();
  };

  const handleContinue = () => {
    navigation.navigate('Processing', { capturedImages });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Receipt image */}
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: previewUri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Multi-image badge — visible when more than one page captured */}
      {capturedImages.length > 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {capturedImages.length} pages captured
          </Text>
        </View>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.retakeBtn}
          onPress={handleRetake}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-undo" size={16} color="#FFFFFF" style={styles.btnIcon} />
          <Text style={styles.retakeBtnText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={styles.btnIcon} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },

  imageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  image: {
    width: '100%',
    height: SH * 0.62,
    borderRadius: 12,
  },

  badge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  badgeText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  btnIcon: {
    marginHorizontal: 6,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  continueBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1B5E3B',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  continueBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
