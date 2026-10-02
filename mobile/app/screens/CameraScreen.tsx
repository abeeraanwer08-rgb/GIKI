import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  checkImageQuality,
  qualityWarningMessage,
  QualityIssue,
} from '../utils/imageQuality';
import Txt from '../ui/Txt';
import { pickPhotosFromGallery } from '../utils/pickReceipt';
import Button from '../ui/Button';
import IconBadge from '../ui/IconBadge';
import EmptyState from '../ui/EmptyState';
import FocusStatusBar from '../ui/FocusStatusBar';
import { MULTI_PAGE_TYPES, ScanDocumentType, scanTypeLabel } from '../utils/scanType';
import { colors, radius, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Camera'>;

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

export default function CameraScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const documentType: ScanDocumentType | undefined = route.params?.documentType;
  const isStatement = documentType === 'bank_statement';
  const existingImages = route.params?.existingImages ?? [];
  const multiPage = !!documentType && MULTI_PAGE_TYPES.includes(documentType);
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.permissionScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <FocusStatusBar style="dark" />
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.permissionClose, { top: insets.top + spacing.md }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <EmptyState
          icon="camera"
          title="Camera access needed"
          body={
            permission.canAskAgain
              ? 'HissabAI uses your camera to scan receipts. Photos are only uploaded when you choose to continue.'
              : 'Camera access was denied. Enable it for HissabAI in your device Settings to scan receipts.'
          }
        />
        {permission.canAskAgain ? (
          <Button title="Allow camera access" icon="camera-outline" onPress={requestPermission} />
        ) : (
          <Button title="Go back" variant="secondary" onPress={() => navigation.goBack()} />
        )}
      </View>
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
    navigation.navigate('ReceiptPreview', { capturedImages: [...existingImages, uri], documentType });
  };

  // ── Choose an existing photo instead of capturing ───────────────────────
  const handleGallery = async () => {
    const uris = await pickPhotosFromGallery(multiPage);
    if (uris.length) navigation.navigate('ReceiptPreview', { capturedImages: [...existingImages, ...uris], documentType });
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
      navigation.navigate('ReceiptPreview', { capturedImages: [...existingImages, photo.uri], documentType });
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
      ? 'Photo quality issues'
      : hasBlur
      ? 'This photo looks blurry'
      : 'The lighting is too dark';

  // ── Camera UI ────────────────────────────────────────────────────────────
  return (
    <View style={styles.cameraContainer}>
      <FocusStatusBar style="light" />
      {/* Live preview */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

      {/* Viewfinder overlay — non-interactive */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={[styles.mask, { flex: 1 }]} />
        <View style={{ flexDirection: 'row', height: FRAME_H }}>
          <View style={[styles.mask, { width: SIDE_MARGIN }]} />
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
          </View>
          <View style={[styles.mask, { width: SIDE_MARGIN }]} />
        </View>
        <View style={[styles.mask, styles.bottomMask]}>
          <View style={styles.hintPill}>
            <Ionicons name="receipt-outline" size={14} color={colors.inkInverse} />
            <Txt variant="caption" color={colors.inkInverse} style={styles.hintText}>
              {isStatement
                ? 'Fit the whole statement page inside the frame'
                : 'Fit the whole receipt inside the frame'}
            </Txt>
          </View>
        </View>
      </View>

      {/* Top bar — interactive */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable
          style={styles.glassButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
        >
          <Ionicons name="close" size={22} color={colors.inkInverse} />
        </Pressable>
        <Txt variant="bodyStrong" color={colors.inkInverse}>
          {documentType && documentType !== 'auto' && documentType !== 'receipt'
            ? `Scan ${scanTypeLabel(documentType).toLowerCase()}`
            : 'Scan receipt'}
        </Txt>
        <View style={styles.glassSpacer} />
      </View>

      {/* Capture controls — interactive */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 36 }]} pointerEvents="box-none">
        <View style={styles.controlsRow} pointerEvents="box-none">
          <Pressable
            style={styles.sideButton}
            onPress={handleGallery}
            accessibilityRole="button"
            accessibilityLabel="Choose a photo from your gallery"
          >
            <Ionicons name="images" size={22} color={colors.inkInverse} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.shutterOuter, (capturing || pressed) && styles.shutterPressed]}
            onPress={handleCapture}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            {capturing ? <ActivityIndicator color={colors.primary} size="small" /> : <View style={styles.shutterInner} />}
          </Pressable>
          <View style={styles.sideButton} />
        </View>
      </View>

      {/* ── Quality warning sheet ────────────────────────────────────────── */}
      <Modal visible={warningVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            {pendingCapture && (
              <Image source={{ uri: pendingCapture.uri }} style={styles.modalThumb} resizeMode="cover" />
            )}
            <View style={styles.modalBody}>
              <View style={styles.warningIconRow}>
                {hasBlur && (
                  <IconBadge icon="scan-outline" color={colors.warning} tint={colors.warningSoft} />
                )}
                {hasDark && <IconBadge icon="moon" color={colors.warning} tint={colors.warningSoft} />}
              </View>
              <Txt variant="heading" align="center">
                {warningTitle}
              </Txt>
              <ScrollView style={styles.modalMsgScroll} showsVerticalScrollIndicator={false}>
                <Txt variant="caption" color={colors.inkSecondary} align="center">
                  {warningMessage}
                </Txt>
              </ScrollView>
              <Button title="Retake photo" icon="camera-reverse-outline" onPress={handleRetakeFromWarning} />
              <Button
                title="Continue anyway"
                variant="ghost"
                onPress={handleContinueAnyway}
                style={styles.continueAnyway}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CORNER = 30;

const styles = StyleSheet.create({
  // ── States ────────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  permissionClose: {
    position: 'absolute',
    left: spacing.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Camera UI ─────────────────────────────────────────────────────────────
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  mask: { backgroundColor: 'rgba(0,0,0,0.6)' },
  bottomMask: { flex: 1.3, alignItems: 'center', paddingTop: spacing.xl },
  frame: { width: FRAME_W, height: FRAME_H },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.inkInverse },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  hintText: { marginLeft: 6 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  glassButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassSpacer: { width: 42 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.xxxl,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.inkInverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.inkInverse,
  },

  // ── Quality warning sheet ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: 'hidden',
  },
  modalThumb: { width: '100%', height: SH * 0.24 },
  modalBody: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  warningIconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modalMsgScroll: { maxHeight: 90, marginTop: spacing.sm, marginBottom: spacing.xl },
  continueAnyway: { marginTop: spacing.xs },
});
