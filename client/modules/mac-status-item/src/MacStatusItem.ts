import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

/** One of the menu bar extra's sections: Overdue or Today, and the tasks it lists. */
export interface MacStatusSection {
  overdue: boolean;
  /** Everything in the section, for its header; past the listed tasks, `more`. */
  total: number;
  tasks: { id: string; title: string }[];
  more: number;
}

/**
 * Whether Yarukoto opens at login. `requiresApproval` is registered but waiting
 * on System Settings ▸ General ▸ Login Items, which macOS can ask for.
 */
export type LoginItemStatus = 'enabled' | 'disabled' | 'requiresApproval' | 'unavailable';

/** A menu choice JS answers. Open and Quit are answered natively. */
export type MacStatusAction =
  | { action: 'openTask' | 'complete'; taskId: string }
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
  /** Takes the task sections and count out of the menu, so a signed-out app shows none of the old account's tasks. */
  clearTasks(): Promise<void>;
  /** The menu's Overdue and Today sections; `count` is the number beside the icon, none at 0. */
  setSections(sections: MacStatusSection[], count: number): Promise<void>;
}

/**
 * iOS builds only; null on web and Android. It loads on a phone too, where
 * `isAvailable()` is false and everything else does nothing. See YKMacAppKit.m.
 */
export default requireOptionalNativeModule<MacStatusItemModule>('MacStatusItem');
