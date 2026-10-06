import { View } from 'react-native';
import type { EscapeKeyViewProps } from './EscapeKeyView';

/**
 * The web has no native view to load, and `requireNativeView` throws there the
 * moment the module is evaluated. Never rendered — the web listens on
 * `document` instead (see EscapeToClose) — so a plain view keeps the import safe.
 */
export default View as unknown as React.ComponentType<EscapeKeyViewProps>;
