import { describe, expect, it } from 'vitest';
import { defaultDetailStyles, detailMarks, detailStyleFor, insetRing, labelFrame, newDetailStyle, offsetPath, OTHER_SHAPES, pointAlong } from '../src/core/detailMarks';
import { newDetail, newDetailItem } from '../src/core/details';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { defaultStyle } from '../src/core/markupTypes';
import { DEFAULT_SETTINGS, findPreset, scaleFromPreset } from '../src/core/units';
import { polygonArea } from '../src/core/geometry';
import type { DocState, Markup, Pt, Sheet } from '../src/types';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const len = (p: Pt[]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);

describe('offset lines', () => {
  it('runs parallel, the same length, to either side', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const a = offsetPath(line, 5, false);
    const b = offsetPath(line, -5, false);
    expect(a).toEqual([
      { x: 0, y: 5 },
      { x: 100, y: 5 },
    ]);
    expect(b).toEqual([
      { x: 0, y: -5 },
      { x: 100, y: -5 },
    ]);
  });

  it('mitres the corners of a polyline', () => {
    // An L: right 100, then down 100. Offset 10 to the left of travel (−ty, tx) → inside of the turn.
    const p = offsetPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
      false,
    );
    expect(p).toHaveLength(3);
    close(p[1].x, 90);
    close(p[1].y, 10);
    close(p[2].x, 90);
    close(p[2].y, 100);
  });

  it('insets a ring inside an outline, whichever way it was drawn', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    for (const ring of [sq, [...sq].reverse()]) {
      const r = insetRing(ring, 5);
      close(polygonArea(r), 90 * 90);
      for (const q of r) {
        expect(q.x).toBeGreaterThan(4.9);
        expect(q.x).toBeLessThan(95.1);
      }
    }
  });

  it('finds points along a path', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAlong(p, false, 0).p).toEqual({ x: 0, y: 0 });
    expect(pointAlong(p, false, 0.25).p).toEqual({ x: 50, y: 0 });
    expect(pointAlong(p, false, 0.75).p).toEqual({ x: 100, y: 50 });
    expect(pointAlong(p, false, 1).p).toEqual({ x: 100, y: 100 });
  });
});

describe('detail material on the drawing', () => {
  const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
  const ft = 12 / scale.realPerPt;
  const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1.02', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
  const mk = (id: string, type: Markup['type'], pts: [number, number][], custom: Markup['custom'] = {}): Markup => ({
    id,
    sheetId: 's1',
    type,
    points: pts.map(([x, y]) => ({ x: 100 + x * ft, y: 300 + y * ft })),
    subject: 'W',
    label: 'W24x55',
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle(type),
    custom,
  });
  const beam = mk('b1', 'length', [[0, 0], [24, 0]], { member_size: 'W24x55', qty: 1 });
  const post = mk('p1', 'length', [[0, 10], [0, 30]], { member_size: 'HSS4x4x1/4', qty: 1 });
  const cols = mk('c1', 'count', [[0, 50], [25, 50]], { member_size: 'HSS6x6x3/8' });
  const deck = mk('d1', 'area', [[0, 60], [40, 60], [40, 90], [0, 90]], { member_size: 'Deck' });
  const detail = newDetail({
    name: 'Beam material',
    conditions: [{ column: 'c:member_size', op: 'eq', value: 'W24x55' }],
    items: [
      newDetailItem({ subject: 'L', size: 'L4x4x3/8', length: `0'-11 1/2"`, rule: 'each', value: '4' }),
      newDetailItem({ subject: 'L', size: 'L3x3x1/4', rule: 'full', value: '1' }),
      newDetailItem({ subject: 'Stud', size: '3/4" stud', rule: 'spacing', value: '24', addEnd: true }),
    ],
  });
  const base: DocState = {
    files: [],
    sheets: [sheet],
    markups: [beam, post, cols, deck],
    columns: defaultColumns(),
    layers: defaultLayers(),
    settings: DEFAULT_SETTINGS,
    standardDetails: [detail],
  };
  const opts = (labels: Record<string, string[]> = {}) => ({ styles: defaultDetailStyles(), gap: 4, labels: true, parentLabel: (m: Markup) => labels[m.id] ?? [] });

  it('draws full-length material as a line the same length and direction, away from the label', () => {
    const marks = detailMarks(base, base.markups, opts({ b1: ['W24x55', `24'-0"`] }));
    expect(marks.map((m) => m.kind)).toEqual(['count', 'line', 'spaced']);
    const line = marks[1];
    const p = line.paths[0].pts;
    close(len(p), len(beam.points));
    close(p[0].y - p[1].y, 0);
    // The beam's label is above it (smaller y), so the material goes below.
    expect(p[0].y).toBeGreaterThan(beam.points[0].y + 2);
    expect(p[0].y).toBeLessThan(beam.points[0].y + 10);
    expect(line.text?.text).toBe('L3x3x1/4');
    expect(line.text!.at.y).toBeGreaterThan(p[0].y);
  });

  it('draws pieces at a spacing as marks along the member', () => {
    const marks = detailMarks(base, base.markups, opts());
    const studs = marks.find((m) => m.kind === 'spaced')!;
    // 24'-0" @ 2'-0" with the end one: 13.
    expect(studs.symbols).toHaveLength(13);
    expect(studs.text?.text).toBe(`13 × 3/4" stud @ 2'-0"`);
    close(studs.symbols[0].x, beam.points[0].x);
    close(studs.symbols[12].x, beam.points[1].x);
    // Beyond the full-length line (stacked, not on top of it).
    const line = marks.find((m) => m.kind === 'line')!;
    expect(studs.symbols[0].y).toBeGreaterThan(line.paths[0].pts[0].y + 2);
  });

  it('puts a counted item as a count mark after the markup label', () => {
    const marks = detailMarks(base, base.markups, opts({ b1: ['W24x55', `24'-0"`] }));
    const count = marks.find((m) => m.kind === 'count')!;
    const f = labelFrame(beam, ['W24x55', `24'-0"`])!;
    expect(count.symbols).toHaveLength(1);
    // Right of the label's end, level with it (above the beam).
    expect(count.symbols[0].x).toBeGreaterThan(f.o.x + f.u1);
    expect(count.symbols[0].y).toBeLessThan(beam.points[0].y);
    expect(count.text?.text).toBe('4 × L4x4x3/8');
    expect(count.text!.at.x).toBeGreaterThan(count.symbols[0].x);
  });

  it('keeps the direction of a vertical member', () => {
    const d = newDetail({
      conditions: [{ column: 'c:member_size', op: 'eq', value: 'HSS4x4x1/4' }],
      items: [newDetailItem({ subject: 'PL', size: 'PL3/8x4', rule: 'full', value: '1' })],
    });
    const [m] = detailMarks({ ...base, standardDetails: [d] }, [post], opts());
    const p = m.paths[0].pts;
    close(p[0].x, p[1].x);
    close(len(p), len(post.points));
    expect(Math.abs(p[0].x - post.points[0].x)).toBeGreaterThan(2);
  });

  it('puts the material of a count next to its label, and runs material inside an area', () => {
    const d = newDetail({
      conditions: [{ column: 'c:member_size', op: 'eq', value: 'HSS6x6x3/8' }],
      items: [
        newDetailItem({ subject: 'BP', size: 'PL3/4x12', length: '12', rule: 'each', value: '1' }),
        newDetailItem({ subject: 'Anchor Rod', size: 'ROD3/4', length: '18', rule: 'each', value: '4' }),
        newDetailItem({ subject: 'L', size: 'L3x3x1/4', rule: 'full', value: '1' }), // no length to run along: left out
      ],
    });
    const e = newDetail({ conditions: [{ column: 'c:member_size', op: 'eq', value: 'Deck' }], items: [newDetailItem({ subject: 'L', size: 'L3x3x1/4', rule: 'full', value: '1' })] });
    const marks = detailMarks({ ...base, standardDetails: [d, e] }, [cols, deck], opts({ c1: ['2'] }));
    const counts = marks.filter((m) => m.parentId === 'c1');
    expect(counts.map((m) => m.text?.text)).toEqual(['2 × PL3/4x12', '8 × ROD3/4']);
    const last = cols.points[1];
    for (const m of counts) expect(m.symbols[0].x).toBeGreaterThan(last.x);
    // One above the other.
    expect(counts[1].symbols[0].y).toBeLessThan(counts[0].symbols[0].y);
    const ring = marks.find((m) => m.parentId === 'd1')!;
    expect(ring.paths[0].closed).toBe(true);
    expect(polygonArea(ring.paths[0].pts)).toBeLessThan(polygonArea(deck.points));
    expect(polygonArea(ring.paths[0].pts)).toBeGreaterThan(polygonArea(deck.points) * 0.9);
  });

  it('draws nothing for markups without material, or when the detail is off', () => {
    expect(detailMarks({ ...base, standardDetails: [] }, base.markups, opts())).toEqual([]);
    expect(detailMarks({ ...base, standardDetails: [{ ...detail, enabled: false }] }, base.markups, opts())).toEqual([]);
    expect(detailMarks(base, [post, cols, deck], opts())).toEqual([]);
    // Taken off this beam by hand.
    expect(detailMarks(base, [{ ...beam, detailsOff: [detail.id] }], opts())).toEqual([]);
  });

  it('leaves the labels off when asked', () => {
    const marks = detailMarks(base, [beam], { ...opts(), labels: false });
    expect(marks).toHaveLength(3);
    expect(marks.every((m) => m.text === null)).toBe(true);
  });
});

describe('detail mark presets by shape', () => {
  const styles = defaultDetailStyles();

  it('finds the shape of the material from its size, else its subject, else other shapes', () => {
    expect(detailStyleFor(styles, 'Clip Angle', 'L4x4x3/8').shape).toBe('L');
    expect(detailStyleFor(styles, 'Post', 'HSS1-1/2x1-1/2x1/8').shape).toBe('HSS');
    expect(detailStyleFor(styles, 'BP', '').shape).toBe('BP');
    expect(detailStyleFor(styles, 'PL', 'PL3/4x12').shape).toBe('PL');
    expect(detailStyleFor(styles, 'Dowel', '#5 Rebar').shape).toBe(OTHER_SHAPES);
    // "Clip Angle" is not a C.
    expect(detailStyleFor(styles, 'Clip Angle', '').shape).toBe(OTHER_SHAPES);
  });

  it('starts with each shape in its own colour, L dotted and HSS dashed', () => {
    const L = detailStyleFor(styles, '', 'L3x3x1/4');
    expect(L.line.color).toBe('#e76f51');
    expect(L.line.lineStyle).toBe('dotted');
    expect(L.count.symbol).toBe('triangle');
    expect(detailStyleFor(styles, '', 'HSS4x4x1/4').line.lineStyle).toBe('dashed');
    expect(styles.at(-1)!.shape).toBe(OTHER_SHAPES);
  });
});

describe('drawing with the presets', () => {
  const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
  const ft = 12 / scale.realPerPt;
  const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
  const beam: Markup = {
    id: 'b1',
    sheetId: 's1',
    type: 'length',
    points: [
      { x: 100, y: 300 },
      { x: 100 + 24 * ft, y: 300 },
    ],
    subject: 'W',
    label: 'W24x55',
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle('length'),
    custom: { member_size: 'W24x55' },
  };
  const detail = newDetail({
    conditions: [{ column: 'c:member_size', op: 'eq', value: 'W24x55' }],
    items: [
      newDetailItem({ subject: 'L', size: 'L4x4x3/8', rule: 'each', value: '4' }),
      newDetailItem({ subject: 'L', size: 'L3x3x1/4', rule: 'full', value: '1' }),
      newDetailItem({ subject: 'Stud', size: '3/4" stud', rule: 'spacing', value: '24' }),
    ],
  });
  const doc: DocState = { files: [], sheets: [sheet], markups: [beam], columns: defaultColumns(), layers: defaultLayers(), settings: DEFAULT_SETTINGS, standardDetails: [detail] };
  const L = { ...newDetailStyle('L'), count: { show: true, symbol: 'star' as const, size: 9, color: '#112233', label: false }, line: { show: true, lineStyle: 'dashed' as const, width: 6, color: '#445566', label: true } };
  const other = { ...newDetailStyle(OTHER_SHAPES), count: { show: false, symbol: 'circle' as const, size: 3, color: '#000000', label: true }, line: { show: true, lineStyle: 'solid' as const, width: 1, color: '#000000', label: true } };
  const run = (styles = [L, other]) => detailMarks(doc, [beam], { styles, gap: 4, labels: true, parentLabel: () => ['24\'-0"'] });

  it('draws count marks with the symbol, size, colour and label of the shape', () => {
    const count = run().find((m) => m.kind === 'count')!;
    expect(count.style.symbol).toBe('star');
    expect(count.symbolSize).toBe(9);
    expect(count.style.color).toBe('#112233');
    expect(count.text).toBeNull();
  });

  it('draws lines with the line style, width, colour and label of the shape', () => {
    const line = run().find((m) => m.kind === 'line')!;
    expect(line.style.lineStyle).toBe('dashed');
    expect(line.style.lineWidth).toBe(6);
    expect(line.style.color).toBe('#445566');
    expect(line.text?.text).toBe('L3x3x1/4');
    // Wider line: further from the beam.
    const thin = run([{ ...L, line: { ...L.line, width: 1 } }, other]).find((m) => m.kind === 'line')!;
    expect(line.paths[0].pts[0].y - beam.points[0].y).toBeGreaterThan(thin.paths[0].pts[0].y - beam.points[0].y);
  });

  it('leaves out what a shape does not show', () => {
    // Studs are "other shapes", whose count marks are off.
    expect(run().map((m) => m.kind)).toEqual(['count', 'line']);
    const none = run([{ ...L, count: { ...L.count, show: false }, line: { ...L.line, show: false } }, other]);
    expect(none).toEqual([]);
  });
});
