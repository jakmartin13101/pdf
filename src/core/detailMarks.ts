// Standard detail material on the drawing. The material a detail adds to a markup is drawn next to it,
// in the look of the material's shape (the line style rule for its shape, else the Tool Chest tool for
// its size, else a colour per size), a little to the side so both stay readable:
//
//   full length   – a line the same length and direction as the markup (inside an area's outline)
//   @ spacing     – a mark for every piece, along that line
//   × quantity    – a count mark with the number of pieces, next to the markup's label
//
// Marks are worked out from the details each time, so they follow their markup when it moves and go
// away with the detail; they are not markups of their own (the material is counted once, as before).

import type { ChestTool, CountSymbol, DocState, Markup, MarkupStyle, Pt, StandardDetail, ToolSet } from '../types';
import { buildRows } from './columns';
import { detailApplies, itemQuantity, itemSubject, parseDetailLength, qtyColumnId, runLength } from './details';
import { autoStyleFor, withRule, type AutoLookPrefs } from './autoStyles';
import { sizeColor } from './autoTakeoff';
import { defaultStyle } from './markupTypes';
import { DEFAULT_SUBJECTS, subjectForSize } from './subjects';
import { bbox, centroid, dist, labelPoint, polygonArea, signedArea } from './geometry';
import { polylineLabelAnchor, uprightAngle } from './shapes';
import { normName, toNum } from './formula';
import { fmtNumber, formatLength } from './units';

export interface DetailMarkPrefs {
  /** Draw the material standard details add next to their markups. */
  show: boolean;
  /** Space between a markup and its material, in page points (1/72"). */
  gap: number;
  /** Write the size (and the number of pieces) by the material. */
  labels: boolean;
}

export const defaultDetailMarkPrefs = (): DetailMarkPrefs => ({ show: true, gap: 4, labels: true });

export interface MarkText {
  text: string;
  /** Middle of the text's height; the start or the middle of its width (`anchor`). */
  at: Pt;
  angle: number;
  anchor: 'start' | 'middle';
  size: number;
}

export interface DetailMark {
  /** parent~detail~item, as the material row's id. */
  key: string;
  parentId: string;
  detailId: string;
  itemId: string;
  kind: 'line' | 'spaced' | 'count';
  style: MarkupStyle;
  /** Lines: open beside a length, or closed inside an area. */
  paths: { pts: Pt[]; closed: boolean }[];
  /** Symbols: every piece at a spacing, or the one count mark. */
  symbols: Pt[];
  symbolSize: number;
  text: MarkText | null;
  /** For the hover tip: the detail, and the material with its quantity. */
  title: string;
  sub: string;
}

// ---------------------------------------------------------------------------
// The look of the material

const sameName = (a: string, b: string) => !!a.trim() && normName(a) === normName(b);
const memberSize = (t: ChestTool) => String(Object.entries(t.custom).find(([k]) => normName(k) === 'membersize')?.[1] ?? '');

/** The Tool Chest tool for a material: by its size, else by its subject; a count tool for marks. */
export function materialTool(chest: ToolSet[], subject: string, size: string, kind: 'line' | 'count'): ChestTool | undefined {
  const tools = chest.flatMap((s) => s.tools);
  const bySize = size.trim() ? tools.filter((t) => sameName(memberSize(t), size) || (t.sizeTool && sameName(t.sizeTool.value, size)) || sameName(t.subject, size)) : [];
  const pool = bySize.length ? bySize : tools.filter((t) => sameName(t.subject, subject) || sameName(t.name, subject));
  const wanted = (t: ChestTool) => (kind === 'count' ? t.type === 'count' : t.type === 'length' || t.type === 'polylength');
  return pool.find(wanted) ?? pool[0];
}

/** The shape of a material: from its size (L4x4x3/8 → L), else its subject when that is a shape. */
export function materialShape(subject: string, size: string, subjects: string[] = DEFAULT_SUBJECTS): string | undefined {
  return subjectForSize(size, subjects) ?? subjects.find((s) => sameName(s, subject));
}

/** How a material is drawn: as a line, or as count marks. */
export function materialLook(chest: ToolSet[], prefs: AutoLookPrefs, subject: string, size: string, kind: 'line' | 'count'): MarkupStyle {
  const tool = materialTool(chest, subject, size, kind);
  const shape = materialShape(subject, size, prefs.subjects);
  const rule = (shape && autoStyleFor(prefs.autoStyles, shape)) || (size.trim() ? autoStyleFor(prefs.autoStyles, size) : undefined);
  const def = defaultStyle(kind === 'count' ? 'count' : 'polylength');
  const own = tool && prefs.autoUseToolStyle ? tool.style : undefined;
  // The tool's whole look when it draws the same way (a count tool for marks), else its colour.
  const whole = !!own && (tool!.type === 'count') === (kind === 'count');
  let style: MarkupStyle = whole
    ? { ...own! }
    : { ...def, color: own?.color ?? sizeColor(size.trim() || subject), fontColor: own?.fontColor, fontFamily: own?.fontFamily };
  if (rule) style = withRule(style, rule);
  if (kind === 'count') {
    const symbol: CountSymbol = tool?.type === 'count' ? tool.style.symbol : 'diamond';
    const fill = rule || !whole || !style.fillColor ? style.color : style.fillColor;
    style = { ...style, symbol, fillColor: fill, fillOpacity: Math.max(style.fillOpacity, 0.75) };
  }
  return { ...style, lineStart: 'none', lineEnd: 'none' };
}

// ---------------------------------------------------------------------------
// Geometry

const LH = 1.18;
/** Rough width of a label (bold sans), for placing marks after it. */
const textWidth = (s: string, size: number) => s.length * size * 0.58;

/**
 * Where a markup's label is: its origin and direction, and the box its text fills around the origin
 * in text space (u along the text, v up from it).
 */
export interface LabelFrame {
  o: Pt;
  angle: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Text size of the label. */
  size: number;
}

/** A point given in a frame's text space. */
export const framePoint = (f: Pick<LabelFrame, 'o' | 'angle'>, u: number, v: number): Pt => ({
  x: f.o.x + u * Math.cos(f.angle) + v * Math.sin(f.angle),
  y: f.o.y + u * Math.sin(f.angle) - v * Math.cos(f.angle),
});

/** The frame of a markup's label as the drawing places it (no label: where it would go). */
export function labelFrame(m: Markup, lines: string[]): LabelFrame | null {
  const pts = m.points;
  if (!pts.length) return null;
  const s = m.style;
  const fs = s.fontSize;
  const k = lines.length;
  const width = (size: number) => lines.reduce((w, l) => Math.max(w, textWidth(l, size)), 0);
  switch (m.type) {
    case 'length':
    case 'line':
    case 'arrow':
    case 'polylength':
    case 'polyline': {
      if (pts.length < 2) return null;
      const anc =
        m.type === 'length' || m.type === 'line' || m.type === 'arrow'
          ? { p: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, angle: uprightAngle(Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)) }
          : polylineLabelAnchor(pts);
      const off = fs * 0.55 + s.lineWidth;
      const w = width(fs);
      return k
        ? { o: anc.p, angle: anc.angle, u0: -w / 2, u1: w / 2, v0: off - fs * 0.25, v1: off + (k - 1) * fs * LH + fs * 0.75, size: fs }
        : { o: anc.p, angle: anc.angle, u0: 0, u1: 0, v0: s.lineWidth, v1: s.lineWidth, size: fs };
    }
    case 'area':
    case 'perimeter':
    case 'volume':
    case 'polygon': {
      const w = width(fs);
      const h = (k * fs * LH) / 2;
      return { o: labelPoint(pts), angle: 0, u0: -w / 2, u1: w / 2, v0: -h, v1: h, size: fs };
    }
    case 'count': {
      const r = s.symbolSize;
      const size = Math.max(8, r * 1.2);
      const last = pts[pts.length - 1];
      return k
        ? { o: { x: last.x + r * 1.5, y: last.y - r * 1.2 }, angle: 0, u0: 0, u1: width(size), v0: -size * 0.25, v1: (k - 1) * size * LH + size * 0.75, size }
        : { o: last, angle: 0, u0: -r, u1: r, v0: -r, v1: r, size };
    }
    default: {
      const b = bbox(pts);
      return { o: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, angle: 0, u0: -b.w / 2, u1: b.w / 2, v0: -b.h / 2, v1: b.h / 2, size: fs };
    }
  }
}

function lineCross(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / den;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

/**
 * A line `d` to the side of a polyline (or ring): positive to the side of the normal (−ty, tx) of each
 * segment, with mitred corners (cut off where they would run far out).
 */
export function offsetPath(pts: Pt[], d: number, closed: boolean): Pt[] {
  const n = pts.length;
  const segs: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = dist(a, b);
    if (len < 1e-9) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    segs.push({ a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } });
  }
  if (!segs.length) return [];
  const join = (s1: { a: Pt; b: Pt }, s2: { a: Pt; b: Pt }): Pt => {
    const p = lineCross(s1.a, s1.b, s2.a, s2.b);
    if (!p || dist(p, s1.b) > Math.abs(d) * 4) return { x: (s1.b.x + s2.a.x) / 2, y: (s1.b.y + s2.a.y) / 2 };
    return p;
  };
  const out: Pt[] = [];
  if (closed) {
    for (let i = 0; i < segs.length; i++) out.push(join(segs[(i + segs.length - 1) % segs.length], segs[i]));
  } else {
    out.push(segs[0].a);
    for (let i = 1; i < segs.length; i++) out.push(join(segs[i - 1], segs[i]));
    out.push(segs[segs.length - 1].b);
  }
  return out;
}

/** A ring `d` inside an outline (outside, if the outline is too small to fit it). */
export function insetRing(pts: Pt[], d: number): Pt[] {
  const a = polygonArea(pts);
  const inner = [offsetPath(pts, d, true), offsetPath(pts, -d, true)]
    .filter((r) => r.length >= 3 && Math.sign(signedArea(r)) === Math.sign(signedArea(pts)))
    .sort((x, y) => polygonArea(x) - polygonArea(y));
  const r = inner[0];
  return r && polygonArea(r) < a ? r : offsetPath(pts, signedArea(pts) > 0 ? -d : d, true);
}

/** The point a share (0..1) of the way along a path, and the direction there. */
export function pointAlong(pts: Pt[], closed: boolean, share: number): { p: Pt; angle: number } {
  const ring = closed ? [...pts, pts[0]] : pts;
  let total = 0;
  for (let i = 1; i < ring.length; i++) total += dist(ring[i - 1], ring[i]);
  let left = Math.min(1, Math.max(0, share)) * total;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const l = dist(a, b);
    if (left <= l || i === ring.length - 1) {
      const t = l ? Math.min(1, left / l) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    left -= l;
  }
  return { p: ring[0], angle: 0 };
}

function longestSegment(pts: Pt[], closed: boolean): number {
  let best = 0;
  let len = -1;
  for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) {
    const l = dist(pts[i], pts[(i + 1) % pts.length]);
    if (l > len) {
      len = l;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The marks

export interface DetailMarkOptions {
  chest: ToolSet[];
  look: AutoLookPrefs;
  /** Space between a markup and its material, page points. */
  gap: number;
  labels: boolean;
  /** A markup's label lines as the drawing shows them (none when labels are off). */
  parentLabel: (m: Markup) => string[];
}

const ftIn = (inches: number) => formatLength(inches, 'ft-in', 16);
const fmtCount = (n: number) => fmtNumber(n, n % 1 ? 2 : 0);
/** More pieces than this along one markup are not drawn one by one. */
const MAX_SPACED = 400;

const LINEAR = new Set(['length', 'polylength']);
const RINGS = new Set(['area', 'perimeter', 'volume']);

/** The marks for the material standard details add to these markups. */
export function detailMarks(doc: DocState, markups: Markup[], o: DetailMarkOptions): DetailMark[] {
  const details = (doc.standardDetails ?? []).filter((d) => d.enabled && d.items.length);
  if (!details.length || !markups.length) return [];
  const qtyCol = qtyColumnId(doc);
  const gap = Math.max(0, o.gap);
  const out: DetailMark[] = [];
  for (const r of buildRows(doc, markups)) {
    const m = r.markup;
    const linear = LINEAR.has(m.type) && m.points.length >= 2;
    const ring = RINGS.has(m.type) && m.points.length >= 3;
    let frame: LabelFrame | null | undefined;
    let lineAt = gap + m.style.lineWidth / 2;
    let countRow = 0;
    const applied: StandardDetail[] = details.filter((d) => detailApplies(r, d));
    for (const d of applied) {
      for (const it of d.items) {
        const q = itemQuantity(it, r, qtyCol);
        if (q.warning || !(q.pieces > 0)) continue;
        const subject = itemSubject(it, d);
        const size = it.size.trim();
        const name = size || subject;
        const base = {
          key: `${m.id}~${d.id}~${it.id}`,
          parentId: m.id,
          detailId: d.id,
          itemId: it.id,
          title: `${d.name} (standard detail)`,
          // "L4x4x3/8 · 4 EA × 0'-11 1/2"", "3/4" stud · 13 EA @ 2'-0" OC", "L3x3x1/4 · 23'-0" full length"
          sub: `${name} · ${
            it.rule === 'full'
              ? `${ftIn(q.pieceLength)} ${q.basis}`
              : `${fmtCount(q.pieces)} EA${q.pieceLength ? ` × ${ftIn(q.pieceLength)}` : ''}${it.rule === 'spacing' ? ` ${q.basis}` : ''}`
          }`,
        };
        const ts = Math.max(6, m.style.fontSize * 0.8);

        if (it.rule === 'each') {
          // A count mark with the number of pieces, after the markup's label.
          if (frame === undefined) frame = labelFrame(m, o.parentLabel(m));
          if (!frame) continue;
          const cs = Math.max(6, frame.size * 0.85);
          const r0 = cs * 0.42;
          const v = frame.v0 + cs * 0.6 + countRow * cs * LH;
          const u = frame.u1 + cs * 0.6;
          countRow++;
          const style = materialLook(o.chest, o.look, subject, it.size, 'count');
          out.push({
            ...base,
            kind: 'count',
            style: { ...style, fontSize: cs },
            paths: [],
            symbols: [framePoint(frame, u + r0 * 1.25, v)],
            symbolSize: r0,
            text: o.labels ? { text: `${fmtCount(q.pieces)} × ${name}`, at: framePoint(frame, u + r0 * 2.5 + cs * 0.3, v), angle: frame.angle, anchor: 'start', size: cs } : null,
          });
          continue;
        }

        // Full length and spacing: beside a length, inside an area.
        if (!linear && !ring) continue;
        const kind = it.rule === 'full' ? 'line' : 'spaced';
        const style = materialLook(o.chest, o.look, subject, it.size, kind === 'line' ? 'line' : 'count');
        const lw = kind === 'line' ? style.lineWidth : 0;
        const symbolSize = Math.max(2.5, ts * 0.32);
        const reach = kind === 'line' ? lw / 2 : symbolSize * 1.25;
        const d0 = lineAt + reach;
        lineAt = d0 + reach + gap + (o.labels ? ts * LH : 0);
        let path: Pt[];
        let side: number;
        const pts = m.points;
        if (linear) {
          // Away from the markup's label.
          const j = m.type === 'length' ? 0 : longestSegment(pts, false);
          const a = pts[j];
          const b = pts[j + 1];
          const ang = uprightAngle(Math.atan2(b.y - a.y, b.x - a.x));
          const up = { x: Math.sin(ang), y: -Math.cos(ang) };
          const len = dist(a, b) || 1;
          const nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
          side = nrm.x * up.x + nrm.y * up.y > 0 ? -1 : 1;
          path = offsetPath(m.type === 'length' ? pts.slice(0, 2) : pts, side * d0, false);
        } else {
          path = insetRing(pts, d0);
          side = 0;
        }
        if (path.length < 2) continue;
        const closed = ring;

        let symbols: Pt[] = [];
        let label = name;
        if (kind === 'line') {
          const runs = it.value.trim() === '' ? 1 : toNum(it.value);
          label = runs !== 1 ? `${fmtCount(runs)} × ${name}` : name;
        } else {
          const sp = parseDetailLength(it.value);
          const run = runLength(r);
          const n = sp && run ? Math.ceil(run / sp - 1e-6) : 0;
          if (!n) continue;
          if (n <= MAX_SPACED) {
            const shares = it.addEnd && !closed ? Array.from({ length: n + 1 }, (_, k) => k / n) : Array.from({ length: n }, (_, k) => (k + (it.addEnd ? 0 : 0.5)) / n);
            symbols = shares.map((s) => pointAlong(path, closed, s).p);
          }
          label = `${fmtCount(q.pieces)} × ${name} @ ${ftIn(sp!)}`;
        }

        // The label: by the middle of the longest stretch, on the far side.
        let text: MarkText | null = null;
        if (o.labels) {
          const j = longestSegment(path, closed);
          const a = path[j];
          const b = path[(j + 1) % path.length];
          const ang = uprightAngle(Math.atan2(b.y - a.y, b.x - a.x));
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const len = dist(a, b) || 1;
          let away = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
          if (closed) {
            const c = centroid(path);
            if (away.x * (c.x - mid.x) + away.y * (c.y - mid.y) < 0) away = { x: -away.x, y: -away.y };
          } else away = { x: away.x * side, y: away.y * side };
          const k = reach + ts * 0.62;
          text = { text: label, at: { x: mid.x + away.x * k, y: mid.y + away.y * k }, angle: ang, anchor: 'middle', size: ts };
        }
        out.push({
          ...base,
          kind,
          style: { ...style, fontSize: ts },
          paths: kind === 'line' ? [{ pts: path, closed }] : [],
          symbols,
          symbolSize,
          text,
        });
      }
    }
  }
  return out;
}
