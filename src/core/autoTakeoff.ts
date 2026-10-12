// Automatic takeoff: finds the member-size labels on a framing plan (W24x55, HSS8x4x1/4, Pipe 4 Std…)
// and the line each one labels, so beams and tubing can be taken off as length measurements in one go.
//
//   1. Line work: every straight stroked segment of the PDF, with its line weight and dash
//      (thin filled bars, as some CAD programs draw heavy lines, count as strokes too).
//   2. Labels: text matching a steel size, with its position and direction.
//   3. Matching: a label belongs to the line that runs parallel to it, directly beside it, under the
//      label's middle. Solid heavy lines win over dashed and hairline ones (grid and dimension lines).
//      Each label takes one line and each line one label.
//
// Pure functions: the PDF side (operator list, text) is passed in, so this runs in tests too.

import type { Markup, Pt } from '../types';
import { findPreset, type ScalePreset } from './units';

export interface Stroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Line weight in page points. */
  width: number;
  dashed: boolean;
}

/** A text run in page points: origin on the baseline, direction `angle` (radians, y down). */
export interface PlacedText {
  str: string;
  ox: number;
  oy: number;
  angle: number;
  /** Advance width along the text direction. */
  w: number;
  /** Font height. */
  fh: number;
}

export type MemberFamily = 'beam' | 'channel' | 'tube' | 'angle';

export const MEMBER_FAMILIES: { id: MemberFamily; label: string; hint: string; on: boolean }[] = [
  { id: 'beam', label: 'Beams', hint: 'W, S, M and HP shapes', on: true },
  { id: 'tube', label: 'Tubing', hint: 'HSS (rectangular, square, round), TS and Pipe', on: true },
  { id: 'channel', label: 'Channels', hint: 'C and MC shapes', on: true },
  { id: 'angle', label: 'Angles', hint: 'L and 2L shapes (lintels, ledgers)', on: false },
];

export interface MemberLabel {
  size: string;
  family: MemberFamily;
  /** The text the size was read from. */
  text: string;
  /** Box of the size within the text, in the text's own frame. */
  o: Pt;
  u: Pt; // along the text
  v: Pt; // up from the baseline
  s0: number;
  s1: number;
  fh: number;
}

export type EndKind = 'end' | 'column' | 'midpoint';

export interface FoundMember {
  id: string;
  size: string;
  family: MemberFamily;
  text: string;
  p1: Pt;
  p2: Pt;
  /** Line weight of the member line. */
  width: number;
  dashed: boolean;
  /**
   * What each end (p1, p2) stops at: the end of the drawn line, a column symbol on the line, or – where
   * a line carries on past several labels with nothing between them – the midpoint between two labels.
   */
  ends?: [EndKind, EndKind];
  /** Where the label is (axis-aligned box, page points). */
  labelBox: { x: number; y: number; w: number; h: number };
  /** An existing length markup already covers this member. */
  existingId?: string;
}

// ---------------------------------------------------------------------------
// Line work

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const MAX_STROKES = 400_000;
const MAX_BOXES = 50_000;

/** A small closed shape (column symbol: square, rectangle, I-shape, circle), as its bounding box. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Column symbols are small and roughly square. */
const BOX_MIN = 2.5;
const BOX_MAX = 40;
const BOX_ASPECT = 1.6;

interface SubPath {
  /** On-curve points in device space. */
  pts: Pt[];
  /** straight[i]: the segment from pts[i] to pts[i + 1] is a straight line (not a curve). */
  straight: boolean[];
  closed: boolean;
}

/**
 * The line work of a page from its pdf.js operator list: straight segments with their line weight
 * and dash, and small closed shapes (column symbols).
 * `ops` is pdfjs.OPS; `base` the viewport transform (PDF space → page points, y down).
 */
export function extractVectors(fnArray: number[], argsArray: unknown[], ops: Record<string, number>, base: number[]): { strokes: Stroke[]; boxes: Box[] } {
  const out: Stroke[] = [];
  const boxes: Box[] = [];
  let ctm = base.slice(0, 6) as Mat;
  let lw = 1;
  let dashed = false;
  const stack: { ctm: Mat; lw: number; dashed: boolean }[] = [];
  let path: SubPath[] = [];
  const tp = (x: number, y: number): Pt => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] });
  const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;

  const strokePath = () => {
    const w = lw * scaleOf(ctm);
    for (const sp of path) {
      const n = sp.pts.length;
      for (let i = 1; i < n && out.length < MAX_STROKES; i++) {
        if (!sp.straight[i - 1]) continue;
        const a = sp.pts[i - 1];
        const b = sp.pts[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: w, dashed });
      }
      if (sp.closed && n > 2) {
        const a = sp.pts[n - 1];
        const b = sp.pts[0];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 1 && out.length < MAX_STROKES) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: w, dashed });
      }
    }
  };
  // Filled long thin quadrilaterals are heavy lines drawn as shapes: use their centre line.
  const fillPath = () => {
    for (const sp of path) {
      if (sp.straight.some((x) => !x)) continue;
      let pts = sp.pts;
      if (pts.length === 5 && near(pts[4], pts[0])) pts = pts.slice(0, 4);
      if (pts.length !== 4) continue;
      const e = [0, 1, 2, 3].map((i) => Math.hypot(pts[(i + 1) % 4].x - pts[i].x, pts[(i + 1) % 4].y - pts[i].y));
      // Opposite sides equal (a parallelogram), one pair much longer than the other.
      if (Math.abs(e[0] - e[2]) > 0.05 * Math.max(e[0], e[2]) + 0.2 || Math.abs(e[1] - e[3]) > 0.05 * Math.max(e[1], e[3]) + 0.2) continue;
      const long = e[0] >= e[1] ? 0 : 1;
      const len = e[long];
      const thick = e[1 - long];
      if (thick > 14 || len < 6 * thick || thick < 0.2) continue;
      const mid = (p: Pt, q: Pt) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      // Centre line joins the midpoints of the two short sides.
      const a = long === 0 ? mid(pts[3], pts[0]) : mid(pts[0], pts[1]);
      const b = long === 0 ? mid(pts[1], pts[2]) : mid(pts[2], pts[3]);
      if (out.length < MAX_STROKES) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: thick, dashed: false });
    }
  };
  // Small closed, roughly square shapes, stroked or filled: candidate column symbols.
  const collectBoxes = () => {
    for (const sp of path) {
      const n = sp.pts.length;
      if (n < 3 || !(sp.closed || near(sp.pts[n - 1], sp.pts[0])) || boxes.length >= MAX_BOXES) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const q of sp.pts) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x);
        y1 = Math.max(y1, q.y);
      }
      const w = x1 - x0;
      const h = y1 - y0;
      if (Math.min(w, h) < BOX_MIN || Math.max(w, h) > BOX_MAX || Math.max(w, h) > BOX_ASPECT * Math.min(w, h)) continue;
      boxes.push({ x: x0, y: y0, w, h });
    }
  };

  const O = ops;
  const STROKES = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  const FILLS = new Set([O.fill, O.eoFill]);
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];
    if (fn === O.save) stack.push({ ctm, lw, dashed });
    else if (fn === O.restore) {
      const g = stack.pop();
      if (g) ({ ctm, lw, dashed } = g);
    } else if (fn === O.transform) ctm = mul(ctm, args as Mat);
    else if (fn === O.setLineWidth) lw = Number(args[0]) || 0;
    else if (fn === O.setDash) dashed = Array.isArray(args[0]) && (args[0] as number[]).some((n) => n > 0);
    else if (fn === O.setGState) {
      for (const [k, v] of (args[0] as [string, unknown][]) ?? []) {
        if (k === 'LW') lw = Number(v) || 0;
        else if (k === 'D' && Array.isArray(v)) dashed = Array.isArray(v[0]) && (v[0] as number[]).some((n) => n > 0);
      }
    } else if (fn === O.paintFormXObjectBegin) {
      stack.push({ ctm, lw, dashed });
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as Mat);
    } else if (fn === O.paintFormXObjectEnd) {
      const g = stack.pop();
      if (g) ({ ctm, lw, dashed } = g);
    } else if (fn === O.constructPath) {
      const [subOps, coords] = args as [number[], number[]];
      let j = 0;
      let cur: SubPath | undefined = path[path.length - 1];
      const start = (p: Pt): SubPath => {
        const sp: SubPath = { pts: [p], straight: [], closed: false };
        path.push(sp);
        return sp;
      };
      // After closepath a new segment starts a new subpath at the closed one's start.
      const open = () => (cur && !cur.closed ? cur : (cur = start(cur ? cur.pts[0] : { x: 0, y: 0 })));
      for (const op of subOps) {
        if (op === O.moveTo) cur = start(tp(coords[j++], coords[j++]));
        else if (op === O.lineTo) {
          const p = tp(coords[j++], coords[j++]);
          const sp = open();
          sp.pts.push(p);
          sp.straight.push(true);
        } else if (op === O.rectangle) {
          const x = coords[j++];
          const y = coords[j++];
          const w = coords[j++];
          const h = coords[j++];
          const r = start(tp(x, y));
          r.pts.push(tp(x + w, y), tp(x + w, y + h), tp(x, y + h));
          r.straight.push(true, true, true);
          r.closed = true;
          cur = r;
        } else if (op === O.curveTo || op === O.curveTo2 || op === O.curveTo3) {
          j += op === O.curveTo ? 4 : 2;
          const p = tp(coords[j++], coords[j++]);
          const sp = open();
          sp.pts.push(p);
          sp.straight.push(false);
        } else if (op === O.closePath) {
          if (cur) cur.closed = true;
        }
      }
    } else if (STROKES.has(fn)) {
      strokePath();
      if (fn !== O.stroke && fn !== O.closeStroke) fillPath();
      collectBoxes();
      path = [];
    } else if (FILLS.has(fn)) {
      fillPath();
      collectBoxes();
      path = [];
    } else if (fn === O.endPath) path = [];
  }
  return { strokes: out, boxes };
}

/** Straight segments of a page's line work (see extractVectors). */
export function extractStrokes(fnArray: number[], argsArray: unknown[], ops: Record<string, number>, base: number[]): Stroke[] {
  return extractVectors(fnArray, argsArray, ops, base).strokes;
}

/** A pdf.js text item placed on the page (viewport transform `base`). */
export function placeText(str: string, transform: number[], width: number, base: number[]): PlacedText {
  const t = mul(base.slice(0, 6) as Mat, transform.slice(0, 6) as Mat);
  return { str, ox: t[4], oy: t[5], angle: Math.atan2(t[1], t[0]), w: width * Math.hypot(base[0], base[1]), fh: Math.hypot(t[2], t[3]) };
}

// ---------------------------------------------------------------------------
// Labels

const DIM = String.raw`(?:\d+[- ]\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const X = String.raw`\s?[xX×]\s?`;
const PATTERNS: { family: MemberFamily; re: RegExp; size: (m: RegExpExecArray) => string }[] = [
  { family: 'tube', re: new RegExp(String.raw`\b(HSS|TS)\s?(${DIM})${X}(${DIM})${X}(${DIM})(?![\d/])`, 'g'), size: (m) => `HSS${d(m[2])}x${d(m[3])}x${d(m[4])}` },
  { family: 'tube', re: new RegExp(String.raw`\bHSS\s?(${DIM})${X}(${DIM})(?![\d/]|\s?[xX×]\s?\d)`, 'g'), size: (m) => `HSS${d(m[1])}x${d(m[2])}` },
  {
    family: 'tube',
    re: new RegExp(String.raw`\bPIPE\s?(${DIM})\s?(?:"|in\.?|Ø)?\s?(STD|XXS|XS|X-STRONG|XX-STRONG|EXTRA STRONG|SCH(?:EDULE)?\.?\s?\d+)\b`, 'gi'),
    size: (m) => `Pipe ${d(m[1])} ${pipeGrade(m[2])}`,
  },
  { family: 'beam', re: new RegExp(String.raw`\b(W|S|M|HP)\s?(\d{1,2}(?:\.\d+)?)${X}(\d{1,3}(?:\.\d+)?)(?![\d/]|\s?[xX×])`, 'g'), size: (m) => `${m[1]}${m[2]}x${m[3]}` },
  { family: 'channel', re: new RegExp(String.raw`\b(C|MC)\s?(\d{1,2})${X}(\d{1,3}(?:\.\d+)?)(?![\d/]|\s?[xX×])`, 'g'), size: (m) => `${m[1]}${m[2]}x${m[3]}` },
  { family: 'angle', re: new RegExp(String.raw`\b(2L|L)\s?(${DIM})${X}(${DIM})${X}(${DIM})(?![\d/])`, 'g'), size: (m) => `${m[1]}${d(m[2])}x${d(m[3])}x${d(m[4])}` },
];
const d = (s: string) => s.trim().replace(/\s+/, '-').replace(/^\./, '0.');
function pipeGrade(g: string) {
  const u = g.toUpperCase().replace(/\s+/g, ' ');
  if (u === 'STD') return 'Std';
  if (u === 'XS' || u === 'X-STRONG' || u === 'EXTRA STRONG') return 'XS';
  if (u === 'XXS' || u === 'XX-STRONG') return 'XXS';
  return u.replace(/^SCH(?:EDULE)?\.?\s?/, 'Sch ');
}

/** Text naming columns or posts: those are counted, not measured. */
const COLUMN_WORDS = /\b(COL(UMN)?S?|COL\.|POSTS?)\b/i;

/** Member sizes in the page text, with where each one sits. */
export function findMemberLabels(texts: PlacedText[], families: MemberFamily[]): MemberLabel[] {
  const fams = new Set(families);
  const out: MemberLabel[] = [];
  for (const t of texts) {
    if (!t.str.trim() || COLUMN_WORDS.test(t.str)) continue;
    const taken: [number, number][] = [];
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(t.str))) {
        const a = m.index;
        const b = a + m[0].length;
        if (taken.some(([x, y]) => a < y && b > x)) continue;
        taken.push([a, b]);
        if (!fams.has(p.family)) continue;
        const n = Math.max(1, t.str.length);
        const u = { x: Math.cos(t.angle), y: Math.sin(t.angle) };
        out.push({
          size: p.size(m),
          family: p.family,
          text: t.str.trim(),
          o: { x: t.ox, y: t.oy },
          u,
          v: { x: u.y, y: -u.x },
          // Character positions are estimated from the run's advance width.
          s0: (a / n) * t.w,
          s1: (b / n) * t.w,
          fh: t.fh,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching labels to lines

export interface MatchOptions {
  /** Max gap between the label and its line, in font heights. */
  maxGap?: number;
  /** Lines shorter than this (page points) are not members. */
  minLength?: number;
  /** Small closed shapes on the page (column symbols): a member line running through one stops there. */
  boxes?: Box[];
}

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });

/** Same segment drawn more than once (bold by over-striking, overlapping layers): keep one. */
function dedupe(strokes: Stroke[]): Stroke[] {
  const best = new Map<string, Stroke>();
  const r = (n: number) => Math.round(n * 2) / 2;
  for (const s of strokes) {
    const [a, b] = s.x1 < s.x2 || (s.x1 === s.x2 && s.y1 <= s.y2) ? [`${r(s.x1)},${r(s.y1)}`, `${r(s.x2)},${r(s.y2)}`] : [`${r(s.x2)},${r(s.y2)}`, `${r(s.x1)},${r(s.y1)}`];
    const k = `${a};${b}`;
    const o = best.get(k);
    if (!o || (o.dashed && !s.dashed) || (o.dashed === s.dashed && s.width > o.width)) best.set(k, s);
  }
  return [...best.values()];
}

/** Grid of strokes by cell for neighbourhood lookups. */
function strokeGrid(strokes: Stroke[], cell: number) {
  const grid = new Map<string, number[]>();
  strokes.forEach((s, i) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const steps = Math.max(1, Math.ceil(len / (cell / 2)));
    const seen = new Set<string>();
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const key = `${Math.floor((s.x1 + (s.x2 - s.x1) * t) / cell)},${Math.floor((s.y1 + (s.y2 - s.y1) * t) / cell)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let a = grid.get(key);
      if (!a) grid.set(key, (a = []));
      a.push(i);
    }
  });
  return (x0: number, y0: number, x1: number, y1: number) => {
    const found = new Set<number>();
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++)
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) for (const i of grid.get(`${cx},${cy}`) ?? []) found.add(i);
    return found;
  };
}

function labelCorners(l: MemberLabel): Pt[] {
  const at = (s: number, t: number) => ({ x: l.o.x + l.u.x * s + l.v.x * t, y: l.o.y + l.u.y * s + l.v.y * t });
  const lo = -0.22 * l.fh;
  const hi = 0.78 * l.fh;
  return [at(l.s0, lo), at(l.s1, lo), at(l.s1, hi), at(l.s0, hi)];
}

// A continuous line: direction u, normal n, offset d (= p·n) and extent [t0, t1] along u (= p·u).
interface Run {
  u: Pt;
  n: Pt;
  d: number;
  t0: number;
  t1: number;
  width: number;
  dashed: boolean;
}
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const runPoint = (r: Run, t: number): Pt => ({ x: r4(r.u.x * t + r.n.x * r.d), y: r4(r.u.y * t + r.n.y * r.d) });

/** Line directions are grouped in [WRAP, WRAP + π): away from the common 0° and 90°. */
const WRAP = -1.27;

/**
 * Collinear strokes that touch or nearly touch, joined into continuous lines: a beam drawn in pieces
 * (broken where other members frame in, or running through the columns) becomes one line.
 */
export function joinCollinear(strokes: Stroke[]): { p1: Pt; p2: Pt; width: number; dashed: boolean }[] {
  return buildRuns(strokes).map((r) => ({ p1: runPoint(r, r.t0), p2: runPoint(r, r.t1), width: r.width, dashed: r.dashed }));
}

function buildRuns(strokes: Stroke[]): Run[] {
  const TH = 0.012;
  const items = strokes.map((s) => {
    let th = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    while (th < WRAP) th += Math.PI;
    while (th >= WRAP + Math.PI) th -= Math.PI;
    const u = { x: Math.cos(th), y: Math.sin(th) };
    const n = { x: -u.y, y: u.x };
    const ta = s.x1 * u.x + s.y1 * u.y;
    const tb = s.x2 * u.x + s.y2 * u.y;
    const d = ((s.x1 + s.x2) / 2) * n.x + ((s.y1 + s.y2) / 2) * n.y;
    return { s, th, u, n, d, t0: Math.min(ta, tb), t1: Math.max(ta, tb), len: Math.abs(tb - ta) };
  });
  // Union pieces with the same direction, the same offset, and the same look.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const bins = new Map<string, number[]>();
  items.forEach((it, i) => {
    const kt = Math.round(it.th / TH);
    const kd = Math.round(it.d);
    for (let a = kt - 1; a <= kt + 1; a++)
      for (let b = kd - 1; b <= kd + 1; b++)
        for (const j of bins.get(`${a},${b}`) ?? []) {
          const o = items[j];
          const w = Math.max(it.s.width, o.s.width);
          if (o.s.dashed !== it.s.dashed || Math.abs(o.th - it.th) > TH || Math.abs(o.d - it.d) > Math.max(0.6, 0.35 * w)) continue;
          if (w > 1.8 * Math.max(0.1, Math.min(it.s.width, o.s.width))) continue;
          parent[find(i)] = find(j);
        }
    const key = `${kt},${kd}`;
    const list = bins.get(key);
    if (list) list.push(i);
    else bins.set(key, [i]);
  });
  const groups = new Map<number, typeof items>();
  items.forEach((it, i) => {
    const g = find(i);
    const list = groups.get(g);
    if (list) list.push(it);
    else groups.set(g, [it]);
  });
  // Within each group, pieces whose gaps are small are one line.
  const runs: Run[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.t0 - b.t0);
    let cur: (typeof list)[number][] = [];
    let end = -Infinity;
    const flush = () => {
      if (!cur.length) return;
      const total = cur.reduce((n, x) => n + x.len, 0) || 1;
      const ref = cur.reduce((a, b) => (b.len > a.len ? b : a));
      runs.push({
        u: ref.u,
        n: ref.n,
        d: cur.reduce((n, x) => n + x.d * x.len, 0) / total,
        t0: Math.min(...cur.map((x) => x.t0)),
        t1: Math.max(...cur.map((x) => x.t1)),
        width: Math.max(...cur.map((x) => x.s.width)),
        dashed: ref.s.dashed,
      });
      cur = [];
    };
    for (const it of list) {
      const gapTol = Math.max(2, 2 * it.s.width);
      if (cur.length && it.t0 > end + gapTol) flush();
      cur.push(it);
      end = Math.max(end, it.t1);
    }
    flush();
  }
  return runs;
}

/** Positions (along the run) of the column symbols the run passes through, inside the run. */
function columnsOn(r: Run, boxes: Box[]): number[] {
  const ts: number[] = [];
  for (const b of boxes) {
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const off = Math.abs(dot(c, r.n) - r.d);
    if (off > Math.max(Math.min(b.w, b.h) / 2, 1.5) + r.width / 2 + 0.5) continue;
    const t = dot(c, r.u);
    if (t > r.t0 + 0.5 && t < r.t1 - 0.5) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  // The same column drawn twice (outline and fill) counts once.
  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1);
}

/** Pair each label with the member line it names, and find where that member starts and stops. */
export function matchMembers(labels: MemberLabel[], strokes: Stroke[], opts: MatchOptions = {}): FoundMember[] {
  const maxGapK = opts.maxGap ?? 1.6;
  const minLength = opts.minLength ?? 12;
  const boxes = opts.boxes ?? [];
  const runs = buildRuns(dedupe(strokes)).filter((r) => r.t1 - r.t0 >= minLength);
  const lines: Stroke[] = runs.map((r) => {
    const a = runPoint(r, r.t0);
    const b = runPoint(r, r.t1);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: r.width, dashed: r.dashed };
  });
  const near = strokeGrid(lines, 48);
  const sinTol = Math.sin((8 * Math.PI) / 180);

  // Each label takes the line it sits beside; a long line can carry several labels.
  const onRun = new Map<number, { li: number; tm: number; ta: number; tb: number }[]>();
  labels.forEach((l, li) => {
    const corners = labelCorners(l);
    const maxGap = maxGapK * l.fh + 3;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const pad = maxGap + 8;
    const mid = (l.s0 + l.s1) / 2;
    const labelLen = l.s1 - l.s0;
    let best: { si: number; score: number } | null = null;
    for (const si of near(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad)) {
      const s = lines[si];
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const dir = { x: (s.x2 - s.x1) / len, y: (s.y2 - s.y1) / len };
      // Parallel to the text (either way round).
      if (Math.abs(dir.x * l.u.y - dir.y * l.u.x) > sinTol) continue;
      if (len < Math.max(minLength, 0.4 * labelLen)) continue;
      // Along the text: the label's middle must sit over the line.
      const t1 = dot(sub({ x: s.x1, y: s.y1 }, l.o), l.u);
      const t2 = dot(sub({ x: s.x2, y: s.y2 }, l.o), l.u);
      if (mid < Math.min(t1, t2) - 2 || mid > Math.max(t1, t2) + 2) continue;
      // Across: where the line passes the label's middle, measured up from the baseline.
      const k = (mid - t1) / (t2 - t1 || 1);
      const at = { x: s.x1 + (s.x2 - s.x1) * k, y: s.y1 + (s.y2 - s.y1) * k };
      const v = dot(sub(at, l.o), l.v);
      const lo = -0.22 * l.fh;
      const hi = 0.78 * l.fh;
      const raw = v < lo ? lo - v : v > hi ? v - hi : 0;
      const gap = Math.max(0, raw - s.width / 2);
      if (gap > maxGap) continue;
      // Grid lines, hidden lines and hairline dimension lines are rarely the member.
      const score = gap + (s.dashed ? 40 : 0) + (s.width < 0.9 ? 6 : 0) - Math.min(s.width, 6) * 0.25;
      if (!best || score < best.score) best = { si, score };
    }
    if (!best) return;
    const r = runs[best.si];
    const along = corners.map((c) => dot(c, r.u));
    const middle = { x: l.o.x + l.u.x * mid + l.v.x * 0.28 * l.fh, y: l.o.y + l.u.y * mid + l.v.y * 0.28 * l.fh };
    const list = onRun.get(best.si) ?? [];
    list.push({ li, tm: dot(middle, r.u), ta: Math.min(...along), tb: Math.max(...along) });
    onRun.set(best.si, list);
  });

  const out: FoundMember[] = [];
  for (const [si, found] of onRun) {
    const r = runs[si];
    found.sort((a, b) => a.tm - b.tm);
    // The same size written twice at one spot (both sides of the line) is one member.
    const list = found.filter((x, i) => i === 0 || !(labels[x.li].size === labels[found[i - 1].li].size && x.ta < found[i - 1].tb));
    const cols = columnsOn(r, boxes);
    // Boundaries between consecutive members: a column between their labels (the one nearest the
    // midpoint), else the midpoint between the labels. The outer ends: the nearest column beyond the
    // label, else the end of the line.
    const bounds: { t: number; kind: EndKind }[] = [];
    for (let k = 0; k <= list.length; k++) {
      if (k === 0) {
        const c = cols.filter((t) => t < list[0].ta);
        bounds.push(c.length ? { t: c[c.length - 1], kind: 'column' } : { t: r.t0, kind: 'end' });
      } else if (k === list.length) {
        const c = cols.filter((t) => t > list[k - 1].tb);
        bounds.push(c.length ? { t: c[0], kind: 'column' } : { t: r.t1, kind: 'end' });
      } else {
        const m = (list[k - 1].tm + list[k].tm) / 2;
        const c = cols.filter((t) => t > list[k - 1].tb && t < list[k].ta);
        bounds.push(c.length ? { t: c.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a)), kind: 'column' } : { t: m, kind: 'midpoint' });
      }
    }
    list.forEach((x, k) => {
      const lo = bounds[k];
      const hi = bounds[k + 1];
      if (hi.t - lo.t < 1) return;
      const l = labels[x.li];
      const box = labelCorners(l);
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      const a = runPoint(r, lo.t);
      const b = runPoint(r, hi.t);
      // Measure left to right (top to bottom for vertical members).
      const flip = a.x > b.x + 0.5 || (Math.abs(a.x - b.x) <= 0.5 && a.y > b.y);
      out.push({
        id: '',
        size: l.size,
        family: l.family,
        text: l.text,
        p1: flip ? b : a,
        p2: flip ? a : b,
        width: r.width,
        dashed: r.dashed,
        ends: flip ? [hi.kind, lo.kind] : [lo.kind, hi.kind],
        labelBox: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      });
    });
  }
  // Reading order: top to bottom, left to right.
  out.sort((a, b) => Math.min(a.p1.y, a.p2.y) - Math.min(b.p1.y, b.p2.y) || a.p1.x - b.p1.x);
  return out.map((m, i) => ({ ...m, id: `am${i + 1}` }));
}

/**
 * Members an existing length measurement already covers (most of the member, along its line), as
 * member id → markup id. A measurement counts for the one member it lies closest to.
 */
export function existingMeasurements(members: Pick<FoundMember, 'id' | 'p1' | 'p2'>[], markups: Markup[]): Map<string, string> {
  const best = new Map<string, { member: string; dist: number }>();
  for (const m of members) {
    const len = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
    if (!len) continue;
    const u = { x: (m.p2.x - m.p1.x) / len, y: (m.p2.y - m.p1.y) / len };
    const n = { x: -u.y, y: u.x };
    for (const mk of markups) {
      if (mk.type !== 'length' && mk.type !== 'polylength') continue;
      let covered = 0;
      let dist = Infinity;
      for (let i = 1; i < mk.points.length; i++) {
        const a = sub(mk.points[i - 1], m.p1);
        const b = sub(mk.points[i], m.p1);
        // Parallel and on the member line.
        const da = Math.abs(dot(a, n));
        const db = Math.abs(dot(b, n));
        if (da > 6 || db > 6) continue;
        const t0 = Math.max(0, Math.min(dot(a, u), dot(b, u)));
        const t1 = Math.min(len, Math.max(dot(a, u), dot(b, u)));
        if (t1 > t0) {
          covered += t1 - t0;
          dist = Math.min(dist, (da + db) / 2);
        }
      }
      if (covered < 0.5 * len) continue;
      const cur = best.get(mk.id);
      if (!cur || dist < cur.dist) best.set(mk.id, { member: m.id, dist });
    }
  }
  const out = new Map<string, string>();
  for (const [markupId, { member }] of best) if (!out.has(member)) out.set(member, markupId);
  return out;
}

/** Points of a member stretched by `ext` page points at each end. */
export function extendMember(m: Pick<FoundMember, 'p1' | 'p2'>, ext: number): [Pt, Pt] {
  const len = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
  if (!ext || !len) return [m.p1, m.p2];
  const u = { x: (m.p2.x - m.p1.x) / len, y: (m.p2.y - m.p1.y) / len };
  return [
    { x: m.p1.x - u.x * ext, y: m.p1.y - u.y * ext },
    { x: m.p2.x + u.x * ext, y: m.p2.y + u.y * ext },
  ];
}

/** Colour for a size without a Tool Chest tool: stable per size. */
export function sizeColor(size: string): string {
  const palette = ['#e8112d', '#f46036', '#b5179e', '#2e86de', '#0b8f8a', '#6a4c93', '#d1199a', '#1aa34a', '#ff9f1c', '#3a86ff', '#9c6644', '#118ab2'];
  let h = 0;
  for (const c of size) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// ---------------------------------------------------------------------------
// Printed scales

/**
 * Drawing scales printed on a sheet (SCALE: 1/8" = 1'-0", 1" = 20', SCALE 1:100), with how often
 * each appears. Used for sheets that have no scale set.
 */
export function printedScales(texts: Pick<PlacedText, 'str'>[]): { preset: ScalePreset; count: number }[] {
  const counts = new Map<string, number>();
  const add = (label: string) => {
    if (findPreset(label)) counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  for (const { str } of texts) {
    const s = str.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"');
    for (const m of s.matchAll(/(\d+(?:[- ]\d+\/\d+)?|\d+\/\d+)\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/g)) add(`${m[1].replace('-', ' ')}" = 1'-0"`);
    for (const m of s.matchAll(/(?<![\d/])1\s*"\s*=\s*(\d+)\s*'(?!\s*-?\s*\d)/g)) add(`1" = ${m[1]}'`);
    if (/SCALE/i.test(s)) for (const m of s.matchAll(/\b1\s*:\s*(\d+)\b/g)) add(`1:${m[1]}`);
  }
  return [...counts.entries()].map(([label, count]) => ({ preset: findPreset(label)!, count })).sort((a, b) => b.count - a.count);
}
