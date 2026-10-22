import type { DocState, MarkupType } from '../types';
import { allColumns, customColId, type Row } from './columns';
import { AREA_SUFFIX, LENGTH_SUFFIX, VOLUME_SUFFIX, fmtNumber } from './units';
import { normName } from './formula';

export interface SummaryLine {
  subject: string;
  color: string;
  markups: number;
  count: number;
  length: number;
  area: number;
  volume: number;
  extras: Record<string, number>;
  primary: 'count' | 'length' | 'area' | 'volume';
  ids: string[];
  /** Material added by standard details (not drawn on the sheets). */
  fromDetail?: boolean;
}

export interface SummaryGroup {
  name: string;
  lines: SummaryLine[];
  total: SummaryLine;
}

const LINEAR: MarkupType[] = ['length', 'pathlength', 'perimeter'];

function emptyLine(subject: string, color = ''): SummaryLine {
  return { subject, color, markups: 0, count: 0, length: 0, area: 0, volume: 0, extras: {}, primary: 'count', ids: [] };
}

/** Numeric custom columns (number + formula) that get summed in the summary. */
export function summableCustomColumns(doc: DocState) {
  return doc.columns.filter((c) => c.kind === 'number' || c.kind === 'formula');
}

/**
 * The summary line a markup goes on: its subject (a shape such as W) and its Member Size, so each size
 * gets its own line (W24X55, W18X35…). A size that already names the subject stands on its own.
 */
export function summaryKey(subject: string, size: string): string {
  const s = subject.trim();
  const z = size.trim();
  if (!z) return s || '(no subject)';
  if (!s || normName(z).startsWith(normName(s))) return z;
  return `${s} ${z}`;
}

export function buildSummary(rows: Row[], doc: DocState, groupBy: string | null): { groups: SummaryGroup[]; total: SummaryLine } {
  const extras = summableCustomColumns(doc).map(customColId);
  const sizeCol = doc.columns.find((c) => normName(c.name) === 'membersize');
  const sizeOf = (r: Row) => (sizeCol ? String(r.values[customColId(sizeCol)] ?? '') : '');
  const groups = new Map<string, Map<string, SummaryLine>>();
  const typeCounts = new Map<SummaryLine, Record<string, number>>();
  const total = emptyLine('Total');

  for (const r of rows) {
    const m = r.markup;
    const g = groupBy ? String(r.display[groupBy] ?? r.values[groupBy] ?? '') || '(none)' : '';
    let gm = groups.get(g);
    if (!gm) groups.set(g, (gm = new Map()));
    const key = r.detail ? r.detail.summaryKey : summaryKey(m.subject, sizeOf(r));
    // Material lines stay separate from drawn markups that happen to share the subject.
    const mapKey = `${r.detail ? 'detail' : 'markup'}:${key}`;
    let line = gm.get(mapKey);
    if (!line) {
      gm.set(mapKey, (line = emptyLine(key, m.style.color)));
      if (r.detail) line.fromDetail = true;
      typeCounts.set(line, {});
    }
    const add = (l: SummaryLine) => {
      // The overall total counts drawn markups; material rows are counted by their own lines.
      if (!(r.detail && l === total)) l.markups += 1;
      l.count += Number(r.values.count) || 0;
      l.length += Number(r.values.length) || 0;
      l.area += Number(r.values.area) || 0;
      l.volume += Number(r.values.volume) || 0;
      for (const e of extras) l.extras[e] = (l.extras[e] ?? 0) + (Number(r.values[e]) || 0);
      l.ids.push(r.detail ? r.detail.parentId : m.id);
    };
    add(line);
    add(total);
    const tc = typeCounts.get(line)!;
    const kind = m.type === 'count' ? 'count' : LINEAR.includes(m.type) ? 'length' : m.type === 'area' ? 'area' : m.type === 'volume' ? 'volume' : 'other';
    tc[kind] = (tc[kind] ?? 0) + 1;
  }

  for (const [line, tc] of typeCounts) {
    const best = (['volume', 'area', 'length', 'count'] as const).reduce<{ k: SummaryLine['primary']; n: number }>(
      (acc, k) => ((tc[k] ?? 0) > acc.n ? { k, n: tc[k] ?? 0 } : acc),
      { k: 'count', n: 0 },
    );
    line.primary = best.k;
  }

  const out: SummaryGroup[] = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, lm]) => {
      // Drawn items first, then the material standard details add.
      const lines = [...lm.values()].sort((a, b) => Number(!!a.fromDetail) - Number(!!b.fromDetail) || a.subject.localeCompare(b.subject, undefined, { numeric: true }));
      const t = emptyLine(name);
      for (const l of lines) {
        t.markups += l.markups;
        t.count += l.count;
        t.length += l.length;
        t.area += l.area;
        t.volume += l.volume;
        for (const [k, v] of Object.entries(l.extras)) t.extras[k] = (t.extras[k] ?? 0) + v;
        t.ids.push(...l.ids);
      }
      t.ids = [...new Set(t.ids)];
      return { name, lines, total: t };
    });
  return { groups: out, total };
}

export function primaryQuantity(l: SummaryLine, doc: DocState): string {
  const s = doc.settings;
  switch (l.primary) {
    case 'count':
      return `${fmtNumber(l.count, 0)} EA`;
    case 'length':
      // Linear members are usually priced by piece and by length (e.g. "12 EA · 276.00 LF").
      return `${fmtNumber(l.count, 0)} EA · ${fmtNumber(l.length, s.decimals)} ${LENGTH_SUFFIX[s.lengthUnit]}`;
    case 'area':
      return `${fmtNumber(l.area, s.decimals)} ${AREA_SUFFIX[s.areaUnit]}`;
    case 'volume':
      return `${fmtNumber(l.volume, s.decimals)} ${VOLUME_SUFFIX[s.volumeUnit]}`;
  }
}

export function columnName(doc: DocState, id: string) {
  return allColumns(doc.columns, doc.listStyle?.labels).find((c) => c.id === id)?.name ?? id;
}
