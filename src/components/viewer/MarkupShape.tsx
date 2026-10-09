import { memo, type CSSProperties } from 'react';
import type { FontFamily, Markup, Pt } from '../../types';
import { cloudPath, labelPoint, pointsToPath } from '../../core/geometry';
import {
  calloutAnchor,
  calloutBox,
  dashArray,
  lineEndPath,
  markupRect,
  OPEN_SYMBOLS,
  polylineLabelAnchor,
  stampFontSize,
  symbolPath,
  uprightAngle,
} from '../../core/shapes';

interface Props {
  m: Markup;
  /** Measurement label lines joined by \n. */
  label: string;
  showLabels: boolean;
  draft?: boolean;
}

const LABEL_FONT = 'Arial, Helvetica, sans-serif';

export function cssFontFamily(f: FontFamily | undefined): string {
  if (f === 'Times') return '"Times New Roman", Times, serif';
  if (f === 'Courier') return '"Courier New", Courier, monospace';
  return LABEL_FONT;
}

function strokeStyle(m: Markup, width = m.style.lineWidth): CSSProperties {
  const d = dashArray(m.style);
  return {
    stroke: m.style.color,
    strokeWidth: `max(${width}px, var(--px, 1px))`,
    strokeDasharray: d?.join(' '),
    strokeLinecap: m.style.lineStyle === 'dotted' ? 'round' : 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };
}

function fillStyle(m: Markup): CSSProperties {
  return m.style.fillColor ? { fill: m.style.fillColor, fillOpacity: m.style.fillOpacity } : { fill: 'none' };
}

function Halo({ x, y, lines, size, color, angle = 0, anchor = 'middle', valign = 'middle', family = LABEL_FONT, weight = 600 }: {
  family?: string;
  weight?: number;
  x: number;
  y: number;
  lines: string[];
  size: number;
  color: string;
  angle?: number;
  anchor?: 'start' | 'middle' | 'end';
  valign?: 'middle' | 'bottom';
}) {
  if (!lines.length) return null;
  const lh = size * 1.18;
  const startY = valign === 'middle' ? -((lines.length - 1) * lh) / 2 : -(lines.length - 1) * lh;
  return (
    <text
      className="mk-label"
      transform={`translate(${x},${y}) rotate(${(angle * 180) / Math.PI})`}
      fontSize={size}
      fontFamily={family}
      fontWeight={weight}
      textAnchor={anchor}
      dominantBaseline={valign === 'middle' ? 'central' : 'auto'}
      fill={color}
      stroke="#fff"
      strokeWidth={size * 0.22}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {lines.map((l, i) => (
        <tspan key={i} x={0} y={startY + i * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function Ends({ m, pts }: { m: Markup; pts: Pt[] }) {
  if (pts.length < 2) return null;
  const lw = m.style.lineWidth;
  const start = lineEndPath(pts[0], pts[1], m.style.lineStart, lw);
  const end = lineEndPath(pts[pts.length - 1], pts[pts.length - 2], m.style.lineEnd, lw);
  return (
    <>
      {[start, end].map((e, i) =>
        e ? (
          <path
            key={i}
            d={e.d}
            style={e.filled ? { fill: m.style.color, stroke: m.style.color, strokeWidth: `max(${lw * 0.5}px, var(--px))` } : { ...strokeStyle(m), strokeDasharray: undefined }}
          />
        ) : null,
      )}
    </>
  );
}

/** Wide invisible stroke that makes thin markups easy to click. */
function Hit({ d }: { d: string }) {
  return <path className="mk-hit" d={d} />;
}

function body(m: Markup, label: string, showLabels: boolean, draft: boolean) {
  const pts = m.points;
  const lines = showLabels && label ? label.split('\n') : [];
  const fs = m.style.fontSize;
  const labelColor = m.style.color;
  const ff = cssFontFamily(m.style.fontFamily);
  const fw = m.style.fontBold === false ? 400 : 600;

  switch (m.type) {
    case 'length':
    case 'line':
    case 'arrow': {
      if (pts.length < 2) return null;
      const d = pointsToPath(pts, false);
      const [a, b] = pts;
      const ang = uprightAngle(Math.atan2(b.y - a.y, b.x - a.x));
      const off = fs * 0.55 + m.style.lineWidth;
      const mx = (a.x + b.x) / 2 + Math.sin(ang) * off;
      const my = (a.y + b.y) / 2 - Math.cos(ang) * off;
      return (
        <>
          {!draft && <Hit d={d} />}
          <path d={d} style={strokeStyle(m)} />
          <Ends m={m} pts={pts} />
          {lines.length > 0 && <Halo family={ff} weight={fw} x={mx} y={my} lines={lines} size={fs} color={labelColor} angle={ang} valign="bottom" />}
        </>
      );
    }
    case 'polylength':
    case 'polyline':
    case 'pen': {
      if (pts.length < 2) return null;
      const d = pointsToPath(pts, false);
      const anchor = polylineLabelAnchor(pts);
      const off = fs * 0.55 + m.style.lineWidth;
      return (
        <>
          {!draft && <Hit d={d} />}
          <path d={d} style={strokeStyle(m)} />
          {m.type !== 'pen' && <Ends m={m} pts={pts} />}
          {lines.length > 0 && (
            <Halo family={ff} weight={fw}
              x={anchor.p.x + Math.sin(anchor.angle) * off}
              y={anchor.p.y - Math.cos(anchor.angle) * off}
              lines={lines}
              size={fs}
              color={labelColor}
              angle={anchor.angle}
              valign="bottom"
            />
          )}
        </>
      );
    }
    case 'perimeter':
    case 'area':
    case 'volume':
    case 'polygon': {
      if (pts.length < 2) return null;
      const closed = pts.length > 2;
      let d = pointsToPath(pts, closed);
      for (const c of m.cutouts ?? []) d += pointsToPath(c, true);
      const lp = labelPoint(pts);
      return (
        <>
          {!draft && <Hit d={d} />}
          <path d={d} fillRule="evenodd" style={{ ...strokeStyle(m), ...(m.type === 'perimeter' ? {} : fillStyle(m)) }} />
          {lines.length > 0 && <Halo family={ff} weight={fw} x={lp.x} y={lp.y} lines={lines} size={fs} color={labelColor} />}
        </>
      );
    }
    case 'angle': {
      if (pts.length < 2) return null;
      const d = pointsToPath(pts, false);
      let arc = '';
      if (pts.length >= 3) {
        const [a, b, c] = pts;
        const r = Math.min(40, Math.hypot(a.x - b.x, a.y - b.y) * 0.4, Math.hypot(c.x - b.x, c.y - b.y) * 0.4);
        const a1 = Math.atan2(a.y - b.y, a.x - b.x);
        const a2 = Math.atan2(c.y - b.y, c.x - b.x);
        let delta = a2 - a1;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        arc = `M${b.x + Math.cos(a1) * r},${b.y + Math.sin(a1) * r}A${r},${r} 0 0,${delta > 0 ? 1 : 0} ${b.x + Math.cos(a2) * r},${b.y + Math.sin(a2) * r}`;
        const mid = a1 + delta / 2;
        return (
          <>
            {!draft && <Hit d={d} />}
            <path d={d} style={strokeStyle(m)} />
            <path d={arc} style={{ ...strokeStyle(m), strokeDasharray: undefined }} />
            {lines.length > 0 && <Halo family={ff} weight={fw} x={b.x + Math.cos(mid) * (r + fs)} y={b.y + Math.sin(mid) * (r + fs)} lines={lines} size={fs} color={labelColor} />}
          </>
        );
      }
      return <path d={d} style={strokeStyle(m)} />;
    }
    case 'count': {
      const r = m.style.symbolSize;
      const open = OPEN_SYMBOLS.has(m.style.symbol);
      const d = pts.map((p) => symbolPath(m.style.symbol, p, r)).join('');
      const last = pts[pts.length - 1];
      return (
        <>
          <path
            d={d}
            className="mk-count"
            style={{
              stroke: m.style.color,
              strokeWidth: `max(${open ? Math.max(1.5, r * 0.3) : Math.max(1, r * 0.16)}px, var(--px))`,
              fill: open ? 'none' : m.style.fillColor ?? m.style.color,
              fillOpacity: open ? undefined : m.style.fillOpacity,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
          {lines.length > 0 && last && (
            <Halo family={ff} weight={fw} x={last.x + r * 1.5} y={last.y - r * 1.2} lines={lines} size={Math.max(8, r * 1.2)} color={labelColor} anchor="start" valign="bottom" />
          )}
        </>
      );
    }
    case 'cloud': {
      if (pts.length < 2) return null;
      const d = cloudPath(pts, Math.max(14, m.style.lineWidth * 9), pts.length > 2 && !draft);
      return (
        <>
          {!draft && <Hit d={d} />}
          <path d={d} style={{ ...strokeStyle(m), ...fillStyle(m), strokeDasharray: undefined }} />
        </>
      );
    }
    case 'rectangle':
    case 'highlight': {
      const r = markupRect(m);
      const hl = m.type === 'highlight';
      return (
        <>
          {!draft && !hl && <Hit d={`M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}Z`} />}
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            style={{
              ...(m.style.lineWidth > 0 ? strokeStyle(m) : { stroke: 'none' }),
              ...fillStyle(m),
              mixBlendMode: hl ? 'multiply' : undefined,
            }}
          />
        </>
      );
    }
    case 'ellipse': {
      const r = markupRect(m);
      const d = `M${r.x},${r.y + r.h / 2}a${r.w / 2},${r.h / 2} 0 1,0 ${r.w},0a${r.w / 2},${r.h / 2} 0 1,0 ${-r.w},0`;
      return (
        <>
          {!draft && <Hit d={d} />}
          <path d={d} style={{ ...strokeStyle(m), ...fillStyle(m) }} />
        </>
      );
    }
    case 'text':
    case 'callout': {
      if (m.type === 'callout' && pts.length < 3) {
        return pts.length === 2 ? <path d={pointsToPath(pts, false)} style={strokeStyle(m)} /> : null;
      }
      const r = m.type === 'text' ? markupRect(m) : calloutBox(m);
      let leader: JSX.Element | null = null;
      if (m.type === 'callout') {
        const tip = pts[0];
        const anc = calloutAnchor(tip, r);
        const end = lineEndPath(tip, anc, m.style.lineStart === 'none' ? 'none' : m.style.lineStart, m.style.lineWidth);
        leader = (
          <>
            <Hit d={`M${tip.x},${tip.y}L${anc.x},${anc.y}`} />
            <path d={`M${tip.x},${tip.y}L${anc.x},${anc.y}`} style={{ ...strokeStyle(m), strokeDasharray: undefined }} />
            {end && <path d={end.d} style={end.filled ? { fill: m.style.color, stroke: m.style.color } : strokeStyle(m)} />}
          </>
        );
      }
      return (
        <>
          {leader}
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            className="mk-textbox"
            style={{ ...(m.style.lineWidth > 0 ? strokeStyle(m) : { stroke: 'none' }), ...(m.style.fillColor ? fillStyle(m) : { fill: 'transparent' }) }}
          />
          <foreignObject x={r.x} y={r.y} width={Math.max(1, r.w)} height={Math.max(1, r.h)} style={{ pointerEvents: 'none' }}>
            <div
              className="mk-text"
              style={{ fontSize: fs, color: m.style.color, fontFamily: ff, fontWeight: m.style.fontBold ? 700 : 400, padding: Math.max(2, fs * 0.25), lineHeight: 1.2 }}
            >
              {m.text}
            </div>
          </foreignObject>
        </>
      );
    }
    case 'stamp': {
      const r = markupRect(m);
      const text = m.text || 'STAMP';
      const size = stampFontSize(text, r);
      const lw = m.style.lineWidth;
      return (
        <>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(r.h, r.w) * 0.12} style={{ ...strokeStyle(m), fill: 'rgba(255,255,255,0.01)', strokeDasharray: undefined }} />
          <rect
            x={r.x + lw * 1.8}
            y={r.y + lw * 1.8}
            width={Math.max(0, r.w - lw * 3.6)}
            height={Math.max(0, r.h - lw * 3.6)}
            rx={Math.min(r.h, r.w) * 0.09}
            style={{ ...strokeStyle(m, lw * 0.45), strokeDasharray: undefined }}
          />
          <text
            x={r.x + r.w / 2}
            y={r.y + r.h / 2}
            fontSize={size}
            fontFamily={ff}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
            fill={m.style.color}
            letterSpacing={size * 0.04}
          >
            {text}
          </text>
        </>
      );
    }
  }
}

export const MarkupShape = memo(function MarkupShape({ m, label, showLabels, draft = false }: Props) {
  return (
    <g data-mid={draft ? undefined : m.id} className={`mk mk-${m.type}${m.locked ? ' locked' : ''}`} opacity={m.style.opacity}>
      {body(m, label, showLabels, draft)}
    </g>
  );
});
