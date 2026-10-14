// Combine report: which stock lengths to order to cut every piece of each size, nested together.
//
// Pieces are the length measurements of the takeoff (and the material standard details add), by size
// (Member Size, else label). For each shape the user keeps the lengths that can be ordered (W: 20', 25',
// … 60'). Each bar keeps an allowance for the machine (about 1'-0"), and every cut a saw kerf. The plan
// uses as little ordered length as it can find: an exact search for small sizes, the best of several
// packing heuristics for larger ones.

import type { DocState } from '../types';
import { customColId, type Row } from './columns';
import { normName } from './formula';
import { plf } from './steelShapes';
import { subjectForSize } from './subjects';

/** Lengths that can be ordered for a shape (inches), e.g. W: 20', 25', 30'… */
export interface StockShape {
  shape: string;
  lengths: number[];
}

export interface CombineSettings {
  /** Kept on every bar for the machine (to hold it, end trim): inches. */
  allowance: number;
  /** Lost at every cut: inches. */
  kerf: number;
  stock: StockShape[];
  /** Stock lengths for shapes not in the list (empty: such sizes are not planned). */
  other: number[];
}

const ft = (n: number) => n * 12;

export function defaultCombineSettings(): CombineSettings {
  return {
    allowance: 12,
    kerf: 0.125,
    stock: [
      { shape: 'W', lengths: [20, 25, 30, 35, 40, 45, 50, 55, 60].map(ft) },
      { shape: 'HSS', lengths: [20, 24, 40, 48].map(ft) },
      { shape: 'L', lengths: [20, 40].map(ft) },
      { shape: 'C', lengths: [20, 40].map(ft) },
      { shape: 'MC', lengths: [20, 40].map(ft) },
      { shape: 'WT', lengths: [20, 40].map(ft) },
      { shape: 'S', lengths: [20, 40].map(ft) },
      { shape: 'HP', lengths: [40, 50, 60].map(ft) },
      { shape: 'PIPE', lengths: [21, 42].map(ft) },
    ],
    // Joists, rebar, plate, rods…: listed, not planned, until lengths are set for them.
    other: [],
  };
}

/** A piece to cut. */
export interface Piece {
  /** Inches. */
  length: number;
  /** The markup it comes from (the parent markup for standard detail material). */
  markupId: string;
  sheet: string;
  /** Material added by a standard detail, e.g. "Clip Angle". */
  detail?: string;
}

export interface Bar {
  /** Stock length, inches. */
  stock: number;
  pieces: Piece[];
  /** Left over after the pieces, kerfs and the machine allowance: inches. */
  drop: number;
}

export interface SizePlan {
  size: string;
  shape: string;
  pieces: Piece[];
  bars: Bar[];
  /** Stock lengths to order: length (inches) → how many. Longest first. */
  order: { stock: number; count: number }[];
  /** Pieces longer than the longest stock: they need a splice (planned as several bars). */
  tooLong: Piece[];
  /** No stock lengths for this shape: nothing planned. */
  noStock: boolean;
  /** Inches. */
  pieceLength: number;
  stockLength: number;
  dropLength: number;
  /** Pounds per foot, when the size is known. */
  plf: number;
}

// ---------------------------------------------------------------------------
// Packing

interface Packed {
  bars: { stock: number; items: number[] }[];
}

const EPS = 1e-6;

/** Space a set of pieces takes on a bar: their lengths, a kerf per cut, the machine allowance. */
const need = (lengths: number[], allowance: number, kerf: number) => lengths.reduce((s, l) => s + l, 0) + lengths.length * kerf + allowance;

/** The shortest stock length a set of pieces fits on (undefined: none). */
function shortestFit(total: number, stock: number[]): number | undefined {
  return stock.find((s) => total <= s + EPS);
}

/** First-fit or best-fit decreasing on bars of the longest stock, each then cut down to the shortest that holds its pieces. */
function decreasing(lengths: number[], stock: number[], allowance: number, kerf: number, best: boolean, open: number): Packed {
  const order = lengths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
  const bars: { cap: number; used: number; items: number[] }[] = [];
  for (const i of order) {
    const add = lengths[i] + kerf;
    let pick = -1;
    for (let b = 0; b < bars.length; b++) {
      if (bars[b].used + add > bars[b].cap + EPS) continue;
      if (!best) {
        pick = b;
        break;
      }
      if (pick < 0 || bars[b].cap - bars[b].used < bars[pick].cap - bars[pick].used) pick = b;
    }
    if (pick < 0) {
      bars.push({ cap: open, used: allowance, items: [] });
      pick = bars.length - 1;
    }
    bars[pick].used += add;
    bars[pick].items.push(i);
  }
  return { bars: bars.map((b) => ({ stock: shortestFit(b.used, stock) ?? b.cap, items: b.items })) };
}

const cost = (p: Packed) => p.bars.reduce((s, b) => s + b.stock, 0);
const longestBar = (p: Packed) => p.bars.reduce((s, b) => Math.max(s, b.stock), 0);
/** Less ordered length; then fewer bars (fewer cuts and drops to handle); then shorter bars. */
const better = (a: Packed, b: Packed) => {
  const d = cost(a) - cost(b);
  if (Math.abs(d) > EPS) return d < 0;
  if (a.bars.length !== b.bars.length) return a.bars.length < b.bars.length;
  return longestBar(a) < longestBar(b) - EPS;
};

/**
 * The least total stock length for a few pieces: every way of grouping them (3^n subsets). Ties go to
 * the plan with fewer bars, then to the one with the shorter longest bar.
 */
function exact(lengths: number[], stock: number[], allowance: number, kerf: number): Packed {
  const n = lengths.length;
  const full = (1 << n) - 1;
  const fit = new Float64Array(1 << n).fill(Infinity);
  for (let m = 1; m <= full; m++) {
    let total = allowance;
    for (let i = 0; i < n; i++) if (m & (1 << i)) total += lengths[i] + kerf;
    fit[m] = shortestFit(total, stock) ?? Infinity;
  }
  const best = new Float64Array(1 << n).fill(Infinity);
  const longest = new Float64Array(1 << n).fill(Infinity);
  const bars = new Float64Array(1 << n).fill(Infinity);
  const choice = new Int32Array(1 << n);
  best[0] = 0;
  longest[0] = 0;
  bars[0] = 0;
  for (let m = 1; m <= full; m++) {
    const low = m & -m; // the group holding the first piece left
    for (let sub = m; sub; sub = (sub - 1) & m) {
      if (!(sub & low) || fit[sub] === Infinity) continue;
      const rest = m ^ sub;
      const c = fit[sub] + best[rest];
      const l = Math.max(fit[sub], longest[rest]);
      const k = bars[rest] + 1;
      const d = c - best[m];
      if (d < -EPS || (Math.abs(d) <= EPS && (k < bars[m] || (k === bars[m] && l < longest[m] - EPS)))) {
        best[m] = c;
        longest[m] = l;
        bars[m] = k;
        choice[m] = sub;
      }
    }
  }
  const out: Packed = { bars: [] };
  for (let m = full; m; m ^= choice[m]) {
    const sub = choice[m];
    const items: number[] = [];
    for (let i = 0; i < n; i++) if (sub & (1 << i)) items.push(i);
    out.bars.push({ stock: fit[sub], items });
  }
  return out;
}

/** Up to this many pieces of one size are planned exactly. */
const EXACT_MAX = 12;

/**
 * Stock bars for pieces (inches) that each fit on the longest stock length: the least total ordered
 * length found, then the fewest bars.
 */
export function packPieces(lengths: number[], stockLengths: number[], allowance: number, kerf: number): Packed {
  const stock = [...new Set(stockLengths.filter((s) => s > 0))].sort((a, b) => a - b);
  if (!lengths.length || !stock.length) return { bars: [] };
  if (lengths.length <= EXACT_MAX) return exact(lengths, stock, allowance, kerf);
  let best: Packed | null = null;
  // Open new bars at each stock length in turn; first fit and best fit.
  for (const open of [...stock].reverse()) {
    if (lengths.some((l) => need([l], allowance, kerf) > open + EPS)) continue;
    for (const bf of [false, true]) {
      const p = decreasing(lengths, stock, allowance, kerf, bf, open);
      if (!best || better(p, best)) best = p;
    }
  }
  return best ?? { bars: [] };
}

// ---------------------------------------------------------------------------
// From the takeoff

/** The stock lengths for a shape (case does not matter), else the ones for other shapes. */
export function stockFor(settings: CombineSettings, shape: string): number[] {
  const s = settings.stock.find((x) => normName(x.shape) === normName(shape));
  return s ? s.lengths : settings.other;
}

/**
 * Pieces of the takeoff by size: length and polylength measurements (one piece each, times Qty) and
 * the lengths standard details add. The size is the Member Size, else the label.
 */
export function collectPieces(rows: Row[], doc: DocState): Map<string, { size: string; pieces: Piece[] }> {
  const byNorm = new Map(doc.columns.map((c) => [normName(c.name), c]));
  const sizeCol = byNorm.get('membersize') ?? byNorm.get('size');
  const qtyCol = byNorm.get('qty');
  const out = new Map<string, { size: string; pieces: Piece[] }>();
  for (const r of rows) {
    const m = r.markup;
    const size = String((sizeCol ? r.values[customColId(sizeCol)] : '') || m.label || '').trim();
    if (!size) continue;
    let length = 0;
    let count = 0;
    if (r.detail) {
      const pieces = Math.ceil(Number(r.values.count) || 0);
      const total = r.measure.length ?? 0;
      if (pieces <= 0 || total <= 0) continue;
      length = total / pieces;
      count = pieces;
    } else {
      if (m.type !== 'length' && m.type !== 'polylength') continue;
      length = r.measure.length ?? 0;
      const qty = qtyCol ? Number(r.values[customColId(qtyCol)]) : 1;
      count = Number.isFinite(qty) && qty > 0 ? Math.ceil(qty) : 1;
    }
    if (length <= 0) continue;
    const key = normName(size);
    const entry = out.get(key) ?? { size, pieces: [] };
    if (!out.has(key)) out.set(key, entry);
    for (let i = 0; i < count; i++)
      entry.pieces.push({ length, markupId: r.detail ? r.detail.parentId : m.id, sheet: r.display.page ?? '', detail: r.detail ? m.subject || r.detail.detailName : undefined });
  }
  return out;
}

/** The plan for every size: what to order and how to cut it. */
export function combinePlan(rows: Row[], doc: DocState, settings: CombineSettings): SizePlan[] {
  const shapes = [...settings.stock.map((s) => s.shape)];
  const plans: SizePlan[] = [];
  for (const { size, pieces } of collectPieces(rows, doc).values()) {
    const shape = subjectForSize(size, shapes) ?? '';
    const stock = [...stockFor(settings, shape)].sort((a, b) => a - b);
    const longest = stock[stock.length - 1] ?? 0;
    const fits = (p: Piece) => longest > 0 && need([p.length], settings.allowance, settings.kerf) <= longest + EPS;
    const normal = pieces.filter(fits);
    const tooLong = longest > 0 ? pieces.filter((p) => !fits(p)) : [];
    const bars: Bar[] = [];
    if (stock.length) {
      const packed = packPieces(
        normal.map((p) => p.length),
        stock,
        settings.allowance,
        settings.kerf,
      );
      for (const b of packed.bars) {
        const ps = b.items.map((i) => normal[i]).sort((a, c) => c.length - a.length);
        bars.push({ stock: b.stock, pieces: ps, drop: b.stock - need(ps.map((p) => p.length), settings.allowance, settings.kerf) });
      }
      // Longer than any stock: whole bars of the longest, spliced, and the rest on the shortest that holds it.
      for (const p of tooLong) {
        const usable = longest - settings.allowance - settings.kerf;
        let left = p.length;
        while (left > usable + EPS) {
          bars.push({ stock: longest, pieces: [{ ...p, length: usable }], drop: 0 });
          left -= usable;
        }
        const s = shortestFit(need([left], settings.allowance, settings.kerf), stock) ?? longest;
        bars.push({ stock: s, pieces: [{ ...p, length: left }], drop: s - need([left], settings.allowance, settings.kerf) });
      }
    }
    bars.sort((a, b) => b.stock - a.stock || a.drop - b.drop);
    const counts = new Map<number, number>();
    for (const b of bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1);
    const pieceLength = pieces.reduce((s, p) => s + p.length, 0);
    const stockLength = bars.reduce((s, b) => s + b.stock, 0);
    plans.push({
      size,
      shape,
      pieces: [...pieces].sort((a, b) => b.length - a.length),
      bars,
      order: [...counts].map(([stock, count]) => ({ stock, count })).sort((a, b) => b.stock - a.stock),
      tooLong,
      noStock: !stock.length,
      pieceLength,
      stockLength,
      dropLength: bars.reduce((s, b) => s + Math.max(0, b.drop), 0),
      plf: plf(size),
    });
  }
  const shapeIndex = (s: string) => {
    const i = shapes.findIndex((x) => normName(x) === normName(s));
    return i < 0 ? shapes.length : i;
  };
  return plans.sort((a, b) => shapeIndex(a.shape) - shapeIndex(b.shape) || a.size.localeCompare(b.size, undefined, { numeric: true }));
}
