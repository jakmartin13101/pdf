import {
  Box,
  CircleDot,
  Cloud,
  Highlighter,
  Hexagon,
  Minus,
  MoveUpRight,
  MessageSquareText,
  PenLine,
  Pentagon,
  Ruler,
  Spline,
  Square,
  Circle,
  Stamp,
  Triangle,
  Type,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import type { ChestTool, MarkupStyle, MarkupType } from '../types';
import { symbolPath } from '../core/shapes';

export const TYPE_ICON: Record<MarkupType, LucideIcon> = {
  length: Ruler,
  polylength: Spline,
  perimeter: Hexagon,
  area: Pentagon,
  volume: Box,
  count: CircleDot,
  angle: Triangle,
  text: Type,
  callout: MessageSquareText,
  cloud: Cloud,
  rectangle: Square,
  ellipse: Circle,
  line: Minus,
  arrow: MoveUpRight,
  polyline: Waypoints,
  polygon: Pentagon,
  pen: PenLine,
  highlight: Highlighter,
  stamp: Stamp,
};

/** Small preview of a tool chest tool's appearance. */
export function ToolSwatch({ tool, size = 26 }: { tool: Pick<ChestTool, 'type' | 'style' | 'text'>; size?: number }) {
  const s: MarkupStyle = tool.style;
  const c = s.color;
  const lw = Math.min(4, Math.max(1.2, s.lineWidth * 0.7));
  const dash = s.lineStyle === 'dashed' ? '4 2.5' : s.lineStyle === 'dotted' ? '0.5 2.5' : undefined;
  const fill = s.fillColor ?? 'none';
  let body: JSX.Element;
  switch (tool.type) {
    case 'count':
      body = (
        <path
          d={symbolPath(s.symbol, { x: 13, y: 13 }, 6.5)}
          fill={s.symbol === 'check' || s.symbol === 'cross' ? 'none' : s.fillColor ?? c}
          fillOpacity={s.fillOpacity}
          stroke={c}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      );
      break;
    case 'area':
    case 'volume':
    case 'polygon':
    case 'perimeter':
      body = (
        <path
          d="M4 20 L7 6 L19 4 L22 17 Z"
          fill={tool.type === 'perimeter' ? 'none' : fill}
          fillOpacity={s.fillOpacity}
          stroke={c}
          strokeWidth={lw}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      );
      break;
    case 'polylength':
    case 'polyline':
      body = <path d="M3 20 L10 9 L16 16 L23 5" fill="none" stroke={c} strokeWidth={lw} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />;
      break;
    case 'cloud':
      body = <path d="M5 17a3 3 0 0 1 1-6 4 4 0 0 1 7-3 3.5 3.5 0 0 1 6 2 3 3 0 0 1 1 6z" fill="none" stroke={c} strokeWidth={1.6} />;
      break;
    case 'highlight':
      body = <rect x={3} y={8} width={20} height={10} fill={c} fillOpacity={0.6} />;
      break;
    case 'stamp':
      body = (
        <>
          <rect x={2} y={7} width={22} height={12} rx={2} fill="none" stroke={c} strokeWidth={1.6} />
          <text x={13} y={15.5} fontSize={6} fontWeight={800} textAnchor="middle" fill={c}>
            {(tool.text ?? 'OK').slice(0, 5)}
          </text>
        </>
      );
      break;
    case 'text':
    case 'callout':
      body = (
        <>
          <rect x={3} y={6} width={20} height={14} fill={s.fillColor ?? 'none'} stroke={c} strokeWidth={1.2} />
          <text x={13} y={16.5} fontSize={9} fontWeight={700} textAnchor="middle" fill={c}>
            T
          </text>
        </>
      );
      break;
    case 'rectangle':
      body = <rect x={4} y={7} width={18} height={12} fill={fill} fillOpacity={s.fillOpacity} stroke={c} strokeWidth={lw} strokeDasharray={dash} />;
      break;
    case 'ellipse':
      body = <ellipse cx={13} cy={13} rx={9} ry={6.5} fill={fill} fillOpacity={s.fillOpacity} stroke={c} strokeWidth={lw} strokeDasharray={dash} />;
      break;
    case 'pen':
      body = <path d="M3 18c4-9 7 4 11-3s5-6 9-4" fill="none" stroke={c} strokeWidth={lw} strokeLinecap="round" />;
      break;
    case 'angle':
      body = <path d="M4 21 L22 21 M4 21 L17 6 M11 21 A7 7 0 0 0 9 15" fill="none" stroke={c} strokeWidth={lw} />;
      break;
    default:
      body = (
        <>
          <path d="M3 19 L23 7" fill="none" stroke={c} strokeWidth={lw} strokeDasharray={dash} strokeLinecap="round" />
          {(tool.type === 'length' || tool.type === 'arrow') && (
            <path d={tool.type === 'arrow' ? 'M23 7 l-6 0.5 l3 5 z' : 'M1 16.5 l4 5 M21 4.5 l4 5'} fill={c} stroke={c} strokeWidth={1.2} />
          )}
        </>
      );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" className="tool-swatch" aria-hidden>
      {body}
    </svg>
  );
}
