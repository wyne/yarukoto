import { View } from 'react-native';

/**
 * `requireNativeView` throws on the web as soon as the module is evaluated. The
 * web needs nothing native here anyway: the divider's `cursor: col-resize` style
 * reaches the DOM, so a plain view keeps the import safe.
 */
export default View;
