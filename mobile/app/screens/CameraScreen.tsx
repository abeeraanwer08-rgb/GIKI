import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Modal,
  Image,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  checkImageQuality,
  qualityWarningMessage,
  QualityIssue,
} from '../utils/imageQuality';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'>;
};

const { width: SW, height: SH } = Dimensions.get('window');
const FRAME_W = SW * 0.8;
const FRAME_H = FRAME_W * 1.42; // portrait receipt aspect ratio
const SIDE_MARGIN = (SW - FRAME_W) / 2;

/** Captured photo held in state until the user dismisses the quality warning. */
interface PendingCapture {
  uri: string;
  width: number;
  height: number;
}

export default function CameraScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // ── Quality-check state ──────────────────────────────────────────────────
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B5E3B" />
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <View style={styles.permIconCircle}>
          <Ionicons name="camera" size={34} color="#1B5E3B" />
        </View>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permBody}>
          KharchAI needs your camera to scan receipts. Images stay on your
          device and are never uploaded without your action.
        </Text>

        {permission.canAskAgain ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={requestPermission}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Allow Camera Access</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.permSettingsNote}>
              Camera access was permanently denied. Please enable it in your
              device Settings to use this feature.
            </Text>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineBtnText}>Go Back</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.textBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.textBtnText}>← Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Dismiss quality warning — let user retake ────────────────────────────
  const handleRetakeFromWarning = () => {
    setPendingCapture(null);
    setQualityIssues([]);
    // Camera is still mounted; user can capture again immediately.
  };

  // ── Dismiss quality warning — proceed anyway ─────────────────────────────
  const handleContinueAnyway = () => {
    if (!pendingCapture) return;
    const { uri } = pendingCapture;
    setPendingCapture(null);
    setQualityIssues([]);
    navigation.navigate('ReceiptPreview', { capturedImages: [uri] });
  };

  // ── Capture ──────────────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    try {
      setCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,   // needed for blur heuristic
        exif: true,     // needed for lighting check
      });

      if (!photo?.uri) return;

      // Run quality checks synchronously — O(1), no blocking I/O.
      if (photo.base64) {
        const issues = checkImageQuality({
          base64: photo.base64,
          width: photo.width,
          height: photo.height,
          exif: photo.exif as Record<string, unknown> | undefined,
        });

        if (issues.length > 0) {
          // Store the capture and surface the warning modal.
          setPendingCapture({ uri: photo.uri, width: photo.width, height: photo.height });
          setQualityIssues(issues);
          return; // Don't navigate yet — let user decide.
        }
      }

      // No quality issues (or base64 unavailable) → proceed directly.
      navigation.navigate('ReceiptPreview', { capturedImages: [photo.uri] });
    } catch (err) {
      console.error('[Camera] takePictureAsync failed:', err);
    } finally {
      setCapturing(false);
    }
  };

  // ── Warning modal content ─────────────────────────────────────────────────
  const warningVisible = qualityIssues.length > 0 && pendingCapture !== null;
  const hasBlur = qualityIssues.includes('blur');
  const hasDark = qualityIssues.includes('dark');
  const warningMessage = qualityWarningMessage(qualityIssues);
  const warningTitle =
    hasBlur && hasDark
      ? 'Photo Quality Issues'
      : hasBlur
      ? 'Blurry Photo'
      : 'Poor Lighting';

  // ── Camera UI ────────────────────────────────────────────────────────────
  return (
    <View style={styles.cameraContainer}>
      {/* Live preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
      />

      {/* Viewfinder overlay — non-interactive */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {/* Top mask */}
        <View style={[styles.mask, { flex: 1 }]} />

        {/* Middle row */}
        <View style={{ flexDirection: 'row', height: FRAME_H }}>
          <View style={[styles.mask, { width: SIDE_MARGIN }]} />

          {/* Transparent receipt frame */}
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
          </View>

          <View style={[styles.mask, { width: SIDE_MARGIN }]} />
        </View>

        {/* Bottom mask with hint */}
        <View style={[styles.mask, { flex: 1.3, alignItems: 'center', paddingTop: 18 }]}>
          <Text style={styles.hintText}>Position the receipt within the frame</Text>
        </View>
      </View>

      {/* Top bar — interactive */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan Receipt</Text>
        {/* Spacer to balance title */}
        <View style={styles.iconBtn} />
      </SafeAreaView>

      {/* Capture button — interactive */}
      <SafeAreaView style={styles.bottomBar} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.shutterOuter, capturing && styles.shutterCapturing]}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.85}
        >
          {capturing ? (
            <ActivityIndicator color="#1B5E3B" size="small" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Quality warning modal ─────────────────────────────────────────── */}
      <Modal
        visible={warningVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Captured image thumbnail */}
            {pendingCapture && (
              <Image
                source={{ uri: pendingCapture.uri }}
                style={styles.modalThumb}
                resizeMode="cover"
              />
            )}

            {/* Warning icon row */}
            <View style={styles.warningIconRow}>
              {hasBlur && (
                <View style={styles.warningIconBadge}>
                  <Ionicons name="scan-outline" size={22} color="#B8860B" />
                </View>
              )}
              {hasDark && (
                <View style={styles.warningIconBadge}>
                  <Ionicons name="moon" size={22} color="#B8860B" />
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={styles.modalTitle}>{warningTitle}</Text>

            {/* Message */}
            <ScrollView style={styles.modalMsgScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalMessage}>{warningMessage}</Text>
            </ScrollView>

            {/* Action buttons */}
            <TouchableOpacity
              style={styles.modalRetakeBtn}
              onPress={handleRetakeFromWarning}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-undo" size={16} color="#FFFFFF" style={styles.modalRetakeIcon} />
              <Text style={styles.modalRetakeBtnText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalContinueBtn}
              onPress={handleContinueAnyway}
              activeOpacity={0.85}
            >
              <Text style={styles.modalContinueBtnText}>Continue anyway</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── States ────────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E3F3E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 12,
    textAlign: 'center',
  },
  permBody: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  permSettingsNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryBtn: {
    backgroundColor: '#1B5E3B',
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  outlineBtnText: { color: '#1B5E3B', fontSize: 15, fontWeight: '600' },
  textBtn: { marginTop: 8, padding: 8 },
  textBtnText: { color: '#888', fontSize: 14 },

  // ── Camera UI ─────────────────────────────────────────────────────────────
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  mask: { backgroundColor: 'rgba(0,0,0,0.58)' },
  frame: { width: FRAME_W, height: FRAME_H, position: 'relative' },

  // Corner marks
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#FFFFFF' },
  cTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 3 },
  cTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 3 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 3 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 3 },

  hintText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 48,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF',
    borderWidth: 4,
    borderColor: '#1B5E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCapturing: { opacity: 0.65 },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1B5E3B',
  },

  // ── Quality warning modal ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingBottom: 24,
    overflow: 'hidden',
    elevation: 8,
  },
  modalThumb: {
    width: '100%',
    height: SH * 0.28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  warningIconRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    marginBottom: 4,
  },
  warningIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FBF2DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  modalMsgScroll: {
    maxHeight: 90,
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalMessage: {
    fontSize: 14,
    color: '#555',
    lineHeight: 21,
    textAlign: 'center',
  },
  modalRetakeBtn: {
    flexDirection: 'row',
    backgroundColor: '#1B5E3B',
    paddingVertical: 15,
    borderRadius: 12,
    width: '85%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 2,
  },
  modalRetakeIcon: { marginRight: 8 },
  modalRetakeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalContinueBtn: {
    paddingVertical: 12,
    width: '85%',
    alignItems: 'center',
  },
  modalContinueBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
