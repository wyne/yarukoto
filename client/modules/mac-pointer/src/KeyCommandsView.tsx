import { requireNativeView } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface KeyCommandsViewProps extends ViewProps {
  /**
   * Keys to answer, by `keyName`: 'up', 'shift+down', 'return', 'escape', 'tab',
   * 'shift+tab', 'space', 'home', 'end', 'pageup', 'pagedown'.
   */
  keys: string[];
  /** Answers nothing while false. Defaults to true. */
  active?: boolean;
  /** Takes focus itself, for content with no field of its own. */
  focusable?: boolean;
  /** Changing it takes focus again, when `focusable`. */
  focusKey?: number;
  /** On the web, returning false leaves the key to the browser; the Mac always takes it. */
  onKeyCommand: (event: NativeSyntheticEvent<{ key: string }>) => void | boolean;
  /** A `focusable` view taking or giving up the keyboard. */
  onFocusChange?: (event: NativeSyntheticEvent<{ focused: boolean }>) => void;
}

/** iOS builds only, and only rendered on the Mac. See KeyCommandsView.swift, and the .web file for the web's. */
export default requireNativeView<KeyCommandsViewProps>('KeyCommands');
