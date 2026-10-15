// Totals of the selected markups (the pop-up by a selection): length, count, area and volume, and the
// standard detail material they carry.

import type { DocState } from '../types';
import { buildRows } from './columns';
import { detailRows } from './details';
import { TYPE_INFO } from './markupTypes';

export interface SelectionTotals {
  markups: number;
  /** Real inches. */
  length: number;
  count: number;
  /** Square inches. */
  area: number;
  /** Cubic inches. */
  volume: number;
  /** Material standard details add to the selected markups. */
  material: { pieces: number; length: number };
}

const LENGTH_TYPES = new Set(['length', 'polylength', 'perimeter']);

export function selectionTotals(doc: DocState, ids: string[]): SelectionTotals {
  const want = new Set(ids);
  const picked = doc.markups.filter((m) => want.has(m.id) && TYPE_INFO[m.type].measure);
  const t: SelectionTotals = { markups: picked.length, length: 0, count: 0, area: 0, volume: 0, material: { pieces: 0, length: 0 } };
  const rows = buildRows(doc, picked);
  for (const r of rows) {
    const m = r.markup;
    if (LENGTH_TYPES.has(m.type)) t.length += r.measure.length ?? r.measure.perimeter ?? 0;
    if (m.type === 'count') t.count += r.measure.count ?? 0;
    if (m.type === 'area') t.area += r.measure.area ?? 0;
    if (m.type === 'volume') {
      t.area += r.measure.area ?? 0;
      t.volume += r.measure.volume ?? 0;
    }
  }
  for (const r of detailRows(doc, rows)) {
    if (r.detail?.warning) continue;
    t.material.pieces += Number(r.values.count) || 0;
    t.material.length += r.measure.length ?? 0;
  }
  return t;
}
