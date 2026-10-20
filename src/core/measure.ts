import type { Markup, MeasureValues, ProjectSettings, Pt, Scale, Sheet, Viewport } from '../types';
import { angleAt, centroid, pointInRect, polygonArea, polygonPerimeter, polylineLength } from './geometry';
import { TYPE_INFO } from './markupTypes';
import { DEFAULT_SCALE, displayScale, fmtLen, fmtNumber, formatArea, formatAreaAs, formatLength, formatVolume, formatVolumeAs, lengthValue, unitPrecision } from './units';

/** Viewport containing a point; for overlapping viewports the last-defined wins. */
export function viewportAt(sheet: Sheet, p: Pt): Viewport | undefined {
  for (let i = sheet.viewports.length - 1; i >= 0; i--) {
    if (pointInRect(p, sheet.viewports[i].rect)) return sheet.viewports[i];
  }
  return undefined;
}

/** Scale applying to a point on a sheet: viewport scale if inside one, else the sheet scale. */
export function scaleAt(sheet: Sheet | undefined, p: Pt | undefined): Scale {
  if (!sheet) return DEFAULT_SCALE;
  if (p) {
    const vp = viewportAt(sheet, p);
    if (vp) return displayScale(vp.scale);
  }
  return sheet.scale ? displayScale(sheet.scale) : DEFAULT_SCALE;
}

export function anchorPoint(m: Pick<Markup, 'type' | 'points'>): Pt | undefined {
  if (!m.points.length) return undefined;
  if (TYPE_INFO[m.type].closed) return centroid(m.points);
  return m.points[0];
}

/** The scale a markup is measured with, written in its own length unit when it has one. */
export function scaleForMarkup(m: Pick<Markup, 'type' | 'points'> & { units?: Markup['units'] }, sheet: Sheet | undefined): Scale {
  const s = scaleAt(sheet, anchorPoint(m));
  const u = m.units?.length;
  return u && u !== s.unit && s !== DEFAULT_SCALE ? { ...s, unit: u, precision: unitPrecision(u) } : s;
}

/** Measurements that take a Width: counts (each piece) and runs (a strip). */
export const takesWidth = (t: Markup['type']) => t === 'count' || t === 'length' || t === 'polylength' || t === 'perimeter';
/** …a Depth: those, and areas (a volume) and volumes. */
export const takesDepth = (t: Markup['type']) => takesWidth(t) || t === 'area' || t === 'volume';
/** …a Height: counts (the length of each piece). */
export const takesHeight = (t: Markup['type']) => t === 'count';

/** A count's Height (the Height column): the length of each piece counted, real inches (0: none). */
export function markupHeight(m: { custom?: Markup['custom'] }): number {
  const h = lengthValue(m.custom?.height);
  return h != null && h > 0 ? h : 0;
}

type Measurable = Pick<Markup, 'type' | 'points' | 'cutouts' | 'depth' | 'countOverride'> & { width?: number; custom?: Markup['custom'] };

export function computeMeasure(m: Measurable, scale: Scale): MeasureValues {
  const k = scale.realPerPt;
  const w = m.width && m.width > 0 ? m.width : 0;
  const d = m.depth && m.depth > 0 ? m.depth : 0;
  /** A run with a width is a strip (its area), and with a depth too, a volume. */
  const run = (length: number): MeasureValues => {
    const v: MeasureValues = { length };
    if (w) v.area = length * w;
    if (w && d) v.volume = length * w * d;
    return v;
  };
  switch (m.type) {
    case 'length':
    case 'polylength':
      return run(polylineLength(m.points) * k);
    case 'perimeter':
      return run(polygonPerimeter(m.points) * k);
    case 'area':
    case 'volume': {
      let a = polygonArea(m.points);
      for (const c of m.cutouts ?? []) a -= polygonArea(c);
      a = Math.max(0, a);
      const area = a * k * k;
      let perim = polygonPerimeter(m.points);
      for (const c of m.cutouts ?? []) perim += polygonPerimeter(c);
      const v: MeasureValues = { area, perimeter: perim * k };
      if (m.type === 'volume') v.volume = area * (m.depth ?? 0);
      else if (d) v.volume = area * d;
      return v;
    }
    case 'count': {
      // Each piece counted can have a size: Height its length (a plate 1'-2" long), Width × Height its
      // area, × Depth its volume.
      const n = m.countOverride ?? m.points.length;
      const v: MeasureValues = { count: n };
      const h = markupHeight(m);
      if (h) v.length = n * h;
      if (h && w) v.area = n * w * h;
      if (h && w && d) v.volume = n * w * h * d;
      return v;
    }
    case 'angle':
      return m.points.length >= 3 ? { angle: angleAt(m.points[0], m.points[1], m.points[2]) } : {};
    default:
      return {};
  }
}

type WithUnits = Pick<Markup, 'type'> & { units?: Markup['units'] };

/** An area in the markup's own area unit, else the sheet's family and the project's unit. */
export function areaText(m: WithUnits, sqIn: number, scale: Scale, s: ProjectSettings): string {
  return m.units?.area ? formatAreaAs(sqIn, m.units.area, s.decimals) : formatArea(sqIn, scale.unit, s);
}

export function volumeText(m: WithUnits, cuIn: number, scale: Scale, s: ProjectSettings): string {
  return m.units?.volume ? formatVolumeAs(cuIn, m.units.volume, s.decimals) : formatVolume(cuIn, scale.unit, s);
}

/** A dimension of a markup (Depth, Width, Height) in its own unit for them, else your units. */
export function dimText(m: { units?: Markup['units'] }, inches: number): string {
  const u = m.units?.dim;
  return u ? formatLength(inches, u, unitPrecision(u)) : fmtLen(inches);
}

/** Primary measurement text shown on the drawing and in the "Measurement" column. */
export function measurementText(m: WithUnits, v: MeasureValues, scale: Scale, s: ProjectSettings): string {
  switch (m.type) {
    case 'length':
    case 'polylength':
    case 'perimeter':
      return formatLength(v.length ?? 0, scale.unit, scale.precision);
    case 'area':
      return areaText(m, v.area ?? 0, scale, s);
    case 'volume':
      return volumeText(m, v.volume ?? 0, scale, s);
    case 'count':
      return fmtNumber(v.count ?? 0, 0);
    case 'angle':
      return `${fmtNumber(v.angle ?? 0, 1)}°`;
    default:
      return '';
  }
}

/** Multi-line label lines drawn on the sheet for a measurement markup. */
export function drawingLabelLines(m: WithUnits & Pick<Markup, 'label'>, v: MeasureValues, scale: Scale, s: ProjectSettings): string[] {
  const main = measurementText(m, v, scale, s);
  const lines: string[] = [];
  if (m.label) lines.push(m.label);
  if (m.type === 'area' || m.type === 'volume') {
    lines.push(main);
    if (m.type === 'volume') lines.push(areaText(m, v.area ?? 0, scale, s));
    else if (v.volume != null) lines.push(volumeText(m, v.volume, scale, s));
    if (s.showPerimeterOnArea) lines.push(`P: ${formatLength(v.perimeter ?? 0, scale.unit, scale.precision)}`);
  } else if (main) {
    lines.push(main);
    // Counts with a Height, lengths with a Width: what they come to.
    if (m.type === 'count' && v.length != null) lines.push(formatLength(v.length, scale.unit, scale.precision));
    if (m.type !== 'angle' && v.area != null) lines.push(areaText(m, v.area, scale, s));
    if (m.type !== 'angle' && v.volume != null) lines.push(volumeText(m, v.volume, scale, s));
  }
  return lines;
}
