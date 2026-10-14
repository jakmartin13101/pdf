import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { flattenIntoPdf } from '../src/core/export';
import { extractVectors } from '../src/core/autoTakeoff';
import { defaultStyle } from '../src/core/markupTypes';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { DEFAULT_SETTINGS } from '../src/core/units';
import type { DocState, Markup, MarkupType, Pt } from '../src/types';

const mk = (type: MarkupType, points: Pt[], extra: Partial<Markup> = {}): Markup => ({
  id: `m-${type}`,
  sheetId: 's1',
  type,
  points,
  subject: type,
  label: '',
  comments: '',
  author: '',
  created: 0,
  modified: 0,
  status: 'None',
  checked: false,
  layer: '',
  style: defaultStyle(type),
  custom: {},
  ...extra,
});

async function read(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const ops = await page.getOperatorList();
  const vp = page.getViewport({ scale: 1 });
  return { text: tc.items.map((i) => ('str' in i ? i.str : '')).join(' '), boxes: extractVectors(ops.fnArray, ops.argsArray, pdfjs.OPS as never, vp.transform) };
}

describe('flatten markups', () => {
  it('draws markups into the page content of a new PDF', async () => {
    const src = await PDFDocument.create();
    src.addPage([600, 400]);
    const bytes = await src.save();
    const doc = { files: [], sheets: [{ id: 's1', fileId: 'f1', pageIndex: 0, number: '1', title: '', width: 600, height: 400, rotation: 0, scale: null, viewports: [] }], markups: [], columns: defaultColumns(), layers: defaultLayers(), settings: { ...DEFAULT_SETTINGS }, standardDetails: [] } as unknown as DocState;
    const before = await read(bytes);
    expect(before.text).toBe('');
    const markups = [mk('text', [{ x: 100, y: 100 }, { x: 300, y: 140 }], { text: 'FLATTENED NOTE' }), mk('rectangle', [{ x: 350, y: 200 }, { x: 370, y: 218 }])];
    const out = await flattenIntoPdf(bytes, doc, [{ pageIndex: 0, markups, toPdf: (p) => ({ x: p.x, y: 400 - p.y }) }]);
    const after = await read(out);
    expect(after.text).toContain('FLATTENED NOTE');
    // The 20 × 18 rectangle is now line work on the page, where it was drawn.
    expect(after.boxes.boxes.some((b) => Math.abs(b.x + b.w / 2 - 360) < 2 && Math.abs(b.y + b.h / 2 - 209) < 2)).toBe(true);
  });
});
