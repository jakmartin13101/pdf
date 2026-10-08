import type { Markup, MeasureValues, ProjectSettings, Pt, Scale, Sheet, Viewport } from '../types';
import { angleAt, centroid, pointInRect, polygonArea, polygonPerimeter, polylineLength } from './geometry';
import { TYPE_INFO } from './markupTypes';
import { DEFAULT_SCALE, fmtNumber, formatArea, formatLength, formatVolume } from './units';

/** Viewport containing a point, last-defined wins (Bluebeam behaviour for overlapping viewports). */
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
    if (vp) return vp.scale;
  }
  return sheet.scale ?? DEFAULT_SCALE;
}

export function anchorPoint(m: Pick<Markup, 'type' | 'points'>): Pt | undefined {
  if (!m.points.length) return undefined;
  if (TYPE_INFO[m.type].closed) return centroid(m.points);
  return m.points[0];
}

export function scaleForMarkup(m: Pick<Markup, 'type' | 'points'>, sheet: Sheet | undefined): Scale {
  return scaleAt(sheet, anchorPoint(m));
}

export function computeMeasure(m: Pick<Markup, 'type' | 'points' | 'cutouts' | 'depth'>, scale: Scale): MeasureValues {
  const k = scale.realPerPt;
  switch (m.type) {
    case 'length':
    case 'polylength':
      return { length: polylineLength(m.points) * k };
    case 'perimeter':
      return { length: polygonPerimeter(m.points) * k };
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
      return v;
    }
    case 'count':
      return { count: m.points.length };
    case 'angle':
      return m.points.length >= 3 ? { angle: angleAt(m.points[0], m.points[1], m.points[2]) } : {};
    default:
      return {};
  }
}

/** Primary measurement text shown on the drawing and in the "Measurement" column. */
export function measurementText(m: Pick<Markup, 'type'>, v: MeasureValues, scale: Scale, s: ProjectSettings): string {
  switch (m.type) {
    case 'length':
    case 'polylength':
    case 'perimeter':
      return formatLength(v.length ?? 0, scale.unit, scale.precision);
    case 'area':
      return formatArea(v.area ?? 0, scale.unit, s);
    case 'volume':
      return formatVolume(v.volume ?? 0, scale.unit, s);
    case 'count':
      return fmtNumber(v.count ?? 0, 0);
    case 'angle':
      return `${fmtNumber(v.angle ?? 0, 1)}°`;
    default:
      return '';
  }
}

/** Multi-line label lines drawn on the sheet for a measurement markup. */
export function drawingLabelLines(m: Pick<Markup, 'type' | 'label'>, v: MeasureValues, scale: Scale, s: ProjectSettings): string[] {
  const main = measurementText(m, v, scale, s);
  const lines: string[] = [];
  if (m.label) lines.push(m.label);
  if (m.type === 'area' || m.type === 'volume') {
    lines.push(main);
    if (m.type === 'volume') lines.push(formatArea(v.area ?? 0, scale.unit, s));
    if (s.showPerimeterOnArea) lines.push(`P: ${formatLength(v.perimeter ?? 0, scale.unit, scale.precision)}`);
  } else if (main) {
    lines.push(main);
  }
  return lines;
}
