// Minimal IndexedDB key-value store used for autosave (project JSON + PDF bytes).

const DB_NAME = 'takeoff-studio';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key));
export const idbDel = (key: string) => tx('readwrite', (s) => s.delete(key));
export const idbKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode */
  }
}

interface DownloadsNamespace {
  save(req: { filename: string; data: Blob }): Promise<{ status: string }>;
}

let downloadsNs: Promise<DownloadsNamespace | null> | null = null;

/**
 * Inside a published artifact the page cannot start downloads itself; files are offered through the
 * viewer's `downloads` capability instead. Standalone (dev server, static hosting) there is no
 * `window.claude` and a plain link download is used.
 */
export function downloadsCapability(): Promise<DownloadsNamespace | null> {
  const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (!host?.use) return Promise.resolve(null);
  downloadsNs ??= host
    .use('downloads')
    .then((ns) => (ns as DownloadsNamespace | null) ?? null)
    .catch(() => null);
  return downloadsNs;
}

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

export async function downloadBlob(blob: Blob, filename: string): Promise<SaveOutcome> {
  const hosted = !!(window as unknown as { claude?: unknown }).claude;
  const ns = await downloadsCapability();
  if (ns) {
    try {
      await ns.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string }).code;
      return code === 'declined' || code === 'rate_limited' ? 'declined' : 'unavailable';
    }
  }
  if (hosted && window.top !== window) return 'unavailable';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'saved';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
