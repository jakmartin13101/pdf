// Standard details: rules that look at the takeoff and add material.
//
//   IF [Member Size] = W24x55  →  ADD Clip Angle  L4x4x3/8  × 0'-11 1/2"  × 4 per beam
//   IF [Subject] = Handrail    →  ADD Post  HSS1-1/2x1-1/2x1/8  × 3'-6"  @ 4'-0" OC
//
// Each matching markup gets one read-only material row per item. Material rows flow through the
// same columns as markups (so formula columns such as Weight compute for them), the Markups List,
// the Takeoff Summary and the exports.

import type { DetailCondition, DetailItem, DetailOp, DocState, Markup, StandardDetail } from '../types';
import { allColumns, buildRows, customColId, rowBuilder, type ColumnSpec, type Row } from './columns';
import { normName, toNum } from './formula';
import { fmtNumber, formatLength, parseLength } from './units';

export const DETAIL_OPS: { id: DetailOp; label: string }[] = [
  { id: 'eq', label: '=' },
  { id: 'neq', label: '≠' },
  { id: 'contains', label: 'contains' },
];

export const DETAIL_RULES: { id: DetailItem['rule']; label: string; hint: string }[] = [
  { id: 'spacing', label: '@ Spacing', hint: 'Pieces along the measured length, e.g. posts @ 48" OC' },
  { id: 'each', label: '× Quantity', hint: 'A fixed number per markup, or per counted item' },
  { id: 'full', label: 'Full length', hint: 'One continuous piece the measured length (× runs)' },
];

/** Columns a condition can test: everything except pure measurements and timestamps. */
export function conditionColumns(doc: DocState): ColumnSpec[] {
  const skip = new Set(['measurement', 'length', 'area', 'perimeter', 'volume', 'count', 'depth', 'date', 'color', 'checkmark']);
  return allColumns(doc.columns).filter((c) => !skip.has(c.id));
}

/** The text a condition compares against: raw text values, or the display string for numbers. */
export function rowText(r: Row, col: string): string {
  const v = r.values[col];
  return typeof v === 'string' ? v : r.display[col] ?? (v == null ? '' : String(v));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[×✕]/g, 'x').replace(/\s+/g, ' ');

export function conditionMatches(r: Row, c: DetailCondition): boolean {
  const v = norm(rowText(r, c.column));
  const t = norm(c.value);
  if (c.op === 'neq') return v !== t;
  if (c.op === 'contains') return v.includes(t);
  return v === t;
}

/** A detail applies when it is enabled, has at least one condition, and every condition matches. */
export function detailMatches(r: Row, d: StandardDetail): boolean {
  const conds = d.conditions.filter((c) => c.column);
  return d.enabled && conds.length > 0 && conds.every((c) => conditionMatches(r, c));
}

/** Distinct values of a column across the takeoff, most common first, for the value drop-down. */
export function columnValues(rows: Row[], col: string): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = rowText(r, col).trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { numeric: true }));
}

/** Piece lengths and spacings: ft-in text, bare numbers are inches. Returns inches. */
export function parseDetailLength(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const v = parseLength(t, 'in');
  return v != null && v > 0 ? v : null;
}

const ftIn = (inches: number) => formatLength(inches, 'ft-in', 16);

export interface ItemQuantity {
  /** Number of pieces. */
  pieces: number;
  /** Length of each piece in inches (0 when the item is counted only). */
  pieceLength: number;
  /** Total length in inches. */
  totalLength: number;
  /** Short description of how the quantity was found, e.g. `@ 4'-0" OC`. */
  basis: string;
  warning?: string;
}

/** Multiplier from the markup's Qty column (identical members drawn once), if it has one. */
function qtyColumnId(doc: DocState): string | null {
  const c = doc.columns.find((x) => (x.kind === 'number' || x.kind === 'formula') && ['qty', 'quantity'].includes(normName(x.name)));
  return c ? customColId(c) : null;
}

/** Length a spacing or full-length item runs along: the measured length, or an area's perimeter. */
export function runLength(r: Row): number {
  return r.measure.length ?? r.measure.perimeter ?? 0;
}

export function itemQuantity(item: DetailItem, r: Row, qtyCol: string | null): ItemQuantity {
  const m = r.markup;
  const qv = qtyCol ? Number(r.values[qtyCol]) : NaN;
  const mult = Number.isFinite(qv) && qv > 0 ? qv : 1;
  const run = runLength(r);
  const typed = parseDetailLength(item.length) ?? 0;
  const perItem = m.type === 'count' ? r.measure.count ?? 0 : 1;

  if (item.rule === 'spacing') {
    const sp = parseDetailLength(item.value);
    if (!sp) return { pieces: 0, pieceLength: typed, totalLength: 0, basis: '@ ? OC', warning: 'Enter a spacing' };
    if (!run) return { pieces: 0, pieceLength: typed, totalLength: 0, basis: `@ ${ftIn(sp)} OC`, warning: 'Spacing needs a length, polylength, perimeter or area markup' };
    const pieces = (Math.ceil(run / sp - 1e-6) + (item.addEnd ? 1 : 0)) * mult;
    return { pieces, pieceLength: typed, totalLength: pieces * typed, basis: `@ ${ftIn(sp)} OC` };
  }
  if (item.rule === 'full') {
    const runs = item.value.trim() === '' ? 1 : toNum(item.value);
    if (!run) return { pieces: 0, pieceLength: 0, totalLength: 0, basis: 'full length', warning: 'Full length needs a length, polylength, perimeter or area markup' };
    const pieces = runs * mult;
    return { pieces, pieceLength: run, totalLength: pieces * run, basis: runs === 1 ? 'full length' : `full length × ${fmtNumber(runs, 2)}` };
  }
  const n = item.value.trim() === '' ? 1 : toNum(item.value);
  const pieces = n * perItem * mult;
  return {
    pieces,
    pieceLength: typed,
    totalLength: pieces * typed,
    basis: `× ${fmtNumber(n, 2)}${m.type === 'count' ? ' per item' : ''}`,
  };
}

export function itemSubject(item: DetailItem, d: StandardDetail): string {
  return item.subject.trim() || item.size.trim() || d.name.trim() || 'Material';
}

/** Readable form of a detail: IF [Member Size] = "W24x55" → ADD Clip Angle L4x4x3/8 × 0'-11 1/2" × 4. */
export function describeDetail(d: StandardDetail, doc: DocState): string {
  const cols = allColumns(doc.columns);
  const name = (id: string) => cols.find((c) => c.id === id)?.name ?? id;
  const cond = d.conditions
    .filter((c) => c.column)
    .map((c) => `[${name(c.column)}] ${DETAIL_OPS.find((o) => o.id === c.op)?.label ?? '='} "${c.value}"`)
    .join(' AND ');
  const adds = d.items.map((it) => {
    const len = parseDetailLength(it.length);
    const parts = [itemSubject(it, d), it.size.trim()].filter((x, i, a) => x && a.indexOf(x) === i);
    if (it.rule === 'full') parts.push(`full length${it.value.trim() && toNum(it.value) !== 1 ? ` × ${it.value.trim()}` : ''}`);
    else {
      if (len) parts.push(`× ${ftIn(len)}`);
      if (it.rule === 'spacing') {
        const sp = parseDetailLength(it.value);
        parts.push(`@ ${sp ? ftIn(sp) : '?'} OC${it.addEnd ? ' (+1)' : ''}`);
      } else parts.push(`× ${it.value.trim() || '1'} EA`);
    }
    return parts.join(' ');
  });
  return `IF ${cond || '(no condition)'} → ADD ${adds.join(' + ') || '(nothing)'}`;
}

/** Material rows for every matching markup row, in the same order as the markups. */
export function detailRows(doc: DocState, rows: Row[]): Row[] {
  const details = (doc.standardDetails ?? []).filter((d) => d.enabled && d.items.length);
  if (!details.length) return [];
  const make = rowBuilder(doc);
  const qtyCol = qtyColumnId(doc);
  const byNorm = new Map(doc.columns.map((c) => [normName(c.name), c]));
  const sizeCol = byNorm.get('membersize') ?? byNorm.get('size');
  const catCol = byNorm.get('category');
  const qtyCustom = qtyCol ? doc.columns.find((c) => customColId(c) === qtyCol) : undefined;
  const out: Row[] = [];
  for (const r of rows) {
    if (r.detail) continue;
    for (const d of details) {
      if (!detailMatches(r, d)) continue;
      for (const it of d.items) {
        const q = itemQuantity(it, r, qtyCol);
        const size = it.size.trim();
        const custom = { ...r.markup.custom };
        if (sizeCol && sizeCol.kind !== 'formula') custom[sizeCol.id] = size;
        // Pieces are already multiplied by the markup's Qty; the material row stands for itself.
        if (qtyCustom && qtyCustom.kind === 'number') custom[qtyCustom.id] = 1;
        if (catCol && catCol.kind !== 'formula' && d.category.trim()) custom[catCol.id] = d.category.trim();
        const subject = itemSubject(it, d);
        const synthetic: Markup = {
          ...r.markup,
          id: `${r.markup.id}~${d.id}~${it.id}`,
          type: q.pieceLength > 0 ? 'length' : 'count',
          subject,
          label: size,
          comments: `Standard detail “${d.name}” on ${r.markup.subject || 'markup'}`,
          custom,
        };
        const measurement = `${fmtNumber(q.pieces, q.pieces % 1 ? 2 : 0)} EA${q.pieceLength && it.rule !== 'full' ? ` × ${ftIn(q.pieceLength)}` : ''} ${q.basis}`.trim();
        const row = make(synthetic, {
          measure: q.totalLength > 0 ? { length: q.totalLength } : {},
          scale: r.scale,
          count: q.pieces,
          type: 'Standard Detail',
          measurement: q.warning ? `⚠ ${q.warning}` : measurement,
        });
        // Qty was 1 only so formulas see the material row on its own; don't add it to Qty totals.
        if (qtyCol) {
          row.values[qtyCol] = 0;
          row.display[qtyCol] = '';
        }
        row.detail = {
          parentId: r.markup.id,
          detailId: d.id,
          detailName: d.name,
          itemId: it.id,
          summaryKey: size && normName(size) !== normName(subject) ? `${subject} – ${size}` : subject,
          warning: q.warning,
        };
        out.push(row);
      }
    }
  }
  return out;
}

/** Markup rows followed (per markup) by the material their standard details add. */
export function buildTakeoffRows(doc: DocState, withDetails: boolean): Row[] {
  const rows = buildRows(doc);
  if (!withDetails) return rows;
  const extra = detailRows(doc, rows);
  if (!extra.length) return rows;
  const byParent = new Map<string, Row[]>();
  for (const x of extra) {
    const list = byParent.get(x.detail!.parentId) ?? [];
    list.push(x);
    byParent.set(x.detail!.parentId, list);
  }
  return rows.flatMap((r) => [r, ...(byParent.get(r.markup.id) ?? [])]);
}

// ---------------------------------------------------------------------------
// New details and examples

let seq = 0;
export const detailUid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newDetailItem(patch: Partial<DetailItem> = {}): DetailItem {
  return { id: detailUid('di'), subject: '', size: '', length: '', rule: 'each', value: '1', addEnd: true, ...patch };
}

export function newDetail(patch: Partial<StandardDetail> = {}): StandardDetail {
  return {
    id: detailUid('sd'),
    name: 'New Standard Detail',
    enabled: true,
    conditions: [{ column: 'subject', op: 'eq', value: '' }],
    items: [newDetailItem()],
    category: '',
    ...patch,
  };
}

/** Typical structural steel details, set up for the default columns. */
export function exampleDetails(doc: DocState): StandardDetail[] {
  const byNorm = new Map(doc.columns.map((c) => [normName(c.name), c]));
  const size = byNorm.get('membersize');
  const sizeCol = size ? customColId(size) : 'subject';
  return [
    newDetail({
      name: 'W24 beam end connections',
      conditions: [{ column: sizeCol, op: 'eq', value: 'W24x55' }],
      items: [newDetailItem({ subject: 'Clip Angle', size: 'L4x4x3/8', length: `0'-11 1/2"`, rule: 'each', value: '4' })],
      category: 'Misc Metals',
    }),
    newDetail({
      name: 'Deck edge angle',
      conditions: [{ column: 'subject', op: 'eq', value: 'Metal Deck' }],
      items: [newDetailItem({ subject: 'Edge Angle', size: 'L3x3x1/4', rule: 'full', value: '1' })],
      category: 'Joists & Deck',
    }),
    newDetail({
      name: 'Footing dowels',
      conditions: [{ column: 'subject', op: 'eq', value: 'Continuous Footing' }],
      items: [newDetailItem({ subject: 'Dowel', size: '#5 Rebar', length: `3'-0"`, rule: 'spacing', value: '24', addEnd: true })],
      category: 'Concrete',
    }),
    newDetail({
      name: 'HSS column base',
      conditions: [{ column: 'subject', op: 'eq', value: 'HSS Column' }],
      items: [
        newDetailItem({ subject: 'Base Plate', size: 'PL3/4x12', length: `1'-0"`, rule: 'each', value: '1' }),
        newDetailItem({ subject: 'Anchor Rod', size: 'ROD3/4', length: `1'-6"`, rule: 'each', value: '4' }),
      ],
      category: 'Structural Steel',
    }),
  ];
}
