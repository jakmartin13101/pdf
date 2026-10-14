// The takeoff saved inside its PDF, as an embedded file (attachment) of the PDF. Other PDF programs
// show the drawing as it was (and list the attachment); this program reads the takeoff back when the
// PDF is opened again, so the markups, scales, columns and details stay with the file they were made on.

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export const TAKEOFF_ATTACHMENT = 'BuildSuite-Takeoff.json';

/** The PDF cannot be rewritten (it is encrypted, e.g. password-protected against changes). */
export class LockedPdfError extends Error {
  constructor() {
    super('This PDF is protected against changes');
    this.name = 'LockedPdfError';
  }
}

/** Take out a takeoff saved before (so saving again replaces it rather than adding another). */
function removeTakeoff(pdf: PDFDocument) {
  const names = pdf.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const files = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const list = files?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!files || !list) return;
  const keep: ReturnType<PDFArray['get']>[] = [];
  const removed: PDFRef[] = [];
  for (let i = 0; i + 1 < list.size(); i += 2) {
    const key = list.lookup(i);
    const name = key instanceof PDFString || key instanceof PDFHexString ? key.decodeText() : '';
    const ref = list.get(i + 1);
    if (name === TAKEOFF_ATTACHMENT && ref instanceof PDFRef) removed.push(ref);
    else keep.push(list.get(i), ref);
  }
  if (!removed.length) return;
  files.set(PDFName.of('Names'), pdf.context.obj(keep));
  const af = pdf.catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
  if (af) {
    const rest = af.asArray().filter((r) => !(r instanceof PDFRef && removed.some((x) => x === r || x.toString() === r.toString())));
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj(rest));
  }
  for (const ref of removed) {
    const spec = pdf.context.lookup(ref);
    const ef = spec instanceof PDFDict ? spec.lookupMaybe(PDFName.of('EF'), PDFDict) : undefined;
    const stream = ef?.get(PDFName.of('F'));
    if (stream instanceof PDFRef) pdf.context.delete(stream);
    pdf.context.delete(ref);
  }
}

/** The PDF with the takeoff embedded in it (replacing a takeoff saved before). */
export async function embedTakeoff(pdfBytes: Uint8Array, takeoff: unknown): Promise<Uint8Array> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  } catch (e) {
    if ((e as Error)?.name === 'EncryptedPDFError' || /encrypt/i.test(String((e as Error)?.message))) throw new LockedPdfError();
    throw e;
  }
  if (pdf.isEncrypted) throw new LockedPdfError();
  removeTakeoff(pdf);
  const now = new Date();
  await pdf.attach(new TextEncoder().encode(JSON.stringify(takeoff)), TAKEOFF_ATTACHMENT, {
    mimeType: 'application/json',
    description: 'Takeoff (markups, scales, columns and standard details) by BuildSuite Takeoff Studio',
    creationDate: now,
    modificationDate: now,
  });
  return pdf.save({ addDefaultPage: false });
}

/** The takeoff saved inside a PDF, if it has one. */
export async function readTakeoff<T = unknown>(pdf: PDFDocumentProxy): Promise<T | null> {
  try {
    const all = (await pdf.getAttachments()) as Record<string, { filename?: string; content?: Uint8Array }> | null;
    if (!all) return null;
    const hit = Object.entries(all).find(([k, v]) => k === TAKEOFF_ATTACHMENT || v?.filename === TAKEOFF_ATTACHMENT)?.[1];
    if (!hit?.content) return null;
    const data = JSON.parse(new TextDecoder().decode(hit.content)) as { app?: string };
    return data?.app === 'takeoff-studio' ? (data as T) : null;
  } catch {
    return null;
  }
}
