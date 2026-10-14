// Flatten markups: draw them into the drawing itself. Each affected PDF gets a new version (a new file
// id with the markups in its page content), so Undo goes back to the original drawing.
import type { Markup, SourceFile } from '../types';
import { flattenIntoPdf } from '../core/export';
import { getPage, registerPdf } from '../core/pdf';
import { uid } from '../core/ids';
import { idbSet } from '../core/persistence';
import { fileBytes } from './project';
import { getState } from './store';

export const FLATTENED_LAYER = 'layer-flattened';

export interface FlattenOptions {
  /** Keep the markups as takeoff data (on a hidden, locked "Flattened" layer) instead of removing them. */
  keep: boolean;
  /** Draw measurement labels with the measurements. */
  labels: boolean;
}

/** Flatten these markups into their sheets' PDFs, as one undo step. Returns how many were flattened. */
export async function flattenMarkups(ids: string[], opts: FlattenOptions): Promise<number> {
  const st = getState();
  const doc = st.doc;
  const wanted = new Set(ids);
  const marks = doc.markups.filter((m) => wanted.has(m.id));
  if (!marks.length) return 0;
  const sheetById = new Map(doc.sheets.map((s) => [s.id, s]));
  // Markups by file, then by page.
  const byFile = new Map<string, Map<number, Markup[]>>();
  for (const m of marks) {
    const sh = sheetById.get(m.sheetId);
    if (!sh) continue;
    const pages = byFile.get(sh.fileId) ?? new Map<number, Markup[]>();
    const list = pages.get(sh.pageIndex) ?? [];
    list.push(m);
    pages.set(sh.pageIndex, list);
    byFile.set(sh.fileId, pages);
  }
  st.setBusy(`Flattening ${marks.length} markup${marks.length === 1 ? '' : 's'}…`);
  try {
    const replaced = new Map<string, SourceFile>();
    for (const [fileId, pages] of byFile) {
      const bytes = fileBytes.get(fileId);
      if (!bytes) throw new Error('The drawing data is not loaded');
      const plan = await Promise.all(
        [...pages].map(async ([pageIndex, markups]) => {
          const vp = (await getPage(fileId, pageIndex)).getViewport({ scale: 1 });
          return { pageIndex, markups, toPdf: (q: { x: number; y: number }) => ({ x: vp.convertToPdfPoint(q.x, q.y)[0], y: vp.convertToPdfPoint(q.x, q.y)[1] }) };
        }),
      );
      const out = await flattenIntoPdf(bytes, doc, plan, { labels: opts.labels });
      const file = doc.files.find((f) => f.id === fileId)!;
      const next: SourceFile = { ...file, id: uid('f') };
      await registerPdf(next.id, out);
      fileBytes.set(next.id, out);
      idbSet(`file:${next.id}`, out).catch(() => {});
      replaced.set(fileId, next);
    }
    st.commit((d) => {
      const layers = opts.keep && !d.layers.some((l) => l.id === FLATTENED_LAYER) ? [...d.layers, { id: FLATTENED_LAYER, name: 'Flattened', visible: false }] : d.layers;
      return {
        ...d,
        files: d.files.map((f) => replaced.get(f.id) ?? f),
        sheets: d.sheets.map((s) => (replaced.has(s.fileId) ? { ...s, fileId: replaced.get(s.fileId)!.id } : s)),
        layers,
        markups: opts.keep
          ? d.markups.map((m) => (wanted.has(m.id) ? { ...m, layer: FLATTENED_LAYER, locked: true, modified: Date.now() } : m))
          : d.markups.filter((m) => !wanted.has(m.id)),
      };
    });
    st.setSelection([]);
    return marks.length;
  } finally {
    st.setBusy(null);
  }
}
