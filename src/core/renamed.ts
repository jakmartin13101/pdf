// Names that settings and files saved before version 1.22 use, brought over to the current ones when they
// are read: storage keys on this computer, a panel id, a markup type and its name in the Type column.

/** Storage keys: before → now. */
const KEYS: [string, string][] = [
  ['ts.toolchest', 'ts.toollibrary'],
  ['ts.chestAdded', 'ts.libraryAdded'],
];

/** Panel ids and markup types: before → now. */
const IDS: Record<string, string> = { toolchest: 'toollibrary', polylength: 'pathlength' };

/** Type column names (standard detail conditions compare them): before → now. */
const TYPE_NAMES: Record<string, string> = { 'Polylength Measurement': 'Path Length Measurement' };

/** Moves settings kept under an earlier key to the current one (once; the earlier key is removed). */
export function moveRenamedKeys(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  for (const [before, now] of KEYS) {
    try {
      const v = store.getItem(before);
      if (v == null) continue;
      if (store.getItem(now) == null) store.setItem(now, v);
      store.removeItem(before);
    } catch {
      /* storage unavailable */
    }
  }
}

/** A panel id or markup type under its current name. */
export const currentId = <T extends string>(id: T): T => (IDS[id] ?? id) as T;

/** A command id (tool.<type>, panel.<id>…) under its current name. */
export const currentCommandId = (id: string) => id.split('.').map(currentId).join('.');

/** A Type column name under its current name. */
export const currentTypeName = (name: string) => TYPE_NAMES[name] ?? name;

/** Object keys and string values that are earlier ids, renamed throughout (layouts, per-type settings). */
export function renameIds<T>(v: T): T {
  if (typeof v === 'string') return currentId(v) as T;
  if (Array.isArray(v)) return v.map(renameIds) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [currentId(k), renameIds(x)])) as T;
  return v;
}
