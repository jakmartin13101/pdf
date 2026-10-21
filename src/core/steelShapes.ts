// Nominal weights for common structural shapes, used by the PLF()/PSF() formula functions.
// Rolled shapes carry their weight in the designation (W18X35 = 35 lb/ft). HSS, angles,
// plates, bent plates and bars are computed from their nominal dimensions (steel = 490 lb/ft³,
// 0.2836 lb/in³ – the usual plate weight calculator figure).

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
  // Plates / flat bars with width: PL1/2X8, FB3/8X4 – a foot of plate that wide and thick.
  m = compact.match(/^(?:PL|FB|BAR)([\d./-]+)X([\d./-]+)$/);
  if (m) {
    const t = parseDim(m[1]);
    const w = parseDim(m[2]);
    if (t && w) return round2(t * w * STEEL_LB_PER_IN2_FT);
  }
  // Bent plate: BP3X3X1/4 – the legs, then the thickness. A foot of it is a foot of flat plate as wide as
  // the legs added together (12" × 6" × 1/4" = 5.10 lb/ft); BP4X6X4X3/8 (more bends) the same way.
  m = compact.match(/^BP((?:[\d./-]+X)+)([\d./-]+)$/);
  if (m) {
    const legs = m[1].split('X').filter(Boolean).map(parseDim);
    const t = parseDim(m[2]);
    if (t && legs.length && legs.every((x): x is number => !!x)) return round2(legs.reduce((a, b) => a + b, 0) * t * STEEL_LB_PER_IN2_FT);
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
  // Reinforcing bar: #5, #5 REBAR, #5 BAR
  m = compact.match(/^#(\d{1,2})(?:REBAR|BAR)?$/);
  if (m) return REBAR[Number(m[1])] ?? 0;
  // Joists
  m = compact.match(/^(\d+K\d+)$/);
  if (m) return K_JOISTS[m[1]] ?? 0;
  return 0;
}

/** ASTM A615 deformed bar weights, lb/ft. */
const REBAR: Record<number, number> = { 3: 0.376, 4: 0.668, 5: 1.043, 6: 1.502, 7: 2.044, 8: 2.67, 9: 3.4, 10: 4.303, 11: 5.313, 14: 7.65, 18: 13.6 };

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
  'W8X31', 'W10X33', 'W12X26', 'W12X40', 'W14X22', 'W14X48', 'W16X26', 'W16X31', 'W18X35', 'W18X40',
  'W21X44', 'W21X50', 'W24X55', 'W24X68', 'W27X84', 'W30X90', 'W33X118', 'W36X135',
  'HSS4X4X1/4', 'HSS6X6X3/8', 'HSS8X8X1/2', 'HSS6X4X1/4', 'HSS6.625X.280',
  'L3X3X1/4', 'L4X4X3/8', 'L6X4X3/8', 'C8X11.5', 'C10X15.3', 'C12X20.7', 'MC12X31',
  'PL3/8', 'PL1/2', 'PL3/4', 'PL1', 'PL1/2X7', 'PL3/4X12', 'BP3X3X1/4', 'BP4X4X3/8', 'BP6X4X3/8', 'Pipe 4 Std', 'Pipe 6 Std', '18K4', '24K6',
];

export interface ShapeFamily {
  id: string;
  label: string;
  example: string;
}

/** Families offered when creating a steel shape tool. `id` is the prefix added to a typed size. */
export const SHAPE_FAMILIES: ShapeFamily[] = [
  { id: 'W', label: 'W – Wide flange', example: 'W18X35' },
  { id: 'HSS', label: 'HSS – Tube / round HSS', example: 'HSS6X6X3/8' },
  { id: 'L', label: 'L – Angle', example: 'L4X4X3/8' },
  { id: 'C', label: 'C – Channel', example: 'C10X15.3' },
  { id: 'MC', label: 'MC – Misc. channel', example: 'MC12X31' },
  { id: 'WT', label: 'WT – Structural tee', example: 'WT9X17.5' },
  { id: 'S', label: 'S – American standard beam', example: 'S12X31.8' },
  { id: 'HP', label: 'HP – Bearing pile', example: 'HP12X53' },
  { id: 'PL', label: 'PL – Plate / flat bar', example: 'PL1/2X8' },
  { id: 'BP', label: 'BP – Bent plate (legs × thickness)', example: 'BP3X3X1/4' },
  { id: 'Pipe', label: 'Pipe', example: 'Pipe 6 Std' },
  { id: '', label: 'Joist (K-series)', example: '24K6' },
  { id: '', label: 'Other / free text', example: '' },
];

/**
 * Size separators as a capital X, as sizes are written in the list and exports: W24x55, w24*55 and
 * W24 × 55 become W24X55, HSS6x6x3/8 becomes HSS6X6X3/8. "*" can be typed for the X. Other spaces stay
 * as typed (W 8x10 → W 8X10).
 */
export function upperX(raw: string): string {
  return raw.replace(/([\d"”″])\s*[xX×*]\s*(?=[\d.#])/g, '$1X');
}

/** Text that is a size (W24x55, w 8*10, HSS6x6x3/8, 2x4) written the standard way; other text as typed. */
export function sizeText(text: string): string {
  return /^\s*(2L|[A-Za-z]{1,4})\s?\d/.test(text) || /\d\s*[*×]\s*\d/.test(text) ? normalizeSize('', text) : text;
}

/**
 * Normalise a typed size: separators become a capital X ("*" works too), a short lower-case shape code
 * is capitalised (w24x55 → W24X55), and in a size tool's family a bare size gets the family prefix
 * (18x35 in W → W18X35, 6 std in Pipe → Pipe 6 std). A space after the shape is kept: W 8x10 → W 8X10.
 */
export function normalizeSize(family: string, raw: string): string {
  let v = upperX(raw.trim().replace(/\s+/g, ' '));
  if (!v) return v;
  v = v.replace(/^([a-z]{1,4})(?=\s?\d)/, (m) => m.toUpperCase());
  if (!family) return v;
  if (v.toLowerCase().startsWith(family.toLowerCase())) {
    const rest = v.slice(family.length);
    if (family === 'Pipe') return `Pipe ${rest.trim()}`;
    return family + (rest.startsWith(' ') ? ' ' : '') + rest.trim();
  }
  if (/^[\d.]/.test(v)) return family === 'Pipe' ? `Pipe ${v}` : family + v;
  return v;
}
