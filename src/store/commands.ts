// UI commands shared by the menu bar, toolbar and context menus.
import { getState, type ViewRequest } from './store';
import { openPdfFiles, openProjectFile, openSample, saveProjectFile, closeProject } from './project';

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

export async function cmdOpenPdf() {
  const files = await pickFiles('application/pdf,.pdf', true);
  if (files.length) await openPdfFiles(files, 'new');
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
export const cmdOpenSample = () => openSample();

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
