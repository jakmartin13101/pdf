import { useMemo } from 'react';
import { useStore } from '../store/store';
import { resolveBindings, shortcutFor } from '../core/keymap';

/** The current shortcut label of a command (Settings → Keyboard), for menus and tooltips. */
export function useShortcuts(): (id: string) => string | undefined {
  const keys = useStore((s) => s.prefs.keys);
  const bindings = useMemo(() => resolveBindings(keys), [keys]);
  return (id: string) => shortcutFor(id, bindings);
}
