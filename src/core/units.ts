import type { LengthUnit, ProjectSettings, Scale } from '../types';

export const PT_PER_IN = 72;
const IN_PER_M = 39.37007874015748;

export const LENGTH_UNITS: { id: LengthUnit; label: string; metric: boolean }[] = [
  { id: 'ft-in', label: "Feet-Inches (ft' in\")", metric: false },
  { id: 'ft', label: 'Decimal Feet (ft)', metric: false },
  { id: 'in', label: 'Inches (in)', metric: false },
  { id: 'm', label: 'Meters (m)', metric: true },
  { id: 'cm', label: 'Centimeters (cm)', metric: true },
  { id: 'mm', label: 'Millimeters (mm)', metric: true },
];

export function isMetric(unit: LengthUnit): boolean {
  return unit === 'm' || unit === 'cm' || unit === 'mm';
}

export const FRACTION_PRECISIONS = [1, 2, 4, 8, 16, 32];
export const DECIMAL_PRECISIONS = [0, 1, 2, 3, 4];

export function precisionOptions(unit: LengthUnit): { value: number; label: string }[] {
  if (unit === 'ft-in') {
    return FRACTION_PRECISIONS.map((d) => ({ value: d, label: d === 1 ? '1"' : `1/${d}"` }));
  }
  return DECIMAL_PRECISIONS.map((d) => ({ value: d, label: d === 0 ? '1' : '0.' + '0'.repeat(d - 1) + '1' }));
}

export function defaultPrecision(unit: LengthUnit): number {
  switch (unit) {
    case 'ft-in':
      return 1;
    case 'ft':
      return 2;
    case 'in':
      return 2;
    case 'm':
      return 3;
    case 'cm':
      return 1;
    case 'mm':
      return 0;
  }
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function fmtNumber(n: number, decimals: number): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format a real-world length given in inches. */
export function formatLength(inches: number, unit: LengthUnit, precision: number): string {
  if (!isFinite(inches)) return '—';
  const sign = inches < 0 ? '-' : '';
  const v = Math.abs(inches);
  switch (unit) {
    case 'ft-in': {
      const denom = Math.max(1, Math.round(precision));
      let totalUnits = Math.round(v * denom); // in 1/denom inches
      const unitsPerFoot = 12 * denom;
      const ft = Math.floor(totalUnits / unitsPerFoot);
      totalUnits -= ft * unitsPerFoot;
      const whole = Math.floor(totalUnits / denom);
      const frac = totalUnits - whole * denom;
      let inchStr = String(whole);
      if (frac > 0) {
        const g = gcd(frac, denom);
        inchStr += ` ${frac / g}/${denom / g}`;
      }
      return `${sign}${ft.toLocaleString('en-US')}'-${inchStr}"`;
    }
    case 'ft':
      return `${sign}${fmtNumber(v / 12, precision)}'`;
    case 'in':
      return `${sign}${fmtNumber(v, precision)}"`;
    case 'm':
      return `${sign}${fmtNumber(v / IN_PER_M, precision)} m`;
    case 'cm':
      return `${sign}${fmtNumber((v / IN_PER_M) * 100, precision)} cm`;
    case 'mm':
      return `${sign}${fmtNumber((v / IN_PER_M) * 1000, precision)} mm`;
  }
}

/**
 * Parse a user-entered length into inches.
 * Accepts: 20'-6 1/2", 20' 6", 20'6", 20', 6", 20-6, 20.5', 20.5 ft, 20 ft 6 in,
 * 246 in, 6.1 m, 610 cm, 6100 mm, 3/8", and plain numbers (interpreted in defaultUnit).
 */
export function parseLength(input: string, defaultUnit: LengthUnit = 'ft-in'): number | null {
  if (input == null) return null;
  let s = String(input)
    .trim()
    .toLowerCase()
    .replace(/[’′`]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/''/g, '"')
    .replace(/,/g, '');
  if (!s) return null;

  // Metric suffixes.
  const metric = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m|meters?|millimeters?|centimeters?)$/);
  if (metric) {
    const n = parseFloat(metric[1]);
    const u = metric[2];
    if (u.startsWith('mm') || u.startsWith('milli')) return (n / 1000) * IN_PER_M;
    if (u.startsWith('cm') || u.startsWith('centi')) return (n / 100) * IN_PER_M;
    return n * IN_PER_M;
  }

  s = s
    .replace(/\s*(feet|foot|ft)\b\.?/g, "'")
    .replace(/\s*(inches|inch|in)\b\.?/g, '"')
    .trim();

  const num = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
  const frac = String.raw`(\d+)\s*/\s*(\d+)`;

  const parseInches = (t: string): number | null => {
    t = t.trim().replace(/"$/, '').trim();
    if (!t) return 0;
    let m = t.match(new RegExp(`^${num}(?:\\s*[- ]\\s*${frac})?$`));
    if (m) {
      let v = parseFloat(m[1]);
      if (m[2]) v += parseInt(m[2], 10) / parseInt(m[3], 10);
      return v;
    }
    m = t.match(new RegExp(`^${frac}$`));
    if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
    return null;
  };

  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1).trim();
  }
  const apply = (v: number | null) => (v == null || !isFinite(v) ? null : neg ? -v : v);

  // Feet with optional inches: 20'-6 1/2", 20' 6", 20'6", 20.5'
  let m = s.match(new RegExp(`^${num}\\s*'\\s*-?\\s*(.*)$`));
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = parseInches(m[2]);
    if (inch == null) return null;
    return apply(ft * 12 + inch);
  }
  // Inches only: 6", 6 1/2", 3/8"
  if (s.endsWith('"')) {
    return apply(parseInches(s));
  }
  // Dash shorthand: 20-6, 20-6 1/2
  m = s.match(new RegExp(`^(\\d+)\\s*-\\s*(\\d+(?:\\.\\d+)?)(?:\\s+${frac})?$`));
  if (m) {
    let inch = parseFloat(m[2]);
    if (m[3]) inch += parseInt(m[3], 10) / parseInt(m[4], 10);
    return apply(parseInt(m[1], 10) * 12 + inch);
  }
  // Space-separated ft in: "20 6"
  m = s.match(new RegExp(`^(\\d+)\\s+(\\d+(?:\\.\\d+)?)(?:\\s+${frac})?$`));
  if (m && (defaultUnit === 'ft-in' || defaultUnit === 'ft')) {
    let inch = parseFloat(m[2]);
    if (m[3]) inch += parseInt(m[3], 10) / parseInt(m[4], 10);
    return apply(parseInt(m[1], 10) * 12 + inch);
  }
  // Plain number or fraction in default unit.
  const plain = parseInches(s);
  if (plain == null) return null;
  switch (defaultUnit) {
    case 'ft-in':
    case 'ft':
      return apply(plain * 12);
    case 'in':
      return apply(plain);
    case 'm':
      return apply(plain * IN_PER_M);
    case 'cm':
      return apply((plain / 100) * IN_PER_M);
    case 'mm':
      return apply((plain / 1000) * IN_PER_M);
  }
}

// ---------------------------------------------------------------------------
// Scales

export interface ScalePreset {
  group: 'Architectural' | 'Engineering' | 'Metric';
  label: string;
  realPerPt: number;
  unit: LengthUnit;
}

function arch(paperIn: number, label: string): ScalePreset {
  return { group: 'Architectural', label: `${label} = 1'-0"`, realPerPt: 12 / (paperIn * PT_PER_IN), unit: 'ft-in' };
}
function eng(ft: number): ScalePreset {
  return { group: 'Engineering', label: `1" = ${ft}'`, realPerPt: (ft * 12) / PT_PER_IN, unit: 'ft' };
}
function metricScale(n: number): ScalePreset {
  // 1 mm on paper = n mm real. 1 pt = 25.4/72 mm paper.
  return { group: 'Metric', label: `1:${n}`, realPerPt: n / PT_PER_IN, unit: n >= 50 ? 'm' : 'mm' };
}

export const SCALE_PRESETS: ScalePreset[] = [
  arch(1 / 32, '1/32"'),
  arch(1 / 16, '1/16"'),
  arch(3 / 32, '3/32"'),
  arch(1 / 8, '1/8"'),
  arch(3 / 16, '3/16"'),
  arch(1 / 4, '1/4"'),
  arch(3 / 8, '3/8"'),
  arch(1 / 2, '1/2"'),
  arch(3 / 4, '3/4"'),
  arch(1, '1"'),
  arch(1.5, '1 1/2"'),
  arch(3, '3"'),
  arch(6, '6"'),
  arch(12, '12"'),
  eng(10),
  eng(20),
  eng(30),
  eng(40),
  eng(50),
  eng(60),
  eng(100),
  eng(200),
  metricScale(1),
  metricScale(5),
  metricScale(10),
  metricScale(20),
  metricScale(25),
  metricScale(50),
  metricScale(100),
  metricScale(200),
  metricScale(250),
  metricScale(500),
  metricScale(1000),
];

export function scaleFromPreset(p: ScalePreset, unit?: LengthUnit, precision?: number): Scale {
  const u = unit ?? p.unit;
  return { realPerPt: p.realPerPt, label: p.label, unit: u, precision: precision ?? defaultPrecision(u) };
}

export function findPreset(label: string): ScalePreset | undefined {
  return SCALE_PRESETS.find((p) => p.label === label);
}

/** Describe a ratio of real inches per point as a familiar scale string. */
export function describeScale(realPerPt: number, metric = false): string {
  const candidates = SCALE_PRESETS.filter((p) => (p.group === 'Metric') === metric);
  for (const p of candidates) {
    if (Math.abs(p.realPerPt - realPerPt) / p.realPerPt < 0.005) return p.label;
  }
  const realPerPaperInch = realPerPt * PT_PER_IN;
  if (metric) return `1:${fmtNumber(realPerPaperInch, realPerPaperInch < 10 ? 2 : 0)}`;
  return `1" = ${formatLength(realPerPaperInch, 'ft-in', 4)}`;
}

/** Build a scale from a calibration: a known real distance (inches) over a PDF distance (points). */
export function calibratedScale(realInches: number, pdfPoints: number, unit: LengthUnit, precision: number): Scale {
  const realPerPt = realInches / pdfPoints;
  return { realPerPt, label: describeScale(realPerPt, isMetric(unit)), unit, precision };
}

/** Custom scale: paper distance (in paperUnit) = real distance (inches). */
export function customScale(paperValue: number, paperUnit: 'in' | 'mm', realInches: number, unit: LengthUnit, precision: number): Scale {
  const paperPts = paperUnit === 'in' ? paperValue * PT_PER_IN : (paperValue / 25.4) * PT_PER_IN;
  return calibratedScale(realInches, paperPts, unit, precision);
}

export const DEFAULT_SCALE: Scale = { realPerPt: 1 / PT_PER_IN, label: 'Not calibrated (1" = 1")', unit: 'in', precision: 2 };

// ---------------------------------------------------------------------------
// Report units

export const DEFAULT_SETTINGS: ProjectSettings = {
  lengthUnit: 'ft',
  areaUnit: 'sf',
  volumeUnit: 'cy',
  decimals: 2,
  showPerimeterOnArea: true,
};

export function lengthToReport(inches: number, s: ProjectSettings): number {
  switch (s.lengthUnit) {
    case 'ft':
      return inches / 12;
    case 'in':
      return inches;
    case 'm':
      return inches / IN_PER_M;
  }
}

export function areaToReport(sqIn: number, s: ProjectSettings): number {
  switch (s.areaUnit) {
    case 'sf':
      return sqIn / 144;
    case 'sy':
      return sqIn / 1296;
    case 'm2':
      return sqIn / (IN_PER_M * IN_PER_M);
  }
}

export function volumeToReport(cuIn: number, s: ProjectSettings): number {
  switch (s.volumeUnit) {
    case 'cf':
      return cuIn / 1728;
    case 'cy':
      return cuIn / 46656;
    case 'm3':
      return cuIn / (IN_PER_M * IN_PER_M * IN_PER_M);
  }
}

export const LENGTH_SUFFIX: Record<ProjectSettings['lengthUnit'], string> = { ft: 'LF', in: 'in', m: 'm' };
export const AREA_SUFFIX: Record<ProjectSettings['areaUnit'], string> = { sf: 'SF', sy: 'SY', m2: 'm²' };
export const VOLUME_SUFFIX: Record<ProjectSettings['volumeUnit'], string> = { cy: 'CY', cf: 'CF', m3: 'm³' };

/** Area/volume units used for on-drawing labels follow the sheet's length unit family. */
export function formatArea(sqIn: number, unit: LengthUnit, s: ProjectSettings): string {
  if (isMetric(unit)) return `${fmtNumber(sqIn / (IN_PER_M * IN_PER_M), s.decimals)} m²`;
  if (unit === 'in') return `${fmtNumber(sqIn, s.decimals)} sq in`;
  if (s.areaUnit === 'sy') return `${fmtNumber(sqIn / 1296, s.decimals)} sy`;
  return `${fmtNumber(sqIn / 144, s.decimals)} sf`;
}

export function formatVolume(cuIn: number, unit: LengthUnit, s: ProjectSettings): string {
  if (isMetric(unit)) return `${fmtNumber(cuIn / (IN_PER_M * IN_PER_M * IN_PER_M), s.decimals)} m³`;
  if (s.volumeUnit === 'cf') return `${fmtNumber(cuIn / 1728, s.decimals)} cf`;
  return `${fmtNumber(cuIn / 46656, s.decimals)} cy`;
}
