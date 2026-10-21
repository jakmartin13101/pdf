import { describe, expect, it } from 'vitest';
import { buildRows } from '../src/core/columns';
import { OLD_WEIGHT_FORMULA, WEIGHT_FORMULA, defaultColumns, defaultLayers } from '../src/core/defaults';
import { upgradeToolChest, withAddedColumns } from '../src/core/docUpgrade';
import { evaluate } from '../src/core/formula';
import { defaultStyle } from '../src/core/markupTypes';
import { plf, psf } from '../src/core/steelShapes';
import { subjectForSize } from '../src/core/subjects';
import { DEFAULT_SETTINGS, findPreset, scaleFromPreset } from '../src/core/units';
import type { DocState, Markup, Sheet, ToolSet } from '../src/types';

/** A plate weight calculator: length × width × thickness (inches) × 0.2836 lb/in³. */
const calculator = (l: number, w: number, t: number) => l * w * t * 0.2836;

describe('bent plate and plate weights', () => {
  it('bent plate: a foot of flat plate as wide as the legs added together', () => {
    // BP 3X3X1/4: 12" long, 3" + 3" = 6" wide, 1/4" thick.
    expect(plf('BP3X3X1/4')).toBeCloseTo(calculator(12, 6, 0.25), 1);
    expect(plf('BP3X3X1/4')).toBe(5.1);
    expect(plf('BP 3X3X1/4')).toBe(5.1);
    expect(plf('bp 3*3*1/4')).toBe(5.1);
    expect(plf('BP6X4X3/8')).toBeCloseTo(calculator(12, 10, 0.375), 1);
    // More bends: every leg counts.
    expect(plf('BP4X6X4X3/8')).toBeCloseTo(calculator(12, 14, 0.375), 1);
    expect(plf('BP2-1/2X2-1/2X3/16')).toBeCloseTo(calculator(12, 5, 0.1875), 1);
    expect(subjectForSize('BP3X3X1/4', ['W', 'PL', 'BP'])).toBe('BP');
  });

  it('plate: by thickness and width per foot, or per square foot', () => {
    expect(plf('PL1/2X7')).toBeCloseTo(calculator(12, 7, 0.5), 1);
    expect(plf('PL 3/4X12')).toBeCloseTo(calculator(12, 12, 0.75), 1);
    expect(psf('PL1/2')).toBeCloseTo(calculator(12, 12, 0.5), 1);
  });

  it('PLF and PSF take the first size they know (Member Size, else the label)', () => {
    const at = (vals: Record<string, string | number>) => (n: string) => vals[n.toLowerCase().replace(/[^a-z0-9]/g, '')];
    expect(evaluate('PLF([Member Size], Label)', at({ membersize: '', label: 'BP3X3X1/4' }))).toBe(5.1);
    expect(evaluate('PLF([Member Size], Label)', at({ membersize: 'W18X35', label: 'BP3X3X1/4' }))).toBe(35);
    expect(evaluate('PLF([Member Size], Label)', at({ membersize: 'Roof beams', label: 'Note' }))).toBe(0);
  });

  describe('in the Weight column', () => {
    const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    const ptPerFt = 12 / scale.realPerPt;
    const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
    let n = 0;
    const mk = (type: Markup['type'], points: { x: number; y: number }[], patch: Partial<Markup>): Markup => ({
      id: `m${n++}`,
      sheetId: 's1',
      type,
      points,
      subject: '',
      label: '',
      comments: '',
      author: 't',
      created: 0,
      modified: 0,
      status: 'None',
      checked: false,
      layer: '',
      style: defaultStyle(type),
      custom: {},
      ...patch,
    });
    const docOf = (markups: Markup[]): DocState => ({ files: [], sheets: [sheet], markups, columns: defaultColumns(), layers: defaultLayers(), settings: DEFAULT_SETTINGS, standardDetails: [] });

    it('a bent plate run weighs its length × lb/ft, the size in Member Size or only in the label', () => {
      const run = (patch: Partial<Markup>) =>
        mk(
          'length',
          [
            { x: 10, y: 10 },
            { x: 10 + 20 * ptPerFt, y: 10 },
          ],
          patch,
        );
      const rows = buildRows(docOf([run({ subject: 'BP', label: 'BP3X3X1/4' }), run({ subject: 'BP', custom: { member_size: 'BP3X3X1/4', qty: 1 } })]));
      expect(Number(rows[0].values['c:weight'])).toBeCloseTo(20 * 5.1, 6);
      expect(Number(rows[1].values['c:weight'])).toBeCloseTo(20 * 5.1, 6);
    });

    it('plates counted with a Height weigh their pieces', () => {
      // 3 × PL1/2X7, each 1'-2": 3'-6" of plate.
      const plates = mk(
        'count',
        [
          { x: 10, y: 10 },
          { x: 50, y: 10 },
          { x: 90, y: 10 },
        ],
        { subject: 'PL', label: 'PL1/2X7', custom: { height: 14 } },
      );
      const [r] = buildRows(docOf([plates]));
      expect(Number(r.values['c:weight'])).toBeCloseTo(3.5 * plf('PL1/2X7'), 6);
    });
  });

  it('older documents and tool chests are brought up to date', () => {
    const old = defaultColumns().map((c) => (c.id === 'weight' ? { ...c, formula: OLD_WEIGHT_FORMULA } : c));
    expect(withAddedColumns(old).find((c) => c.id === 'weight')?.formula).toBe(WEIGHT_FORMULA);
    // A formula of the user's own is left alone.
    const own = defaultColumns().map((c) => (c.id === 'weight' ? { ...c, formula: 'Length * 2' } : c));
    expect(withAddedColumns(own).find((c) => c.id === 'weight')?.formula).toBe('Length * 2');
    // BP is bent plate: the base plate tool takes PL.
    const sets: ToolSet[] = [{ id: 's', name: 'S', tools: [{ id: 't', name: 'Base Plate', type: 'count', subject: 'BP', style: defaultStyle('count'), custom: {} }] }];
    expect(upgradeToolChest(sets)[0].tools[0].subject).toBe('PL');
  });
});
