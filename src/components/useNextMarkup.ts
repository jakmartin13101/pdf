import { useMemo } from 'react';
import type { Markup } from '../types';
import { getState, useStore } from '../store/store';

/** The markup the picked drawing tool makes next (no points yet), or null with no drawing tool picked. */
export function useNextMarkup(): Markup | null {
  const tool = useStore((s) => s.tool);
  const toolChest = useStore((s) => s.toolChest);
  const typeDefaults = useStore((s) => s.typeDefaults);
  const doc = useStore((s) => s.doc);
  const prefs = useStore((s) => s.prefs);
  const sheetId = useStore((s) => s.currentSheetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getState().nextMarkup(), [tool, toolChest, typeDefaults, doc, prefs, sheetId]);
}
