import type { Pt, Rect } from '../types';

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

export function polygonPerimeter(pts: Pt[]): number {
  if (pts.length < 2) return 0;
  return polylineLength(pts) + (pts.length > 2 ? dist(pts[pts.length - 1], pts[0]) : 0);
}

/** Signed shoelace area. */
export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return a / 2;
}

export function polygonArea(pts: Pt[]): number {
  return pts.length < 3 ? 0 : Math.abs(signedArea(pts));
}

export function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length < 3) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a += f;
    cx += (pts[j].x + pts[i].x) * f;
    cy += (pts[j].y + pts[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** A point guaranteed to lie inside (or very near) a polygon for label placement. */
export function labelPoint(pts: Pt[]): Pt {
  const c = centroid(pts);
  if (pts.length < 3 || pointInPolygon(c, pts)) return c;
  // Fall back to the midpoint of the widest horizontal span through the bbox centre.
  const b = bbox(pts);
  const y = b.y + b.h / 2;
  const xs: number[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const p = pts[i];
    if ((a.y > y) !== (p.y > y)) xs.push(a.x + ((y - a.y) / (p.y - a.y)) * (p.x - a.x));
  }
  xs.sort((m, n) => m - n);
  let best = c;
  let bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1] - xs[i];
    if (w > bestW) {
      bestW = w;
      best = { x: (xs[i] + xs[i + 1]) / 2, y };
    }
  }
  return best;
}

export function bbox(pts: Pt[]): Rect {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Constrain p relative to origin to the nearest multiple of `stepDeg` degrees. */
export function constrainAngle(origin: Pt, p: Pt, stepDeg = 45): Pt {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...p };
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(ang) * len, y: origin.y + Math.sin(ang) * len };
}

/** Interior angle at vertex b (degrees) formed by a-b-c. */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const a1 = Math.atan2(a.y - b.y, a.x - b.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function translate(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function pointsToPath(pts: Pt[], closed: boolean): string {
  if (!pts.length) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i].x},${pts[i].y}`;
  if (closed) d += 'Z';
  return d;
}

/**
 * Revision-cloud path along a polygon: a series of outward bulging arcs.
 * `arc` is the approximate arc chord length in points.
 */
export function cloudPath(pts: Pt[], arc: number, closed = true): string {
  if (pts.length < 2) return '';
  const ring = closed ? [...pts, pts[0]] : pts;
  // Orientation decides which side is "outward".
  const sweep = closed && signedArea(pts) > 0 ? 0 : 1;
  let d = `M${ring[0].x},${ring[0].y}`;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const len = dist(a, b);
    const n = Math.max(1, Math.round(len / arc));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const r = len / n / 2;
      d += `A${r},${r} 0 0,${sweep} ${x},${y}`;
    }
  }
  return d;
}

/** Ramer–Douglas–Peucker simplification for freehand strokes. */
export function simplify(pts: Pt[], tolerance: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function expandRect(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}
