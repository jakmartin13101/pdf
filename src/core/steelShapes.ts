// Nominal weights for common structural shapes, used by the PLF()/PSF() formula functions.
// Rolled shapes carry their weight in the designation (W18x35 = 35 lb/ft). HSS, angles,
// plates and bars are computed from their nominal dimensions (steel = 490 lb/ft³).

const STEEL_LB_PER_IN2_FT = 490 / 144; // lb per linear foot per in² of section area

const PIPE_STD: Record<string, number> = {
  '1/2': 0.85, '3/4': 1.13, '1': 1.68, '1-1/4': 2.27, '1-1/2': 2.72, '2': 3.65, '2-1/2': 5.79, '3': 7.58,
  '3-1/2': 9.11, '4': 10.79, '5': 14.62, '6': 18.97, '8': 28.55, '10': 40.48, '12': 49.56,
};
const PIPE_XS: Record<string, number> = {
  '1/2': 1.09, '3/4': 1.47, '1': 2.17, '1-1/4': 3.0, '1-1/2': 3.63, '2': 5.02, '2-1/2': 7.66, '3': 10.25,
  '3-1/2': 12.5, '4': 14.98, '5': 20.78, '6': 28.57, '8': 43.39, '10': 54.74, '12': 65.42,
};

/** Approximate SJI K-series open web joist self weights (lb/ft). */
const K_JOISTS: Record<string, number> = {
  '10K1': 5.0, '12K1': 5.0, '12K3': 5.7, '12K5': 7.1, '14K1': 5.2, '14K3': 6.0, '14K4': 6.7, '14K6': 7.7,
  '16K2': 5.5, '16K3': 6.3, '16K4': 7.0, '16K5': 7.5, '16K6': 8.1, '16K7': 8.6, '18K3': 6.6, '18K4': 7.2,
  '18K5': 7.7, '18K6': 8.5, '18K7': 9.0, '20K3': 6.7, '20K4': 7.6, '20K5': 8.2, '20K6': 8.9, '20K7': 9.3,
  '22K4': 8.0, '22K5': 8.8, '22K6': 9.2, '22K7': 9.7, '24K4': 8.4, '24K5': 9.3, '24K6': 9.7, '24K7': 10.1,
  '24K8': 11.5, '26K5': 9.8, '26K6': 10.6, '26K7': 10.9, '28K6': 11.4, '28K7': 11.8, '28K8': 12.7,
  '30K7': 12.3, '30K8': 13.2,
};

/** Parse 3/8, 0.375, .375, 1-1/2, 1 1/2 into a number. */
export function parseDim(s: string): number | null {
  s = s.trim();
  let m = s.match(/^(\d+)[-\s](\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  m = s.match(/^(\d*\.?\d+)$/);
  if (m) return parseFloat(m[1]);
  return null;
}

function normalize(shape: string): string {
  return shape
    .toUpperCase()
    .replace(/[×*]/g, 'X')
    .replace(/["”″]/g, '')
    .replace(/\s*X\s*/g, 'X')
    .trim();
}

/** Weight in lb per linear foot, or 0 when the designation is not recognised. */
export function plf(shape: string): number {
  if (!shape) return 0;
  const s = normalize(shape);
  const compact = s.replace(/\s+/g, '');

  // Rolled shapes with weight in the name.
  let m = compact.match(/^(W|M|S|HP|C|MC|WT|MT|ST)(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[3]);

  // HSS rectangular / square: HSS6X6X3/8
  m = compact.match(/^HSS([\d./-]+)X([\d./-]+)X([\d./-]+)$/);
  if (m) {
    const a = parseDim(m[1]);
    const b = parseDim(m[2]);
    const t = parseDim(m[3]);
    if (a && b && t) {
      const area = 2 * t * (a + b) - 4 * t * t - (4 - Math.PI) * 3 * t * t;
      return round2(area * STEEL_LB_PER_IN2_FT);
    }
  }
  // HSS round: HSS6.625X.280
  m = compact.match(/^HSS([\d./-]+)X([\d./-]+)$/);
  if (m) {
    const d = parseDim(m[1]);
    const t = parseDim(m[2]);
    if (d && t) return round2(Math.PI * t * (d - t) * STEEL_LB_PER_IN2_FT);
  }
  // Angles: L4X4X3/8
  m = compact.match(/^(?:L|2L)([\d./-]+)X([\d./-]+)X([\d./-]+)$/);
  if (m) {
    const a = parseDim(m[1]);
    const b = parseDim(m[2]);
    const t = parseDim(m[3]);
    if (a && b && t) return round2(t * (a + b - t) * STEEL_LB_PER_IN2_FT * (compact.startsWith('2L') ? 2 : 1));
  }
  // Plates / flat bars with width: PL1/2X8, FB3/8X4
  m = compact.match(/^(?:PL|FB|BAR)([\d./-]+)X([\d./-]+)$/);
  if (m) {
    const t = parseDim(m[1]);
    const w = parseDim(m[2]);
    if (t && w) return round2(t * w * STEEL_LB_PER_IN2_FT);
  }
  // Round bar / rod: RB1, ROD3/4
  m = compact.match(/^(?:RB|ROD|RD)([\d./-]+)$/);
  if (m) {
    const d = parseDim(m[1]);
    if (d) return round2(((Math.PI * d * d) / 4) * STEEL_LB_PER_IN2_FT);
  }
  // Pipe: PIPE 6 STD, PIPE6XS
  m = s.match(/^PIPE\s*([\d\s/-]+?)\s*(STD|XS|X-STRONG)?$/);
  if (m) {
    const key = m[1].trim().replace(/\s+/, '-');
    const table = m[2] && m[2] !== 'STD' ? PIPE_XS : PIPE_STD;
    return table[key] ?? 0;
  }
  // Joists
  m = compact.match(/^(\d+K\d+)$/);
  if (m) return K_JOISTS[m[1]] ?? 0;
  return 0;
}

/** Weight in lb per square foot for plate designations (PL1/2, 1/2" Plate, 1/2 PL). */
export function psf(shape: string): number {
  if (!shape) return 0;
  const s = normalize(shape);
  let m = s.match(/^(?:PL|PLATE)\s*([\d./-]+)$/);
  if (!m) m = s.match(/^([\d./\s-]+?)\s*(?:PL|PLATE)$/);
  if (m) {
    const t = parseDim(m[1].trim());
    if (t) return round2(t * 12 * STEEL_LB_PER_IN2_FT);
  }
  return 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const COMMON_SHAPES = [
  'W8x31', 'W10x33', 'W12x26', 'W12x40', 'W14x22', 'W14x48', 'W16x26', 'W16x31', 'W18x35', 'W18x40',
  'W21x44', 'W21x50', 'W24x55', 'W24x68', 'W27x84', 'W30x90', 'W33x118', 'W36x135',
  'HSS4x4x1/4', 'HSS6x6x3/8', 'HSS8x8x1/2', 'HSS6x4x1/4', 'HSS6.625x.280',
  'L3x3x1/4', 'L4x4x3/8', 'L6x4x3/8', 'C8x11.5', 'C10x15.3', 'C12x20.7', 'MC12x31',
  'PL3/8', 'PL1/2', 'PL3/4', 'PL1', 'Pipe 4 Std', 'Pipe 6 Std', '18K4', '24K6',
];

export interface ShapeFamily {
  id: string;
  label: string;
  example: string;
}

/** Families offered when creating a steel shape tool. `id` is the prefix added to a typed size. */
export const SHAPE_FAMILIES: ShapeFamily[] = [
  { id: 'W', label: 'W – Wide flange', example: 'W18x35' },
  { id: 'HSS', label: 'HSS – Tube / round HSS', example: 'HSS6x6x3/8' },
  { id: 'L', label: 'L – Angle', example: 'L4x4x3/8' },
  { id: 'C', label: 'C – Channel', example: 'C10x15.3' },
  { id: 'MC', label: 'MC – Misc. channel', example: 'MC12x31' },
  { id: 'WT', label: 'WT – Structural tee', example: 'WT9x17.5' },
  { id: 'S', label: 'S – American standard beam', example: 'S12x31.8' },
  { id: 'HP', label: 'HP – Bearing pile', example: 'HP12x53' },
  { id: 'PL', label: 'PL – Plate / flat bar', example: 'PL1/2x8' },
  { id: 'Pipe', label: 'Pipe', example: 'Pipe 6 Std' },
  { id: '', label: 'Joist (K-series)', example: '24K6' },
  { id: '', label: 'Other / free text', example: '' },
];

/**
 * Normalise a size typed into a size tool: "18x35" in the W family becomes "W18x35",
 * "w24x55" becomes "W24x55", "6 std" in Pipe becomes "Pipe 6 std". Other text is kept as typed.
 */
export function normalizeSize(family: string, raw: string): string {
  const v = raw.trim().replace(/(\d)\s*[xX×]\s*(?=[\d.])/g, '$1x');
  if (!family || !v) return v;
  if (v.toLowerCase().startsWith(family.toLowerCase())) {
    const rest = v.slice(family.length).trim();
    return family === 'Pipe' ? `Pipe ${rest}` : family + rest;
  }
  if (/^[\d.]/.test(v)) return family === 'Pipe' ? `Pipe ${v}` : family + v;
  return v;
}
