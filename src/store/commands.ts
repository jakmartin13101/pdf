// UI commands shared by the menu bar, toolbar and context menus.
import type { MarkupType } from '../types';
import { getState, type ViewRequest } from './store';
import { fileBytes, openExampleTakeoff, openPdfFiles, openProjectFile, openSample, safeName, saveProjectFile, closeProject } from './project';
import { offerFile } from './files';
import { exportFlattenedPdf } from '../core/export';
import { COMMAND_BY_ID, chordFromEvent, commandForChord, resolveBindings } from '../core/keymap';
import { TYPE_INFO } from '../core/markupTypes';

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.click();
  });
}

/** Open PDFs: each one opens in a new tab of the active pane (and joins the project's set). */
export async function cmdOpenPdf() {
  const files = await pickFiles('application/pdf,.pdf', true);
  if (files.length) await openPdfFiles(files, getState().loaded ? 'append' : 'new');
}

/** Start a new project from PDFs (the open project is closed; it stays in its saved file). */
export async function cmdNewProject() {
  const files = await pickFiles('application/pdf,.pdf', true);
  if (files.length) await openPdfFiles(files, 'new');
}

/** The document tab showing in the active pane. */
function activeTab() {
  const st = getState();
  const pane = st.panes.find((p) => p.id === st.activePaneId);
  const fileId = st.doc.sheets.find((s) => s.id === pane?.sheetId)?.fileId;
  return pane && fileId ? { paneId: pane.id, fileId } : null;
}

export async function cmdAddPdf() {
  const files = await pickFiles('application/pdf,.pdf', true);
  if (files.length) await openPdfFiles(files, getState().loaded ? 'append' : 'new');
}

export async function cmdOpenProject() {
  const [file] = await pickFiles('.json,application/json', false);
  if (file) await openProjectFile(file);
}

export const cmdSaveProject = () => saveProjectFile();

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
    case 'file.newProject':
      return void cmdNewProject();
    case 'file.addPdf':
      return void cmdAddPdf();
    case 'file.save':
      if (st.loaded) void cmdSaveProject();
      return;
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
    case 'tab.close': {
      const t = activeTab();
      if (t) st.closeTab(t.paneId, t.fileId);
      return;
    }
    case 'tab.newPane': {
      const t = activeTab();
      if (t) st.tabToNewPane(t.paneId, t.fileId);
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
    const bytes = await exportFlattenedPdf(st.doc, fileBytes);
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

export function cmdCloseProject() {
  getState().setDialog({
    kind: 'confirm',
    title: 'Close Project',
    message: 'Close the current project? Unsaved work is kept only until another project is opened. Save a project file first if you need a copy.',
    onConfirm: () => void closeProject(),
  });
}

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
