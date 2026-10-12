// Overlay / compare math: aligning one sheet onto another and finding what changed.
// Framework-free so it can be unit tested; the canvas side lives in core/compare.ts.

import type { Pt, Rect } from '../types';

/** Maps a point on sheet B onto sheet A: pA = scale · R(rotation) · pB + (tx, ty). Page points, radians. */
export interface Similarity {
  scale: number;
  rotation: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Similarity = { scale: 1, rotation: 0, tx: 0, ty: 0 };

export function applySim(t: Similarity, p: Pt): Pt {
  const c = Math.cos(t.rotation) * t.scale;
  const s = Math.sin(t.rotation) * t.scale;
  return { x: c * p.x - s * p.y + t.tx, y: s * p.x + c * p.y + t.ty };
}

export function invertSim(t: Similarity): Similarity {
  const scale = 1 / t.scale;
  const rotation = -t.rotation;
  const c = Math.cos(rotation) * scale;
  const s = Math.sin(rotation) * scale;
  return { scale, rotation, tx: -(c * t.tx - s * t.ty), ty: -(s * t.tx + c * t.ty) };
}

/** As a canvas/CSS matrix [a, b, c, d, e, f]. */
export function simMatrix(t: Similarity): [number, number, number, number, number, number] {
  const c = Math.cos(t.rotation) * t.scale;
  const s = Math.sin(t.rotation) * t.scale;
  return [c, s, -s, c, t.tx, t.ty];
}

export interface PointPair {
  /** Point on sheet A. */
  a: Pt;
  /** The same feature on sheet B. */
  b: Pt;
}

/**
 * Least-squares similarity (scale, rotation, translation) taking the B points onto the A points.
 * One pair gives a pure shift.
 */
export function fitSimilarity(pairs: PointPair[]): Similarity | null {
  const n = pairs.length;
  if (!n) return null;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (const p of pairs) {
    ax += p.a.x;
    ay += p.a.y;
    bx += p.b.x;
    by += p.b.y;
  }
  ax /= n;
  ay /= n;
  bx /= n;
  by /= n;
  if (n === 1) return { scale: 1, rotation: 0, tx: ax - bx, ty: ay - by };
  let sxx = 0, sxy = 0, varB = 0;
  for (const p of pairs) {
    const qx = p.b.x - bx;
    const qy = p.b.y - by;
    const rx = p.a.x - ax;
    const ry = p.a.y - ay;
    sxx += qx * rx + qy * ry;
    sxy += qx * ry - qy * rx;
    varB += qx * qx + qy * qy;
  }
  if (varB < 1e-9) return { scale: 1, rotation: 0, tx: ax - bx, ty: ay - by };
  const rotation = Math.atan2(sxy, sxx);
  const scale = Math.hypot(sxx, sxy) / varB;
  const c = Math.cos(rotation) * scale;
  const s = Math.sin(rotation) * scale;
  return { scale, rotation, tx: ax - (c * bx - s * by), ty: ay - (s * bx + c * by) };
}

/** Deterministic pseudo-random numbers (so auto-align gives the same answer every time). */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export interface FitResult {
  t: Similarity;
  inliers: PointPair[];
  /** Root-mean-square residual of the inliers, in page points. */
  rms: number;
}

function residuals(t: Similarity, pairs: PointPair[], tol: number) {
  const inliers: PointPair[] = [];
  let sum = 0;
  for (const p of pairs) {
    const q = applySim(t, p.b);
    const d = Math.hypot(q.x - p.a.x, q.y - p.a.y);
    if (d <= tol) {
      inliers.push(p);
      sum += d * d;
    }
  }
  return { inliers, rms: inliers.length ? Math.sqrt(sum / inliers.length) : Infinity };
}

/** Plausible sheet-to-sheet alignment: roughly the same scale, at most a slight rotation. */
const plausible = (t: Similarity) => t.scale > 0.4 && t.scale < 2.5 && Math.abs(t.rotation) < (12 * Math.PI) / 180;

/** Robust similarity from matches that include some wrong pairs (RANSAC, then least squares on inliers). */
export function ransacSimilarity(pairs: PointPair[], tol = 6, iterations = 600): FitResult | null {
  if (pairs.length < 2) return null;
  const rand = rng(pairs.length * 7919 + 17);
  let best: FitResult | null = null;
  const tries = Math.min(iterations, (pairs.length * (pairs.length - 1)) / 2 + 50);
  for (let k = 0; k < tries; k++) {
    const i = Math.floor(rand() * pairs.length);
    let j = Math.floor(rand() * (pairs.length - 1));
    if (j >= i) j++;
    const p = pairs[i];
    const q = pairs[j];
    // Two points close together give a poorly defined rotation and scale.
    if (Math.hypot(p.b.x - q.b.x, p.b.y - q.b.y) < 40) continue;
    const t = fitSimilarity([p, q]);
    if (!t || !plausible(t)) continue;
    const r = residuals(t, pairs, tol);
    if (!best || r.inliers.length > best.inliers.length || (r.inliers.length === best.inliers.length && r.rms < best.rms)) best = { t, ...r };
  }
  if (!best || best.inliers.length < 2) return null;
  // Refine on the inliers (twice: the refit can pick up a few more).
  for (let k = 0; k < 2; k++) {
    const t = fitSimilarity(best.inliers);
    if (!t || !plausible(t)) break;
    const r = residuals(t, pairs, tol);
    if (r.inliers.length < best.inliers.length) break;
    best = { t, ...r };
  }
  return best;
}

export interface TextBox {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const textKey = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

/** Pairs of text that appears exactly once on each sheet (sheet titles, notes, grid bubbles…). */
export function uniqueTextPairs(a: TextBox[], b: TextBox[]): PointPair[] {
  const group = (items: TextBox[]) => {
    const m = new Map<string, TextBox[]>();
    for (const it of items) {
      const k = textKey(it.str);
      if (!k) continue;
      const list = m.get(k) ?? [];
      list.push(it);
      m.set(k, list);
    }
    return m;
  };
  const ga = group(a);
  const gb = group(b);
  const out: PointPair[] = [];
  for (const [k, la] of ga) {
    const lb = gb.get(k);
    if (la.length !== 1 || lb?.length !== 1) continue;
    const ta = la[0];
    const tb = lb[0];
    // Same text at a very different size is probably a different thing.
    const ha = Math.max(ta.h, 1);
    const hb = Math.max(tb.h, 1);
    if (ha / hb > 1.6 || hb / ha > 1.6) continue;
    out.push({ a: { x: ta.x + ta.w / 2, y: ta.y + ta.h / 2 }, b: { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 } });
  }
  return out;
}

/** After a first fit, pair repeated text too (each B item with the nearest same text on A). */
export function nearestTextPairs(a: TextBox[], b: TextBox[], t: Similarity, tol: number): PointPair[] {
  const byKey = new Map<string, Pt[]>();
  for (const it of a) {
    const k = textKey(it.str);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
    byKey.set(k, list);
  }
  const out: PointPair[] = [];
  for (const it of b) {
    const cands = byKey.get(textKey(it.str));
    if (!cands) continue;
    const pb = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    const q = applySim(t, pb);
    let best: Pt | null = null;
    let bd = tol;
    for (const c of cands) {
      const d = Math.hypot(c.x - q.x, c.y - q.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) out.push({ a: best, b: pb });
  }
  return out;
}

export interface TextAlignment extends FitResult {
  matches: number;
}

/** Align sheet B onto sheet A from their text. Null when there is not enough shared text. */
export function alignByText(a: TextBox[], b: TextBox[]): TextAlignment | null {
  const unique = uniqueTextPairs(a, b);
  const first = ransacSimilarity(unique, 12);
  if (!first || first.inliers.length < 3) return null;
  const all = nearestTextPairs(a, b, first.t, 8);
  const refined = all.length > first.inliers.length ? ransacSimilarity(all, 3) : null;
  const best = refined && refined.inliers.length >= first.inliers.length ? refined : first;
  return { ...best, matches: best.inliers.length };
}

// ---------------------------------------------------------------------------
// Image registration (scanned drawings without text): phase correlation

function fft1d(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, n: number, inverse: boolean) {
  const rr = new Float64Array(n);
  const ri = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    const o = y * n;
    rr.set(re.subarray(o, o + n));
    ri.set(im.subarray(o, o + n));
    fft1d(rr, ri, inverse);
    re.set(rr, o);
    im.set(ri, o);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rr[y] = re[y * n + x];
      ri[y] = im[y * n + x];
    }
    fft1d(rr, ri, inverse);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rr[y];
      im[y * n + x] = ri[y];
    }
  }
}

/**
 * Shift (dx, dy) in pixels that moves image B onto image A (both n×n, n a power of two, values
 * 0..1 with 1 = ink). `peak` is the correlation strength (higher is more certain).
 */
export function phaseCorrelate(a: Float32Array, b: Float32Array, n: number): { dx: number; dy: number; peak: number } {
  const ar = Float64Array.from(a);
  const ai = new Float64Array(n * n);
  const br = Float64Array.from(b);
  const bi = new Float64Array(n * n);
  fft2d(ar, ai, n, false);
  fft2d(br, bi, n, false);
  // Normalised cross-power spectrum A · conj(B) / |A · conj(B)|
  for (let i = 0; i < n * n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const m = ai[i] * br[i] - ar[i] * bi[i];
    const mag = Math.hypot(r, m) || 1;
    ar[i] = r / mag;
    ai[i] = m / mag;
  }
  fft2d(ar, ai, n, true);
  let best = 0;
  let bv = -Infinity;
  for (let i = 0; i < n * n; i++)
    if (ar[i] > bv) {
      bv = ar[i];
      best = i;
    }
  const px = best % n;
  const py = Math.floor(best / n);
  // Sub-pixel peak by fitting a parabola through the neighbours.
  const at = (x: number, y: number) => ar[((y + n) % n) * n + ((x + n) % n)];
  const sub = (l: number, c: number, r: number) => {
    const d = l - 2 * c + r;
    return d ? (0.5 * (l - r)) / d : 0;
  };
  let dx = px + sub(at(px - 1, py), bv, at(px + 1, py));
  let dy = py + sub(at(px, py - 1), bv, at(px, py + 1));
  if (dx > n / 2) dx -= n;
  if (dy > n / 2) dy -= n;
  return { dx, dy, peak: bv / (n * n) };
}

// ---------------------------------------------------------------------------
// Change detection on aligned ink masks (1 = ink)

export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** Grow ink by r pixels (square neighbourhood), so small misregistration is not reported as change. */
export function dilate(m: Mask, r: number): Mask {
  if (r <= 0) return m;
  const { w, h } = m;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  // Separable: rows, then columns. A pixel is set when ink lies within r on either side.
  const pass = (src: Uint8Array, dst: Uint8Array, len: number, lines: number, at: (line: number, k: number) => number) => {
    const last = new Float64Array(len);
    for (let l = 0; l < lines; l++) {
      let prev = -Infinity;
      for (let k = 0; k < len; k++) {
        if (src[at(l, k)]) prev = k;
        last[k] = prev;
      }
      let nextInk = Infinity;
      for (let k = len - 1; k >= 0; k--) {
        if (src[at(l, k)]) nextInk = k;
        if (k - last[k] <= r || nextInk - k <= r) dst[at(l, k)] = 1;
      }
    }
  };
  pass(m.data, tmp, w, h, (y, x) => y * w + x);
  pass(tmp, out, h, w, (x, y) => y * w + x);
  return { w, h, data: out };
}

export interface ChangeBox extends Rect {
  /** Ink only on sheet B (new), only on A (removed), or both. */
  kind: 'added' | 'removed' | 'changed';
  /** Changed ink, in pixels. */
  size: number;
}

/** Fraction of one mask's ink that lies on the other (dilated) mask: 1 when the drawings line up. */
export function inkAgreement(a: Mask, b: Mask, tolerance = 2): number {
  const da = dilate(a, tolerance);
  let total = 0;
  let hit = 0;
  for (let i = 0; i < b.data.length; i++) {
    if (!b.data[i]) continue;
    total++;
    if (da.data[i]) hit++;
  }
  return total ? hit / total : 0;
}

/**
 * Areas where the aligned drawings differ, as boxes in mask pixels. `tolerance` absorbs
 * misregistration, `group` merges nearby strokes into one change, `minSize` drops specks.
 */
export function findChanges(a: Mask, b: Mask, opts: { tolerance?: number; group?: number; minSize?: number } = {}): ChangeBox[] {
  const { w, h } = a;
  const tol = opts.tolerance ?? 2;
  const group = opts.group ?? 8;
  const minSize = opts.minSize ?? 12;
  const da = dilate(a, tol);
  const db = dilate(b, tol);
  const removed = new Uint8Array(w * h);
  const added = new Uint8Array(w * h);
  const diff = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (a.data[i] && !db.data[i]) removed[i] = diff[i] = 1;
    if (b.data[i] && !da.data[i]) added[i] = diff[i] = 1;
  }
  const grown = dilate({ w, h, data: diff }, group);
  const label = new Int32Array(w * h);
  const boxes: ChangeBox[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!grown.data[start] || label[start]) continue;
    next++;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, nAdd = 0, nRem = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      if (added[i] || removed[i]) {
        if (added[i]) nAdd++;
        if (removed[i]) nRem++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && grown.data[j] && !label[j]) {
          label[j] = next;
          stack.push(j);
        }
      }
    }
    const size = nAdd + nRem;
    if (size < minSize) continue;
    const kind = nAdd && nRem ? (Math.min(nAdd, nRem) / size > 0.15 ? 'changed' : nAdd > nRem ? 'added' : 'removed') : nAdd ? 'added' : 'removed';
    boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, kind, size });
  }
  return boxes.sort((p, q) => q.size - p.size);
}

// ---------------------------------------------------------------------------
// Text changes (vector drawings): text that has no identical twin in the same place on the other sheet

export interface TextChange extends Rect {
  kind: 'added' | 'removed';
  text: string;
}

/** Text on A missing from B (removed) and text on B missing from A (added), in A's page points. */
export function textChanges(a: TextBox[], b: TextBox[], t: Similarity, tol = 4): TextChange[] {
  const centre = (it: TextBox) => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
  const byKey = new Map<string, { p: Pt; used: boolean; it: TextBox }[]>();
  for (const it of a) {
    const k = textKey(it.str);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push({ p: centre(it), used: false, it });
    byKey.set(k, list);
  }
  const out: TextChange[] = [];
  for (const it of b) {
    const k = textKey(it.str);
    if (!k) continue;
    const q = applySim(t, centre(it));
    const twin = byKey.get(k)?.find((c) => !c.used && Math.hypot(c.p.x - q.x, c.p.y - q.y) <= tol);
    if (twin) {
      twin.used = true;
      continue;
    }
    const corners = [
      { x: it.x, y: it.y },
      { x: it.x + it.w, y: it.y },
      { x: it.x, y: it.y + it.h },
      { x: it.x + it.w, y: it.y + it.h },
    ].map((p) => applySim(t, p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    out.push({ kind: 'added', text: it.str, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  for (const list of byKey.values())
    for (const c of list) if (!c.used) out.push({ kind: 'removed', text: c.it.str, x: c.it.x, y: c.it.y, w: c.it.w, h: c.it.h });
  return out;
}

/** Merge boxes that touch or lie within `gap` of each other; added + removed in one place = changed. */
export function mergeBoxes<T extends Rect & { kind: 'added' | 'removed' | 'changed' }>(boxes: T[], gap: number): (Rect & { kind: T['kind'] | 'changed' })[] {
  const list: (Rect & { kind: 'added' | 'removed' | 'changed' })[] = boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind }));
  const near = (p: Rect, q: Rect) => p.x - gap <= q.x + q.w && q.x - gap <= p.x + p.w && p.y - gap <= q.y + q.h && q.y - gap <= p.y + p.h;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < list.length && !merged; i++)
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        if (!near(p, q)) continue;
        const x = Math.min(p.x, q.x);
        const y = Math.min(p.y, q.y);
        list[i] = { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y, kind: p.kind === q.kind ? p.kind : 'changed' };
        list.splice(j, 1);
        merged = true;
        break;
      }
  }
  return list;
}
