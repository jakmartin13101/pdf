import { describe, expect, it } from 'vitest';
import { calibratedScale, describeScale, findPreset, formatLength, parseLength, scaleFromPreset, DEFAULT_SETTINGS, formatArea } from '../src/core/units';
import { polygonArea, polygonPerimeter, polylineLength, centroid, constrainAngle } from '../src/core/geometry';
import { evaluate, validateFormula } from '../src/core/formula';
import { plf, psf } from '../src/core/steelShapes';
import { computeMeasure, scaleForMarkup } from '../src/core/measure';
import { buildRows, customColId } from '../src/core/columns';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { defaultStyle } from '../src/core/markupTypes';
import type { DocState, Markup, Sheet } from '../src/types';

describe('length formatting', () => {
  it('formats feet-inches', () => {
    expect(formatLength(390, 'ft-in', 1)).toBe(`32'-6"`);
    expect(formatLength(240, 'ft-in', 1)).toBe(`20'-0"`);
    expect(formatLength(6.5, 'ft-in', 8)).toBe(`0'-6 1/2"`);
    expect(formatLength(143.99, 'ft-in', 1)).toBe(`12'-0"`);
    expect(formatLength(12 * 1234, 'ft-in', 1)).toBe(`1,234'-0"`);
  });
  it('formats decimal and metric units', () => {
    expect(formatLength(390, 'ft', 2)).toBe(`32.50'`);
    expect(formatLength(39.37007874, 'm', 3)).toBe('1.000 m');
    expect(formatLength(39.37007874, 'mm', 0)).toBe('1,000 mm');
  });
});

describe('length parsing', () => {
  const cases: [string, number][] = [
    [`20'-0"`, 240],
    [`20'`, 240],
    [`32'-6"`, 390],
    [`32' 6"`, 390],
    [`32'6"`, 390],
    [`20'-6 1/2"`, 246.5],
    [`20'-6-1/2"`, 246.5],
    [`6"`, 6],
    [`3/8"`, 0.375],
    ['20-6', 246],
    ['20.5', 246],
    ['20.5 ft', 246],
    ['20 ft 6 in', 246],
    ['246 in', 246],
    ['20', 240],
  ];
  for (const [s, v] of cases) {
    it(`parses ${s}`, () => expect(parseLength(s, 'ft-in')).toBeCloseTo(v, 6));
  }
  it('parses metric', () => {
    expect(parseLength('1 m', 'ft-in')).toBeCloseTo(39.37, 2);
    expect(parseLength('1000mm', 'ft-in')).toBeCloseTo(39.37, 2);
    expect(parseLength('2.5', 'm')).toBeCloseTo(98.425, 2);
  });
  it('rejects junk', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
  });
});

describe('scales', () => {
  it('architectural preset 1/8" = 1\'-0"', () => {
    const p = findPreset(`1/8" = 1'-0"`)!;
    // 1/8" paper = 9 pt -> 12 in real
    expect(p.realPerPt).toBeCloseTo(12 / 9, 9);
  });
  it('calibrates from a known distance and recognises presets', () => {
    // 20'-0" drawn at 1/8" scale is 2.5" on paper = 180 pt
    const s = calibratedScale(240, 180, 'ft-in', 1);
    expect(s.realPerPt).toBeCloseTo(4 / 3, 9);
    expect(s.label).toBe(`1/8" = 1'-0"`);
    expect(describeScale(240 / 100)).toMatch(/^1" = /);
  });
  it('measures 32\'-6" at 1/8" scale', () => {
    const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    const pts = 390 / scale.realPerPt; // points for 32'-6"
    const v = computeMeasure({ type: 'length', points: [{ x: 0, y: 0 }, { x: pts, y: 0 }] }, scale);
    expect(formatLength(v.length!, 'ft-in', 1)).toBe(`32'-6"`);
  });
});

describe('geometry', () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('area, perimeter, length', () => {
    expect(polygonArea(sq)).toBe(100);
    expect(polygonPerimeter(sq)).toBe(40);
    expect(polylineLength(sq)).toBe(30);
    expect(centroid(sq)).toEqual({ x: 5, y: 5 });
  });
  it('constrains angles', () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(10, 1));
  });
  it('area measurement with cutout', () => {
    const scale = { realPerPt: 12, label: '', unit: 'ft-in' as const, precision: 1 };
    const v = computeMeasure({ type: 'area', points: sq, cutouts: [[{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]] }, scale);
    // (100 - 25) pt² * 144 in²/pt² = 10800 in² = 75 sf
    expect(v.area! / 144).toBeCloseTo(75);
    expect(formatArea(v.area!, 'ft-in', DEFAULT_SETTINGS)).toBe('75.00 sf');
  });
});

describe('formula engine', () => {
  const vals: Record<string, number | string> = { length: 32.5, qty: 2, membersize: 'W18x35', area: 0 };
  const r = (n: string) => vals[n.toLowerCase().replace(/[^a-z0-9]/g, '')];
  it('arithmetic & precedence', () => {
    expect(evaluate('1 + 2 * 3', r)).toBe(7);
    expect(evaluate('(1 + 2) * 3', r)).toBe(9);
    expect(evaluate('2 ^ 3', r)).toBe(8);
    expect(evaluate('-Length', r)).toBe(-32.5);
  });
  it('references and functions', () => {
    expect(evaluate('Length * Qty * PLF([Member Size])', r)).toBeCloseTo(2275);
    expect(evaluate('IF(Area > 0, 1, 2)', r)).toBe(2);
    expect(evaluate('ROUNDUP(10.01, 0)', r)).toBe(11);
    expect(evaluate('CEILING(13, 4)', r)).toBe(16);
    expect(evaluate('"A" & "B"', r)).toBe('AB');
  });
  it('validation', () => {
    expect(validateFormula('Length *')).not.toBeNull();
    expect(validateFormula('MAX(1, 2)')).toBeNull();
  });
});

describe('steel shapes', () => {
  it('rolled shapes', () => {
    expect(plf('W18x35')).toBe(35);
    expect(plf('C10x15.3')).toBe(15.3);
    expect(plf('w24 x 55')).toBe(55);
  });
  it('computed shapes', () => {
    expect(plf('HSS6x6x3/8')).toBeCloseTo(27.48, 0);
    expect(plf('L4x4x3/8')).toBeCloseTo(9.8, 0);
    expect(plf('HSS6.625x.280')).toBeCloseTo(19.0, 0);
    expect(psf('PL1/2')).toBeCloseTo(20.42, 1);
    expect(psf('1/2" Plate')).toBeCloseTo(20.42, 1);
    expect(plf('Pipe 6 Std')).toBe(18.97);
    expect(plf('unknown')).toBe(0);
  });
});

describe('markup rows', () => {
  it('evaluates built-in and formula columns', () => {
    const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    const sheet: Sheet = { id: 's1', fileId: 'f', pageIndex: 0, number: 'S1.02', title: 'Framing Plan', width: 2592, height: 1728, rotation: 0, scale, viewports: [] };
    const ptsPerFoot = 12 / scale.realPerPt;
    const m: Markup = {
      id: 'm1',
      sheetId: 's1',
      type: 'length',
      points: [
        { x: 100, y: 100 },
        { x: 100 + 32.5 * ptsPerFoot, y: 100 },
      ],
      subject: 'W18x35',
      label: '',
      comments: '',
      author: 'test',
      created: 0,
      modified: 0,
      status: 'None',
      checked: false,
      layer: '',
      style: defaultStyle('length'),
      custom: { member_size: 'W18x35', qty: 2 },
    };
    const doc: DocState = { files: [], sheets: [sheet], markups: [m], columns: defaultColumns(), layers: defaultLayers(), settings: DEFAULT_SETTINGS };
    const [row] = buildRows(doc);
    expect(scaleForMarkup(m, sheet)).toBe(scale);
    expect(row.display.length).toBe(`32'-6"`);
    expect(row.values.length).toBeCloseTo(32.5);
    expect(row.values.page).toBe('S1.02');
    expect(row.values[customColId(doc.columns.find((c) => c.id === 'weight')!)]).toBeCloseTo(2275);
  });
  it('uses viewport scale inside a viewport', () => {
    const scale = scaleFromPreset(findPreset(`1/8" = 1'-0"`)!);
    const detail = scaleFromPreset(findPreset(`1/2" = 1'-0"`)!);
    const sheet: Sheet = {
      id: 's1', fileId: 'f', pageIndex: 0, number: 'S2.01', title: '', width: 2592, height: 1728, rotation: 0, scale,
      viewports: [{ id: 'v', name: 'Detail 1', rect: { x: 0, y: 0, w: 500, h: 500 }, scale: detail }],
    };
    expect(scaleForMarkup({ type: 'length', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] }, sheet)).toBe(detail);
    expect(scaleForMarkup({ type: 'length', points: [{ x: 600, y: 10 }, { x: 700, y: 10 }] }, sheet)).toBe(scale);
  });
});

import { normalizeSize } from '../src/core/steelShapes';

describe('size tools', () => {
  it('normalizes typed sizes to the tool family', () => {
    expect(normalizeSize('W', '18x35')).toBe('W18x35');
    expect(normalizeSize('W', 'w24 X 55')).toBe('W24x55');
    expect(normalizeSize('W', 'W 12 x 26')).toBe('W12x26');
    expect(normalizeSize('Pipe', 'pipe 4 xs')).toBe('Pipe 4 xs');
    expect(normalizeSize('HSS', '6x6x3/8')).toBe('HSS6x6x3/8');
    expect(normalizeSize('Pipe', '6 Std')).toBe('Pipe 6 Std');
    expect(normalizeSize('', 'Custom beam')).toBe('Custom beam');
    expect(normalizeSize('L', '')).toBe('');
  });
});

import { legalToPlainText, parseLegalMarkdown, splitBold } from '../src/core/legal';
import { readFileSync } from 'node:fs';

describe('terms of service', () => {
  it('parses headings, paragraphs and lists', () => {
    const blocks = parseLegalMarkdown('# Title\n\nIntro **bold** text\nsecond line\n\n## 1. Part\n\n- a\n- b\n\n1. one\n2. two\n');
    expect(blocks.map((b) => b.kind)).toEqual(['h1', 'p', 'h2', 'ul', 'ol']);
    expect(blocks[1]).toEqual({ kind: 'p', text: 'Intro **bold** text\nsecond line' });
    expect(splitBold('Intro **bold** text')).toEqual(['Intro ', 'bold', ' text']);
  });
  it('renders the shipped terms as plain text for the installer', () => {
    const txt = legalToPlainText(readFileSync('legal/terms-of-service.md', 'utf8'));
    expect(txt).toMatch(/^BUILDSUITE TAKEOFF STUDIO/);
    expect(txt).toContain('12. DISCLAIMER OF WARRANTIES');
    expect(txt).not.toContain('**');
  });
});
