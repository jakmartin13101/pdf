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

interface SubPath {
  pts: Pt[];
  closed: boolean;
  curved: boolean;
}

/**
 * Straight segments of a page's line work from its pdf.js operator list.
 * `ops` is pdfjs.OPS; `base` the viewport transform (PDF space → page points, y down).
 */
export function extractStrokes(fnArray: number[], argsArray: unknown[], ops: Record<string, number>, base: number[]): Stroke[] {
  const out: Stroke[] = [];
  let ctm = base.slice(0, 6) as Mat;
  let lw = 1;
  let dashed = false;
  const stack: { ctm: Mat; lw: number; dashed: boolean }[] = [];
  // Current path: subpaths of device-space points (curves break a subpath into straight runs).
  let path: SubPath[] = [];
  const tp = (x: number, y: number): Pt => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] });
  const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

  const strokePath = () => {
    const w = lw * scaleOf(ctm);
    for (const sp of path) {
      const pts = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts;
      for (let i = 1; i < pts.length && out.length < MAX_STROKES; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: w, dashed });
      }
    }
  };
  // Filled long thin quadrilaterals are heavy lines drawn as shapes: use their centre line.
  const fillPath = () => {
    for (const sp of path) {
      if (sp.curved) continue;
      let pts = sp.pts;
      if (pts.length === 5 && Math.hypot(pts[4].x - pts[0].x, pts[4].y - pts[0].y) < 0.5) pts = pts.slice(0, 4);
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
      const start = (p: Pt, curved = false): SubPath => {
        const sp: SubPath = { pts: [p], closed: false, curved };
        path.push(sp);
        return sp;
      };
      for (const op of subOps) {
        if (op === O.moveTo) cur = start(tp(coords[j++], coords[j++]));
        else if (op === O.lineTo) {
          const p = tp(coords[j++], coords[j++]);
          if (cur && !cur.closed) cur.pts.push(p);
          else cur = start(p);
        } else if (op === O.rectangle) {
          const x = coords[j++];
          const y = coords[j++];
          const w = coords[j++];
          const h = coords[j++];
          const r = start(tp(x, y));
          r.pts.push(tp(x + w, y), tp(x + w, y + h), tp(x, y + h));
          r.closed = true;
          cur = undefined;
        } else if (op === O.curveTo || op === O.curveTo2 || op === O.curveTo3) {
          j += op === O.curveTo ? 4 : 2;
          if (cur) cur.curved = true;
          // A curve ends the straight run; carry on from its end point.
          cur = start(tp(coords[j++], coords[j++]), true);
        } else if (op === O.closePath) {
          if (cur) cur.closed = true;
        }
      }
    } else if (STROKES.has(fn)) {
      strokePath();
      if (fn !== O.stroke && fn !== O.closeStroke) fillPath();
      path = [];
    } else if (FILLS.has(fn)) {
      fillPath();
      path = [];
    } else if (fn === O.endPath) path = [];
  }
  return out;
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

/** Pair each label with the member line it names. */
export function matchMembers(labels: MemberLabel[], strokes: Stroke[], opts: MatchOptions = {}): FoundMember[] {
  const maxGapK = opts.maxGap ?? 1.6;
  const minLength = opts.minLength ?? 12;
  const lines = dedupe(strokes).filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= minLength);
  const near = strokeGrid(lines, 48);
  const sinTol = Math.sin((8 * Math.PI) / 180);

  const cands: { li: number; si: number; score: number }[] = [];
  labels.forEach((l, li) => {
    const corners = labelCorners(l);
    const maxGap = maxGapK * l.fh + 3;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const pad = maxGap + 8;
    const mid = (l.s0 + l.s1) / 2;
    const labelLen = l.s1 - l.s0;
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
      cands.push({ li, si, score });
    }
  });
  cands.sort((a, b) => a.score - b.score);
  const usedL = new Set<number>();
  const usedS = new Set<number>();
  const out: FoundMember[] = [];
  for (const c of cands) {
    if (usedL.has(c.li) || usedS.has(c.si)) continue;
    usedL.add(c.li);
    usedS.add(c.si);
    const l = labels[c.li];
    const s = lines[c.si];
    const box = labelCorners(l);
    const xs = box.map((p) => p.x);
    const ys = box.map((p) => p.y);
    // Measure left to right (top to bottom for vertical members).
    const flip = s.x1 > s.x2 + 0.5 || (Math.abs(s.x1 - s.x2) <= 0.5 && s.y1 > s.y2);
    out.push({
      id: `am${out.length + 1}`,
      size: l.size,
      family: l.family,
      text: l.text,
      p1: flip ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 },
      p2: flip ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 },
      width: s.width,
      dashed: s.dashed,
      labelBox: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
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
