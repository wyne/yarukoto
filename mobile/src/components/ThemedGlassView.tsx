import { ComponentProps } from 'react';
import { GlassView } from 'expo-glass-effect';
import { useScheme } from '../theme/ThemeContext';

type Props = Omit<ComponentProps<typeof GlassView>, 'colorScheme'>;

/**
 * GlassView in the app's own light or dark, rather than the system's.
 *
 * Glass takes its tint from the UIKit appearance, which follows the device. The
 * app has a setting of its own that can disagree with it, and everything drawn
 * on the glass — text, icons — follows the app. Left to itself, a dark app on a
 * light device gets light glass under light text, which is how popover menus
 * came out unreadable. Every glass surface goes through here so none can miss it.
 */
export default function ThemedGlassView(props: Props) {
  const scheme = useScheme();
  return <GlassView colorScheme={scheme} {...props} />;
}
