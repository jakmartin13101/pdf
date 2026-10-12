// Overlay / compare, browser side: renders sheets to ink masks for auto-align and change finding.
// The maths is in core/align.ts.

import type { Sheet, SheetCompare } from '../types';
import { alignByText, applySim, findChanges, inkAgreement, invertSim, mergeBoxes, phaseCorrelate, textChanges, type Mask, type Similarity } from './align';
import { pageText, renderPage } from './pdf';

/** Overlay colour pairs: old/new line work in contrasting colours, overlaps go dark. */
export const COMPARE_PRESETS: { name: string; a: string; b: string }[] = [
  { name: 'Red / Blue', a: '#e8112d', b: '#1f6feb' },
  { name: 'Red / Green', a: '#e8112d', b: '#1aa34a' },
  { name: 'Magenta / Green', a: '#d1199a', b: '#18a558' },
  { name: 'Orange / Teal', a: '#ff6b00', b: '#0b8f8a' },
];

export function newCompare(otherSheetId: string, patch: Partial<SheetCompare> = {}): SheetCompare {
  return {
    sheetId: otherSheetId,
    enabled: true,
    colorA: COMPARE_PRESETS[0].a,
    colorB: COMPARE_PRESETS[0].b,
    intensityA: 1,
    intensityB: 1,
    showA: true,
    showB: true,
    transform: { scale: 1, rotation: 0, tx: 0, ty: 0 },
    alignedBy: null,
    ...patch,
  };
}

/**
 * SVG colour matrix that redraws a black-on-white drawing as `color`-on-white at `intensity`.
 * Linear in RGB, so it runs as a cheap colour filter (no re-rendering when colours change).
 */
export function tintMatrix(color: string, intensity: number): string {
  const h = color.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const a = Math.max(0, Math.min(1, intensity));
  const rows = rgb.map((c) => {
    const k = a * (1 - c);
    return [k * 0.2126, k * 0.7152, k * 0.0722, 0, 1 - a + a * c].map((n) => +n.toFixed(5)).join(' ');
  });
  return [...rows, '0 0 0 1 0'].join(' ');
}

/** Key that changes whenever the overlay moves (stale change results are flagged). */
export const transformKey = (t: Similarity) => [t.scale, t.rotation, t.tx, t.ty].map((n) => n.toFixed(4)).join(',');

// ---------------------------------------------------------------------------
// Ink masks

function inkFromCanvas(c: HTMLCanvasElement, threshold = 0.9): Mask {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const out = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    if (lum < threshold) out[j] = 1;
  }
  return { w: c.width, h: c.height, data: out };
}

async function renderCanvas(sheet: Sheet, pxPerPt: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  await renderPage(sheet.fileId, sheet.pageIndex, c, pxPerPt);
  return c;
}

/** Sheet B's drawing in sheet A's pixel frame, placed by `t`. */
async function alignedCanvas(a: Sheet, b: Sheet, t: Similarity, pxPerPt: number): Promise<HTMLCanvasElement> {
  const src = await renderCanvas(b, pxPerPt * t.scale);
  const out = document.createElement('canvas');
  out.width = Math.round(a.width * pxPerPt);
  out.height = Math.round(a.height * pxPerPt);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  // src pixel q = pB · pxPerPt · s  →  out pixel = pxPerPt · (s R pB + t) = R q + t · pxPerPt
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  ctx.setTransform(c, s, -s, c, t.tx * pxPerPt, t.ty * pxPerPt);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Share of B's line work that lands on A's line work with this alignment. */
export async function measureAgreement(a: Sheet, b: Sheet, t: Similarity, pxPerPt = 0.5): Promise<number> {
  // Any ink counts: thin lines are faint at this resolution and land on slightly different pixels.
  const ma = inkFromCanvas(await renderCanvas(a, pxPerPt), 0.97);
  const mb = inkFromCanvas(await alignedCanvas(a, b, t, pxPerPt), 0.97);
  return inkAgreement(ma, mb, 2);
}

// ---------------------------------------------------------------------------
// Auto align

export interface AutoAlignResult {
  transform: Similarity;
  by: 'text' | 'image';
  matches: number;
  agreement: number;
}

/** Image registration for drawings without text (scans): shift only, scale from the page sizes. */
async function alignByImage(a: Sheet, b: Sheet): Promise<Similarity> {
  const n = 1024;
  const px = n / Math.max(a.width, a.height);
  // Scans of the same sheet at different sizes: start from the page-size ratio.
  const scale = Math.abs(a.width / a.height - b.width / b.height) < 0.03 ? a.width / b.width : 1;
  const frame = (m: Mask) => {
    const out = new Float32Array(n * n);
    for (let y = 0; y < Math.min(n, m.h); y++) for (let x = 0; x < Math.min(n, m.w); x++) out[y * n + x] = m.data[y * m.w + x];
    return out;
  };
  const ma = inkFromCanvas(await renderCanvas(a, px));
  const mb = inkFromCanvas(await renderCanvas(b, px * scale));
  const r = phaseCorrelate(frame(ma), frame(mb), n);
  return { scale, rotation: 0, tx: r.dx / px, ty: r.dy / px };
}

/** Line sheet B up with sheet A: by matching their text, or by image correlation when there is none. */
export async function autoAlign(a: Sheet, b: Sheet): Promise<AutoAlignResult> {
  const [ta, tb] = await Promise.all([pageText(a.fileId, a.pageIndex), pageText(b.fileId, b.pageIndex)]);
  const text = alignByText(ta, tb);
  let textAgreement = -1;
  if (text) {
    textAgreement = await measureAgreement(a, b, text.t);
    if (textAgreement > 0.5) return { transform: text.t, by: 'text', matches: text.matches, agreement: textAgreement };
  }
  const image = await alignByImage(a, b);
  const agreement = await measureAgreement(a, b, image);
  // Keep the text result if the image one is no better.
  if (text && textAgreement >= agreement) return { transform: text.t, by: 'text', matches: text.matches, agreement: textAgreement };
  return { transform: image, by: 'image', matches: 0, agreement };
}

// ---------------------------------------------------------------------------
// Changes

export type Sensitivity = 'low' | 'medium' | 'high';

/**
 * Areas where the overlaid drawings differ, in sheet A's page points (padded for clouding).
 * Line work is compared as images; text is compared as text, so a single changed digit is found too.
 */
export async function findSheetChanges(a: Sheet, b: Sheet, t: Similarity, sensitivity: Sensitivity = 'medium') {
  const px = Math.min(1, Math.sqrt(4_500_000 / (a.width * a.height)));
  const ma = inkFromCanvas(await renderCanvas(a, px));
  const mb = inkFromCanvas(await alignedCanvas(a, b, t, px));
  const minSize = { low: 80, medium: 30, high: 12 }[sensitivity];
  const raster = findChanges(ma, mb, { tolerance: 1, group: Math.round(10 * px), minSize }).map((x) => ({
    kind: x.kind,
    x: x.x / px,
    y: x.y / px,
    w: x.w / px,
    h: x.h / px,
  }));
  const [ta, tb] = await Promise.all([pageText(a.fileId, a.pageIndex), pageText(b.fileId, b.pageIndex)]);
  const text = textChanges(ta, tb, t, sensitivity === 'low' ? 6 : 4);
  const pad = 10;
  return mergeBoxes([...raster, ...text], 6)
    .sort((p, q) => p.y - q.y || p.x - q.x)
    .map((x, i) => ({
      id: `chg${i + 1}`,
      kind: x.kind,
      x: Math.max(0, x.x - pad),
      y: Math.max(0, x.y - pad),
      w: Math.min(a.width, x.w + pad * 2),
      h: Math.min(a.height, x.h + pad * 2),
    }));
}

/** Where a point on sheet A falls on sheet B, and back. */
export const toB = (t: Similarity, p: { x: number; y: number }) => applySim(invertSim(t), p);
export const toA = (t: Similarity, p: { x: number; y: number }) => applySim(t, p);
