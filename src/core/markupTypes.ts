import type { MarkupStyle, MarkupType } from '../types';

export interface TypeInfo {
  label: string;
  /** Text shown in the markups list "Type" column (Bluebeam style). */
  listName: string;
  measure: boolean;
  /** How points are captured. */
  input: 'two-point' | 'multi' | 'drag-rect' | 'freehand' | 'click' | 'callout';
  closed?: boolean;
  minPoints: number;
  shortcut?: string;
}

export const TYPE_INFO: Record<MarkupType, TypeInfo> = {
  length: { label: 'Length', listName: 'Length Measurement', measure: true, input: 'two-point', minPoints: 2, shortcut: 'Shift+Alt+L' },
  polylength: { label: 'Polylength', listName: 'Polylength Measurement', measure: true, input: 'multi', minPoints: 2, shortcut: 'Shift+Alt+P' },
  perimeter: { label: 'Perimeter', listName: 'Perimeter Measurement', measure: true, input: 'multi', closed: true, minPoints: 3 },
  area: { label: 'Area', listName: 'Area Measurement', measure: true, input: 'multi', closed: true, minPoints: 3, shortcut: 'Shift+Alt+A' },
  volume: { label: 'Volume', listName: 'Volume Measurement', measure: true, input: 'multi', closed: true, minPoints: 3 },
  count: { label: 'Count', listName: 'Count Measurement', measure: true, input: 'click', minPoints: 1, shortcut: 'Shift+Alt+C' },
  angle: { label: 'Angle', listName: 'Angle Measurement', measure: true, input: 'multi', minPoints: 3 },
  text: { label: 'Text Box', listName: 'Text Box', measure: false, input: 'drag-rect', minPoints: 2, shortcut: 'T' },
  callout: { label: 'Callout', listName: 'Callout', measure: false, input: 'callout', minPoints: 3, shortcut: 'Q' },
  cloud: { label: 'Cloud', listName: 'Cloud', measure: false, input: 'multi', closed: true, minPoints: 3, shortcut: 'K' },
  rectangle: { label: 'Rectangle', listName: 'Rectangle', measure: false, input: 'drag-rect', minPoints: 2, shortcut: 'R' },
  ellipse: { label: 'Ellipse', listName: 'Ellipse', measure: false, input: 'drag-rect', minPoints: 2, shortcut: 'E' },
  line: { label: 'Line', listName: 'Line', measure: false, input: 'two-point', minPoints: 2, shortcut: 'L' },
  arrow: { label: 'Arrow', listName: 'Arrow', measure: false, input: 'two-point', minPoints: 2, shortcut: 'A' },
  polyline: { label: 'Polyline', listName: 'Polyline', measure: false, input: 'multi', minPoints: 2, shortcut: 'N' },
  polygon: { label: 'Polygon', listName: 'Polygon', measure: false, input: 'multi', closed: true, minPoints: 3, shortcut: 'G' },
  pen: { label: 'Pen', listName: 'Pen', measure: false, input: 'freehand', minPoints: 2, shortcut: 'P' },
  highlight: { label: 'Highlight', listName: 'Highlight', measure: false, input: 'drag-rect', minPoints: 2, shortcut: 'H' },
  stamp: { label: 'Stamp', listName: 'Stamp', measure: false, input: 'drag-rect', minPoints: 2 },
};

export const MEASURE_TYPES: MarkupType[] = ['length', 'polylength', 'area', 'perimeter', 'volume', 'count', 'angle'];
export const MARKUP_TYPES: MarkupType[] = ['text', 'callout', 'cloud', 'rectangle', 'ellipse', 'line', 'arrow', 'polyline', 'polygon', 'pen', 'highlight', 'stamp'];

export const BASE_STYLE: MarkupStyle = {
  color: '#ff0000',
  fillColor: null,
  fillOpacity: 0.3,
  opacity: 1,
  lineWidth: 2,
  lineStyle: 'solid',
  fontSize: 14,
  symbol: 'circle',
  symbolSize: 9,
  lineStart: 'none',
  lineEnd: 'none',
};

export function defaultStyle(type: MarkupType): MarkupStyle {
  switch (type) {
    case 'length':
      return { ...BASE_STYLE, color: '#e8112d', lineStart: 'tick', lineEnd: 'tick' };
    case 'polylength':
      return { ...BASE_STYLE, color: '#e8112d', lineWidth: 2.5 };
    case 'perimeter':
      return { ...BASE_STYLE, color: '#1f6feb', lineWidth: 2.5 };
    case 'area':
      return { ...BASE_STYLE, color: '#1f6feb', fillColor: '#1f6feb', fillOpacity: 0.25 };
    case 'volume':
      return { ...BASE_STYLE, color: '#7a3cc9', fillColor: '#7a3cc9', fillOpacity: 0.25 };
    case 'count':
      return { ...BASE_STYLE, color: '#e8112d', fillColor: '#e8112d', fillOpacity: 0.35, symbol: 'circle', symbolSize: 9 };
    case 'angle':
      return { ...BASE_STYLE, color: '#d97706' };
    case 'text':
      return { ...BASE_STYLE, color: '#e8112d', lineWidth: 0, fontSize: 16 };
    case 'callout':
      return { ...BASE_STYLE, color: '#e8112d', lineWidth: 1.5, fillColor: '#ffffff', fillOpacity: 1, fontSize: 14, lineStart: 'arrow' };
    case 'cloud':
      return { ...BASE_STYLE, color: '#e8112d', lineWidth: 2 };
    case 'rectangle':
    case 'ellipse':
    case 'polygon':
      return { ...BASE_STYLE, color: '#e8112d' };
    case 'line':
    case 'polyline':
      return { ...BASE_STYLE, color: '#e8112d' };
    case 'arrow':
      return { ...BASE_STYLE, color: '#e8112d', lineEnd: 'arrow' };
    case 'pen':
      return { ...BASE_STYLE, color: '#e8112d', lineWidth: 2 };
    case 'highlight':
      return { ...BASE_STYLE, color: '#ffe600', fillColor: '#ffe600', fillOpacity: 0.4, lineWidth: 0 };
    case 'stamp':
      return { ...BASE_STYLE, color: '#1a8f3a', lineWidth: 3, fontSize: 28 };
  }
}

export const STAMP_TEXTS = ['APPROVED', 'REVIEWED', 'REJECTED', 'REVISE & RESUBMIT', 'FOR CONSTRUCTION', 'NOT FOR CONSTRUCTION', 'DRAFT', 'COMPLETED', 'VOID'];
