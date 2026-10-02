import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import type { QrScannerProps } from './QrScanner';

/** How long a QR that was read and refused stays unread, so its error can be seen. */
const RETRY_MS = 1500;

/**
 * The camera itself. Only ever loaded through QrScanner, which keeps it, and
 * expo-camera with it, off the devices that can't scan.
 */
export default function QrCamera({ visible, onClose, title, onScan }: QrScannerProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  /** Set while a read is being handled, so one QR held still isn't read over and over. */
  const busyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    busyRef.current = false;
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    // Asked once per opening, not again every time the answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleScan = ({ data }: { data: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const problem = onScan(data);
    if (!problem) return;
    setError(problem);
    setTimeout(() => {
      busyRef.current = false;
    }, RETRY_MS);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={visible ? handleScan : undefined}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {permission && !permission.canAskAgain
                ? 'Camera access is turned off for Yarukoto. Turn it on in Settings to scan, or type the code instead.'
                : 'Yarukoto needs the camera to scan the QR code.'}
            </Text>
            <Pressable
              style={styles.permissionBtn}
              onPress={() => (permission && !permission.canAskAgain ? Linking.openSettings() : requestPermission())}
            >
              <Text style={styles.permissionBtnText}>
                {permission && !permission.canAskAgain ? 'Open Settings' : 'Allow camera'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        {permission?.granted && <View style={styles.frame} pointerEvents="none" />}

        {!!error && (
          <View style={[styles.errorBox, { bottom: insets.bottom + 32 }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// The camera is dark whatever the app's theme, so these colours are fixed.
const useStyles = makeStyles(() => ({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    color: '#fff',
  },
  cancel: {
    fontFamily: fonts.sansMedium,
    fontSize: 17,
    color: '#fff',
  },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  errorBox: {
    position: 'absolute',
    left: 24,
    right: 24,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  errorText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 20,
    color: '#fff',
    textAlign: 'center',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 22,
    color: '#fff',
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  permissionBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: '#000',
  },
}));
