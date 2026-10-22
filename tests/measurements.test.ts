import { afterEach, describe, expect, it } from 'vitest';
import { buildRows } from '../src/core/columns';
import { collectPieces } from '../src/core/combine';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { defaultStyle } from '../src/core/markupTypes';
import { computeMeasure, drawingLabelLines, scaleForMarkup } from '../src/core/measure';
import { selectionTotals } from '../src/core/selectionTotals';
import { DEFAULT_SETTINGS, DEFAULT_USER_UNITS, findPreset, scaleFromPreset, setUserUnits } from '../src/core/units';
import { PANEL_IDS, isPanelOpen, normalizeLayout, sectionPanels, upgradeLayout } from '../src/store/dockLayout';
import type { LayoutState, PanelId, PanelPlace } from '../src/store/store';
import type { DocState, Markup, Sheet } from '../src/types';

afterEach(() => setUserUnits(DEFAULT_USER_UNITS));

const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
const ptPerFt = 12 / scale.realPerPt;
const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
let n = 0;
function mk(type: Markup['type'], points: { x: number; y: number }[], patch: Partial<Markup> = {}): Markup {
  return {
    id: `m${n++}`,
    sheetId: 's1',
    type,
    points,
    subject: '',
    label: '',
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle(type),
    custom: {},
    ...patch,
  };
}
const plates = (height: number | string | undefined, patch: Partial<Markup> = {}) =>
  mk(
    'count',
    [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
    ],
    { label: 'PL 1/2X7', custom: height === undefined ? {} : { height }, ...patch },
  );
const beam = (feet: number, patch: Partial<Markup> = {}) =>
  mk(
    'length',
    [
      { x: 10, y: 100 },
      { x: 10 + feet * ptPerFt, y: 100 },
    ],
    patch,
  );
const docOf = (markups: Markup[]): DocState => ({ files: [], sheets: [sheet], markups, columns: defaultColumns(), layers: defaultLayers(), settings: DEFAULT_SETTINGS, standardDetails: [] });

describe('measurement dimensions', () => {
  it('a count with a Height takes off a length: each piece that long', () => {
    const m = plates(14); // 3 plates × 1'-2"
    const v = computeMeasure(m, scale);
    expect(v.count).toBe(3);
    expect(v.length).toBe(42);
    expect(v.area).toBeUndefined();
    // Width × Height an area, × Depth a volume.
    expect(computeMeasure({ ...m, width: 7 }, scale).area).toBe(3 * 7 * 14);
    expect(computeMeasure({ ...m, width: 7, depth: 0.5 }, scale).volume).toBe(3 * 7 * 14 * 0.5);
    // Older text heights are read too.
    expect(computeMeasure(plates(`1'-2"`), scale).length).toBe(42);
    // No Height: just the count.
    expect(computeMeasure(plates(undefined), scale)).toEqual({ count: 3 });
  });

  it('a length with a Width is a strip: its area (and volume with a Depth)', () => {
    const v = computeMeasure(beam(20, { width: 24 }), scale);
    expect(v.length).toBeCloseTo(240, 6);
    expect(v.area).toBeCloseTo(240 * 24, 6);
    expect(computeMeasure(beam(20, { width: 24, depth: 12 }), scale).volume).toBeCloseTo(240 * 24 * 12, 6);
    expect(computeMeasure(beam(20), scale).area).toBeUndefined();
  });

  it('counts with a Height fill the Length column, the labels and the totals', () => {
    const doc = docOf([plates(14), beam(10)]);
    const rows = buildRows(doc);
    expect(rows[0].display.length).toBe(`3'-6"`);
    expect(Number(rows[0].values.length)).toBeCloseTo(3.5, 6);
    expect(rows[0].display['c:height']).toBe(`1'-2"`);
    expect(drawingLabelLines(doc.markups[0], rows[0].measure, scale, DEFAULT_SETTINGS)).toEqual(['PL 1/2X7', '3', `3'-6"`]);
    const t = selectionTotals(doc, doc.markups.map((m) => m.id));
    expect(t.count).toBe(3);
    expect(t.length).toBeCloseTo(42 + 120, 6);
  });

  it('counts with a Height are pieces in the combine report', () => {
    const doc = docOf([plates(14)]);
    const [entry] = [...collectPieces(buildRows(doc), doc).values()];
    expect(entry.size).toBe('PL 1/2X7');
    const pieces = entry.pieces;
    expect(pieces.map((p) => p.length)).toEqual([14, 14, 14]);
  });

  it('a measurement can have its own units', () => {
    const m = beam(20, { units: { length: 'in' }, width: 24 });
    const s = scaleForMarkup(m, sheet);
    expect(s.unit).toBe('in');
    const doc = docOf([m]);
    const [r] = buildRows(doc);
    expect(r.display.length).toBe(`240.00"`);
    // Its area follows (square inches) unless it has an area unit of its own.
    expect(r.display.area).toBe('5,760.00 sq in');
    expect(buildRows(docOf([{ ...m, units: { length: 'in', area: 'sf' } }]))[0].display.area).toBe('40.00 sf');
    const sy = buildRows(docOf([{ ...m, units: { area: 'sy' } }]))[0];
    expect(sy.display.area).toBe('4.44 sy');
    expect(sy.display.length).toBe(`20'-0"`);
    // Dimensions in their own unit.
    const w = buildRows(docOf([{ ...m, units: { dim: 'in' } }]))[0];
    expect(w.display.width).toBe(`24.00"`);
    expect(buildRows(docOf([m]))[0].display.width).toBe(`2'-0"`);
  });
});

describe('workspace: Measurements stacked between the Tool Library and Properties', () => {
  const docks: Record<PanelId, PanelPlace['dock']> = {
    sheets: 'left',
    toollibrary: 'right',
    properties: 'right',
    measurements: 'right',
    layers: 'right',
    compare: 'right',
    autotakeoff: 'right',
    markups: 'bottom',
    summary: 'bottom',
  };
  it('gives Measurements a section of its own, open, once', () => {
    const panels = {} as LayoutState['panels'];
    for (const id of PANEL_IDS) panels[id] = { dock: docks[id], float: { x: 0, y: 0, w: 300, h: 400 }, open: false, section: id === 'properties' ? 1 : 0 };
    // A layout from 1.12: Tool Library (and Measurements) above, Properties below.
    const old = normalizeLayout({
      panels,
      active: { left: ['sheets'], right: ['toollibrary', 'properties'], top: [null], bottom: ['markups'] },
      split: { left: [1], right: [1.3, 1], top: [1], bottom: [1] },
      size: { left: 250, right: 310, top: 220, bottom: 250 },
      floatOrder: [],
      toolbar: { dock: 'top', x: 0, y: 0 },
      locked: false,
      propsOwn: true,
    });
    const l = upgradeLayout(old);
    expect(l.measOwn).toBe(true);
    expect(sectionPanels(l, 'right', 0)).toEqual(['toollibrary', 'layers', 'compare', 'autotakeoff']);
    expect(sectionPanels(l, 'right', 1)).toEqual(['measurements']);
    expect(sectionPanels(l, 'right', 2)).toEqual(['properties']);
    expect(['toollibrary', 'measurements', 'properties'].every((id) => isPanelOpen(l, id as PanelId))).toBe(true);
    // Once only: moved back, it stays.
    expect(upgradeLayout({ ...old, measOwn: true })).toEqual({ ...old, measOwn: true });
  });
});
