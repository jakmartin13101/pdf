import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { existingMeasurements, extractStrokes, findMemberLabels, matchMembers, placeText, printedScales, type PlacedText } from '../src/core/autoTakeoff';

async function loadPage(file: string, pageIndex: number) {
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const strokes = extractStrokes(ops.fnArray, ops.argsArray, pdfjs.OPS as unknown as Record<string, number>, vp.transform);
  const tc = await page.getTextContent();
  const texts: PlacedText[] = [];
  for (const it of tc.items) if ('str' in it && it.str.trim()) texts.push(placeText(it.str, it.transform, it.width, vp.transform));
  return { strokes, texts };
}

const tally = (sizes: string[]) => sizes.reduce<Record<string, number>>((o, s) => ((o[s] = (o[s] ?? 0) + 1), o), {});

describe('automatic takeoff', () => {
  it('reads the scale printed on a drawing', () => {
    const scales = printedScales([{ str: `SCALE: 1/8" = 1'-0"` }, { str: `SCALE: 1 1/2" = 1'-0"` }, { str: `1/8" = 1'-0"` }, { str: `1" = 20'` }, { str: 'SCALE 1:100' }, { str: 'SLOPE 1:12' }]);
    expect(scales.map((s) => [s.preset.label, s.count])).toEqual([
      [`1/8" = 1'-0"`, 2],
      [`1 1/2" = 1'-0"`, 1],
      [`1" = 20'`, 1],
      ['1:100', 1],
    ]);
  });

  it('reads member sizes from labels', () => {
    const t = (str: string, angle = 0): PlacedText => ({ str, ox: 0, oy: 0, angle, w: str.length * 6, fh: 10 });
    const labels = findMemberLabels(
      [
        t('W24x55'),
        t('W 18 X 35 (TYP.)'),
        t('HSS8x4x1/4'),
        t('HSS 3 1/2 x 3 1/2 x 1/4'),
        t('HSS6.625x.280'),
        t('TS6x6x3/8'),
        t('PIPE 4" STD'),
        t('C10x15.3'),
        t('L4x4x3/8 LINTEL'),
        t('HSS6x6x3/8 COLUMNS (TYP.)'),
        t('24K6 @ 5\'-0" O.C.'),
        t('W30x90 (MOMENT FRAME)'),
      ],
      ['beam', 'tube', 'channel'],
    );
    expect(labels.map((l) => l.size)).toEqual(['W24x55', 'W18x35', 'HSS8x4x1/4', 'HSS3-1/2x3-1/2x1/4', 'HSS6.625x0.280', 'HSS6x6x3/8', 'Pipe 4 Std', 'C10x15.3', 'W30x90']);
    expect(labels.find((l) => l.size === 'W30x90')!.s1).toBeCloseTo(6 * 6);
  });

  it('pairs each label with the solid member line beside it', () => {
    // A W24 drawn under its label, a dashed grid line on the same line and a W18 well below.
    const strokes = [
      { x1: 100, y1: 200, x2: 400, y2: 200, width: 0.6, dashed: true },
      { x1: 110, y1: 200, x2: 390, y2: 200, width: 3, dashed: false },
      { x1: 110, y1: 260, x2: 390, y2: 260, width: 3, dashed: false },
      { x1: 250, y1: 150, x2: 250, y2: 250, width: 3, dashed: false },
    ];
    const texts: PlacedText[] = [
      { str: 'W24x55', ox: 230, oy: 192, angle: 0, w: 40, fh: 10 },
      { str: 'W18x35', ox: 230, oy: 252, angle: 0, w: 40, fh: 10 },
      // reading upwards, beside the vertical line
      { str: 'HSS8x4x1/4', ox: 262, oy: 230, angle: -Math.PI / 2, w: 55, fh: 10 },
    ];
    const found = matchMembers(findMemberLabels(texts, ['beam', 'tube']), strokes);
    expect(found.map((f) => [f.size, f.p1, f.p2, f.dashed])).toEqual([
      ['HSS8x4x1/4', { x: 250, y: 150 }, { x: 250, y: 250 }, false],
      ['W24x55', { x: 110, y: 200 }, { x: 390, y: 200 }, false],
      ['W18x35', { x: 110, y: 260 }, { x: 390, y: 260 }, false],
    ]);
  });

  it('finds every labelled beam and tube on the sample roof framing plan', async () => {
    const { strokes, texts } = await loadPage('public/samples/Sample-Structural-Set.pdf', 2);
    const found = matchMembers(findMemberLabels(texts, ['beam', 'tube', 'channel']), strokes);
    expect(tally(found.map((f) => f.size))).toEqual({ W24x55: 24, W18x35: 22, W30x90: 1, 'HSS8x4x1/4': 2, 'HSS6x6x1/4': 1 });
    // Bays are 25'-0" x 20'-0" at 1/8" = 1'-0" (9 pt per foot); lines stop 1'-0" short of each grid line.
    const lengths = (size: string) => [...new Set(found.filter((f) => f.size === size).map((f) => Math.round(Math.hypot(f.p2.x - f.p1.x, f.p2.y - f.p1.y) / 9)))].sort((a, b) => a - b);
    expect(lengths('W18x35')).toEqual([18, 23]);
    expect(lengths('W24x55')).toEqual([23]);
    expect(lengths('HSS8x4x1/4')).toEqual([7]); // canopy outriggers, labelled reading upwards
    expect(lengths('HSS6x6x1/4')).toEqual([21]);
    // The column note names a tube size but is not a member.
    expect(found.some((f) => f.size === 'HSS6x6x3/8')).toBe(false);
    // Members already measured are recognised.
    const w30 = found.find((f) => f.size === 'W30x90')!;
    // (The W30x90 is drawn 4 pt from the W18x35 on the same grid line: a measurement counts for the nearer one.)
    const existing = [{ id: 'm1', type: 'length', points: [{ x: w30.p1.x + 1, y: w30.p1.y + 1 }, { x: w30.p2.x - 1, y: w30.p2.y + 1 }] }] as never;
    const taken = existingMeasurements(found, existing);
    expect([...taken].map(([id, mk]) => [found.find((f) => f.id === id)!.size, mk])).toEqual([['W30x90', 'm1']]);
    const frame = found.find((f) => f.size === 'W30x90')!;
    expect(frame.width).toBe(5);
    expect(found.every((f) => !f.dashed)).toBe(true);
  });
});
