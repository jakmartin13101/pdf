import { version } from '../package.json';

// Product identity. BuildSuite is the suite; Takeoff Studio is this program.
export const SUITE_NAME = 'BuildSuite';
export const PRODUCT_NAME = 'Takeoff Studio';
export const FULL_NAME = `${SUITE_NAME} ${PRODUCT_NAME}`;
export const ICON_URL = './brand/takeoff-icon.svg';
export const APP_VERSION = version;

/** Bridge exposed by the Windows desktop app's preload script (electron/preload.cjs). */
export interface DesktopBridge {
  platform: string;
  /** Shows a native Save dialog and writes the file. Resolves false when the user cancels. */
  saveFile(name: string, data: Uint8Array): Promise<boolean>;
  /** Opens an HTML report in its own window. */
  openReport(html: string): Promise<boolean>;
  /** Files passed on the command line at launch ("Open with"). */
  takeOpenFiles(): Promise<{ name: string; data: Uint8Array }[]>;
  /** Files sent from a second launch while the app is already open. Returns an unsubscribe function. */
  onOpenFiles(callback: (files: { name: string; data: Uint8Array }[]) => void): () => void;
  /** Graphics card use: the mode running now, the one saved for the next start, and Chromium's feature status. */
  graphics?(): Promise<{ mode: GpuMode; saved: GpuMode; status: Record<string, string>; gpu: { vendorId: number; deviceId: number; driver: string } | null }>;
  setGraphics?(mode: GpuMode): Promise<boolean>;
  relaunch?(): Promise<void>;
}

export type GpuMode = 'auto' | 'off' | 'force';

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? (window as unknown as { buildsuite?: DesktopBridge }).buildsuite : undefined;

/** True inside the installed Windows desktop app (Electron). */
export const isDesktop = !!desktop;
