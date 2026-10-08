// Core data model for the takeoff workspace.
// All geometry is stored in "page points": PDF points (1/72 in) in the page's
// displayed (rotated) orientation, origin at the top-left corner.

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MeasureType = 'length' | 'polylength' | 'perimeter' | 'area' | 'volume' | 'count' | 'angle';

export type AnnotType =
  | 'text'
  | 'callout'
  | 'cloud'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polyline'
  | 'polygon'
  | 'pen'
  | 'highlight'
  | 'stamp';

export type MarkupType = MeasureType | AnnotType;

export type LengthUnit = 'ft-in' | 'ft' | 'in' | 'm' | 'cm' | 'mm';

export interface Scale {
  /** Real-world inches represented by one PDF point. */
  realPerPt: number;
  /** Human readable description, e.g. 1/8" = 1'-0". */
  label: string;
  /** Display unit for lengths measured with this scale. */
  unit: LengthUnit;
  /** ft-in: fraction denominator (1,2,4,8,16,32). Decimal units: decimal places. */
  precision: number;
}

export interface Viewport {
  id: string;
  name: string;
  rect: Rect;
  scale: Scale;
}

export interface SourceFile {
  id: string;
  name: string;
  pageCount: number;
}

export interface Sheet {
  id: string;
  fileId: string;
  /** 0-based page index in the source file. */
  pageIndex: number;
  number: string;
  title: string;
  /** Displayed page size in points. */
  width: number;
  height: number;
  rotation: number;
  scale: Scale | null;
  viewports: Viewport[];
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type CountSymbol = 'circle' | 'square' | 'triangle' | 'diamond' | 'check' | 'cross' | 'star';
export type LineEnd = 'none' | 'arrow' | 'tick' | 'dot';
export type MarkupStatus = 'None' | 'Accepted' | 'Rejected' | 'Cancelled' | 'Completed';

export const STATUSES: MarkupStatus[] = ['None', 'Accepted', 'Rejected', 'Cancelled', 'Completed'];

export interface MarkupStyle {
  color: string;
  fillColor: string | null;
  fillOpacity: number;
  opacity: number;
  lineWidth: number;
  lineStyle: LineStyle;
  fontSize: number;
  symbol: CountSymbol;
  symbolSize: number;
  lineStart: LineEnd;
  lineEnd: LineEnd;
}

export type CustomValue = string | number;

export interface Markup {
  id: string;
  sheetId: string;
  type: MarkupType;
  points: Pt[];
  /** Area/volume cutouts (holes). */
  cutouts?: Pt[][];
  text?: string;
  subject: string;
  label: string;
  comments: string;
  author: string;
  created: number;
  modified: number;
  status: MarkupStatus;
  checked: boolean;
  layer: string;
  style: MarkupStyle;
  /** Volume depth in real inches. */
  depth?: number;
  custom: Record<string, CustomValue>;
  toolId?: string;
  locked?: boolean;
}

export type ColumnKind = 'text' | 'number' | 'choice' | 'formula';

export interface CustomColumn {
  id: string;
  name: string;
  kind: ColumnKind;
  options?: string[];
  formula?: string;
  defaultValue?: string;
  decimals?: number;
  suffix?: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

export type ReportLengthUnit = 'ft' | 'in' | 'm';
export type ReportAreaUnit = 'sf' | 'sy' | 'm2';
export type ReportVolumeUnit = 'cy' | 'cf' | 'm3';

export interface ProjectSettings {
  lengthUnit: ReportLengthUnit;
  areaUnit: ReportAreaUnit;
  volumeUnit: ReportVolumeUnit;
  decimals: number;
  showPerimeterOnArea: boolean;
}

export interface DocState {
  files: SourceFile[];
  sheets: Sheet[];
  markups: Markup[];
  columns: CustomColumn[];
  layers: Layer[];
  settings: ProjectSettings;
}

export interface ChestTool {
  id: string;
  name: string;
  type: MarkupType;
  subject: string;
  label?: string;
  text?: string;
  style: MarkupStyle;
  depth?: number;
  layer?: string;
  /** Custom column values keyed by column NAME so tools survive across projects. */
  custom: Record<string, CustomValue>;
}

export interface ToolSet {
  id: string;
  name: string;
  collapsed?: boolean;
  tools: ChestTool[];
}

/** Computed measurement values in base units (inches). */
export interface MeasureValues {
  length?: number;
  perimeter?: number;
  area?: number;
  volume?: number;
  count?: number;
  angle?: number;
}
