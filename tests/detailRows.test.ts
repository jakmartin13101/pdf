import { describe, expect, it } from 'vitest';
import { buildTakeoffRows, describeDetail, newDetail, newDetailItem } from '../src/core/details';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { defaultStyle } from '../src/core/markupTypes';
import { DEFAULT_SETTINGS, findPreset, scaleFromPreset } from '../src/core/units';
import type { DocState, Markup, Sheet } from '../src/types';

describe('standard detail material rows', () => {
  const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
  const ft = 12 / scale.realPerPt;
  const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
  const beam: Markup = {
    id: 'b1',
    sheetId: 's1',
    type: 'length',
    points: [
      { x: 100, y: 100 },
      { x: 100 + 24 * ft, y: 100 },
    ],
    subject: 'W',
    label: 'W24X55',
    comments: '',
    author: 't',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    style: defaultStyle('length'),
    custom: { member_size: 'W24X55', qty: 1, finish: 'Prime' },
  };
  const detail = newDetail({
    name: 'Beam material',
    conditions: [{ column: 'c:member_size', op: 'eq', value: 'W24X55' }],
    items: [
      newDetailItem({ subject: 'L', size: 'L4X4X3/8', length: `0'-11 1/2"`, rule: 'each', value: '4', galv: true }),
      newDetailItem({ subject: 'Stud', size: '3/4" stud', length: '5', rule: 'spacing', value: '24' }),
      newDetailItem({ subject: 'L', size: 'L3X3X1/4', rule: 'full', value: '1' }),
    ],
  });
  const doc: DocState = { files: [], sheets: [sheet], markups: [beam], columns: defaultColumns(), layers: defaultLayers(), settings: DEFAULT_SETTINGS, standardDetails: [detail] };
  const rows = buildTakeoffRows(doc, true).filter((r) => r.detail);

  it('shows the length of each piece for counted and spaced material, the run for full length', () => {
    expect(rows.map((r) => r.display.length)).toEqual([`0'-11 1/2"`, `0'-5"`, `24'-0"`]);
    expect(rows.map((r) => r.display.count)).toEqual(['4', '13', '1']);
  });

  it('keeps the total length for totals and formulas', () => {
    // 4 × 11.5" = 46" = 3.83'; 13 × 5" = 65"; 24'.
    expect(Number(rows[0].values.length)).toBeCloseTo(46 / 12, 6);
    expect(Number(rows[1].values.length)).toBeCloseTo(65 / 12, 6);
    expect(Number(rows[2].values.length)).toBeCloseTo(24, 6);
  });

  it('galvanized material has the Finish Galvanize; the rest keep the markup\'s', () => {
    expect(rows.map((r) => r.values['c:finish'])).toEqual(['Galvanize', 'Prime', 'Prime']);
    expect(describeDetail(detail, doc)).toContain('L4X4X3/8 × 0\'-11 1/2" × 4 EA GALV');
  });
});
