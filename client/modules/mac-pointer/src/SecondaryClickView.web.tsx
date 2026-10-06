import { View } from 'react-native';
import type { SecondaryClickViewProps } from './SecondaryClickView';

/**
 * The web has no native view to load, and `requireNativeView` throws there the
 * moment the module is evaluated, which took the whole web app down before it
 * drew anything. Never rendered — the web listens for `contextmenu` instead
 * (see ContextMenuTarget) — so a plain view keeps the import safe.
 */
export default View as unknown as React.ComponentType<SecondaryClickViewProps>;
