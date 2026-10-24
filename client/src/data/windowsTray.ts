import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { StatusMenuContents } from './macStatusMenu';
import { WINDOWS_APP } from './platform';

/**
 * The Windows shell's notification area icon (windows/src/tray.rs), the
 * counterpart of the Mac's menu bar extra. Every call here is a no-op outside
 * the Windows app, where there is no shell to answer it.
 */

export interface TraySettings {
  showInTray: boolean;
  /** Null where Windows wouldn't say. */
  openAtLogin: boolean | null;
}

/** A menu choice JS answers. Open and Exit are answered natively. */
export type TrayAction =
  | { action: 'openTask' | 'complete'; taskId: string }
  | { action: 'newTask' | 'settings' | 'today'; taskId?: undefined };

export function traySettings(): Promise<TraySettings> {
  return invoke<TraySettings>('tray_settings');
}

/** The icon, and with it the close button hiding the window rather than exiting. */
export function setShowInTray(enabled: boolean): Promise<void> {
  return invoke('set_show_in_tray', { enabled });
}

/** Resolves to whether the login item is there afterwards. */
export function setOpenAtLogin(enabled: boolean): Promise<boolean> {
  return invoke<boolean>('set_open_at_login', { enabled });
}

/** The menu's Today section and the tooltip's count; null takes them out. */
export function setTrayTasks(contents: StatusMenuContents | null): Promise<void> {
  if (!WINDOWS_APP) return Promise.resolve();
  return invoke('set_tray_tasks', { contents });
}

export function onTrayAction(handler: (action: TrayAction) => void): Promise<UnlistenFn> {
  return listen<TrayAction>('tray-action', (event) => handler(event.payload));
}

/** Pixels on a side. Windows draws the overlay at 16, so this covers 200% scaling. */
const BADGE_SIZE = 32;

/**
 * The count on the taskbar button. Windows has no badge API for desktop apps,
 * only an overlay icon over the corner of the app's own, so this draws one:
 * the number in a red circle, as Windows' own apps do, 9+ past nine. Zero
 * clears it.
 */
export function setTaskbarBadge(count: number): Promise<void> {
  if (!WINDOWS_APP) return Promise.resolve();
  const rgba = count > 0 ? drawBadge(count > 9 ? '9+' : String(count)) : null;
  return invoke('set_taskbar_badge', { rgba, size: BADGE_SIZE });
}

function drawBadge(label: string): number[] | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BADGE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const half = BADGE_SIZE / 2;
  context.fillStyle = '#c42b1c';
  context.beginPath();
  context.arc(half, half, half, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `600 ${label.length > 1 ? 18 : 22}px "Segoe UI", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, half, half + 1);
  return Array.from(context.getImageData(0, 0, BADGE_SIZE, BADGE_SIZE).data);
}
