import { requireNativeView } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface KeyCommandsViewProps extends ViewProps {
  /** Keys to answer, by `keyName`: 'up', 'shift+down', 'return', 'escape'. */
  keys: string[];
  /** Answers nothing while false. Defaults to true. */
  active?: boolean;
  /** Takes focus itself, for content with no field of its own. */
  focusable?: boolean;
  /** Changing it takes focus again, when `focusable`. */
  focusKey?: number;
  onKeyCommand: (event: NativeSyntheticEvent<{ key: string }>) => void;
}

/** iOS builds only, and only rendered on the Mac. See KeyCommandsView.swift. */
export default requireNativeView<KeyCommandsViewProps>('KeyCommands');
