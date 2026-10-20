import { describe, expect, it } from 'vitest';
import { combinePlan, packPieces, defaultCombineSettings, splicePlan } from '../src/core/combine';
import { buildRows } from '../src/core/columns';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { defaultStyle } from '../src/core/markupTypes';
import { DEFAULT_SETTINGS, findPreset, scaleFromPreset } from '../src/core/units';
import type { DocState, Markup, Sheet } from '../src/types';

const FT = 12;
const order = (lengths: number[], stock: number[], allowance = 12, kerf = 0) => {
  const p = packPieces(lengths.map((l) => l * FT), stock.map((s) => s * FT), allowance, kerf);
  return p.bars.map((b) => b.stock / FT).sort((a, b) => b - a);
};

describe('combine: nesting pieces on stock lengths', () => {
  it('fits three 5 ft pieces on one 20 ft bar', () => {
    expect(order([5, 5, 5], [20, 40])).toEqual([20]);
  });

  it('needs a 40 ft and a 20 ft bar for 15, 18 and 18 ft', () => {
    expect(order([15, 18, 18], [20, 40])).toEqual([40, 20]);
  });

  it('keeps the machine allowance and the kerf on every bar', () => {
    // 19'-0" + 1'-0" allowance fills a 20 ft bar exactly; a kerf more does not fit.
    expect(order([19], [20, 40])).toEqual([20]);
    expect(order([19], [20, 40], 12, 0.125)).toEqual([40]);
    expect(order([10, 9], [20, 40], 12, 0)).toEqual([20]);
    expect(order([10, 9], [20, 40], 12, 0.125)).toEqual([40]);
  });

  it('uses the stock lengths for the shape, picking the least total length', () => {
    const w = defaultCombineSettings().stock.find((s) => s.shape === 'W')!.lengths.map((l) => l / FT);
    // 23' + 23' + 1' = 47': one 50' bar (two 25' bars are 50' too, but two bars).
    expect(order([23, 23], w)).toEqual([50]);
    // With 5' steps up to 60', 15', 18' and 18' (+ 1') take one 55' bar: less than 40' + 20'.
    expect(order([15, 18, 18], w)).toEqual([55]);
    expect(order([30, 29], w)).toEqual([60]); // 30' + 29' + 1' fills a 60' bar exactly
    expect(order([30, 29], w, 12, 0.125)).toEqual([35, 35]); // … unless the cuts take some (29' + 1/8" + 1' > 30')
  });

  it('packs many pieces well (heuristics beyond the exact search)', () => {
    const pieces = Array.from({ length: 30 }, (_, i) => 4 + (i % 7));
    const bars = order(pieces, [20, 40]);
    const total = bars.reduce((s, b) => s + b, 0);
    const need = pieces.reduce((s, p) => s + p, 0) + bars.length; // + 1 ft allowance per bar
    expect(total).toBeGreaterThanOrEqual(need);
    expect(total - need).toBeLessThan(40); // little waste
  });
});

describe('combine: whole stock lengths and splices', () => {
  const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
  const ptPerFt = 12 / scale.realPerPt;
  const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
  let n = 0;
  const piece = (size: string, inches: number): Markup => ({
    id: `m${n++}`,
    sheetId: 's1',
    type: 'length',
    points: [
      { x: 10, y: 10 },
      { x: 10 + (inches / 12) * ptPerFt, y: 10 },
    ],
    subject: '',
    label: size,
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle('length'),
    custom: {},
  });
  const plan = (size: string, lengths: number[], patch: Partial<ReturnType<typeof defaultCombineSettings>> = {}) => {
    const markups = lengths.map((l) => piece(size, l));
    const doc: DocState = { files: [], sheets: [sheet], markups, columns: defaultColumns().filter((c) => c.id !== 'member_size'), layers: defaultLayers(), settings: DEFAULT_SETTINGS, standardDetails: [] };
    return combinePlan(buildRows(doc), doc, { ...defaultCombineSettings(), ...patch })[0];
  };
  const ftIn = (f: number, i = 0) => f * FT + i;

  it('orders a piece as long as a stock length whole: no cut, no kerf, no allowance', () => {
    // 5 × 40'-0", 39'-10 1/4", 18'-0 13/16" of L3X3X1/4 (20' and 40' stock), kerf 1/8", no allowance.
    const p = plan('L3X3X1/4', [...Array(5).fill(ftIn(40)), ftIn(39, 10.25), ftIn(18, 13 / 16)], { allowance: 0 });
    expect(p.tooLong).toHaveLength(0);
    expect(p.full).toBe(5);
    expect(p.order).toEqual([
      { stock: ftIn(40), count: 6 },
      { stock: ftIn(20), count: 1 },
    ]);
    expect(p.bars.filter((b) => b.kind === 'full').every((b) => b.drop === 0 && b.pieces.length === 1)).toBe(true);
    // The cut ones keep the kerf.
    const cut = p.bars.filter((b) => !b.kind);
    expect(cut.map((b) => b.drop)).toEqual([1.625, ftIn(1, 11 + 1 / 16)]);
  });

  it('nests the cut rest of spliced pieces together instead of a bar each', () => {
    // 4 × 42' L (40' longest): four whole 40' bars and the four 2' rests on one 20' bar.
    const p = plan('L4X4X1/2', Array(4).fill(ftIn(42)));
    expect(p.tooLong).toHaveLength(4);
    expect(p.order).toEqual([
      { stock: ftIn(40), count: 4 },
      { stock: ftIn(20), count: 1 },
    ]);
    const rests = p.bars.find((b) => !b.kind)!;
    expect(rests.pieces.map((x) => x.length)).toEqual(Array(4).fill(ftIn(2)));
    expect(rests.pieces.every((x) => x.splice === ftIn(42))).toBe(true);
  });

  it('splices from the whole bars that order the least', () => {
    const w = defaultCombineSettings().stock.find((s) => s.shape === 'W')!.lengths;
    // 63': 65' ordered (40' whole + 23' cut from a 25', or 45' + 18' from a 20'), not 60' + 3' from a 20' (80').
    const sp = splicePlan(ftIn(63), w, 12, 0.125);
    const whole = sp.whole.reduce((a, b) => a + b, 0);
    expect(whole + sp.rest).toBe(ftIn(63));
    expect(whole + w.find((s) => s >= sp.rest + 12 + 0.125)!).toBe(ftIn(65));
    expect(sp.whole).toHaveLength(1);
    // 80': two whole 40' bars (or 60' + 20'), nothing cut.
    const two = splicePlan(ftIn(80), w, 12, 0.125);
    expect(two.whole.reduce((a, b) => a + b, 0) + two.rest).toBe(ftIn(80));
    expect([...two.whole, two.rest].every((x) => w.includes(x))).toBe(true);
  });

  it('trims a piece just under the longest stock from that bar rather than splicing it', () => {
    // 39'-6" with a 1'-0" allowance does not nest on 40', but one cut off a 40' bar takes it.
    const p = plan('L3X3X1/4', [ftIn(39, 6)]);
    expect(p.tooLong).toHaveLength(0);
    expect(p.bars).toHaveLength(1);
    expect(p.bars[0]).toMatchObject({ stock: ftIn(40), kind: 'trim' });
    expect(p.bars[0].drop).toBeCloseTo(6 - 0.125, 6);
  });
});
