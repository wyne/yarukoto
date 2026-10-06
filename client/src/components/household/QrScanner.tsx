import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import { MAC } from '../../data/platform';

/**
 * Whether this device has a camera worth scanning with. The Mac runs the iPad
 * build but has no rear camera and nobody holds a laptop up to a phone; the
 * web has the typed code instead.
 */
export const CAN_SCAN = (Platform.OS === 'ios' || Platform.OS === 'android') && !MAC;

export interface QrScannerProps {
  visible: boolean;
  onClose: () => void;
  /** What the person is pointing at, in a few words. */
  title: string;
  /**
   * Called with each QR read. Returns null when it was the one wanted — the
   * caller closes the scanner — or a message saying why not, and scanning
   * carries on.
   */
  onScan: (data: string) => string | null;
}

/**
 * Required only where scanning is offered. The Mac build leaves expo-camera's
 * native module out (it doesn't compile for Catalyst; see plugins/mac-catalyst),
 * and importing the library without it throws as the bundle loads.
 */
const QrCamera: ComponentType<QrScannerProps> | null = CAN_SCAN ? require('./QrCamera').default : null;

/** A full-screen camera that reads one QR code; nothing where CAN_SCAN is false. */
export default function QrScanner(props: QrScannerProps) {
  return QrCamera ? <QrCamera {...props} /> : null;
}
