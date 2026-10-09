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
/** Label/text typeface; maps to the PDF standard fonts on export. */
export type FontFamily = 'Helvetica' | 'Times' | 'Courier';
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
  fontFamily?: FontFamily;
  /** Undefined: measurement labels bold, text boxes regular. */
  fontBold?: boolean;
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
  /** Count markups: a manually entered quantity that replaces the number of symbols. */
  countOverride?: number;
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
  /** Standard details: rules that add material to markups matching a condition. */
  standardDetails?: StandardDetail[];
}

// ---------------------------------------------------------------------------
// Standard details
//
// IF [column] = value  →  ADD material (subject, size, length) @ spacing OC, × quantity or full length.

export type DetailOp = 'eq' | 'neq' | 'contains';

export interface DetailCondition {
  /** List column id ('subject', 'layer', 'c:<custom id>', …). */
  column: string;
  op: DetailOp;
  value: string;
}

/**
 * spacing – pieces along the measured length at a spacing on center (posts @ 48" OC)
 * each    – a fixed number of pieces per markup, or per counted item (2 clip angles per beam)
 * full    – one piece the full measured length, times the value (continuous members)
 */
export type DetailRule = 'spacing' | 'each' | 'full';

export interface DetailItem {
  id: string;
  subject: string;
  size: string;
  /** Length of each piece, ft-in text (bare numbers are inches). Blank for items counted only. */
  length: string;
  rule: DetailRule;
  /** Spacing (ft-in text, bare numbers are inches) for 'spacing'; a number for 'each' and 'full'. */
  value: string;
  /** Spacing rule: add one for the end piece (posts at both ends). */
  addEnd: boolean;
}

export interface StandardDetail {
  id: string;
  name: string;
  enabled: boolean;
  /** All must match (AND). */
  conditions: DetailCondition[];
  items: DetailItem[];
  /** Category for the added material; blank keeps the markup's own category. */
  category: string;
}

/**
 * A "size tool" keeps a typed size (e.g. W18x35) on the tool itself. Every markup placed with it is
 * labelled with that size until the size is changed in the Tool Chest.
 */
export interface SizeToolConfig {
  /** Shape family prefix such as W, HSS, L, C; empty for free text. */
  family: string;
  value: string;
  /** Use the size as the markup subject (groups the takeoff by size). */
  setSubject: boolean;
  /** Write the size into the Member Size column (drives PLF/PSF weight formulas). */
  setMemberSize: boolean;
}

export interface ChestTool {
  id: string;
  name: string;
  hidden?: boolean;
  sizeTool?: SizeToolConfig;
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
  hidden?: boolean;
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
