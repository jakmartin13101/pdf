// Fine adjustment of a straight measurement's ends: lengthen or shorten either end (or both) by a step.
import { Minus, Plus } from 'lucide-react';
import type { MarkupStyle, Pt } from '../types';
import { getState, useStore } from '../store/store';
import { dashArray } from '../core/shapes';

/** Steps in real inches, with how they read. */
const FT_IN_STEPS: [number, string][] = [
  [1 / 16, '1/16"'],
  [1 / 8, '1/8"'],
  [1 / 4, '1/4"'],
  [1 / 2, '1/2"'],
  [1, '1"'],
  [3, '3"'],
  [6, '6"'],
  [12, `1'-0"`],
];
const METRIC_STEPS: [number, string][] = [
  [1 / 25.4, '1 mm'],
  [5 / 25.4, '5 mm'],
  [10 / 25.4, '10 mm'],
  [50 / 25.4, '50 mm'],
  [100 / 25.4, '100 mm'],
];

export function stepOptions(metric: boolean) {
  return metric ? METRIC_STEPS : FT_IN_STEPS;
}

/** The option closest to a step (steps are stored in inches). */
export function nearestStep(step: number, metric: boolean): number {
  const opts = stepOptions(metric);
  return opts.reduce((best, [v]) => (Math.abs(Math.log(v / step)) < Math.abs(Math.log(best / step)) ? v : best), opts[0][0]);
}

/** What to call a line's two ends: Left/Right, Top/Bottom, or Start/End for sloped lines. */
export function endNames(a: Pt, b: Pt): [string, string] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) <= Math.abs(dx) * 0.05) return dx >= 0 ? ['Left', 'Right'] : ['Right', 'Left'];
  if (Math.abs(dx) <= Math.abs(dy) * 0.05) return dy >= 0 ? ['Top', 'Bottom'] : ['Bottom', 'Top'];
  return ['Start', 'End'];
}

export function StepSelect({ metric, testId }: { metric: boolean; testId?: string }) {
  const step = useStore((s) => s.prefs.adjustStep);
  const value = nearestStep(step, metric);
  return (
    <select value={value} onChange={(e) => getState().setPrefs({ adjustStep: Number(e.target.value) })} title="How much each click adds or removes" data-testid={testId}>
      {stepOptions(metric).map(([v, label]) => (
        <option key={label} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/**
 * − / + buttons for each end and both ends. `onAdjust` gets the change at the start and the end in
 * real inches (positive lengthens).
 */
export function EndAdjuster({ names, metric, onAdjust, testId = 'adjust' }: { names: [string, string]; metric: boolean; onAdjust: (dStart: number, dEnd: number) => void; testId?: string }) {
  const step = nearestStep(useStore((s) => s.prefs.adjustStep), metric);
  const pair = (label: string, key: string, fn: (d: number) => void) => (
    <div className="adj-pair">
      <span>{label}</span>
      <button className="icon-btn" title={`Shorten ${label.toLowerCase()} by the step`} onClick={() => fn(-step)} data-testid={`${testId}-${key}-minus`}>
        <Minus size={12} />
      </button>
      <button className="icon-btn" title={`Lengthen ${label.toLowerCase()} by the step`} onClick={() => fn(step)} data-testid={`${testId}-${key}-plus`}>
        <Plus size={12} />
      </button>
    </div>
  );
  return (
    <div className="adj">
      <div className="adj-row">
        {pair(`${names[0]} end`, 'start', (d) => onAdjust(d, 0))}
        {pair(`${names[1]} end`, 'end', (d) => onAdjust(0, d))}
        {pair('Both', 'both', (d) => onAdjust(d, d))}
      </div>
      <label className="adj-step">
        Step <StepSelect metric={metric} testId={`${testId}-step`} />
      </label>
    </div>
  );
}

/** A short sample of a line style. */
/** A short sample of a line style; with `label`, a sample label above it in the text colour. */
export function LineSample({ style, width = 34, label }: { style: Pick<MarkupStyle, 'color' | 'lineWidth' | 'lineStyle' | 'opacity' | 'fontColor'>; width?: number; label?: boolean }) {
  const lw = Math.min(Math.max(style.lineWidth, 0.5), 8);
  const dash = dashArray({ ...style, lineWidth: lw } as MarkupStyle);
  const h = label ? 22 : 12;
  const y = label ? 16 : 6;
  return (
    <svg className="line-sample" width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden>
      {label && (
        <text x={width / 2} y={9} textAnchor="middle" fontSize={9} fontWeight={700} fill={style.fontColor || style.color}>
          W24
        </text>
      )}
      <line x1={3} y1={y} x2={width - 3} y2={y} stroke={style.color} strokeWidth={lw} strokeOpacity={style.opacity} strokeDasharray={dash?.join(' ')} strokeLinecap="round" />
    </svg>
  );
}
