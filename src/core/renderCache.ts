// Rendered pages kept as ImageBitmaps (held by the GPU in Chromium), so a sheet shows instantly when
// you come back to it, and the next and previous sheets can be rendered ahead while you work.

import type { RenderTask } from 'pdfjs-dist';
import { renderPage } from './pdf';

interface Entry {
  bmp: ImageBitmap;
  scale: number;
  px: number;
  used: number;
}

const cache = new Map<string, Entry[]>();
let budgetPx = 48_000_000;
let totalPx = 0;
let tick = 0;

const keyOf = (fileId: string, pageIndex: number) => `${fileId}#${pageIndex}`;

export const CACHE_SIZES = { small: 20_000_000, normal: 48_000_000, large: 110_000_000 } as const;
export type CacheSize = keyof typeof CACHE_SIZES;

export function setRenderCacheSize(size: CacheSize) {
  budgetPx = CACHE_SIZES[size] ?? CACHE_SIZES.normal;
  evict();
}

function evict() {
  if (totalPx <= budgetPx) return;
  const all = [...cache.entries()].flatMap(([k, list]) => list.map((e) => ({ k, e })));
  all.sort((a, b) => a.e.used - b.e.used);
  for (const { k, e } of all) {
    if (totalPx <= budgetPx * 0.85) break;
    const list = cache.get(k)!.filter((x) => x !== e);
    if (list.length) cache.set(k, list);
    else cache.delete(k);
    totalPx -= e.px;
    e.bmp.close();
  }
}

/** The best kept render of a page for a scale: the smallest at least ~80 % of it, else the largest. */
export function cachedRender(fileId: string, pageIndex: number, scale: number): Entry | undefined {
  const list = cache.get(keyOf(fileId, pageIndex));
  if (!list?.length) return undefined;
  const good = list.filter((e) => e.scale >= scale * 0.8).sort((a, b) => a.scale - b.scale)[0];
  const e = good ?? [...list].sort((a, b) => b.scale - a.scale)[0];
  e.used = ++tick;
  return e;
}

/** Keep a finished render. */
export async function keepRender(fileId: string, pageIndex: number, scale: number, canvas: HTMLCanvasElement | OffscreenCanvas) {
  if (typeof createImageBitmap !== 'function' || !canvas.width || !canvas.height) return;
  const px = canvas.width * canvas.height;
  if (px > budgetPx / 2) return;
  const bmp = await createImageBitmap(canvas);
  const k = keyOf(fileId, pageIndex);
  // One render per page and (roughly) scale.
  const list = (cache.get(k) ?? []).filter((e) => {
    if (Math.abs(e.scale - scale) / scale < 0.1) {
      totalPx -= e.px;
      e.bmp.close();
      return false;
    }
    return true;
  });
  list.push({ bmp, scale, px, used: ++tick });
  cache.set(k, list);
  totalPx += px;
  evict();
}

/** Drop a file's renders (closed or replaced). */
export function forgetRenders(fileId: string) {
  for (const [k, list] of cache)
    if (k.startsWith(`${fileId}#`)) {
      for (const e of list) {
        totalPx -= e.px;
        e.bmp.close();
      }
      cache.delete(k);
    }
}

// ---------------------------------------------------------------------------
// Rendering ahead, and making room for the sheet on screen
//
// PDF pages are drawn on the main thread, so background renders (sheets ahead, thumbnails) give way:
// when a sheet on screen needs rendering, they are cancelled and tried again later – except the one
// rendering the very sheet now wanted, which the view waits for instead.

let mainRenders = 0;
const waiting: (() => void)[] = [];

interface Background {
  key: string;
  task?: RenderTask;
  adopted: boolean;
}
const background = new Set<Background>();

/** Track renders of what is on screen: background work waits for them. */
export function mainRenderStarted(fileId?: string, pageIndex?: number) {
  mainRenders++;
  const keep = fileId !== undefined && pageIndex !== undefined ? keyOf(fileId, pageIndex) : null;
  for (const b of background) if (!b.adopted && b.key !== keep) b.task?.cancel();
}
export function mainRenderDone() {
  mainRenders = Math.max(0, mainRenders - 1);
  if (!mainRenders) while (waiting.length) waiting.shift()!();
}
/** Resolves when nothing on screen is rendering (and the browser has a moment). */
export function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const go = () => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 500 });
      else setTimeout(resolve, 30);
    };
    if (!mainRenders) go();
    else waiting.push(go);
  });
}

/**
 * A render that gives way to the sheet on screen: waits until idle, and starts again (when idle) if a
 * sheet on screen needed the main thread meanwhile. Resolves null when `stillWanted` says to stop.
 */
export async function renderInBackground(fileId: string, pageIndex: number, scale: number, stillWanted: () => boolean = () => true): Promise<HTMLCanvasElement | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await whenIdle();
    if (!stillWanted()) return null;
    const b: Background = { key: keyOf(fileId, pageIndex), adopted: false };
    background.add(b);
    try {
      return await renderPage(fileId, pageIndex, document.createElement('canvas'), scale, undefined, (t) => (b.task = t));
    } catch (e) {
      if ((e as Error)?.name !== 'RenderingCancelledException') return null;
    } finally {
      background.delete(b);
    }
  }
  return null;
}

// Renders running ahead, so the page view can wait for one instead of starting the same render again.
const inflight = new Map<string, { scale: number; promise: Promise<HTMLCanvasElement | null> }>();

/** A render of this page running ahead at a usable scale, if there is one (it is then not cancelled). */
export function renderAhead(fileId: string, pageIndex: number, scale: number): Promise<HTMLCanvasElement | null> | undefined {
  const k = keyOf(fileId, pageIndex);
  const r = inflight.get(k);
  if (!r || r.scale < scale * 0.8 || r.scale > scale * 1.25) return undefined;
  for (const b of background) if (b.key === k) b.adopted = true;
  return r.promise;
}

let prefetchGen = 0;

/** Render these pages ahead (in order, one at a time, when idle); a newer request replaces this one. */
export function prefetch(pages: { fileId: string; pageIndex: number }[], scale: number) {
  const gen = ++prefetchGen;
  void (async () => {
    for (const p of pages) {
      if (gen !== prefetchGen) return;
      const have = cachedRender(p.fileId, p.pageIndex, scale);
      if (have && have.scale >= scale * 0.8) continue;
      const k = keyOf(p.fileId, p.pageIndex);
      if (inflight.has(k)) continue;
      const promise = renderInBackground(p.fileId, p.pageIndex, scale, () => gen === prefetchGen)
        .then(async (off) => {
          if (off) await keepRender(p.fileId, p.pageIndex, scale, off);
          return off;
        })
        .finally(() => inflight.delete(k));
      inflight.set(k, { scale, promise });
      await promise;
    }
  })();
}
