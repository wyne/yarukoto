import { requireNativeView } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface KeyCommandsViewProps extends ViewProps {
  /** Keys to claim from a focused field inside, by name: 'up', 'down', 'left', 'right'. */
  keys: string[];
  onKeyCommand: (event: NativeSyntheticEvent<{ key: string }>) => void;
}

/** iOS builds only, and only rendered on the Mac. See KeyCommandsView.swift. */
export default requireNativeView<KeyCommandsViewProps>('KeyCommands');
