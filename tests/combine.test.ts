import { describe, expect, it } from 'vitest';
import { packPieces, defaultCombineSettings } from '../src/core/combine';

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
