import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

/** iOS builds only. Shows the resize cursor over it on the Mac; inert on a phone or iPad. See ResizeCursorView.swift. */
export default requireNativeView<ViewProps>('ResizeCursor');
