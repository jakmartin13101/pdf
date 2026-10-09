import type { CustomColumn, DocState, Layer, Markup, MeasureValues, Scale, Sheet } from '../types';
import { evaluate, normName, toNum, type FValue } from './formula';
import { TYPE_INFO } from './markupTypes';
import { computeMeasure, measurementText, scaleForMarkup } from './measure';
import {
  AREA_SUFFIX,
  LENGTH_SUFFIX,
  VOLUME_SUFFIX,
  areaToReport,
  fmtNumber,
  formatArea,
  formatLength,
  formatVolume,
  lengthToReport,
  volumeToReport,
} from './units';

export type ColumnEditor = 'text' | 'number' | 'choice' | 'status' | 'check' | 'color' | 'layer' | 'length' | 'count' | 'none';

export interface ColumnSpec {
  id: string;
  name: string;
  builtin: boolean;
  editor: ColumnEditor;
  numeric: boolean;
  align: 'left' | 'right' | 'center';
  width: number;
  custom?: CustomColumn;
}

export const BUILTIN_COLUMNS: ColumnSpec[] = [
  { id: 'subject', name: 'Subject', builtin: true, editor: 'text', numeric: false, align: 'left', width: 150 },
  { id: 'type', name: 'Type', builtin: true, editor: 'none', numeric: false, align: 'left', width: 150 },
  { id: 'label', name: 'Label', builtin: true, editor: 'text', numeric: false, align: 'left', width: 110 },
  { id: 'page', name: 'Sheet', builtin: true, editor: 'none', numeric: false, align: 'left', width: 80 },
  { id: 'sheetTitle', name: 'Sheet Title', builtin: true, editor: 'none', numeric: false, align: 'left', width: 150 },
  { id: 'measurement', name: 'Measurement', builtin: true, editor: 'none', numeric: false, align: 'right', width: 110 },
  { id: 'length', name: 'Length', builtin: true, editor: 'none', numeric: true, align: 'right', width: 95 },
  { id: 'area', name: 'Area', builtin: true, editor: 'none', numeric: true, align: 'right', width: 105 },
  { id: 'perimeter', name: 'Perimeter', builtin: true, editor: 'none', numeric: true, align: 'right', width: 95 },
  { id: 'volume', name: 'Volume', builtin: true, editor: 'none', numeric: true, align: 'right', width: 95 },
  { id: 'count', name: 'Count', builtin: true, editor: 'count', numeric: true, align: 'right', width: 72 },
  { id: 'depth', name: 'Depth', builtin: true, editor: 'length', numeric: true, align: 'right', width: 75 },
  { id: 'scale', name: 'Scale', builtin: true, editor: 'none', numeric: false, align: 'left', width: 110 },
  { id: 'layer', name: 'Layer', builtin: true, editor: 'layer', numeric: false, align: 'left', width: 100 },
  { id: 'status', name: 'Status', builtin: true, editor: 'status', numeric: false, align: 'left', width: 90 },
  { id: 'checkmark', name: 'Checkmark', builtin: true, editor: 'check', numeric: false, align: 'center', width: 50 },
  { id: 'color', name: 'Color', builtin: true, editor: 'color', numeric: false, align: 'center', width: 55 },
  { id: 'author', name: 'Author', builtin: true, editor: 'text', numeric: false, align: 'left', width: 100 },
  { id: 'date', name: 'Date', builtin: true, editor: 'none', numeric: false, align: 'left', width: 135 },
  { id: 'comments', name: 'Comments', builtin: true, editor: 'text', numeric: false, align: 'left', width: 180 },
];

export const customColId = (c: CustomColumn) => `c:${c.id}`;

export function allColumns(custom: CustomColumn[]): ColumnSpec[] {
  return [
    ...BUILTIN_COLUMNS,
    ...custom.map<ColumnSpec>((c) => ({
      id: customColId(c),
      name: c.name,
      builtin: false,
      editor: c.kind === 'formula' ? 'none' : c.kind === 'choice' ? 'choice' : c.kind === 'number' ? 'number' : 'text',
      numeric: c.kind === 'number' || c.kind === 'formula',
      align: c.kind === 'number' || c.kind === 'formula' ? 'right' : 'left',
      width: c.kind === 'formula' ? 100 : 110,
      custom: c,
    })),
  ];
}

export interface Row {
  markup: Markup;
  sheet: Sheet | undefined;
  scale: Scale;
  measure: MeasureValues;
  /** Raw values used for sorting, filtering, totals and formulas. */
  values: Record<string, FValue>;
  /** Display strings. */
  display: Record<string, string>;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US') + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function sheetLabel(sheet: Sheet | undefined): string {
  if (!sheet) return '';
  return sheet.number || `Page ${sheet.pageIndex + 1}`;
}

export function sheetDisplayName(sheet: Sheet | undefined): string {
  if (!sheet) return '';
  const n = sheetLabel(sheet);
  return sheet.title ? `${n} – ${sheet.title}` : n;
}

/** Build list rows for markups, evaluating built-in and custom (incl. formula) columns. */
export function buildRows(doc: DocState, markups: Markup[] = doc.markups): Row[] {
  const sheetById = new Map(doc.sheets.map((s) => [s.id, s]));
  const layerById = new Map<string, Layer>(doc.layers.map((l) => [l.id, l]));
  const s = doc.settings;
  const customByNorm = new Map(doc.columns.map((c) => [normName(c.name), c]));

  return markups.map((m) => {
    const sheet = sheetById.get(m.sheetId);
    const scale = scaleForMarkup(m, sheet);
    const measure = computeMeasure(m, scale);
    const info = TYPE_INFO[m.type];
    const values: Record<string, FValue> = {};
    const display: Record<string, string> = {};

    const lengthR = measure.length != null ? lengthToReport(measure.length, s) : 0;
    const areaR = measure.area != null ? areaToReport(measure.area, s) : 0;
    const perimR = measure.perimeter != null ? lengthToReport(measure.perimeter, s) : 0;
    const volR = measure.volume != null ? volumeToReport(measure.volume, s) : 0;
    const count = m.type === 'count' ? measure.count ?? 0 : 1;
    const depthR = m.depth != null ? lengthToReport(m.depth, s) : 0;

    const set = (id: string, v: FValue, d?: string) => {
      values[id] = v;
      display[id] = d ?? (typeof v === 'number' ? fmtNumber(v, s.decimals) : v);
    };
    set('subject', m.subject);
    set('type', info.listName);
    set('label', m.label);
    set('page', sheetLabel(sheet));
    set('sheetTitle', sheet?.title ?? '');
    set('measurement', info.measure ? measurementText(m, measure, scale, s) : '');
    set('length', lengthR, measure.length != null ? formatLength(measure.length, scale.unit, scale.precision) : '');
    set('area', areaR, measure.area != null ? formatArea(measure.area, scale.unit, s) : '');
    set('perimeter', perimR, measure.perimeter != null ? formatLength(measure.perimeter, scale.unit, scale.precision) : '');
    set('volume', volR, measure.volume != null ? formatVolume(measure.volume, scale.unit, s) : '');
    // An asterisk marks a count that was typed in rather than counted on the drawing.
    set('count', count, fmtNumber(count, 0) + (m.type === 'count' && m.countOverride != null ? '*' : ''));
    set('depth', depthR, m.type === 'volume' ? formatLength(m.depth ?? 0, scale.unit, scale.precision) : '');
    set('scale', info.measure ? scale.label : '');
    set('layer', layerById.get(m.layer)?.name ?? '');
    set('status', m.status);
    set('checkmark', m.checked ? 1 : 0, m.checked ? '✓' : '');
    set('color', m.style.color);
    set('author', m.author);
    set('date', m.modified, formatDate(m.modified));
    set('comments', m.comments);

    // Custom columns: plain values first, then formulas (which may reference each other).
    const formulaCols: CustomColumn[] = [];
    for (const c of doc.columns) {
      const id = customColId(c);
      if (c.kind === 'formula') {
        formulaCols.push(c);
        continue;
      }
      const raw = m.custom[c.id] ?? c.defaultValue ?? '';
      if (c.kind === 'number') {
        const n = raw === '' ? 0 : toNum(raw);
        set(id, n, raw === '' ? '' : fmtNumber(n, c.decimals ?? s.decimals) + (c.suffix ? ` ${c.suffix}` : ''));
      } else set(id, String(raw));
    }

    const builtinRef: Record<string, FValue> = {
      length: lengthR,
      area: areaR,
      perimeter: perimR,
      volume: volR,
      count,
      depth: depthR,
      angle: measure.angle ?? 0,
      subject: m.subject,
      label: m.label,
      page: values.page,
      sheet: values.page,
      pagelabel: values.page,
      type: info.label,
      layer: values.layer,
      status: m.status,
      author: m.author,
      comments: m.comments,
    };
    const evaluating = new Set<string>();
    const resolve = (name: string): FValue | undefined => {
      const k = normName(name);
      const col = customByNorm.get(k);
      if (col) {
        if (col.kind !== 'formula') return values[customColId(col)];
        return evalFormula(col);
      }
      return builtinRef[k];
    };
    const evalFormula = (c: CustomColumn): FValue => {
      const id = customColId(c);
      if (id in values) return values[id];
      if (evaluating.has(id)) throw new Error('Circular reference');
      evaluating.add(id);
      try {
        const v = evaluate(c.formula ?? '', resolve);
        // Blank rather than "0 lbs" for markups the formula does not apply to.
        set(id, v, typeof v === 'number' ? (v === 0 ? '' : fmtNumber(v, c.decimals ?? s.decimals) + (c.suffix ? ` ${c.suffix}` : '')) : v);
        return v;
      } catch (e) {
        values[id] = 0;
        display[id] = '#ERR';
        return 0;
      } finally {
        evaluating.delete(id);
      }
    };
    for (const c of formulaCols) evalFormula(c);

    return { markup: m, sheet, scale, measure, values, display };
  });
}

/** Units suffix for numeric built-in columns. */
export function columnUnit(colId: string, doc: DocState): string {
  const s = doc.settings;
  if (colId === 'length' || colId === 'perimeter' || colId === 'depth') return LENGTH_SUFFIX[s.lengthUnit];
  if (colId === 'area') return AREA_SUFFIX[s.areaUnit];
  if (colId === 'volume') return VOLUME_SUFFIX[s.volumeUnit];
  if (colId === 'count') return 'EA';
  const c = doc.columns.find((x) => customColId(x) === colId);
  return c?.suffix ?? '';
}

export function formatTotal(colId: string, v: number, doc: DocState): string {
  const c = doc.columns.find((x) => customColId(x) === colId);
  const dec = colId === 'count' ? 0 : c?.decimals ?? doc.settings.decimals;
  const unit = columnUnit(colId, doc);
  return fmtNumber(v, dec) + (unit ? ` ${unit}` : '');
}

/** Columns that receive totals (sums) in group headers and the footer. */
export function isSummable(spec: ColumnSpec): boolean {
  if (!spec.numeric) return false;
  return spec.id !== 'depth';
}
