import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Pt, Rect } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map<string, Promise<PDFDocumentProxy>>();
const pages = new Map<string, Promise<PDFPageProxy>>();

export function registerPdf(fileId: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const p = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  docs.set(fileId, p);
  p.catch(() => docs.delete(fileId));
  return p;
}

export async function unregisterPdf(fileId: string) {
  const p = docs.get(fileId);
  docs.delete(fileId);
  for (const cache of [pages, textCache, snapCache] as Map<string, unknown>[]) {
    for (const k of [...cache.keys()]) if (k.startsWith(fileId + '#')) cache.delete(k);
  }
  if (p) (await p).destroy();
}

export function unregisterAll() {
  for (const id of [...docs.keys()]) void unregisterPdf(id);
}

export async function getPage(fileId: string, pageIndex: number): Promise<PDFPageProxy> {
  const key = `${fileId}#${pageIndex}`;
  let p = pages.get(key);
  if (!p) {
    const doc = docs.get(fileId);
    if (!doc) throw new Error('PDF not loaded');
    p = doc.then((d) => d.getPage(pageIndex + 1));
    pages.set(key, p);
  }
  return p;
}

export interface PageInfo {
  width: number;
  height: number;
  rotation: number;
}

export async function pageInfos(doc: PDFDocumentProxy): Promise<PageInfo[]> {
  const out: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    out.push({ width: vp.width, height: vp.height, rotation: vp.rotation });
  }
  return out;
}

/**
 * Render a page into a canvas. `scale` is device pixels per point. When `region` is provided only
 * that part of the page (in points) is rendered, filling the whole canvas.
 */
export async function renderPage(
  fileId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number,
  region?: Rect,
  onTask?: (t: RenderTask) => void,
): Promise<void> {
  const page = await getPage(fileId, pageIndex);
  const viewport = page.getViewport({ scale });
  const w = Math.max(1, Math.floor(region ? region.w * scale : viewport.width));
  const h = Math.max(1, Math.floor(region ? region.h * scale : viewport.height));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const task = page.render({
    canvasContext: ctx,
    viewport,
    transform: region ? [1, 0, 0, 1, -region.x * scale, -region.y * scale] : undefined,
    annotationMode: pdfjs.AnnotationMode.ENABLE,
  });
  onTask?.(task);
  await task.promise;
  // Swap in only once complete to avoid flashing.
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(off, 0, 0);
}

// ---------------------------------------------------------------------------
// Text extraction (sheet labels)

export interface TextItem {
  str: string;
  x: number;
  y: number; // top
  w: number;
  h: number;
}

const textCache = new Map<string, Promise<TextItem[]>>();

export function pageText(fileId: string, pageIndex: number): Promise<TextItem[]> {
  const key = `${fileId}#${pageIndex}`;
  let p = textCache.get(key);
  if (!p) {
    p = (async () => {
      const page = await getPage(fileId, pageIndex);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const out: TextItem[] = [];
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const tx = pdfjs.Util.transform(vp.transform, it.transform);
        const fh = Math.hypot(tx[2], tx[3]);
        const angle = Math.atan2(tx[1], tx[0]);
        const w = it.width;
        // Bounding box in viewport space (handles 0/90/180/270 text rotation).
        const x0 = tx[4];
        const y0 = tx[5];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const corners: Pt[] = [
          { x: x0, y: y0 },
          { x: x0 + w * cos, y: y0 + w * sin },
          { x: x0 + fh * sin, y: y0 - fh * cos },
          { x: x0 + w * cos + fh * sin, y: y0 + w * sin - fh * cos },
        ];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        out.push({ str: it.str, x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY || fh });
      }
      return out;
    })();
    textCache.set(key, p);
  }
  return p;
}

function joinLines(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) < Math.max(3, it.h * 0.5)) last.push(it);
    else lines.push([it]);
  }
  return lines
    .map((l) =>
      l
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(' '),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text whose centre lies inside a rectangle given as fractions of the page size. */
export async function textInRegion(fileId: string, pageIndex: number, frac: Rect, pageW: number, pageH: number): Promise<string> {
  const items = await pageText(fileId, pageIndex);
  const r = { x: frac.x * pageW, y: frac.y * pageH, w: frac.w * pageW, h: frac.h * pageH };
  const inside = items.filter((i) => {
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
  });
  return joinLines(inside);
}

const SHEET_NO = /^[A-Z]{1,3}[-.\s]?\d{1,3}(?:[.-]\d{1,3})?[A-Z]?$/;
const NOT_TITLE = /^(SHEET|SHEET NO\.?|SHEET NUMBER|SCALE|DATE|DRAWN|CHECKED|PROJECT|JOB|NO\.?|REV|REVISION|TITLE|DRAWING|DWG)\b/i;

/** Heuristic title-block reader: finds the sheet number (largest matching text toward the lower right) and a title above it. */
export async function detectSheetLabel(fileId: string, pageIndex: number, pageW: number, pageH: number): Promise<{ number: string; title: string } | null> {
  const items = await pageText(fileId, pageIndex);
  const candidates = items.filter((i) => i.x > pageW * 0.55 && i.y > pageH * 0.5 && SHEET_NO.test(i.str.trim()));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.h - a.h || b.x + b.y - (a.x + a.y));
  const num = candidates[0];
  const number = num.str.trim().replace(/\s+/g, '');

  const titleItems = items.filter(
    (i) =>
      i !== num &&
      i.y + i.h <= num.y + 1 &&
      i.y > num.y - pageH * 0.3 &&
      i.x + i.w > num.x - pageW * 0.2 &&
      i.x < num.x + num.w + pageW * 0.1 &&
      /[A-Za-z]{3,}/.test(i.str) &&
      !NOT_TITLE.test(i.str.trim()) &&
      !SHEET_NO.test(i.str.trim()),
  );
  let title = '';
  if (titleItems.length) {
    const maxH = Math.max(...titleItems.map((i) => i.h));
    const big = titleItems.filter((i) => i.h >= maxH * 0.8).sort((a, b) => b.y - a.y);
    // Take the block of large lines nearest above the number, walking upward while lines are contiguous.
    const picked: TextItem[] = [big[0]];
    let lastY = big[0].y;
    for (const it of big.slice(1)) {
      if (Math.abs(it.y - lastY) < maxH * 0.5) picked.push(it);
      else if (lastY - it.y <= maxH * 1.9) {
        picked.push(it);
        lastY = it.y;
      } else break;
    }
    title = joinLines(picked);
  }
  return { number, title };
}

// ---------------------------------------------------------------------------
// Snap to content: endpoints and segments of vector line work.

export interface SnapIndex {
  cell: number;
  points: Map<string, number[]>; // flat x,y pairs per cell
  segs: Map<string, number[]>; // flat x1,y1,x2,y2 per cell
}

const snapCache = new Map<string, Promise<SnapIndex>>();
const MAX_SEGMENTS = 250_000;

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export function snapIndex(fileId: string, pageIndex: number): Promise<SnapIndex> {
  const key = `${fileId}#${pageIndex}`;
  let p = snapCache.get(key);
  if (!p) {
    p = (async () => {
      const page = await getPage(fileId, pageIndex);
      const vp = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const O = pdfjs.OPS;
      const cell = 24;
      const idx: SnapIndex = { cell, points: new Map(), segs: new Map() };
      let ctm: Mat = vp.transform as Mat;
      const stack: Mat[] = [];
      let segCount = 0;
      const addPoint = (x: number, y: number) => {
        const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
        let a = idx.points.get(k);
        if (!a) idx.points.set(k, (a = []));
        a.push(x, y);
      };
      const addSeg = (x1: number, y1: number, x2: number, y2: number) => {
        if (segCount++ > MAX_SEGMENTS) return;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 2) return;
        // Register the segment in every cell it passes through (sampled).
        const steps = Math.max(1, Math.ceil(len / cell));
        const seen = new Set<string>();
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const k = `${Math.floor((x1 + (x2 - x1) * t) / cell)},${Math.floor((y1 + (y2 - y1) * t) / cell)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          let a = idx.segs.get(k);
          if (!a) idx.segs.set(k, (a = []));
          a.push(x1, y1, x2, y2);
        }
        addPoint(x1, y1);
        addPoint(x2, y2);
        addPoint((x1 + x2) / 2, (y1 + y2) / 2);
      };
      const tp = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === O.save) stack.push(ctm);
        else if (fn === O.restore) ctm = stack.pop() ?? ctm;
        else if (fn === O.transform) ctm = mul(ctm, args as Mat);
        else if (fn === O.paintFormXObjectBegin) {
          stack.push(ctm);
          if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as Mat);
        } else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
        else if (fn === O.constructPath) {
          const [subOps, coords] = args as [number[], number[]];
          let j = 0;
          let cx = 0;
          let cy = 0;
          let sx = 0;
          let sy = 0;
          for (const op of subOps) {
            if (op === O.moveTo) {
              [cx, cy] = tp(coords[j++], coords[j++]);
              sx = cx;
              sy = cy;
            } else if (op === O.lineTo) {
              const [nx, ny] = tp(coords[j++], coords[j++]);
              addSeg(cx, cy, nx, ny);
              cx = nx;
              cy = ny;
            } else if (op === O.rectangle) {
              const x = coords[j++];
              const y = coords[j++];
              const w = coords[j++];
              const h = coords[j++];
              const c = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)];
              for (let k = 0; k < 4; k++) addSeg(c[k][0], c[k][1], c[(k + 1) % 4][0], c[(k + 1) % 4][1]);
              [cx, cy] = c[0];
              sx = cx;
              sy = cy;
            } else if (op === O.curveTo) {
              j += 4;
              [cx, cy] = tp(coords[j++], coords[j++]);
              addPoint(cx, cy);
            } else if (op === O.curveTo2 || op === O.curveTo3) {
              j += 2;
              [cx, cy] = tp(coords[j++], coords[j++]);
              addPoint(cx, cy);
            } else if (op === O.closePath) {
              addSeg(cx, cy, sx, sy);
              cx = sx;
              cy = sy;
            }
          }
        }
      }
      return idx;
    })();
    snapCache.set(key, p);
  }
  return p;
}

export type SnapKind = 'point' | 'intersection' | 'line';

function segIntersect(a: number[], b: number[]): Pt | null {
  const [x1, y1, x2, y2] = a;
  const [x3, y3, x4, y4] = b;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * Find the best content snap within `radius`: endpoints, midpoints and line intersections win,
 * otherwise the nearest point on a line. Lines get a small penalty so a precise vertex is preferred
 * only when it is about as close as the line itself.
 */
export function querySnap(idx: SnapIndex, p: Pt, radius: number): { pt: Pt; kind: SnapKind } | null {
  const c = idx.cell;
  const x0 = Math.floor((p.x - radius) / c);
  const x1 = Math.floor((p.x + radius) / c);
  const y0 = Math.floor((p.y - radius) / c);
  const y1 = Math.floor((p.y + radius) / c);
  let best: { pt: Pt; kind: SnapKind; score: number } | null = null;
  const consider = (pt: Pt, kind: SnapKind, penalty: number) => {
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d > radius) return;
    const score = d + penalty;
    if (!best || score < best.score) best = { pt, kind, score };
  };
  const near: { seg: number[]; d: number }[] = [];
  const seen = new Set<string>();
  for (let gx = x0; gx <= x1; gx++)
    for (let gy = y0; gy <= y1; gy++) {
      const pts = idx.points.get(`${gx},${gy}`);
      if (pts) for (let i = 0; i < pts.length; i += 2) consider({ x: pts[i], y: pts[i + 1] }, 'point', 0);
      const a = idx.segs.get(`${gx},${gy}`);
      if (!a) continue;
      for (let i = 0; i < a.length; i += 4) {
        const key = `${a[i]},${a[i + 1]},${a[i + 2]},${a[i + 3]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ax = a[i];
        const ay = a[i + 1];
        const dx = a[i + 2] - ax;
        const dy = a[i + 3] - ay;
        const l2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2));
        const q = { x: ax + t * dx, y: ay + t * dy };
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= radius) {
          near.push({ seg: [ax, ay, a[i + 2], a[i + 3]], d });
          consider(q, 'line', radius * 0.45);
        }
      }
    }
  near.sort((m, n) => m.d - n.d);
  const top = near.slice(0, 14);
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      const ip = segIntersect(top[i].seg, top[j].seg);
      if (ip) consider(ip, 'intersection', -radius * 0.05);
    }
  const b = best as { pt: Pt; kind: SnapKind; score: number } | null;
  return b ? { pt: b.pt, kind: b.kind } : null;
}
