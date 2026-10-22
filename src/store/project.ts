// Documents: every PDF opened is its own document, and its takeoff (markups, scales, columns,
// standard details) is saved inside that PDF. Older takeoff project files (.takeoff.json, several
// PDFs in one) open as one document per PDF.

import type { DocState, Sheet, SourceFile } from '../types';
import { upgradeSizes, upgradeTypes, withAddedColumns } from '../core/docUpgrade';
import { detectSheetLabel, pageInfos, registerPdf, unregisterPdf } from '../core/pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { uid } from '../core/ids';
import { base64ToBytes, bytesToBase64, idbDel, idbGet, idbKeys, idbSet } from '../core/persistence';
import { offerFile } from './files';
import { docById, docTitle, emptyDoc, getState, liveSlots, newDocState, useStore, type AppState } from './store';
import { DEFAULT_SETTINGS } from '../core/units';
import { titleCase } from '../core/text';
import { whenIdle } from '../core/renderCache';
import { LockedPdfError, embedTakeoff, readTakeoff } from '../core/embed';
import { desktop } from '../brand';

/** In-memory PDF bytes by file id (needed for saving, flattening and export). */
export const fileBytes = new Map<string, Uint8Array>();

/** A document's takeoff as saved inside its PDF (or, for a PDF that cannot be changed, in a .takeoff.json). */
interface SavedDocument {
  app: 'takeoff-studio';
  kind: 'document';
  version: 2;
  name: string;
  doc: DocState;
  currentSheetId?: string | null;
  /** Only in .takeoff.json files: the PDF itself. */
  pdf?: string;
}

/** Takeoff project files of version 1.5 and before: several PDFs and one takeoff over all of them. */
interface ProjectFileV1 {
  app: 'takeoff-studio';
  version: 1;
  name: string;
  doc: DocState;
  currentSheetId?: string | null;
  files: { id: string; name: string; data: string }[];
}

/** What is kept between sessions: the open documents. */
interface Session {
  app: 'takeoff-studio';
  kind: 'session';
  version: 2;
  docs: { id: string; name: string; path?: string; doc: DocState; dirty: boolean; currentSheetId?: string | null }[];
  activeDocId: string | null;
}

const SESSION_KEY = 'session';
const LEGACY_PROJECT_KEY = 'project';

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

const pdfName = (name: string) => (/\.pdf$/i.test(name) ? name : `${docTitle(name)}.pdf`);

/** Sets with more pages than this are shown first and their title blocks read afterwards. */
const READ_LABELS_FIRST_MAX = 12;

/** Sheets for the pages of a PDF (numbers and titles from the title blocks when every page has one). */
async function importPages(pdf: PDFDocumentProxy, fileId: string, name: string, readLabels: boolean, pages?: number[]): Promise<Sheet[]> {
  const infos = await pageInfos(pdf);
  let labels: string[] | null = null;
  try {
    labels = await pdf.getPageLabels();
  } catch {
    labels = null;
  }
  const which = pages ?? infos.map((_, i) => i);
  const sheets: Sheet[] = which.map((i) => ({
    id: uid('s'),
    fileId,
    pageIndex: i,
    number: labels?.[i]?.trim() || String(i + 1),
    title: infos.length > 1 ? `${baseName(name)} – Page ${i + 1}` : baseName(name),
    width: infos[i].width,
    height: infos[i].height,
    rotation: infos[i].rotation,
    scale: null,
    viewports: [],
  }));
  if (readLabels || sheets.length <= READ_LABELS_FIRST_MAX) {
    try {
      const detected = await Promise.all(sheets.map((s) => detectSheetLabel(fileId, s.pageIndex, s.width, s.height)));
      if (detected.length && detected.every((d) => d && d.number)) {
        detected.forEach((d, i) => {
          sheets[i].number = d!.number;
          if (d!.title) sheets[i].title = titleCase(d!.title);
        });
      }
    } catch {
      /* heuristic only */
    }
  }
  return sheets;
}

/** Read sheet numbers and titles from the title blocks of a large set once its first page is showing. */
async function readLabelsLater(docId: string) {
  const doc = docById(getState(), docId);
  const sheets = doc?.sheets ?? [];
  if (sheets.length <= READ_LABELS_FIRST_MAX) return;
  const before = Object.fromEntries(sheets.map((s) => [s.id, { number: s.number, title: s.title }]));
  const detected: ({ number: string; title: string } | null)[] = [];
  try {
    for (const s of sheets) {
      await whenIdle();
      if (!docById(getState(), docId)) return; // closed meanwhile
      detected.push(await detectSheetLabel(s.fileId, s.pageIndex, s.width, s.height));
    }
  } catch {
    return;
  }
  if (!detected.every((d) => d?.number)) return;
  getState().applyReadLabels(
    docId,
    Object.fromEntries(sheets.map((s, i) => [s.id, { number: detected[i]!.number, title: detected[i]!.title ? titleCase(detected[i]!.title) : s.title }])),
    before,
  );
  getState().toast(`Read ${sheets.length} sheet numbers from the title blocks`, 'success');
}

function normalizeDoc(saved: DocState): DocState {
  const st = getState();
  // From earlier versions: sizes with a capital X, and the Height and Finish columns.
  const doc = upgradeTypes(upgradeSizes({ ...saved, columns: withAddedColumns(saved.columns ?? []) }));
  return {
    ...emptyDoc(),
    ...doc,
    settings: { ...DEFAULT_SETTINGS, ...doc.settings },
    sheets: doc.sheets.map((s) => ({ ...s, viewports: s.viewports ?? [] })),
    // Older takeoffs: the list as it was set up.
    listStyle: doc.listStyle ?? { columns: [...st.list.columns], widths: { ...st.list.widths }, labels: {} },
  };
}

/** Sheet and markup ids already used by an open document. */
function idsInUse(st: AppState) {
  const used = new Set<string>();
  for (const d of liveSlots(st)) {
    d.doc.sheets.forEach((s) => used.add(s.id));
    d.doc.markups.forEach((m) => used.add(m.id));
  }
  return used;
}

/** New sheet and markup ids for a document opened twice (a copy of a file already open). */
function reId(doc: DocState): DocState {
  const sheetIds = new Map(doc.sheets.map((s) => [s.id, uid('s')]));
  return {
    ...doc,
    sheets: doc.sheets.map((s) => ({
      ...s,
      id: sheetIds.get(s.id)!,
      compare: s.compare ? { ...s.compare, sheetId: sheetIds.get(s.compare.sheetId) ?? s.compare.sheetId } : undefined,
    })),
    markups: doc.markups.map((m) => ({ ...m, id: uid('m'), sheetId: sheetIds.get(m.sheetId) ?? m.sheetId })),
  };
}

/** A saved takeoff put on a PDF just opened (under a new file id). */
async function adoptTakeoff(saved: DocState, pdf: PDFDocumentProxy, fileId: string, name: string): Promise<DocState> {
  let doc = normalizeDoc(saved);
  const pageCount = pdf.numPages;
  const before = doc.files[0]?.pageCount ?? pageCount;
  const file: SourceFile = { id: fileId, name, pageCount };
  let sheets = doc.sheets.map((s) => ({ ...s, fileId })).filter((s) => s.pageIndex < pageCount);
  // The PDF was changed by another program since: pages it gained come in as new sheets.
  if (pageCount !== before) {
    const have = new Set(sheets.map((s) => s.pageIndex));
    const missing = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !have.has(i));
    if (missing.length) sheets = [...sheets, ...(await importPages(pdf, fileId, name, true, missing))].sort((a, b) => a.pageIndex - b.pageIndex);
  }
  const ids = new Set(sheets.map((s) => s.id));
  doc = { ...doc, files: [file], sheets, markups: doc.markups.filter((m) => ids.has(m.sheetId)) };
  const used = idsInUse(getState());
  return doc.sheets.some((s) => used.has(s.id)) || doc.markups.some((m) => used.has(m.id)) ? reId(doc) : doc;
}

// ---------------------------------------------------------------------------
// Opening

export interface OpenFile {
  name: string;
  bytes: Uint8Array;
  /** Desktop app: where the file is, so Save can write back to it. */
  path?: string;
}

/** Open PDFs: each one is its own document, in a new tab of the active pane. */
export async function openPdfs(files: OpenFile[]) {
  for (const f of files) await openPdfDocument(f);
}

async function openPdfDocument(f: OpenFile) {
  const st = getState();
  // The same file already open: show it.
  const same = liveSlots(st).find((d) => (f.path ? d.path === f.path : d.name === f.name && fileBytes.get(d.doc.files[0]?.id ?? '')?.length === f.bytes.length));
  if (same) {
    st.openTab(st.activePaneId, same.id);
    st.toast(`${f.name} is already open`);
    return;
  }
  st.setBusy(`Opening ${f.name}…`);
  const fileId = uid('f');
  try {
    const pdf = await registerPdf(fileId, f.bytes);
    fileBytes.set(fileId, f.bytes);
    idbSet(`file:${fileId}`, f.bytes).catch(() => {});
    const saved = await readTakeoff<SavedDocument>(pdf);
    const readFirst = !st.prefs.perf.backgroundLabels;
    let doc: DocState;
    if (saved?.doc) {
      doc = await adoptTakeoff(saved.doc, pdf, fileId, f.name);
    } else {
      const sheets = await importPages(pdf, fileId, f.name, readFirst);
      doc = { ...newDocState(getState().prefs), files: [{ id: fileId, name: f.name, pageCount: pdf.numPages }], sheets };
    }
    const id = uid('d');
    getState().addDocument({ id, name: f.name, path: f.path, doc }, { sheetId: saved?.currentSheetId });
    getState().requestView({ kind: 'fit' });
    const n = doc.markups.length;
    getState().toast(saved ? `Opened ${f.name} with its takeoff (${n} markup${n === 1 ? '' : 's'})` : `Opened ${f.name} (${doc.sheets.length} sheet${doc.sheets.length === 1 ? '' : 's'})`, 'success');
    if (!saved && !readFirst) void readLabelsLater(id);
  } catch (e) {
    console.error(e);
    fileBytes.delete(fileId);
    void unregisterPdf(fileId);
    idbDel(`file:${fileId}`).catch(() => {});
    getState().toast(`Could not open ${f.name}: ${(e as Error).message}`, 'error');
  } finally {
    getState().setBusy(null);
  }
}

/** Open files chosen or dropped: PDFs, and takeoff files (.takeoff.json). */
export async function openFiles(list: (File | OpenFile)[]) {
  const items = await Promise.all(
    list.map(async (f) => ('bytes' in f ? f : { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const pdfs = items.filter((f) => /\.pdf$/i.test(f.name));
  const takeoffs = items.filter((f) => /\.json$/i.test(f.name));
  if (!pdfs.length && !takeoffs.length) {
    getState().toast('Please choose PDF files', 'error');
    return;
  }
  for (const t of takeoffs) await openTakeoffText(async () => new TextDecoder().decode(t.bytes), t.name);
  await openPdfs(pdfs);
}

export async function openSample() {
  const st = getState();
  st.setBusy('Loading sample drawing set…');
  try {
    const res = await fetch('./samples/Sample-Structural-Set.pdf');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await openPdfs([{ name: 'Sample-Structural-Set.pdf', bytes }]);
  } catch (e) {
    st.toast(`Could not load sample: ${(e as Error).message}`, 'error');
    st.setBusy(null);
  }
}

/** The sample drawing set with a structural takeoff already in progress (and its addendum). */
export async function openExampleTakeoff() {
  await openTakeoffText(async () => {
    const res = await fetch('./samples/Example-Takeoff.takeoff.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }, 'example takeoff');
}

export async function openProjectFile(file: File) {
  await openTakeoffText(() => file.text(), file.name);
}

/**
 * A takeoff file: a document saved as .takeoff.json (a PDF that could not be changed), or an older
 * project with several PDFs, which opens as one document per PDF.
 */
async function openTakeoffText(read: () => Promise<string>, label: string) {
  const st = getState();
  st.setBusy(`Opening ${label}…`);
  try {
    const data = JSON.parse(await read()) as SavedDocument | ProjectFileV1;
    if (data.app !== 'takeoff-studio' || !data.doc) throw new Error('Not a Takeoff Studio file');
    if ('kind' in data && data.kind === 'document') {
      if (!data.pdf) throw new Error('The file has no drawing in it');
      const bytes = base64ToBytes(data.pdf);
      const fileId = uid('f');
      const pdf = await registerPdf(fileId, bytes);
      fileBytes.set(fileId, bytes);
      idbSet(`file:${fileId}`, bytes).catch(() => {});
      const name = data.doc.files[0]?.name ?? pdfName(data.name);
      const doc = await adoptTakeoff(data.doc, pdf, fileId, name);
      getState().addDocument({ id: uid('d'), name, doc }, { sheetId: data.currentSheetId });
    } else {
      await openProjectV1(data as ProjectFileV1);
    }
    getState().requestView({ kind: 'fit' });
    getState().toast(`Opened ${data.name}`, 'success');
  } catch (e) {
    getState().toast(`Could not open ${label}: ${(e as Error).message}`, 'error');
  } finally {
    getState().setBusy(null);
  }
}

/** An older project: one document per PDF, each with its own sheets and markups. */
async function openProjectV1(pf: ProjectFileV1) {
  const full = normalizeDoc(pf.doc);
  const docName = new Map<string, string>();
  for (const f of pf.files) for (const s of full.sheets) if (s.fileId === f.id) docName.set(s.id, f.name);
  let firstDoc: string | null = null;
  for (const f of pf.files) {
    const bytes = base64ToBytes(f.data);
    const fileId = uid('f');
    const pdf = await registerPdf(fileId, bytes);
    fileBytes.set(fileId, bytes);
    idbSet(`file:${fileId}`, bytes).catch(() => {});
    const sheets = full.sheets
      .filter((s) => s.fileId === f.id)
      .map((s) => ({
        ...s,
        fileId,
        // An overlay of another PDF of the project: that is another document now.
        compare: s.compare ? { ...s.compare, docName: docName.get(s.compare.sheetId) !== f.name ? docName.get(s.compare.sheetId) : undefined } : undefined,
      }));
    const ids = new Set(sheets.map((s) => s.id));
    const file = full.files.find((x) => x.id === f.id);
    const doc: DocState = {
      ...full,
      files: [{ id: fileId, name: f.name, pageCount: file?.pageCount ?? pdf.numPages }],
      sheets,
      markups: full.markups.filter((m) => ids.has(m.sheetId)),
    };
    const id = uid('d');
    const current = pf.currentSheetId && ids.has(pf.currentSheetId) ? pf.currentSheetId : null;
    getState().addDocument({ id, name: f.name, doc }, { sheetId: current });
    if (current) firstDoc = id;
  }
  // Show the document the project was last on.
  if (firstDoc) getState().openTab(getState().activePaneId, firstDoc);
}

// ---------------------------------------------------------------------------
// Saving

/** The sheet a document was last on (to open it there again). */
function lastSheet(st: AppState, docId: string) {
  const act = st.panes.find((p) => p.id === st.activePaneId);
  if (act?.docId === docId) return act.sheetId;
  return st.panes.find((p) => p.docId === docId)?.sheetId ?? null;
}

/**
 * Save a document: its takeoff goes into its PDF. In the desktop app Save writes back to the file it
 * came from (Save As asks where); in a browser the PDF is downloaded. A PDF that is protected against
 * changes is saved as a .takeoff.json file instead (with the PDF inside). Resolves true when saved.
 */
export async function saveDocument(docId: string, opts: { as?: boolean } = {}): Promise<boolean> {
  const st = getState();
  const slot = liveSlots(st).find((d) => d.id === docId);
  const file = slot?.doc.files[0];
  const bytes = file && fileBytes.get(file.id);
  if (!slot || !file || !bytes) return false;
  const data: SavedDocument = { app: 'takeoff-studio', kind: 'document', version: 2, name: docTitle(slot.name), doc: slot.doc, currentSheetId: lastSheet(st, docId) };
  st.setBusy(`Saving ${slot.name}…`);
  try {
    let out: Uint8Array;
    let name = pdfName(slot.name);
    let type = 'application/pdf';
    try {
      out = await embedTakeoff(bytes, data);
    } catch (e) {
      if (!(e instanceof LockedPdfError)) throw e;
      out = new TextEncoder().encode(JSON.stringify({ ...data, pdf: bytesToBase64(bytes) }));
      name = `${docTitle(slot.name)}.takeoff.json`;
      type = 'application/json';
      st.toast(`${slot.name} is protected against changes, so its takeoff is saved in ${name} (open that file to carry on).`, 'info');
    }
    const inPlace = !opts.as && !!slot.path && type === 'application/pdf' && /\.pdf$/i.test(slot.path);
    if (desktop) {
      const path = inPlace && desktop.writeFile ? ((await desktop.writeFile(slot.path!, out)) ? slot.path! : null) : await desktop.saveFile(name, out);
      if (!path) return false;
      const saved = typeof path === 'string' ? path : undefined;
      getState().markSaved(docId, saved ? { path: saved, name: saved.split(/[\\/]/).pop() } : undefined);
      getState().toast(`Saved ${saved?.split(/[\\/]/).pop() ?? name}`, 'success');
      return true;
    }
    if (!(await offerFile(new Blob([out], { type }), name, 'Document'))) return false;
    getState().markSaved(docId, { name: slot.name });
    return true;
  } catch (e) {
    console.error(e);
    getState().toast(`Could not save ${slot.name}: ${(e as Error).message}`, 'error');
    return false;
  } finally {
    getState().setBusy(null);
  }
}

// ---------------------------------------------------------------------------
// Closing

/** File ids a document uses (now and in its undo history, e.g. before flattening). */
function filesOf(slot: { doc: DocState; past: DocState[]; future: DocState[] }) {
  return new Set([slot.doc, ...slot.past, ...slot.future].flatMap((d) => d.files.map((f) => f.id)));
}

/** Close a document (unsaved changes are lost: ask first) and let go of its PDFs. */
export function closeDocument(docId: string) {
  const st = getState();
  const slot = liveSlots(st).find((d) => d.id === docId);
  if (!slot) return;
  const mine = filesOf(slot);
  st.closeDocument(docId);
  const others = new Set(liveSlots(getState()).flatMap((d) => [...filesOf(d)]));
  for (const id of mine) {
    if (others.has(id)) continue;
    fileBytes.delete(id);
    void unregisterPdf(id);
    idbDel(`file:${id}`).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Autosave (IndexedDB): the open documents, restored when the program starts again.

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// No autosave while the last session is being restored (it would drop drawings not read back yet).
let restoring = false;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!restoring) writeSession().catch((e) => console.warn('Autosave failed', e));
  }, 700);
}

async function writeSession() {
  const st = getState();
  const slots = liveSlots(st);
  const session: Session = {
    app: 'takeoff-studio',
    kind: 'session',
    version: 2,
    docs: slots.map((d) => ({ id: d.id, name: d.name, path: d.path, doc: d.doc, dirty: d.doc !== d.saved, currentSheetId: lastSheet(st, d.id) })),
    activeDocId: st.activeDocId,
  };
  await idbSet(SESSION_KEY, session);
  useStore.setState({ lastSaved: Date.now() });
  // Drawings no open document uses any more.
  const used = new Set(slots.flatMap((d) => d.doc.files.map((f) => `file:${f.id}`)));
  const keys = await idbKeys();
  await Promise.all(keys.map(String).filter((k) => k.startsWith('file:') && !used.has(k) && !fileBytes.has(k.slice(5))).map((k) => idbDel(k)));
}

export function startAutosave() {
  useStore.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.docs === prev.docs && s.currentSheetId === prev.currentSheetId && s.loaded === prev.loaded) return;
    if (!restoring) scheduleSave();
  });
}

async function loadBytes(fileId: string): Promise<Uint8Array | null> {
  const bytes = await idbGet<Uint8Array>(`file:${fileId}`);
  if (!bytes) return null;
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
}

export async function restoreAutosave(): Promise<boolean> {
  restoring = true;
  try {
    return await restoreSession();
  } finally {
    restoring = false;
    if (getState().loaded) scheduleSave();
  }
}

async function restoreSession(): Promise<boolean> {
  try {
    const session = await idbGet<Session>(SESSION_KEY);
    if (session?.docs?.length) {
      let restored = 0;
      for (const d of session.docs) {
        const file = d.doc.files[0];
        const bytes = file && (await loadBytes(file.id));
        if (!bytes) continue;
        fileBytes.set(file.id, bytes);
        await registerPdf(file.id, bytes);
        const doc = normalizeDoc(d.doc);
        getState().addDocument({ id: d.id, name: d.name, path: d.path, doc, saved: d.dirty ? null : doc }, { sheetId: d.currentSheetId });
        restored++;
      }
      if (session.activeDocId && getState().docs.some((d) => d.id === session.activeDocId)) getState().openTab(getState().activePaneId, session.activeDocId);
      if (restored) getState().requestView({ kind: 'fit' });
      return restored > 0;
    }
    // Autosave of version 1.5 and before: one project.
    const old = await idbGet<{ name: string; doc: DocState; currentSheetId?: string | null }>(LEGACY_PROJECT_KEY);
    if (!old?.doc?.sheets?.length) return false;
    const files: ProjectFileV1['files'] = [];
    for (const f of old.doc.files) {
      const bytes = await loadBytes(f.id);
      if (!bytes) return false;
      files.push({ id: f.id, name: f.name, data: bytesToBase64(bytes) });
    }
    await openProjectV1({ app: 'takeoff-studio', version: 1, name: old.name, doc: old.doc, currentSheetId: old.currentSheetId, files });
    await idbDel(LEGACY_PROJECT_KEY);
    getState().requestView({ kind: 'fit' });
    return true;
  } catch (e) {
    console.warn('Restore failed', e);
    return false;
  }
}

export function safeName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'takeoff';
}
