import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

/** A menu bar command, by the name MacMenuBar.swift reports it under. */
export type MacMenuCommand = 'newTask' | 'find' | 'settings' | 'undo';

type MacMenuEvents = {
  onCommand: (event: { command: MacMenuCommand }) => void;
};

declare class MacMenuModule extends NativeModule<MacMenuEvents> {
  /** Offers Edit ▸ Undo under this name, or withdraws it (null). */
  setUndo(actionName: string | null): Promise<void>;
}

/**
 * iOS builds only; null on web and Android. On a phone it loads but has no menu
 * bar to add to, so callers gate on `MAC` rather than on this being non-null.
 * See MacMenuBar.swift.
 */
export default requireOptionalNativeModule<MacMenuModule>('MacMenu');
