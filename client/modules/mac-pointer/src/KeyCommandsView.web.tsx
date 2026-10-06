import { View } from 'react-native';
import type { KeyCommandsViewProps } from './KeyCommandsView';

/**
 * The web has no native view to load, and `requireNativeView` throws there the
 * moment the module is evaluated. Never rendered — a web field reports arrow
 * keys through `onKeyPress` — so a plain view keeps the import safe.
 */
export default View as unknown as React.ComponentType<KeyCommandsViewProps>;
