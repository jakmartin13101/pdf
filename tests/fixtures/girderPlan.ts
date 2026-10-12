// A framing-plan detail like a real sheet: a girder drawn as one continuous double line running through
// its columns, labelled W18X40 once per span (text reading upwards beside it), with beams framing in,
// window frames along the wall and grid lines with bubbles. 1/8" = 1'-0" (9 pt per foot).
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

export const FT = 9;
export const GIRDER_X = 400; // left line of the double line; the right one is 5 pt to its right
export const TOP = 60; // the girder starts at a beam along the top
export const BOTTOM = 780; // and runs on past the last column
export const COLUMNS = [TOP + 20 * FT, TOP + 45 * FT, TOP + 70 * FT]; // grids 2.5, 3, 3.5
export const LABELS = [150, 340, 590]; // centre of each W18X40 label along the girder

export interface GirderOptions {
  /** Column squares drawn on the girder (true), or none. */
  columns?: boolean;
  /** The girder lines broken where each beam frames in (pieces that touch). */
  pieces?: boolean;
  /** Small squares at beam connections that are not columns. */
  falseMarks?: number[];
  /** How the columns are drawn. */
  columnShape?: 'square' | 'filled' | 'circle' | 'wide-flange';
}

export async function girderPlan(o: GirderOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const W = 900;
  const H = 900;
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const Y = (y: number) => H - y;
  const line = (x1: number, y1: number, x2: number, y2: number, w = 1, dash?: number[]) =>
    page.drawLine({ start: { x: x1, y: Y(y1) }, end: { x: x2, y: Y(y2) }, thickness: w, color: rgb(0, 0, 0), dashArray: dash });
  const square = (cx: number, cy: number, s: number) => page.drawRectangle({ x: cx - s / 2, y: Y(cy + s / 2), width: s, height: s, borderWidth: 1, borderColor: rgb(0, 0, 0) });

  const framing = [120, 300, 390, 540, 630];
  // Girder: two lines 5 pt apart, either continuous or in pieces between the framing beams.
  const breaks = o.pieces ? [TOP, ...framing, ...COLUMNS].sort((a, b) => a - b).concat(BOTTOM) : [TOP, BOTTOM];
  for (const x of [GIRDER_X, GIRDER_X + 5]) for (let i = 1; i < breaks.length; i++) line(x, breaks[i - 1], x, breaks[i], 1);
  // Beam along the top that the girder starts at, and beams framing in from the left (double lines).
  line(100, TOP, GIRDER_X + 5, TOP, 2);
  for (const y of framing) {
    line(100, y - 2, GIRDER_X, y - 2, 0.7);
    line(100, y + 2, GIRDER_X, y + 2, 0.7);
  }
  // Columns (squares centred on the girder) at the grid lines.
  if (o.columns !== false)
    for (const y of COLUMNS) {
      const cx = GIRDER_X + 2.5;
      const shape = o.columnShape ?? 'square';
      if (shape === 'square') square(cx, y, 8);
      else if (shape === 'filled') page.drawRectangle({ x: cx - 4, y: Y(y + 4), width: 8, height: 8, color: rgb(0.2, 0.2, 0.2) });
      else if (shape === 'circle') page.drawCircle({ x: cx, y: Y(y), size: 4.5, borderWidth: 1, borderColor: rgb(0, 0, 0) });
      // A W column in plan: an I shape (flanges 8 pt wide, 8 pt deep).
      else page.drawSvgPath(`M ${cx - 4} ${y - 4} h 8 v 1 h -3.5 v 6 h 3.5 v 1 h -8 v -1 h 3.5 v -6 h -3.5 Z`, { x: 0, y: H, color: rgb(0, 0, 0) });
    }
  for (const y of o.falseMarks ?? []) square(GIRDER_X + 2.5, y, 6);
  // Window frames along the outside of the wall: tall rectangles, not columns.
  for (const y of [90, 290, 500, 720]) page.drawRectangle({ x: GIRDER_X + 7, y: Y(y + 50), width: 10, height: 50, borderWidth: 0.5, borderColor: rgb(0.4, 0.4, 0.4) });
  // Grid lines (dashed) out to their bubbles.
  for (const [i, y] of COLUMNS.entries()) {
    line(GIRDER_X + 25, y, 640, y, 0.6, [24, 6, 4, 6]);
    page.drawCircle({ x: 660, y: Y(y), size: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawText(['2.5', '3', '3.5'][i], { x: 650, y: Y(y + 5), size: 14, font });
  }
  // Labels: reading upwards, just left of the girder.
  const size = 9;
  const tw = font.widthOfTextAtSize('W18X40', size);
  for (const c of LABELS) page.drawText('W18X40', { x: GIRDER_X - 4, y: Y(c + tw / 2), size, font, rotate: degrees(90) });
  page.drawText('FRAMING PLAN  SCALE: 1/8" = 1\'-0"', { x: 100, y: Y(850), size: 10, font });
  return doc.save();
}
