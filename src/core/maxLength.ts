// Maximum lengths by shape (Settings → Length Measurements). A length or polylength measurement longer
// than its shape's maximum is taken off as pieces along the same line: with W at 40'-0", a 63'-0" line
// becomes a 40'-0" markup and a 23'-0" markup, end to end.

import type { Markup, Pt, Sheet } from '../types';
import { computeMeasure, scaleForMarkup } from './measure';
import { dist, polylineLength } from './geometry';
import { findSubject, subjectForSize } from './subjects';
import { normName } from './formula';

export interface MaxLengthPrefs {
  /** Break measurements longer than their shape's maximum into pieces. */
  enabled: boolean;
  /** Maximum length per shape, real inches (no entry: no maximum). */
  byShape: Record<string, number>;
  /** Maximum for measurements whose shape has none of its own (0: no maximum). */
  other: number;
  /** Also break members found by the automatic takeoff. */
  autoTakeoff: boolean;
}

export const defaultMaxLengths = (): MaxLengthPrefs => ({ enabled: true, byShape: {}, other: 0, autoTakeoff: true });

/** Shorter leftovers than this (real inches) are not a piece of their own. */
const EPS = 1 / 16;

/** Types that are broken up: open measured lines. */
export const SPLITTABLE = new Set<Markup['type']>(['length', 'polylength']);

/**
 * A markup's shape: its subject when that is a shape, else the shape of its Member Size (`sizeCol`: the
 * Member Size column's id) or of its label.
 */
export function markupShape(m: Markup, subjects: string[], sizeCol?: string): string | undefined {
  const own = findSubject(m.subject, subjects);
  if (own) return own;
  const size = sizeCol ? String(m.custom[sizeCol] ?? '') : '';
  return subjectForSize(size, subjects) ?? subjectForSize(m.label, subjects);
}

/** The maximum length (real inches) for a markup, or 0 when it has none. */
export function maxLengthFor(m: Markup, prefs: MaxLengthPrefs, subjects: string[], sizeCol?: string): number {
  if (!prefs.enabled || !SPLITTABLE.has(m.type)) return 0;
  const shape = markupShape(m, subjects, sizeCol);
  const own = shape ? Object.entries(prefs.byShape).find(([k]) => normName(k) === normName(shape))?.[1] : undefined;
  const max = own ?? prefs.other;
  return max > 0 ? max : 0;
}

/**
 * Cut a line (page points) whose real length is `real` into pieces of at most `max` (both in real inches):
 * full pieces from the start, the rest last. One piece when it is not longer than the maximum.
 */
export function cutAtMax(pts: Pt[], real: number, max: number): Pt[][] {
  if (pts.length < 2 || !(max > 0) || !(real > max + EPS)) return [pts];
  const page = polylineLength(pts);
  if (!(page > 0)) return [pts];
  const k = page / real; // page points per real inch
  const cuts: number[] = [];
  for (let d = max; d < real - EPS; d += max) cuts.push(d * k);
  const pieces: Pt[][] = [];
  let piece: Pt[] = [pts[0]];
  let at = 0;
  let c = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    while (c < cuts.length && cuts[c] <= at + l + 1e-9) {
      const t = l > 0 ? (cuts[c] - at) / l : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      piece.push(p);
      pieces.push(piece);
      piece = [p];
      c++;
    }
    piece.push(b);
    at += l;
  }
  pieces.push(piece);
  // A cut on a corner leaves the corner twice.
  return pieces.map((pc) => pc.filter((p, i) => i === 0 || dist(p, pc[i - 1]) > 1e-9)).filter((pc) => pc.length >= 2);
}

/**
 * The pieces a markup is taken off as: itself, or one markup per piece when it is longer than its shape's
 * maximum. The first piece keeps the markup's id; `newId` names the others.
 */
export function splitMarkupAtMax(
  m: Markup,
  sheet: Sheet | undefined,
  prefs: MaxLengthPrefs,
  subjects: string[],
  newId: () => string,
  sizeCol?: string,
): Markup[] {
  const max = maxLengthFor(m, prefs, subjects, sizeCol);
  if (!max) return [m];
  const real = computeMeasure(m, scaleForMarkup(m, sheet)).length ?? 0;
  const parts = cutAtMax(m.points, real, max);
  if (parts.length < 2) return [m];
  return parts.map((points, i) => ({ ...m, id: i === 0 ? m.id : newId(), points, custom: { ...m.custom } }));
}
