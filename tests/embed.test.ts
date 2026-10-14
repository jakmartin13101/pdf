import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TAKEOFF_ATTACHMENT, embedTakeoff, readTakeoff } from '../src/core/embed';
import { builtInListStyle, listStyleFile, parseListStyle } from '../src/core/listStyle';

async function samplePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]).drawText('S1.02', { x: 500, y: 40, size: 12 });
  pdf.addPage([612, 792]);
  return pdf.save();
}

const open = (bytes: Uint8Array) => pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;

describe('takeoff saved inside the PDF', () => {
  it('embeds the takeoff, reads it back, and replaces it when saved again', async () => {
    const original = await samplePdf();
    const first = await embedTakeoff(original, { app: 'takeoff-studio', kind: 'document', n: 1 });
    const pdf1 = await open(first);
    expect(pdf1.numPages).toBe(2);
    expect(await readTakeoff(pdf1)).toEqual({ app: 'takeoff-studio', kind: 'document', n: 1 });

    // Saving again (from the bytes that already hold a takeoff) keeps a single attachment.
    const second = await embedTakeoff(first, { app: 'takeoff-studio', kind: 'document', n: 2 });
    const pdf2 = await open(second);
    const atts = (await pdf2.getAttachments()) as Record<string, unknown>;
    expect(Object.keys(atts).filter((k) => k === TAKEOFF_ATTACHMENT)).toHaveLength(1);
    expect(await readTakeoff(pdf2)).toMatchObject({ n: 2 });
    // The drawing itself is unchanged.
    const text = await (await pdf2.getPage(1)).getTextContent();
    expect(text.items.map((i) => ('str' in i ? i.str : '')).join('')).toContain('S1.02');
  });

  it('finds no takeoff in a plain PDF', async () => {
    expect(await readTakeoff(await open(await samplePdf()))).toBeNull();
  });
});

describe('markups list styles', () => {
  it('round-trips through a style file and rejects other files', () => {
    const style = { ...builtInListStyle(), labels: { length: 'LF' }, widths: { subject: 200 } };
    const back = parseListStyle(JSON.stringify(listStyleFile(style)));
    expect(back.visible).toEqual(style.visible);
    expect(back.labels).toEqual({ length: 'LF' });
    expect(back.widths).toEqual({ subject: 200 });
    expect(back.columns.map((c) => c.name)).toContain('Member Size');
    expect(() => parseListStyle('{"app":"takeoff-studio","kind":"other"}')).toThrow(/style/);
  });
});
