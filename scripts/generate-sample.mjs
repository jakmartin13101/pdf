// Generates public/samples/Sample-Structural-Set.pdf: a small vector drawing set (ARCH D, 36"x24")
// with real text title blocks, dimension strings and repeated symbols for takeoff practice.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 2592;
const H = 1728;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.7, 0.7, 0.7);
const FT8 = 9; // points per foot at 1/8" = 1'-0"

const doc = await PDFDocument.create();
doc.setTitle('Riverside Distribution Center - Construction Documents');
doc.setAuthor('Northpoint Structural Engineers (sample)');
doc.setCreator('Takeoff Studio sample generator');
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

function ftIn(feet) {
  const totalIn = Math.round(feet * 12);
  const f = Math.floor(totalIn / 12);
  const i = totalIn - f * 12;
  return `${f}'-${i}"`;
}

class Sheet {
  constructor(number, title) {
    this.page = doc.addPage([W, H]);
    this.number = number;
    this.title = title;
    this.border();
  }
  Y(y) {
    return H - y;
  }
  line(x1, y1, x2, y2, o = {}) {
    this.page.drawLine({
      start: { x: x1, y: this.Y(y1) },
      end: { x: x2, y: this.Y(y2) },
      thickness: o.w ?? 1,
      color: o.color ?? BLACK,
      dashArray: o.dash,
    });
  }
  rect(x, y, w, h, o = {}) {
    this.page.drawRectangle({
      x,
      y: this.Y(y + h),
      width: w,
      height: h,
      borderColor: o.noStroke ? undefined : o.color ?? BLACK,
      borderWidth: o.noStroke ? 0 : o.w ?? 1,
      color: o.fill,
      borderDashArray: o.dash,
    });
  }
  circle(x, y, r, o = {}) {
    this.page.drawCircle({ x, y: this.Y(y), size: r, borderColor: o.color ?? BLACK, borderWidth: o.w ?? 1, color: o.fill });
  }
  path(d, o = {}) {
    this.page.drawSvgPath(d, { x: 0, y: H, borderColor: o.color ?? BLACK, borderWidth: o.w ?? 1, color: o.fill });
  }
  text(s, x, y, size = 10, o = {}) {
    const f = o.bold ? bold : font;
    let tx = x;
    if (o.align === 'center') tx = x - f.widthOfTextAtSize(s, size) / 2;
    if (o.align === 'right') tx = x - f.widthOfTextAtSize(s, size);
    if (o.rotate) {
      this.page.drawText(s, { x, y: this.Y(y), size, font: f, color: o.color ?? BLACK, rotate: degrees(o.rotate) });
      return;
    }
    this.page.drawText(s, { x: tx, y: this.Y(y), size, font: f, color: o.color ?? BLACK });
  }
  border() {
    this.rect(36, 36, W - 72, H - 72, { w: 2.5 });
    // Title block (right strip)
    const x = W - 36 - 230;
    this.line(x, 36, x, H - 36, { w: 2 });
    this.tb = x;
  }
  titleBlock() {
    const x = this.tb;
    const cx = x + 115;
    this.text('NORTHPOINT', cx, 90, 22, { bold: true, align: 'center' });
    this.text('STRUCTURAL ENGINEERS', cx, 112, 11, { align: 'center' });
    this.text('1200 Harbor Way, Suite 400', cx, 130, 8, { align: 'center', color: GREY });
    this.line(x, 150, W - 36, 150, { w: 1 });
    this.text('PROJECT', x + 12, 172, 7, { color: GREY });
    this.text('RIVERSIDE', cx, 200, 16, { bold: true, align: 'center' });
    this.text('DISTRIBUTION CENTER', cx, 220, 12, { bold: true, align: 'center' });
    this.text('4410 Industrial Parkway', cx, 238, 8, { align: 'center', color: GREY });
    this.line(x, 260, W - 36, 260);
    this.text('REVISIONS', x + 12, 280, 7, { color: GREY });
    const revs = [
      ['1', 'ISSUED FOR BID', '03/14/2026'],
      ['2', 'ADDENDUM 1', '04/02/2026'],
    ];
    revs.forEach((r, i) => {
      const y = 300 + i * 18;
      this.text(r[0], x + 14, y, 8);
      this.text(r[1], x + 34, y, 8);
      this.text(r[2], W - 48, y, 8, { align: 'right' });
      this.line(x, y + 6, W - 36, y + 6, { w: 0.4, color: LIGHT });
    });
    this.line(x, 1180, W - 36, 1180);
    this.text('PROJECT NO.', x + 12, 1200, 7, { color: GREY });
    this.text('2026-118', x + 12, 1216, 10);
    this.text('DATE', x + 120, 1200, 7, { color: GREY });
    this.text('04/02/2026', x + 120, 1216, 10);
    this.text('DRAWN', x + 12, 1240, 7, { color: GREY });
    this.text('JRM', x + 12, 1256, 10);
    this.text('CHECKED', x + 120, 1240, 7, { color: GREY });
    this.text('KLT', x + 120, 1256, 10);
    this.line(x, 1280, W - 36, 1280);
    this.text('SHEET TITLE', x + 12, 1300, 7, { color: GREY });
    const words = this.title.toUpperCase().split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 16) {
        lines.push(cur.trim());
        cur = w;
      } else cur += ' ' + w;
    }
    lines.push(cur.trim());
    lines.forEach((l, i) => this.text(l, cx, 1340 + i * 24, 18, { bold: true, align: 'center' }));
    this.line(x, 1500, W - 36, 1500);
    this.text('SHEET NUMBER', x + 12, 1520, 7, { color: GREY });
    this.text(this.number, cx, 1610, 54, { bold: true, align: 'center' });
  }
  drawingTitle(num, title, scaleText, x, y, width = 420) {
    this.circle(x + 22, y, 20, { w: 1.5 });
    this.text(String(num), x + 22, y + 6, 16, { bold: true, align: 'center' });
    this.line(x + 50, y + 4, x + 50 + width, y + 4, { w: 2.5 });
    this.text(title.toUpperCase(), x + 54, y - 4, 16, { bold: true });
    this.text(`SCALE: ${scaleText}`, x + 54, y + 20, 10);
  }
  dimH(x1, x2, y, label, o = {}) {
    const ext = o.ext ?? 0;
    this.line(x1, y, x2, y, { w: 0.6 });
    for (const x of [x1, x2]) {
      this.line(x, y - 10, x, y + 10 + ext, { w: 0.5 });
      this.line(x - 5, y + 5, x + 5, y - 5, { w: 1.4 });
    }
    this.text(label, (x1 + x2) / 2, y - 5, o.size ?? 10, { align: 'center' });
  }
  dimV(x, y1, y2, label, o = {}) {
    this.line(x, y1, x, y2, { w: 0.6 });
    for (const y of [y1, y2]) {
      this.line(x - 10, y, x + 10, y, { w: 0.5 });
      this.line(x - 5, y + 5, x + 5, y - 5, { w: 1.4 });
    }
    const size = o.size ?? 10;
    const tw = font.widthOfTextAtSize(label, size);
    this.text(label, x - 5, (y1 + y2) / 2 + tw / 2, size, { rotate: 90 });
  }
  bubble(x, y, label) {
    this.circle(x, y, 18, { w: 1.2 });
    this.text(label, x, y + 6, 15, { bold: true, align: 'center' });
  }
  notes(x, y, title, lines, size = 9) {
    this.text(title, x, y, 12, { bold: true });
    lines.forEach((l, i) => this.text(l, x, y + 22 + i * (size + 5), size));
  }
}

// Shared building grid (1/8" = 1'-0")
const OX = 260;
const OY = 300;
const BAYX = 25; // ft
const BAYY = 20; // ft
const NX = 6;
const NY = 5;
const gx = (i) => OX + i * BAYX * FT8;
const gy = (j) => OY + j * BAYY * FT8;
const LETTERS = 'ABCDEFG';

function grid(s, { dims = true } = {}) {
  for (let i = 0; i <= NX; i++) {
    s.line(gx(i), gy(0) - 70, gx(i), gy(NY) + 40, { w: 0.6, color: GREY, dash: [24, 6, 4, 6] });
    s.bubble(gx(i), gy(0) - 90, LETTERS[i]);
  }
  for (let j = 0; j <= NY; j++) {
    s.line(gx(0) - 70, gy(j), gx(NX) + 40, gy(j), { w: 0.6, color: GREY, dash: [24, 6, 4, 6] });
    s.bubble(gx(0) - 90, gy(j), String(j + 1));
  }
  if (dims) {
    for (let i = 0; i < NX; i++) s.dimH(gx(i), gx(i + 1), gy(0) - 135, ftIn(BAYX));
    s.dimH(gx(0), gx(NX), gy(0) - 165, ftIn(BAYX * NX));
    for (let j = 0; j < NY; j++) s.dimV(gx(0) - 135, gy(j), gy(j + 1), ftIn(BAYY));
    s.dimV(gx(0) - 165, gy(0), gy(NY), ftIn(BAYY * NY));
  }
}

// ---------------------------------------------------------------- G0.01 cover
{
  const s = new Sheet('G0.01', 'Cover Sheet');
  s.text('RIVERSIDE DISTRIBUTION CENTER', 1150, 360, 54, { bold: true, align: 'center' });
  s.text('4410 INDUSTRIAL PARKWAY', 1150, 410, 22, { align: 'center' });
  s.text('CONSTRUCTION DOCUMENTS  -  ISSUED FOR BID', 1150, 450, 18, { align: 'center', color: GREY });
  // simple massing sketch
  s.path('M 750 760 L 1150 600 L 1550 760 L 1550 980 L 1150 1140 L 750 980 Z', { w: 2 });
  s.path('M 1150 600 L 1150 820 M 750 760 L 1150 920 L 1550 760 M 1150 920 L 1150 1140', { w: 1, color: GREY });
  s.text('DRAWING INDEX', 300, 1220, 16, { bold: true });
  const idx = [
    ['G0.01', 'COVER SHEET'],
    ['S1.01', 'FOUNDATION PLAN'],
    ['S1.02', 'ROOF FRAMING PLAN'],
    ['S2.01', 'STRUCTURAL SECTIONS AND DETAILS'],
    ['A1.01', 'FIRST FLOOR PLAN'],
    ['M1.01', 'MECHANICAL AND PLUMBING PLAN'],
    ['E1.01', 'ELECTRICAL LIGHTING PLAN'],
  ];
  idx.forEach((r, i) => {
    s.text(r[0], 300, 1250 + i * 22, 12, { bold: true });
    s.text(r[1], 400, 1250 + i * 22, 12);
  });
  s.notes(1300, 1220, 'PROJECT DATA', [
    'BUILDING AREA: 15,000 SF (150\'-0" x 100\'-0")',
    'CONSTRUCTION TYPE: II-B, STEEL FRAME',
    'ROOF: 1.5B 20GA METAL DECK ON 24K6 JOISTS',
    'FOUNDATIONS: SPREAD AND CONTINUOUS FOOTINGS',
    'SLAB ON GRADE: 6" CONCRETE, 4000 PSI',
  ], 12);
  s.titleBlock();
}

// ---------------------------------------------------------------- S1.01 foundation plan
{
  const s = new Sheet('S1.01', 'Foundation Plan');
  grid(s);
  // perimeter continuous footing (2'-0" wide, dashed both sides)
  const half = 1 * FT8;
  s.rect(gx(0) - half, gy(0) - half, gx(NX) - gx(0) + 2 * half, gy(NY) - gy(0) + 2 * half, { w: 0.8, dash: [10, 5] });
  s.rect(gx(0) + half, gy(0) + half, gx(NX) - gx(0) - 2 * half, gy(NY) - gy(0) - 2 * half, { w: 0.8, dash: [10, 5] });
  // foundation wall
  s.rect(gx(0) - 4, gy(0) - 4, gx(NX) - gx(0) + 8, gy(NY) - gy(0) + 8, { w: 2.2 });
  for (let i = 0; i <= NX; i++)
    for (let j = 0; j <= NY; j++) {
      const interior = i > 0 && i < NX && j > 0 && j < NY;
      const f = (interior ? 8 : 6) * FT8;
      s.rect(gx(i) - f / 2, gy(j) - f / 2, f, f, { w: 0.8, dash: [10, 5] });
      s.rect(gx(i) - 9, gy(j) - 9, 18, 18, { w: 1.5, fill: rgb(0.85, 0.85, 0.85) });
      if (interior && (i + j) % 2 === 0) s.text(interior ? 'F8' : 'F6', gx(i) + f / 2 - 26, gy(j) + f / 2 - 6, 9, { bold: true });
    }
  s.text('6" SLAB ON GRADE W/ 6x6-W2.9xW2.9 WWF', gx(2) + 20, gy(2) + 95, 11);
  s.text('OVER 15 MIL VAPOR RETARDER', gx(2) + 20, gy(2) + 110, 11);
  s.text('T/SLAB EL. 100\'-0"', gx(4) + 20, gy(3) + 95, 11, { bold: true });
  s.drawingTitle(1, 'Foundation Plan', '1/8" = 1\'-0"', OX - 40, gy(NY) + 130, 520);
  s.notes(1750, 300, 'FOOTING SCHEDULE', ['MARK   SIZE              REINF.', 'F6     6\'-0" x 6\'-0" x 1\'-6"   (7) #5 E.W.', 'F8     8\'-0" x 8\'-0" x 2\'-0"   (9) #6 E.W.', 'CF     2\'-0" WIDE x 1\'-0"   (3) #5 CONT.'], 10);
  s.notes(1750, 470, 'FOUNDATION NOTES', [
    '1. ALLOWABLE SOIL BEARING PRESSURE = 3000 PSF.',
    '2. CONCRETE: 4000 PSI AT 28 DAYS.',
    '3. ANCHOR RODS: ASTM F1554 GR. 36, (4) 3/4" DIA.',
    '4. BASE PLATES: PL 3/4" x 12" x 12", ASTM A36.',
    '5. GROUT UNDER BASE PLATES: 1 1/2" NON-SHRINK.',
    '6. TOP OF FOOTING EL. 97\'-0" U.N.O.',
  ]);
  s.titleBlock();
}

// ---------------------------------------------------------------- S1.02 roof framing plan
{
  const s = new Sheet('S1.02', 'Roof Framing Plan');
  grid(s);
  // girders along numbered grid lines (E-W), beams along lettered lines (N-S)
  for (let j = 0; j <= NY; j++)
    for (let i = 0; i < NX; i++) {
      s.line(gx(i) + 9, gy(j), gx(i + 1) - 9, gy(j), { w: 3 });
      const lbl = j === 0 || j === NY ? 'W18x35' : 'W24x55';
      s.text(lbl, (gx(i) + gx(i + 1)) / 2, gy(j) - 8, 10, { bold: true, align: 'center' });
    }
  for (let i = 0; i <= NX; i++)
    for (let j = 0; j < NY; j++) {
      if (i === 0 || i === NX) {
        s.line(gx(i), gy(j) + 9, gx(i), gy(j + 1) - 9, { w: 3 });
        s.text('W18x35', gx(i) + 8, (gy(j) + gy(j + 1)) / 2 + 20, 10, { bold: true, rotate: 90 });
      }
    }
  // braced frame bay (heavy) on grid 1 between B-C
  s.line(gx(1) + 9, gy(0) + 4, gx(2) - 9, gy(0) + 4, { w: 5 });
  s.text('W30x90 (MOMENT FRAME)', (gx(1) + gx(2)) / 2, gy(0) + 22, 9, { bold: true, align: 'center' });
  // joists at 5'-0" o.c. in each bay (N-S)
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++) {
      for (let k = 1; k < 5; k++) {
        const x = gx(i) + k * 5 * FT8;
        s.line(x, gy(j) + 6, x, gy(j + 1) - 6, { w: 0.7, dash: [8, 5], color: GREY });
      }
    }
  s.text('24K6 @ 5\'-0" O.C. (TYP.)', gx(2) + 12, gy(1) + 100, 11, { bold: true });
  s.text('1.5B 20GA ROOF DECK (TYP.)', gx(3) + 12, gy(3) + 100, 11, { bold: true });
  // columns
  for (let i = 0; i <= NX; i++)
    for (let j = 0; j <= NY; j++) {
      s.rect(gx(i) - 9, gy(j) - 9, 18, 18, { w: 1.5, fill: rgb(0.2, 0.2, 0.2) });
    }
  s.text('HSS6x6x3/8 COLUMNS (TYP.)', gx(5) + 14, gy(4) + 24, 10, { bold: true });
  // roof opening (RTU) with angle frame
  s.rect(gx(3) + 40, gy(2) + 40, 10 * FT8, 8 * FT8, { w: 1.5 });
  s.line(gx(3) + 40, gy(2) + 40, gx(3) + 40 + 10 * FT8, gy(2) + 40 + 8 * FT8, { w: 0.6 });
  s.line(gx(3) + 40 + 10 * FT8, gy(2) + 40, gx(3) + 40, gy(2) + 40 + 8 * FT8, { w: 0.6 });
  s.text('RTU-1 OPENING, L4x4x3/8 FRAME', gx(3) + 40, gy(2) + 30, 9, { bold: true });
  s.drawingTitle(1, 'Roof Framing Plan', '1/8" = 1\'-0"', OX - 40, gy(NY) + 130, 520);
  s.notes(1750, 300, 'FRAMING NOTES', [
    '1. STRUCTURAL STEEL: W SHAPES ASTM A992; HSS ASTM A500 GR. C.',
    '2. ANGLES, CHANNELS AND PLATES: ASTM A36.',
    '3. T/STEEL EL. 124\'-0" U.N.O.',
    '4. JOISTS: SJI K-SERIES, BRIDGING PER SJI.',
    '5. ROOF DECK: 1.5" TYPE B, 20 GA, GALVANIZED.',
    '6. BEAM CONNECTIONS: SEE 1/S2.01.',
  ]);
  s.notes(1750, 470, 'MEMBER LEGEND', ['W24x55   INTERIOR GIRDER', 'W18x35   PERIMETER BEAM', 'W30x90   MOMENT FRAME BEAM', 'HSS6x6x3/8   COLUMN']);
  s.titleBlock();
}

// ---------------------------------------------------------------- S2.01 sections & details (mixed scales)
{
  const s = new Sheet('S2.01', 'Structural Sections and Details');
  // Detail 1: building section at 1/4" = 1'-0" (18 pt/ft)
  {
    const k = 18;
    const x0 = 140;
    const yG = 760;
    const span = 50; // ft shown (two bays)
    s.line(x0 - 40, yG, x0 + span * k + 40, yG, { w: 2 });
    s.text('FINISH GRADE', x0 - 40, yG + 16, 9);
    for (const c of [0, 25, 50]) {
      const x = x0 + c * k;
      s.rect(x - 3 * k, yG + 1.5 * k, 6 * k, 1.5 * k, { w: 1 }); // footing
      s.rect(x - 3, yG - 24 * k, 6, 24 * k + 1.5 * k, { w: 1.5, fill: rgb(0.85, 0.85, 0.85) }); // column
    }
    s.rect(x0, yG - 24 * k - 1.5 * k, span * k, 1.5 * k, { w: 1.5 }); // roof beam/joist
    s.dimV(x0 + span * k + 70, yG - 24 * k, yG, ftIn(24));
    s.dimH(x0, x0 + 25 * k, yG + 80, ftIn(25));
    s.dimH(x0 + 25 * k, x0 + 50 * k, yG + 80, ftIn(25));
    s.text('T/STEEL EL. 124\'-0"', x0 + 10, yG - 24 * k - 40, 10, { bold: true });
    s.drawingTitle(3, 'Building Section', '1/4" = 1\'-0"', x0 - 20, yG + 170, 380);
  }
  // Detail 2: base plate at 1 1/2" = 1'-0" (108 pt/ft)
  {
    const k = 108;
    const cx = 1400;
    const cy = 480;
    const pl = (14 / 12) * k; // 14" plate
    s.rect(cx - pl / 2, cy - pl / 2, pl, pl, { w: 2 });
    const hss = (6 / 12) * k;
    s.rect(cx - hss / 2, cy - hss / 2, hss, hss, { w: 2, fill: rgb(0.88, 0.88, 0.88) });
    const off = (5 / 12) * k;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s.circle(cx + dx * off, cy + dy * off, 7, { w: 1.5 });
    s.dimH(cx - pl / 2, cx + pl / 2, cy - pl / 2 - 40, '1\'-2"');
    s.dimV(cx - pl / 2 - 40, cy - pl / 2, cy + pl / 2, '1\'-2"');
    s.text('PL 3/4" x 14" x 14"', cx + pl / 2 + 20, cy - 20, 10, { bold: true });
    s.text('(4) 3/4" DIA. ANCHOR RODS', cx + pl / 2 + 20, cy, 10);
    s.text('HSS6x6x3/8', cx + pl / 2 + 20, cy + 20, 10);
    s.drawingTitle(2, 'Column Base Plate', '1 1/2" = 1\'-0"', cx - 140, cy + pl / 2 + 120, 360);
  }
  // Detail 1: beam connection at 1" = 1'-0" (72 pt/ft)
  {
    const k = 72;
    const x = 1350;
    const y = 1000;
    const d = (23.6 / 12) * k; // W24 depth
    s.rect(x - 0.5 * k, y, 0.6 * k, d + 0.6 * k, { w: 1.5, fill: rgb(0.88, 0.88, 0.88) }); // girder web stub
    s.rect(x + 0.1 * k, y, 4 * k, 0.1 * k, { w: 1.5 });
    s.rect(x + 0.1 * k, y + d - 0.1 * k, 4 * k, 0.1 * k, { w: 1.5 });
    s.line(x + 0.1 * k, y + d / 2, x + 4.1 * k, y + d / 2, { w: 0.8, dash: [6, 4] });
    s.rect(x + 0.1 * k, y + 0.25 * k, (4 / 12) * k, (18 / 12) * k, { w: 1.2 }); // clip angle
    for (let b = 0; b < 5; b++) s.circle(x + 0.1 * k + (2 / 12) * k, y + 0.45 * k + b * (3 / 12) * k, 4, { w: 1 });
    s.dimV(x + 4.5 * k, y, y + d, '1\'-11 5/8"');
    s.dimH(x + 0.1 * k, x + 4.1 * k, y - 40, ftIn(4));
    s.text('L4x4x3/8 CLIP ANGLE, (5) 3/4" A325 BOLTS', x + 0.5 * k, y + d + 40, 10, { bold: true });
    s.drawingTitle(1, 'Typical Beam Connection', '1" = 1\'-0"', x - 100, y + d + 120, 380);
  }
  s.notes(140, 1250, 'GENERAL NOTES', [
    'DETAILS ON THIS SHEET ARE DRAWN AT DIFFERENT SCALES.',
    'CALIBRATE EACH DETAIL (VIEWPORT) INDEPENDENTLY BEFORE MEASURING.',
  ]);
  s.titleBlock();
}

// ---------------------------------------------------------------- A1.01 first floor plan
{
  const s = new Sheet('A1.01', 'First Floor Plan');
  grid(s, { dims: true });
  const wt = 8;
  // exterior walls
  s.rect(gx(0) - wt, gy(0) - wt, gx(NX) - gx(0) + 2 * wt, gy(NY) - gy(0) + 2 * wt, { w: 1.5 });
  s.rect(gx(0), gy(0), gx(NX) - gx(0), gy(NY) - gy(0), { w: 1.5 });
  // office block (grids A-C, 1-3)
  s.line(gx(2), gy(0), gx(2), gy(2), { w: 5 });
  s.line(gx(0), gy(2), gx(2), gy(2), { w: 5 });
  s.line(gx(1), gy(0), gx(1), gy(2), { w: 3 });
  s.line(gx(0), gy(1), gx(1), gy(1), { w: 3 });
  s.text('OFFICE 101', gx(0) + 40, gy(0) + 90, 12, { bold: true });
  s.text('OFFICE 102', gx(0) + 40, gy(1) + 90, 12, { bold: true });
  s.text('BREAK RM 103', gx(1) + 40, gy(0) + 90, 12, { bold: true });
  s.text('RESTROOMS 104', gx(1) + 40, gy(1) + 90, 12, { bold: true });
  s.text('WAREHOUSE 110', gx(4) - 40, gy(3), 22, { bold: true });
  const door = (x, y, r, rot = 0) => {
    // swing arc + leaf
    const a = (rot * Math.PI) / 180;
    const ex = x + r * Math.cos(a);
    const ey = y + r * Math.sin(a);
    const lx = x + r * Math.cos(a + Math.PI / 2);
    const ly = y + r * Math.sin(a + Math.PI / 2);
    s.line(x, y, lx, ly, { w: 1.5 });
    s.path(`M ${ex} ${ey} A ${r} ${r} 0 0 1 ${lx} ${ly}`, { w: 0.6 });
  };
  door(gx(0) + 60, gy(0), 27, 0);
  door(gx(1) + 60, gy(0) + 0, 27, 0);
  door(gx(1) - 10, gy(1) + 60, 27, 90);
  door(gx(2) - 10, gy(0) + 60, 27, 90);
  door(gx(2) - 10, gy(1) + 60, 27, 90);
  door(gx(1) + 120, gy(2), 27, 180);
  door(gx(0) + 120, gy(2), 27, 180);
  // overhead doors on grid 6
  for (const i of [2, 3, 4, 5]) {
    const x = gx(i) + 50;
    s.rect(x, gy(NY) - 6, 12 * FT8, 12, { w: 1.2, dash: [6, 3] });
    s.text('OH DOOR 12x14', x + 10, gy(NY) + 30, 9);
  }
  // windows along grid 1 (office side) and grid A
  const win = (x1, y1, x2, y2) => {
    s.line(x1, y1, x2, y2, { w: 0.8 });
    const nx = y2 - y1 ? 4 : 0;
    const ny = x2 - x1 ? 4 : 0;
    s.line(x1 + nx, y1 + ny, x2 + nx, y2 + ny, { w: 0.8 });
    s.line(x1 - nx, y1 - ny, x2 - nx, y2 - ny, { w: 0.8 });
  };
  for (let i = 0; i < 2; i++) for (const t of [0.25, 0.6]) win(gx(i) + t * 225, gy(0) - 4, gx(i) + t * 225 + 40, gy(0) - 4);
  for (let j = 0; j < 2; j++) for (const t of [0.3, 0.65]) win(gx(0) - 4, gy(j) + t * 180, gx(0) - 4, gy(j) + t * 180 + 36);
  s.drawingTitle(1, 'First Floor Plan', '1/8" = 1\'-0"', OX - 40, gy(NY) + 130, 520);
  s.notes(1750, 300, 'PLAN NOTES', ['1. DIMENSIONS ARE TO GRID LINES U.N.O.', '2. OFFICE WALLS: 3 5/8" MTL STUD, GYP. BD. EACH SIDE.', '3. SEE A6.01 FOR DOOR AND WINDOW SCHEDULES.']);
  s.titleBlock();
}

// ---------------------------------------------------------------- M1.01 mechanical & plumbing
{
  const s = new Sheet('M1.01', 'Mechanical and Plumbing Plan');
  grid(s, { dims: true });
  s.rect(gx(0), gy(0), gx(NX) - gx(0), gy(NY) - gy(0), { w: 1.2, color: GREY });
  // main supply duct along grid 3 (double line)
  const ductY = gy(2) + 60;
  s.line(gx(0) + 40, ductY - 9, gx(5) + 60, ductY - 9, { w: 1.2 });
  s.line(gx(0) + 40, ductY + 9, gx(5) + 60, ductY + 9, { w: 1.2 });
  s.text('24x12 SA', gx(2) + 40, ductY - 16, 10, { bold: true });
  // branch ducts + diffusers
  for (let i = 0; i < 5; i++) {
    const x = gx(i) + 110;
    s.line(x - 6, ductY + 9, x - 6, ductY + 110, { w: 1 });
    s.line(x + 6, ductY + 9, x + 6, ductY + 110, { w: 1 });
    s.rect(x - 14, ductY + 110, 28, 28, { w: 1 });
    s.line(x - 14, ductY + 110, x + 14, ductY + 138, { w: 0.6 });
    s.line(x + 14, ductY + 110, x - 14, ductY + 138, { w: 0.6 });
  }
  s.rect(gx(3) + 40, gy(2) + 40, 10 * FT8, 8 * FT8, { w: 2 });
  s.text('RTU-1 (ABOVE)', gx(3) + 50, gy(2) + 30, 10, { bold: true });
  // floor drains
  const fd = [[1, 1], [2, 1], [3, 3], [4, 3], [5, 3], [2, 4], [4, 4], [1, 3]];
  for (const [i, j] of fd) {
    const x = gx(i) + 112;
    const y = gy(j) + 90;
    s.circle(x, y, 8, { w: 1.2 });
    s.line(x - 5, y, x + 5, y, { w: 0.8 });
    s.line(x, y - 5, x, y + 5, { w: 0.8 });
    s.text('FD', x + 12, y + 4, 9, { bold: true });
  }
  // sanitary line
  s.line(gx(1) + 112, gy(4) + 140, gx(5) + 112, gy(4) + 140, { w: 1.4, dash: [14, 4, 3, 4] });
  s.text('4" SAN', gx(3), gy(4) + 132, 9, { bold: true });
  s.drawingTitle(1, 'Mechanical and Plumbing Plan', '1/8" = 1\'-0"', OX - 40, gy(NY) + 130, 560);
  s.notes(1750, 300, 'LEGEND', ['FD   FLOOR DRAIN', '[X]  SUPPLY DIFFUSER 24x24', '----  SUPPLY DUCT', '-- - --  SANITARY PIPING']);
  s.titleBlock();
}

// ---------------------------------------------------------------- E1.01 electrical lighting
{
  const s = new Sheet('E1.01', 'Electrical Lighting Plan');
  grid(s, { dims: true });
  s.rect(gx(0), gy(0), gx(NX) - gx(0), gy(NY) - gy(0), { w: 1.2, color: GREY });
  // high-bay fixtures: 2 per bay in warehouse, 2x4 troffers in offices
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++) {
      const office = i < 2 && j < 2;
      const pts = office ? [[0.3, 0.35], [0.7, 0.35], [0.3, 0.7], [0.7, 0.7]] : [[0.33, 0.5], [0.67, 0.5]];
      for (const [u, v] of pts) {
        const x = gx(i) + u * BAYX * FT8;
        const y = gy(j) + v * BAYY * FT8;
        if (office) {
          s.rect(x - 9, y - 18, 18, 36, { w: 1 });
          s.line(x - 9, y - 18, x + 9, y + 18, { w: 0.6 });
        } else {
          s.circle(x, y, 11, { w: 1.2 });
          s.line(x - 8, y - 8, x + 8, y + 8, { w: 0.8 });
          s.line(x + 8, y - 8, x - 8, y + 8, { w: 0.8 });
        }
      }
    }
  // panel and home runs
  s.rect(gx(0) + 10, gy(2) - 40, 14, 40, { w: 1.5, fill: rgb(0.2, 0.2, 0.2) });
  s.text('PANEL LP-1', gx(0) + 30, gy(2) - 20, 9, { bold: true });
  s.path(`M ${gx(0) + 24} ${gy(2) - 20} Q ${gx(1)} ${gy(2) - 80} ${gx(2) + 75} ${gy(1) + 90}`, { w: 1 });
  s.path(`M ${gx(0) + 24} ${gy(2) - 10} Q ${gx(2)} ${gy(2) + 60} ${gx(3) + 75} ${gy(2) + 90}`, { w: 1 });
  s.drawingTitle(1, 'Electrical Lighting Plan', '1/8" = 1\'-0"', OX - 40, gy(NY) + 130, 520);
  s.notes(1750, 300, 'FIXTURE SCHEDULE', ['TYPE A   2x4 LED TROFFER (OFFICES)', 'TYPE B   LED HIGH BAY 24,000 LM (WAREHOUSE)', 'ALL FIXTURES ON LP-1, 277V.']);
  s.titleBlock();
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/samples/Sample-Structural-Set.pdf');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await doc.save());
console.log('Wrote', out);
