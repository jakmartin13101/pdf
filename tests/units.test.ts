import { afterEach, describe, expect, it } from 'vitest';
import { buildRows } from '../src/core/columns';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { withAddedColumns } from '../src/core/docUpgrade';
import { defaultStyle } from '../src/core/markupTypes';
import { scaleAt } from '../src/core/measure';
import {
  DEFAULT_SETTINGS,
  DEFAULT_USER_UNITS,
  displayScale,
  findPreset,
  fmtLen,
  normalizeLengthText,
  parseLength,
  scaleFromPreset,
  setUserUnits,
  userPrecisionFor,
} from '../src/core/units';
import type { DocState, Markup, Sheet } from '../src/types';

afterEach(() => setUserUnits(DEFAULT_USER_UNITS));

describe('your units', () => {
  it('reads 0-28 as 28" and writes it as 2\'-4" in feet-inches', () => {
    expect(parseLength('0-28')).toBe(28);
    expect(fmtLen(28)).toBe(`2'-4"`);
    expect(normalizeLengthText('0-28')).toBe(`2'-4"`);
    expect(normalizeLengthText(`0'-28"`)).toBe(`2'-4"`);
    expect(normalizeLengthText('13 1/2"')).toBe(`1'-1 1/2"`);
    // Bare numbers are feet, or inches where the field says so.
    expect(normalizeLengthText('3')).toBe(`3'-0"`);
    expect(normalizeLengthText('28', 'in')).toBe(`2'-4"`);
    // Not a length: kept as typed.
    expect(normalizeLengthText('varies')).toBe('varies');
  });

  it('writes lengths in inches or metric when those are your units', () => {
    setUserUnits({ unit: 'in', precision: userPrecisionFor('in'), perSheet: false });
    expect(normalizeLengthText('0-28')).toBe(`28.00"`);
    // Bare numbers are inches now.
    expect(normalizeLengthText('28')).toBe(`28.00"`);
    setUserUnits({ unit: 'mm', precision: userPrecisionFor('mm'), perSheet: false });
    expect(normalizeLengthText('0-28')).toBe('711 mm');
    expect(parseLength(normalizeLengthText('300'))).toBeCloseTo(300 / 25.4, 6);
  });

  it('keeps typed text that decimal feet would round', () => {
    setUserUnits({ unit: 'ft', precision: 2, perSheet: false });
    expect(normalizeLengthText('0-28')).toBe('0-28');
    expect(normalizeLengthText('0-30')).toBe(`2.50'`);
  });

  it('shows measurements in your units, or each sheet\'s own', () => {
    const eng = scaleFromPreset(findPreset(`1" = 20'`)!);
    const arch = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    expect(eng.unit).toBe('ft');
    expect(displayScale(eng)).toMatchObject({ unit: 'ft-in', precision: 16, realPerPt: eng.realPerPt });
    // Same units: the sheet's own precision.
    expect(displayScale(arch)).toBe(arch);
    setUserUnits({ ...DEFAULT_USER_UNITS, perSheet: true });
    expect(displayScale(eng)).toBe(eng);
    setUserUnits({ unit: 'm', precision: 3, perSheet: false });
    expect(displayScale(arch)).toMatchObject({ unit: 'm', precision: 3 });
  });

  describe('Height is a length', () => {
    const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1', title: '', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
    const mk = (id: string, height: unknown): Markup => ({
      id,
      sheetId: 's1',
      type: 'length',
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
      ],
      subject: 'W',
      label: '',
      comments: '',
      author: 't',
      created: 0,
      modified: 0,
      status: 'None',
      checked: false,
      layer: '',
      style: defaultStyle('length'),
      custom: { height } as Markup['custom'],
    });
    const doc: DocState = {
      files: [],
      sheets: [sheet],
      markups: [mk('a', 28), mk('b', '0-28'), mk('c', 'varies')],
      columns: defaultColumns(),
      layers: defaultLayers(),
      settings: DEFAULT_SETTINGS,
      standardDetails: [],
    };

    it('shows heights in your units, totals in the project\'s', () => {
      const rows = buildRows(doc);
      expect(rows.map((r) => r.display['c:height'])).toEqual([`2'-4"`, `2'-4"`, 'varies']);
      expect(Number(rows[0].values['c:height'])).toBeCloseTo(28 / 12, 6);
      setUserUnits({ unit: 'in', precision: 2, perSheet: false });
      expect(buildRows(doc)[0].display['c:height']).toBe(`28.00"`);
    });

    it('turns an old text Height column into a length', () => {
      expect(defaultColumns().find((c) => c.id === 'height')?.kind).toBe('length');
      const old = defaultColumns().map((c) => (c.id === 'height' ? { ...c, kind: 'text' as const } : c));
      expect(withAddedColumns(old).find((c) => c.id === 'height')?.kind).toBe('length');
    });

    it('measures in your units on a sheet with an engineering scale', () => {
      const eng = { ...sheet, scale: scaleFromPreset(findPreset(`1" = 20'`)!) };
      expect(scaleAt(eng, { x: 0, y: 0 }).unit).toBe('ft-in');
    });
  });
});
