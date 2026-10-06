import { requireNativeView } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface SecondaryClickViewProps extends ViewProps {
  /** A secondary click landed inside, at this point in window coordinates. */
  onSecondaryClick: (event: NativeSyntheticEvent<{ x: number; y: number }>) => void;
}

/** iOS builds only. Reports clicks on the Mac; inert on a phone or iPad. See SecondaryClickView.swift. */
export default requireNativeView<SecondaryClickViewProps>('SecondaryClick');
