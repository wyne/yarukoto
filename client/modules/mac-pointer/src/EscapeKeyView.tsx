import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

export interface EscapeKeyViewProps extends ViewProps {
  /** The Escape key was pressed while this view was on screen. */
  onEscape: () => void;
}

/** iOS builds only. Listens on the Mac; inert on a phone or iPad. See EscapeKeyView.swift. */
export default requireNativeView<EscapeKeyViewProps>('EscapeKey');
