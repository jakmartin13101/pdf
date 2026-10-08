import type { DocState, Sheet, SourceFile } from '../types';
import { detectSheetLabel, pageInfos, registerPdf, unregisterAll } from '../core/pdf';
import { uid } from '../core/ids';
import { base64ToBytes, bytesToBase64, idbDel, idbGet, idbKeys, idbSet } from '../core/persistence';
import { offerFile } from './files';
import { emptyDoc, getState, useStore } from './store';
import { DEFAULT_SETTINGS } from '../core/units';
import { titleCase } from '../core/text';

/** In-memory PDF bytes by file id (needed for export and project save). */
export const fileBytes = new Map<string, Uint8Array>();

const PROJECT_KEY = 'project';

interface SavedProject {
  app: 'takeoff-studio';
  version: 1;
  name: string;
  doc: DocState;
  currentSheetId?: string | null;
}

interface ProjectFile extends SavedProject {
  files: { id: string; name: string; data: string }[];
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

async function importPdf(name: string, bytes: Uint8Array, startIndex: number): Promise<{ file: SourceFile; sheets: Sheet[] }> {
  const fileId = uid('f');
  const pdf = await registerPdf(fileId, bytes);
  fileBytes.set(fileId, bytes);
  idbSet(`file:${fileId}`, bytes).catch(() => {});
  const infos = await pageInfos(pdf);
  let labels: string[] | null = null;
  try {
    labels = await pdf.getPageLabels();
  } catch {
    labels = null;
  }
  const sheets: Sheet[] = infos.map((info, i) => ({
    id: uid('s'),
    fileId,
    pageIndex: i,
    number: labels?.[i]?.trim() || String(startIndex + i + 1),
    title: infos.length > 1 ? `${baseName(name)} – Page ${i + 1}` : baseName(name),
    width: info.width,
    height: info.height,
    rotation: info.rotation,
    scale: null,
    viewports: [],
  }));
  // Read sheet numbers/titles from title blocks when every page has one.
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
  return { file: { id: fileId, name, pageCount: infos.length }, sheets };
}

export async function openPdfs(files: { name: string; bytes: Uint8Array }[], mode: 'new' | 'append') {
  const st = getState();
  st.setBusy(`Opening ${files.map((f) => f.name).join(', ')}…`);
  try {
    if (mode === 'new') {
      unregisterAll();
      fileBytes.clear();
      await clearAutosave();
    }
    const base: DocState = mode === 'new' ? emptyDoc() : st.doc;
    let sheets = [...base.sheets];
    const newFiles: SourceFile[] = [...base.files];
    let firstNew: string | null = null;
    for (const f of files) {
      const r = await importPdf(f.name, f.bytes, sheets.length);
      newFiles.push(r.file);
      sheets = [...sheets, ...r.sheets];
      firstNew ??= r.sheets[0]?.id ?? null;
    }
    const doc = { ...base, files: newFiles, sheets };
    const name = mode === 'new' ? baseName(files[0]?.name ?? 'Untitled Project') : st.projectName;
    st.loadDoc(doc, name, { keepHistory: mode === 'append' });
    if (firstNew) useStore.setState({ currentSheetId: firstNew });
    st.requestView({ kind: 'fit' });
    st.toast(`Loaded ${sheets.length - base.sheets.length} sheet${sheets.length - base.sheets.length === 1 ? '' : 's'}`, 'success');
  } catch (e) {
    console.error(e);
    st.toast(`Could not open PDF: ${(e as Error).message}`, 'error');
  } finally {
    st.setBusy(null);
  }
}

export async function openPdfFiles(list: FileList | File[], mode: 'new' | 'append') {
  const files = await Promise.all(
    [...list]
      .filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
      .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  if (!files.length) {
    getState().toast('Please choose PDF files', 'error');
    return;
  }
  await openPdfs(files, mode);
}

export async function openSample() {
  const st = getState();
  st.setBusy('Loading sample drawing set…');
  try {
    const res = await fetch('./samples/Sample-Structural-Set.pdf');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await openPdfs([{ name: 'Sample-Structural-Set.pdf', bytes }], 'new');
    useStore.setState({ projectName: 'Sample Warehouse – Structural Takeoff' });
  } catch (e) {
    st.toast(`Could not load sample: ${(e as Error).message}`, 'error');
    st.setBusy(null);
  }
}

// ---------------------------------------------------------------------------
// Project files (.takeoff.json) – drawings + all takeoff data in one file.

export async function saveProjectFile() {
  const st = getState();
  const pf: ProjectFile = {
    app: 'takeoff-studio',
    version: 1,
    name: st.projectName,
    doc: st.doc,
    currentSheetId: st.currentSheetId,
    files: st.doc.files.map((f) => ({ id: f.id, name: f.name, data: bytesToBase64(fileBytes.get(f.id) ?? new Uint8Array()) })),
  };
  if (await offerFile(new Blob([JSON.stringify(pf)], { type: 'application/json' }), `${safeName(st.projectName)}.takeoff.json`, 'Project')) {
    useStore.setState({ lastSaved: Date.now() });
  }
}

export async function openProjectFile(file: File) {
  await openProjectText(() => file.text(), file.name);
}

/** The sample drawing set with a structural takeoff already in progress. */
export async function openExampleTakeoff() {
  await openProjectText(async () => {
    const res = await fetch('./samples/Example-Takeoff.takeoff.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }, 'example takeoff');
}

async function openProjectText(read: () => Promise<string>, label: string) {
  const st = getState();
  st.setBusy(`Opening ${label}…`);
  try {
    const pf = JSON.parse(await read()) as ProjectFile;
    if (pf.app !== 'takeoff-studio' || !pf.doc) throw new Error('Not a Takeoff Studio project file');
    unregisterAll();
    fileBytes.clear();
    await clearAutosave();
    for (const f of pf.files) {
      const bytes = base64ToBytes(f.data);
      fileBytes.set(f.id, bytes);
      await registerPdf(f.id, bytes);
      idbSet(`file:${f.id}`, bytes).catch(() => {});
    }
    st.loadDoc(normalizeDoc(pf.doc), pf.name);
    if (pf.currentSheetId && pf.doc.sheets.some((s) => s.id === pf.currentSheetId)) useStore.setState({ currentSheetId: pf.currentSheetId });
    st.requestView({ kind: 'fit' });
    st.toast(`Opened ${pf.name}`, 'success');
  } catch (e) {
    st.toast(`Could not open project: ${(e as Error).message}`, 'error');
  } finally {
    st.setBusy(null);
  }
}

function normalizeDoc(doc: DocState): DocState {
  return {
    ...emptyDoc(),
    ...doc,
    settings: { ...DEFAULT_SETTINGS, ...doc.settings },
    sheets: doc.sheets.map((s) => ({ ...s, viewports: s.viewports ?? [] })),
  };
}

export function safeName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'project';
}

export async function closeProject() {
  unregisterAll();
  fileBytes.clear();
  await clearAutosave();
  useStore.setState({ doc: emptyDoc(), past: [], future: [], loaded: false, currentSheetId: null, selection: [], projectName: 'Untitled Project' });
}

// ---------------------------------------------------------------------------
// Autosave (IndexedDB)

async function clearAutosave() {
  try {
    const keys = await idbKeys();
    await Promise.all(keys.map((k) => idbDel(String(k))));
  } catch {
    /* ignore */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function startAutosave() {
  useStore.subscribe((s, prev) => {
    if (!s.loaded) return;
    if (s.doc === prev.doc && s.projectName === prev.projectName && s.currentSheetId === prev.currentSheetId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const st = getState();
      const sp: SavedProject = { app: 'takeoff-studio', version: 1, name: st.projectName, doc: st.doc, currentSheetId: st.currentSheetId };
      idbSet(PROJECT_KEY, sp)
        .then(() => useStore.setState({ lastSaved: Date.now() }))
        .catch((e) => console.warn('Autosave failed', e));
    }, 700);
  });
}

export async function restoreAutosave(): Promise<boolean> {
  try {
    const sp = await idbGet<SavedProject>(PROJECT_KEY);
    if (!sp?.doc?.sheets?.length) return false;
    for (const f of sp.doc.files) {
      const bytes = await idbGet<Uint8Array>(`file:${f.id}`);
      if (!bytes) return false;
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
      fileBytes.set(f.id, b);
      await registerPdf(f.id, b);
    }
    const st = getState();
    st.loadDoc(normalizeDoc(sp.doc), sp.name);
    if (sp.currentSheetId && sp.doc.sheets.some((s) => s.id === sp.currentSheetId)) useStore.setState({ currentSheetId: sp.currentSheetId });
    st.requestView({ kind: 'fit' });
    return true;
  } catch (e) {
    console.warn('Restore failed', e);
    return false;
  }
}
