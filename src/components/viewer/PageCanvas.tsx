import { useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { Rect, Sheet } from '../../types';
import { renderPage } from '../../core/pdf';

interface Props {
  sheet: Sheet;
  zoom: number;
  /** Visible page region in page points (for high-zoom detail rendering). */
  visible: Rect;
}

const MAX_BASE_PIXELS = 14_000_000;

/**
 * Two-layer page rendering: a base canvas for the whole page (resolution capped) plus a
 * detail canvas that re-renders just the visible region at full resolution when zoomed in.
 */
export function PageCanvas({ sheet, zoom, visible }: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const [baseScale, setBaseScale] = useState(0);
  const [detail, setDetail] = useState<{ rect: Rect; key: string } | null>(null);
  const baseTask = useRef<RenderTask | null>(null);
  const detailTask = useRef<RenderTask | null>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxBase = Math.sqrt(MAX_BASE_PIXELS / (sheet.width * sheet.height));
  const wantBase = Math.min(maxBase, Math.max(0.25, zoom * dpr));

  // Reset when the sheet changes.
  useEffect(() => {
    setBaseScale(0);
    setDetail(null);
  }, [sheet.id]);

  // Base layer: re-render when the desired resolution drifts by more than ~20%.
  useEffect(() => {
    if (baseScale && Math.abs(wantBase - baseScale) / baseScale < 0.2 && !(wantBase >= maxBase && baseScale < maxBase)) return;
    const t = setTimeout(
      () => {
        const canvas = baseRef.current;
        if (!canvas) return;
        baseTask.current?.cancel();
        const scale = wantBase;
        renderPage(sheet.fileId, sheet.pageIndex, canvas, scale, undefined, (task) => (baseTask.current = task))
          .then(() => setBaseScale(scale))
          .catch(() => {});
      },
      baseScale ? 180 : 0,
    );
    return () => clearTimeout(t);
  }, [sheet.fileId, sheet.pageIndex, sheet.id, wantBase, baseScale, maxBase]);

  // Detail layer for zoom levels beyond the base resolution.
  const needDetail = baseScale > 0 && zoom * dpr > baseScale * 1.08;
  const vKey = `${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.w)},${Math.round(visible.h)},${zoom.toFixed(4)}`;
  useEffect(() => {
    if (!needDetail) {
      detailTask.current?.cancel();
      setDetail(null);
      return;
    }
    const t = setTimeout(() => {
      const canvas = detailRef.current;
      if (!canvas) return;
      // Render a margin around the visible area so small pans stay sharp.
      const mx = visible.w * 0.15;
      const my = visible.h * 0.15;
      const x0 = Math.max(0, visible.x - mx);
      const y0 = Math.max(0, visible.y - my);
      const x1 = Math.min(sheet.width, visible.x + visible.w + mx);
      const y1 = Math.min(sheet.height, visible.y + visible.h + my);
      if (x1 <= x0 || y1 <= y0) return;
      const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      detailTask.current?.cancel();
      renderPage(sheet.fileId, sheet.pageIndex, canvas, zoom * dpr, rect, (task) => (detailTask.current = task))
        .then(() => setDetail({ rect, key: vKey }))
        .catch(() => {});
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needDetail, vKey, sheet.id]);

  useEffect(
    () => () => {
      baseTask.current?.cancel();
      detailTask.current?.cancel();
    },
    [],
  );

  return (
    <>
      <canvas ref={baseRef} className="page-canvas" style={{ opacity: baseScale ? 1 : 0 }} />
      <canvas
        ref={detailRef}
        className="page-canvas detail"
        style={
          detail && needDetail
            ? { left: detail.rect.x * zoom, top: detail.rect.y * zoom, width: detail.rect.w * zoom, height: detail.rect.h * zoom, display: 'block' }
            : { display: 'none' }
        }
      />
      {!baseScale && <div className="page-loading">Rendering…</div>}
    </>
  );
}
