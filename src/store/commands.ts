// UI commands shared by the menu bar, toolbar and context menus.
import type { MarkupType } from '../types';
import { defaultListStyle, getState, isDirty, listStyleOf, liveSlots, type ViewRequest } from './store';
import { builtInListStyle, listStyleFile, parseListStyle, styleOfDoc } from '../core/listStyle';
import { splitOldSubject } from '../core/subjects';
import { normName } from '../core/formula';
import { closeDocument, fileBytes, openExampleTakeoff, openFiles, openProjectFile, openSample, safeName, saveDocument } from './project';
import { offerFile } from './files';
import { exportFlattenedPdf } from '../core/export';
import { marksForPdf } from './flatten';
import { COMMAND_BY_ID, chordFromEvent, commandForChord, resolveBindings } from '../core/keymap';
import { TYPE_INFO } from '../core/markupTypes';
import { desktop } from '../brand';

export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.click();
  });
}

/** Open PDFs (or takeoff files): each PDF is its own document, in a new tab of the active pane. */
export async function cmdOpenPdf() {
  if (desktop?.openFilesDialog) {
    const files = await desktop.openFilesDialog();
    if (files.length) await openFiles(files.map((f) => ({ name: f.name, bytes: f.data, path: f.path })));
    return;
  }
  const files = await pickFiles('application/pdf,.pdf,.json,application/json', true);
  if (files.length) await openFiles(files);
}

/** The document tab showing in the active pane. */
function activeTab() {
  const st = getState();
  const pane = st.panes.find((p) => p.id === st.activePaneId);
  return pane?.docId ? { paneId: pane.id, docId: pane.docId } : null;
}

export async function cmdOpenProject() {
  const [file] = await pickFiles('.json,application/json', false);
  if (file) await openProjectFile(file);
}

/** Save the active document (its takeoff goes into its PDF). */
export const cmdSave = () => {
  const id = getState().activeDocId;
  return id ? saveDocument(id) : Promise.resolve(false);
};
export const cmdSaveAs = () => {
  const id = getState().activeDocId;
  return id ? saveDocument(id, { as: true }) : Promise.resolve(false);
};
/** Save every document with unsaved changes. */
export async function cmdSaveAll() {
  const st = getState();
  for (const d of st.docs) if (isDirty(getState(), d.id) && !(await saveDocument(d.id))) return false;
  return true;
}

/**
 * Before closing documents: when any has unsaved changes, ask whether to save them first. `then`
 * runs unless the user cancels (or a save fails).
 */
export function confirmUnsaved(docIds: string[], then: () => void) {
  const st = getState();
  const dirty = docIds.filter((id) => isDirty(st, id));
  if (!dirty.length) return then();
  st.setDialog({ kind: 'unsaved', docIds: dirty, then });
}

/** Close a document (asking about unsaved changes). */
export function cmdCloseDocument(docId = getState().activeDocId) {
  if (docId) confirmUnsaved([docId], () => closeDocument(docId));
}

/** Close every document. */
export function cmdCloseAll() {
  const ids = liveSlots(getState()).map((d) => d.id);
  confirmUnsaved(ids, () => ids.forEach((id) => closeDocument(id)));
}

/** Close a document's tab in a pane: its last tab closes the document (asking about unsaved changes). */
export function cmdCloseTab(paneId: string, docId: string) {
  cmdCloseTabs(paneId, [docId]);
}

/** Close several tabs of a pane; documents shown nowhere else close (asking about unsaved changes once). */
export function cmdCloseTabs(paneId: string, docIds: string[]) {
  const st = getState();
  const elsewhere = (id: string) => st.panes.some((p) => p.id !== paneId && p.tabs.some((t) => t.docId === id));
  const closing = docIds.filter((id) => !elsewhere(id));
  confirmUnsaved(closing, () => {
    for (const id of docIds) {
      if (closing.includes(id)) closeDocument(id);
      else getState().closeTab(paneId, id);
    }
  });
}

let bindingsCache: { from: Record<string, string[]>; map: Map<string, string[]> } | null = null;
/** Keyboard shortcuts in effect: defaults with the user's changes. */
export function currentBindings(): Map<string, string[]> {
  const keys = getState().prefs.keys;
  if (bindingsCache?.from !== keys) bindingsCache = { from: keys, map: resolveBindings(keys) };
  return bindingsCache.map;
}

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'color'].includes((el as HTMLInputElement).type);
};

/**
 * Keyboard shortcuts, in every window (the main window and detached panes). The drawing handles its
 * own keys first (Space to pan, Esc, Enter and Backspace while drawing, arrows to nudge).
 */
export function handleAppShortcut(e: KeyboardEvent) {
  if (e.defaultPrevented || e.repeat) return;
  const chord = chordFromEvent(e);
  if (!chord) return;
  const id = commandForChord(chord, currentBindings());
  if (!id) return;
  const def = COMMAND_BY_ID.get(id)!;
  const st = getState();
  if (isTypingTarget(e.target) && !(def.anywhere && chord.startsWith('Ctrl'))) return;
  if ((st.dialog || st.editingTextId) && !def.anywhere) return;
  if (!st.loaded && !def.anywhere) return;
  e.preventDefault();
  runCommand(id);
}

/** Run a command by id (keyboard shortcuts; see core/keymap.ts). */
export function runCommand(id: string) {
  const st = getState();
  const toggle = (k: 'snapContent' | 'snapMarkup' | 'ortho' | 'showLabels') => st.setPrefs({ [k]: !st.prefs[k] });
  switch (id) {
    case 'file.openPdf':
      return void cmdOpenPdf();
    case 'file.save':
      if (st.loaded) void cmdSave();
      return;
    case 'file.saveAs':
      if (st.loaded) void cmdSaveAs();
      return;
    case 'file.saveAll':
      if (st.loaded) void cmdSaveAll();
      return;
    case 'file.close':
      return cmdCloseDocument();
    case 'file.exportPdf':
      return void exportPdf();
    case 'app.settings':
      return st.setDialog({ kind: 'settings' });
    case 'edit.undo':
      return st.undo();
    case 'edit.redo':
      return st.redo();
    case 'edit.copy':
      return st.copySelection();
    case 'edit.paste':
      return st.paste();
    case 'edit.duplicate':
      return st.duplicateSelection();
    case 'edit.delete':
      if (st.selection.length) st.deleteMarkups(st.selection);
      return;
    case 'edit.selectAll': {
      const hidden = new Set(st.doc.layers.filter((l) => !l.visible).map((l) => l.id));
      return st.setSelection(st.doc.markups.filter((m) => m.sheetId === st.currentSheetId && !hidden.has(m.layer)).map((m) => m.id));
    }
    case 'edit.flatten':
      return st.setDialog({ kind: 'flatten' });
    case 'view.fit':
      return view('fit');
    case 'view.fitWidth':
      return view('fitWidth');
    case 'view.zoomIn':
      return view('zoomBy', 1.25);
    case 'view.zoomOut':
      return view('zoomBy', 0.8);
    case 'view.labels':
      return toggle('showLabels');
    case 'sheet.next':
      return st.gotoSheetOffset(1);
    case 'sheet.prev':
      return st.gotoSheetOffset(-1);
    case 'tab.next':
      return st.cycleTab(1);
    case 'tab.prev':
      return st.cycleTab(-1);
    case 'report.combine':
      return st.setDialog({ kind: 'combine' });
    case 'tab.close': {
      const t = activeTab();
      if (t) cmdCloseTab(t.paneId, t.docId);
      return;
    }
    case 'view.single':
      if (st.loaded) st.setPaneLayout('single');
      return;
    case 'view.splitV':
    case 'view.splitH':
    case 'view.split4': {
      if (!st.loaded) return;
      const layout = id === 'view.splitV' ? 'vertical' : id === 'view.splitH' ? 'horizontal' : 'grid';
      return st.setPaneLayout(st.paneLayout === layout ? 'single' : layout);
    }
    case 'tab.newPane': {
      const t = activeTab();
      if (t) st.tabToNewPane(t.paneId, t.docId);
      return;
    }
    case 'tool.select':
      return st.setTool({ kind: 'select' });
    case 'tool.zoomrect':
      return st.setTool({ kind: 'zoomrect' });
    case 'tool.calibrate':
      return st.setTool({ kind: 'calibrate' });
    case 'snap.content':
      return toggle('snapContent');
    case 'snap.markup':
      return toggle('snapMarkup');
    case 'snap.ortho':
      return toggle('ortho');
    case 'takeoff.addDetail':
      if (st.selection.length) st.setDialog({ kind: 'addDetail', markupIds: st.selection });
      else st.toast('Select one or more markups first', 'info');
      return;
    case 'takeoff.details':
      return st.setDialog({ kind: 'details' });
    case 'takeoff.auto':
      return st.togglePanel('autotakeoff');
    case 'takeoff.markups':
      return st.togglePanel('markups');
    case 'takeoff.summary':
      return st.togglePanel('summary');
    case 'doc.pageLabels':
      return st.setDialog({ kind: 'pageLabels' });
    case 'doc.labelsFromBox':
      return cmdLabelsFromBox();
    case 'doc.compare':
      return st.setDialog({ kind: 'compare' });
  }
  if (id.startsWith('tool.')) {
    const type = id.slice(5) as MarkupType;
    if (TYPE_INFO[type]) st.setTool({ kind: 'markup', type });
  }
}

/** Page labels from a box: drag a box around the sheet number (and/or title) on the page. */
export function cmdLabelsFromBox() {
  const st = getState();
  if (!st.loaded) return;
  st.setTool({ kind: 'region', purpose: 'label' });
  st.toast('Drag a box around the sheet number or title in the title block', 'info');
}

export async function exportPdf() {
  const st = getState();
  st.setBusy('Exporting flattened PDF…');
  try {
    const bytes = await exportFlattenedPdf(st.doc, fileBytes, { marks: marksForPdf(st.doc) });
    st.setBusy(null);
    await offerFile(new Blob([bytes], { type: 'application/pdf' }), `${safeName(st.projectName)}_markups.pdf`, 'Marked-up PDF');
  } catch (e) {
    console.error(e);
    st.toast(`Export failed: ${(e as Error).message}`, 'error');
  } finally {
    st.setBusy(null);
  }
}

export const cmdOpenSample = () => openSample();
export const cmdOpenExample = () => openExampleTakeoff();

export const view = (kind: ViewRequest['kind'], factor?: number) => getState().requestView({ kind, factor } as ViewRequest);

export async function cmdImportToolChest() {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const sets = Array.isArray(data) ? data : data.toolSets;
    if (!Array.isArray(sets)) throw new Error('Invalid tool chest file');
    const st = getState();
    st.setToolChest([...st.toolChest, ...sets]);
    st.toast(`Imported ${sets.length} tool set${sets.length === 1 ? '' : 's'}`, 'success');
  } catch (e) {
    getState().toast(`Import failed: ${(e as Error).message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Markups List styles (columns shown, their order, widths and header names, and the custom columns)

/** The active document's list as a style. */
function currentStyle() {
  const st = getState();
  return styleOfDoc(st.doc, listStyleOf(st));
}

/** Files opened from now on start with this document's list style. */
export function cmdSaveDefaultListStyle() {
  getState().setPrefs({ listStyle: currentStyle() });
  getState().toast('Saved as the default Markups List style for files you open from now on', 'success');
}

export function cmdApplyDefaultListStyle() {
  const st = getState();
  st.applyListStyle(defaultListStyle(st.prefs));
  st.toast('Applied the default Markups List style', 'success');
}

export function cmdResetListStyle() {
  getState().applyListStyle(builtInListStyle());
  getState().toast('Markups List columns reset to the built-in style', 'success');
}

/** Save the list style to a file: a backup, or to use on another computer. */
export async function cmdExportListStyle(which: 'current' | 'default' = 'current') {
  const st = getState();
  const style = which === 'default' ? defaultListStyle(st.prefs) : currentStyle();
  const name = which === 'default' ? 'Default Markups List Style.json' : `${safeName(st.projectName)} Markups List Style.json`;
  await offerFile(new Blob([JSON.stringify(listStyleFile(style), null, 2)], { type: 'application/json' }), name, 'Markups List style');
}

/** Read a list style file: use it on this document (applyHere), and (asDefault) make it the default. */
export async function cmdImportListStyle(asDefault = false, applyHere = true) {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return;
  try {
    const style = parseListStyle(await file.text());
    const st = getState();
    if (applyHere && st.activeDocId) st.applyListStyle(style);
    if (asDefault) st.setPrefs({ listStyle: style });
    st.toast(asDefault ? `Imported the Markups List style as the default${applyHere && st.activeDocId ? ' (and used it here)' : ''}` : 'Imported the Markups List style', 'success');
  } catch (e) {
    getState().toast(`Import failed: ${(e as Error).message}`, 'error');
  }
}

/** Menu items for list styles (list toolbar, column header menu). */
export function listStyleMenuItems(): { label?: string; onClick?: () => void; sep?: boolean; disabled?: boolean }[] {
  const custom = !!getState().prefs.listStyle;
  return [
    { label: 'Save as Default Style', onClick: cmdSaveDefaultListStyle },
    { label: 'Apply Default Style', onClick: cmdApplyDefaultListStyle },
    { label: 'Reset to Built-in Style', onClick: cmdResetListStyle },
    { sep: true },
    { label: 'Export This Style…', onClick: () => void cmdExportListStyle('current') },
    { label: 'Export Default Style…', onClick: () => void cmdExportListStyle('default'), disabled: !custom },
    { label: 'Import Style…', onClick: () => void cmdImportListStyle(false) },
    { label: 'Import as Default Style…', onClick: () => void cmdImportListStyle(true) },
  ];
}

// ---------------------------------------------------------------------------
// Subjects (shapes)

/**
 * Turn this document's subjects from before subjects were shapes into shapes: W24X55 → W (the size
 * goes to Member Size when that is empty). With `clearOthers`, subjects that name no shape in the list
 * (Metal Deck…) are cleared. One undo step; returns how many markups changed.
 */
export function cmdConvertSubjects(clearOthers = false): number {
  const st = getState();
  const subjects = st.prefs.subjects;
  const sizeCol = st.doc.columns.find((c) => normName(c.name) === 'membersize');
  const now = Date.now();
  let changed = 0;
  const markups = st.doc.markups.map((m) => {
    if (!m.subject) return m;
    const split = splitOldSubject(m.subject, subjects);
    if (!split) {
      if (!clearOthers) return m;
      changed++;
      return { ...m, subject: '', modified: now };
    }
    if (split.subject === m.subject) return m;
    changed++;
    const custom = sizeCol && split.size && !String(m.custom[sizeCol.id] ?? '').trim() ? { ...m.custom, [sizeCol.id]: split.size } : m.custom;
    return { ...m, subject: split.subject, custom, modified: now };
  });
  if (changed) st.commit((d) => ({ ...d, markups }));
  st.toast(changed ? `Changed the subject of ${changed} markup${changed === 1 ? '' : 's'}` : 'All subjects are already shapes from the list', changed ? 'success' : 'info');
  return changed;
}

/** Break the selected (or given) length measurements at their shapes' maximum length. */
export function cmdSplitAtMax(ids: string[] = getState().selection) {
  const st = getState();
  if (!st.prefs.maxLengths.enabled) {
    st.toast('Maximum lengths are off (Settings → Length Measurements)', 'info');
    return;
  }
  const n = st.splitAtMaxLength(ids);
  st.toast(
    n
      ? `${n} measurement${n === 1 ? '' : 's'} broken at the maximum length`
      : 'Nothing is longer than its maximum length (set them in Settings → Length Measurements)',
    n ? 'success' : 'info',
  );
}
