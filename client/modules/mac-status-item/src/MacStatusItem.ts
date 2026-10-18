import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

/** One of Today's tasks, as the menu bar extra lists it. */
export interface MacStatusTask {
  id: string;
  title: string;
  overdue: boolean;
}

/**
 * Whether Yarukoto opens at login. `requiresApproval` is registered but waiting
 * on System Settings ▸ General ▸ Login Items, which macOS can ask for.
 */
export type LoginItemStatus = 'enabled' | 'disabled' | 'requiresApproval' | 'unavailable';

/** A menu choice JS answers. Open and Quit are answered natively. */
export type MacStatusAction =
  | { action: 'complete'; taskId: string }
  | { action: 'newTask' | 'settings' | 'today'; taskId?: undefined };

type MacStatusItemEvents = {
  onAction: (event: MacStatusAction) => void;
};

declare class MacStatusItemModule extends NativeModule<MacStatusItemEvents> {
  /** False everywhere but the Mac. */
  isAvailable(): boolean;
  /** The menu bar extra, and with it keeping Yarukoto running with the window closed. */
  isMenuBarEnabled(): boolean;
  setMenuBarEnabled(enabled: boolean): Promise<void>;
  getLoginItemStatus(): Promise<LoginItemStatus>;
  /** Registers or removes the login item, and resolves to where that left it. */
  setOpensAtLogin(enabled: boolean): Promise<LoginItemStatus>;
  openLoginItemsSettings(): Promise<void>;
  /** File ▸ Close: into the menu bar while the extra is on, else quits, as the red button does. */
  closeMainWindow(): Promise<void>;
  /** The menu's Today section; `count` is the number beside the icon, none at 0. */
  setTasks(tasks: MacStatusTask[], more: number, count: number): Promise<void>;
}

/**
 * iOS builds only; null on web and Android. It loads on a phone too, where
 * `isAvailable()` is false and everything else does nothing. See YKMacAppKit.m.
 */
export default requireOptionalNativeModule<MacStatusItemModule>('MacStatusItem');
