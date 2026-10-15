import { describe, expect, it } from 'vitest';
import { cutAtMax, defaultMaxLengths, markupShape, maxLengthFor, splitMarkupAtMax } from '../src/core/maxLength';
import { computeMeasure, scaleForMarkup } from '../src/core/measure';
import { defaultStyle } from '../src/core/markupTypes';
import { findPreset, scaleFromPreset } from '../src/core/units';
import { DEFAULT_SUBJECTS } from '../src/core/subjects';
import type { Markup, Sheet } from '../src/types';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('cutting a line at a maximum length', () => {
  it('cuts 63\' at 40\' into 40\' and 23\', end to end on the same line', () => {
    // 1 page point = 1 real inch here.
    const line = [
      { x: 0, y: 0 },
      { x: 63 * 12, y: 0 },
    ];
    const parts = cutAtMax(line, 63 * 12, 40 * 12);
    expect(parts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 480, y: 0 },
      ],
      [
        { x: 480, y: 0 },
        { x: 756, y: 0 },
      ],
    ]);
  });

  it('leaves lines up to the maximum alone', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 480, y: 0 },
    ];
    expect(cutAtMax(line, 480, 480)).toEqual([line]);
    expect(cutAtMax(line, 480.03, 480)).toEqual([line]); // a hair over: not a piece of its own
    expect(cutAtMax(line, 480, 0)).toEqual([line]);
  });

  it('cuts several times, and follows the bends of a polyline', () => {
    // 100 along, 100 down: 200 long, cut every 60.
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const parts = cutAtMax(pts, 200, 60);
    expect(parts.length).toBe(4);
    expect(parts[1]).toEqual([
      { x: 60, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 20 },
    ]);
    expect(parts[3]).toEqual([
      { x: 100, y: 80 },
      { x: 100, y: 100 },
    ]);
  });

  it('cuts on a corner without doubling it', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    const parts = cutAtMax(pts, 100, 50);
    expect(parts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
    ]);
  });
});

describe('maximum lengths by shape', () => {
  const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
  const ft = 12 / scale.realPerPt;
  const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
  const beam = (subject: string, feet: number, custom: Markup['custom'] = {}): Markup => ({
    id: 'b1',
    sheetId: 's1',
    type: 'length',
    points: [
      { x: 100, y: 100 },
      { x: 100 + feet * ft, y: 100 },
    ],
    subject,
    label: '',
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle('length'),
    custom,
  });
  const prefs = { ...defaultMaxLengths(), byShape: { W: 40 * 12, HSS: 20 * 12 } };
  let n = 0;
  const id = () => `n${++n}`;

  it('finds the shape from the subject, else the Member Size', () => {
    expect(markupShape(beam('W', 10), DEFAULT_SUBJECTS)).toBe('W');
    expect(markupShape(beam('', 10, { member_size: 'HSS6x6x3/8' }), DEFAULT_SUBJECTS, 'member_size')).toBe('HSS');
    expect(maxLengthFor(beam('W', 10), prefs, DEFAULT_SUBJECTS)).toBe(480);
    expect(maxLengthFor(beam('L', 10), prefs, DEFAULT_SUBJECTS)).toBe(0);
    expect(maxLengthFor(beam('L', 10), { ...prefs, other: 300 }, DEFAULT_SUBJECTS)).toBe(300);
    expect(maxLengthFor(beam('W', 10), { ...prefs, enabled: false }, DEFAULT_SUBJECTS)).toBe(0);
  });

  it('takes a 63\' W off as a 40\' W and a 23\' W', () => {
    const pieces = splitMarkupAtMax(beam('W', 63, { member_size: 'W24x55' }), sheet, prefs, DEFAULT_SUBJECTS, id);
    expect(pieces).toHaveLength(2);
    const sc = scaleForMarkup(pieces[0], sheet);
    const lens = pieces.map((p) => computeMeasure(p, sc).length! / 12);
    close(lens[0], 40, 1e-6);
    close(lens[1], 23, 1e-6);
    // The first keeps the id; both keep the takeoff data; end to end.
    expect(pieces[0].id).toBe('b1');
    expect(pieces[1].id).not.toBe('b1');
    expect(pieces[1].custom).toEqual({ member_size: 'W24x55' });
    expect(pieces[1].subject).toBe('W');
    expect(pieces[0].points[1]).toEqual(pieces[1].points[0]);
  });

  it('leaves other shapes and short members alone', () => {
    expect(splitMarkupAtMax(beam('L', 63), sheet, prefs, DEFAULT_SUBJECTS, id)).toHaveLength(1);
    expect(splitMarkupAtMax(beam('W', 40), sheet, prefs, DEFAULT_SUBJECTS, id)).toHaveLength(1);
    expect(splitMarkupAtMax(beam('HSS', 63), sheet, prefs, DEFAULT_SUBJECTS, id)).toHaveLength(4); // 20 + 20 + 20 + 3
  });
});
