// Overlay compare layers for the viewer: sheet A and sheet B in their own colours, multiplied.
import type { ReactNode } from 'react';
import type { Rect, Sheet, SheetCompare } from '../../types';
import type { CompareChange } from '../../store/store';
import { applySim, invertSim } from '../../core/align';
import { tintMatrix } from '../../core/compare';
import { PageCanvas } from './PageCanvas';

/** SVG colour filters for the two sheets (referenced by CSS `filter: url(#…)`). */
export function TintDefs({ id, cmp }: { id: string; cmp: SheetCompare }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <filter id={`${id}-a`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={tintMatrix(cmp.colorA, cmp.intensityA)} />
        </filter>
        <filter id={`${id}-b`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={tintMatrix(cmp.colorB, cmp.intensityB)} />
        </filter>
      </defs>
    </svg>
  );
}

/** Sheet A's drawing in its overlay colour. */
export function LayerA({ id, show, children }: { id: string; show: boolean; children: ReactNode }) {
  return (
    <div className="cmp-layer" style={{ filter: `url(#${id}-a)`, opacity: show ? 1 : 0 }} data-testid="overlay-a">
      {children}
    </div>
  );
}

/** Sheet B placed on sheet A by the overlay transform, multiplied over A. */
export function LayerB({ id, other, cmp, zoom, visible }: { id: string; other: Sheet; cmp: SheetCompare; zoom: number; visible: Rect }) {
  const t = cmp.transform;
  // Render B at its on-screen resolution; the wrapper only rotates and moves it.
  const zb = zoom * t.scale;
  const inv = invertSim(t);
  const corners = [
    { x: visible.x, y: visible.y },
    { x: visible.x + visible.w, y: visible.y },
    { x: visible.x, y: visible.y + visible.h },
    { x: visible.x + visible.w, y: visible.y + visible.h },
  ].map((p) => applySim(inv, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const vb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  return (
    <div
      className="cmp-layer b"
      style={{
        width: other.width * zb,
        height: other.height * zb,
        right: 'auto',
        bottom: 'auto',
        transform: `matrix(${c}, ${s}, ${-s}, ${c}, ${t.tx * zoom}, ${t.ty * zoom})`,
        filter: `url(#${id}-b)`,
      }}
      data-testid="overlay-b"
    >
      <PageCanvas sheet={other} zoom={zb} visible={vb} />
    </div>
  );
}

const CHANGE_COLORS: Record<CompareChange['kind'], string> = { added: '#1f6feb', removed: '#e8112d', changed: '#c2187c' };

/** Dashed boxes around the differences found between the two sheets. */
export function ChangeBoxes({ changes, zoom, colors }: { changes: CompareChange[]; zoom: number; colors?: { a: string; b: string } }) {
  const col = (k: CompareChange['kind']) => (k === 'added' ? colors?.b : k === 'removed' ? colors?.a : undefined) ?? CHANGE_COLORS[k];
  return (
    <g className="cmp-changes" pointerEvents="none">
      {changes.map((c, i) => (
        <g key={c.id}>
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={8 / zoom}
            fill="none"
            stroke={col(c.kind)}
            strokeWidth={2 / zoom}
            strokeDasharray={`${8 / zoom} ${5 / zoom}`}
            data-testid="change-box"
          />
          <text x={c.x + 3 / zoom} y={c.y - 4 / zoom} fontSize={11 / zoom} fill={col(c.kind)} fontWeight={700}>
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Numbered markers for the points picked while aligning by points. */
export function AlignMarkers({ points, zoom, color }: { points: { x: number; y: number }[]; zoom: number; color: string }) {
  const r = 9 / zoom;
  return (
    <g pointerEvents="none">
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={color} strokeWidth={2 / zoom} />
          <line x1={p.x - r * 1.6} y1={p.y} x2={p.x + r * 1.6} y2={p.y} stroke={color} strokeWidth={1 / zoom} />
          <line x1={p.x} y1={p.y - r * 1.6} x2={p.x} y2={p.y + r * 1.6} stroke={color} strokeWidth={1 / zoom} />
          <text x={p.x + r * 1.2} y={p.y - r * 1.2} fontSize={13 / zoom} fontWeight={700} fill={color}>
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
}
