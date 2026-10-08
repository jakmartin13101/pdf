// Geometry for drawing markups; shared by the SVG renderer and the flattened PDF export.
import type { CountSymbol, LineEnd, Markup, MarkupStyle, Pt, Rect } from '../types';
import { dist, rectFromPoints } from './geometry';

export const RECT_TYPES = new Set(['text', 'rectangle', 'ellipse', 'highlight', 'stamp']);

export function markupRect(m: Pick<Markup, 'points'>): Rect {
  return rectFromPoints(m.points[0], m.points[1] ?? m.points[0]);
}

export function calloutBox(m: Pick<Markup, 'points'>): Rect {
  return rectFromPoints(m.points[1], m.points[2] ?? m.points[1]);
}

/** Point on the callout box where the leader attaches (nearest edge midpoint to the tip). */
export function calloutAnchor(tip: Pt, box: Rect): Pt {
  const mids = [
    { x: box.x + box.w / 2, y: box.y },
    { x: box.x + box.w, y: box.y + box.h / 2 },
    { x: box.x + box.w / 2, y: box.y + box.h },
    { x: box.x, y: box.y + box.h / 2 },
  ];
  let best = mids[0];
  for (const m of mids) if (dist(m, tip) < dist(best, tip)) best = m;
  return best;
}

export function dashArray(s: MarkupStyle): number[] | undefined {
  const lw = Math.max(s.lineWidth, 0.5);
  if (s.lineStyle === 'dashed') return [lw * 4, lw * 2.5];
  if (s.lineStyle === 'dotted') return [lw * 0.01, lw * 2.2];
  return undefined;
}

/** Path for a line terminator at `tip`, pointing away from `from`. */
export function lineEndPath(tip: Pt, from: Pt, kind: LineEnd, lw: number): { d: string; filled: boolean } | null {
  if (kind === 'none') return null;
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  if (kind === 'arrow') {
    const size = Math.max(8, lw * 5);
    const a1 = ang + Math.PI - 0.42;
    const a2 = ang + Math.PI + 0.42;
    return {
      d: `M${tip.x},${tip.y}L${tip.x + Math.cos(a1) * size},${tip.y + Math.sin(a1) * size}L${tip.x + Math.cos(a2) * size},${tip.y + Math.sin(a2) * size}Z`,
      filled: true,
    };
  }
  if (kind === 'tick') {
    const size = Math.max(6, lw * 3.5);
    const a = ang + Math.PI / 4;
    return {
      d: `M${tip.x - Math.cos(a) * size},${tip.y - Math.sin(a) * size}L${tip.x + Math.cos(a) * size},${tip.y + Math.sin(a) * size}`,
      filled: false,
    };
  }
  const r = Math.max(2.5, lw * 1.6);
  return { d: `M${tip.x - r},${tip.y}A${r},${r} 0 1,0 ${tip.x + r},${tip.y}A${r},${r} 0 1,0 ${tip.x - r},${tip.y}Z`, filled: true };
}

/** Count symbol path centred at p. */
export function symbolPath(sym: CountSymbol, p: Pt, r: number): string {
  const { x, y } = p;
  switch (sym) {
    case 'circle':
      return `M${x - r},${y}A${r},${r} 0 1,0 ${x + r},${y}A${r},${r} 0 1,0 ${x - r},${y}Z`;
    case 'square':
      return `M${x - r},${y - r}H${x + r}V${y + r}H${x - r}Z`;
    case 'diamond':
      return `M${x},${y - r * 1.25}L${x + r * 1.25},${y}L${x},${y + r * 1.25}L${x - r * 1.25},${y}Z`;
    case 'triangle':
      return `M${x},${y - r * 1.2}L${x + r * 1.1},${y + r * 0.8}L${x - r * 1.1},${y + r * 0.8}Z`;
    case 'check':
      return `M${x - r},${y}L${x - r * 0.25},${y + r * 0.8}L${x + r},${y - r * 0.8}`;
    case 'cross':
      return `M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}`;
    case 'star': {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.48 : r * 1.25;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        d += `${i ? 'L' : 'M'}${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`;
      }
      return d + 'Z';
    }
  }
}

export const OPEN_SYMBOLS = new Set<CountSymbol>(['check', 'cross']);

/** Where to place a polylength label: midpoint of its longest segment. */
export function polylineLabelAnchor(pts: Pt[]): { p: Pt; angle: number } {
  let best = 1;
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  const a = pts[best - 1];
  const b = pts[best] ?? a;
  return { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: uprightAngle(Math.atan2(b.y - a.y, b.x - a.x)) };
}

/** Keep text upright: angle in radians normalised to (-90°, 90°]. */
export function uprightAngle(a: number): number {
  if (a > Math.PI / 2) return a - Math.PI;
  if (a <= -Math.PI / 2) return a + Math.PI;
  return a;
}

/** Simple word wrap using a width measure function. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (measure(cand) <= maxWidth || !line) line = cand;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** Font size that fits stamp text inside its frame (bold caps are ~0.72em wide per glyph). */
export function stampFontSize(text: string, r: Rect): number {
  return Math.max(4, Math.min(r.h * 0.5, (r.w * 0.86) / Math.max(1, text.length * 0.72)));
}
