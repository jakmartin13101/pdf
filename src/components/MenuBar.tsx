import { useEffect, useRef, useState } from 'react';
import { MenuList, type MenuItem } from './ContextMenu';
import { getState, useStore } from '../store/store';
import { cmdAddPdf, cmdCloseProject, cmdOpenPdf, cmdOpenProject, cmdOpenSample, cmdSaveProject, view } from '../store/commands';
import { exportFlattenedPdf, downloadText, markupsCsv, openReport, summaryCsv, summaryReportHtml } from '../core/export';
import { buildRows } from '../core/columns';
import { fileBytes, safeName } from '../store/project';
import { downloadBlob } from '../core/persistence';
import { MEASURE_TYPES, MARKUP_TYPES, TYPE_INFO } from '../core/markupTypes';

export async function exportPdf() {
  const st = getState();
  st.setBusy('Exporting flattened PDF…');
  try {
    const bytes = await exportFlattenedPdf(st.doc, fileBytes);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${safeName(st.projectName)}_markups.pdf`);
    st.toast('Exported PDF with markups', 'success');
  } catch (e) {
    console.error(e);
    st.toast(`Export failed: ${(e as Error).message}`, 'error');
  } finally {
    st.setBusy(null);
  }
}

export function exportMarkupsCsv() {
  const st = getState();
  const rows = buildRows(st.doc);
  downloadText(markupsCsv(rows, st.list.columns, st.doc), `${safeName(st.projectName)}_markups.csv`);
}

export function exportSummaryCsv(groupBy: string | null = 'c:category') {
  const st = getState();
  const rows = buildRows(st.doc);
  downloadText(summaryCsv(rows, st.doc, groupBy), `${safeName(st.projectName)}_summary.csv`);
}

export function printSummary(groupBy: string | null = 'c:category') {
  const st = getState();
  openReport(summaryReportHtml(st.projectName, buildRows(st.doc), st.doc, groupBy));
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loaded = useStore((s) => s.loaded);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const hasSel = useStore((s) => s.selection.length > 0);
  const projectName = useStore((s) => s.projectName);
  const lastSaved = useStore((s) => s.lastSaved);
  const ui = useStore((s) => s.ui);
  const prefs = useStore((s) => s.prefs);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const st = getState;
  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'Open PDF…', shortcut: 'Ctrl+O', onClick: cmdOpenPdf },
      { label: 'Add PDF to Set…', onClick: cmdAddPdf, disabled: !loaded },
      { label: 'Open Sample Drawing Set', onClick: cmdOpenSample },
      { sep: true },
      { label: 'Open Project…', onClick: cmdOpenProject },
      { label: 'Save Project As…', shortcut: 'Ctrl+S', onClick: cmdSaveProject, disabled: !loaded },
      { sep: true },
      {
        label: 'Export',
        disabled: !loaded,
        children: [
          { label: 'Flattened PDF with Markups…', onClick: exportPdf },
          { label: 'Markups List (CSV)', onClick: exportMarkupsCsv },
          { label: 'Takeoff Summary (CSV)', onClick: () => exportSummaryCsv() },
          { label: 'Takeoff Summary Report (Print / PDF)', onClick: () => printSummary() },
        ],
      },
      { sep: true },
      { label: 'Close Project', onClick: cmdCloseProject, disabled: !loaded },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => st().undo(), disabled: !canUndo },
      { label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => st().redo(), disabled: !canRedo },
      { sep: true },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => st().copySelection(), disabled: !hasSel },
      { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => st().paste(), disabled: !loaded },
      { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => st().duplicateSelection(), disabled: !hasSel },
      { label: 'Delete', shortcut: 'Del', onClick: () => st().deleteMarkups(st().selection), disabled: !hasSel },
      { sep: true },
      {
        label: 'Select All on Sheet',
        shortcut: 'Ctrl+A',
        onClick: () => {
          const s = st();
          s.setSelection(s.doc.markups.filter((m) => m.sheetId === s.currentSheetId).map((m) => m.id));
        },
        disabled: !loaded,
      },
      { label: 'Deselect', shortcut: 'Esc', onClick: () => st().setSelection([]) },
      { sep: true },
      { label: 'Preferences…', onClick: () => st().setDialog({ kind: 'settings' }) },
    ],
    View: [
      { label: 'Fit Page', shortcut: 'Ctrl+0', onClick: () => view('fit'), disabled: !loaded },
      { label: 'Fit Width', shortcut: 'Ctrl+9', onClick: () => view('fitWidth'), disabled: !loaded },
      { label: 'Actual Size', onClick: () => view('actual'), disabled: !loaded },
      { label: 'Zoom In', shortcut: 'Ctrl+=', onClick: () => view('zoomBy', 1.25), disabled: !loaded },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', onClick: () => view('zoomBy', 0.8), disabled: !loaded },
      { sep: true },
      { label: 'Sheets Panel', checked: ui.leftPanel === 'sheets', onClick: () => st().setUI({ leftPanel: ui.leftPanel === 'sheets' ? null : 'sheets' }) },
      { label: 'Tool Chest', checked: ui.rightPanel === 'toolchest', onClick: () => st().setUI({ rightPanel: ui.rightPanel === 'toolchest' ? null : 'toolchest' }) },
      { label: 'Properties', checked: ui.rightPanel === 'properties', onClick: () => st().setUI({ rightPanel: ui.rightPanel === 'properties' ? null : 'properties' }) },
      { label: 'Measurements', checked: ui.rightPanel === 'measurements', onClick: () => st().setUI({ rightPanel: ui.rightPanel === 'measurements' ? null : 'measurements' }) },
      { label: 'Layers', checked: ui.rightPanel === 'layers', onClick: () => st().setUI({ rightPanel: ui.rightPanel === 'layers' ? null : 'layers' }) },
      { label: 'Markups List', checked: ui.bottomPanel === 'markups', onClick: () => st().setUI({ bottomPanel: ui.bottomPanel === 'markups' ? null : 'markups' }) },
      { label: 'Takeoff Summary', checked: ui.bottomPanel === 'summary', onClick: () => st().setUI({ bottomPanel: ui.bottomPanel === 'summary' ? null : 'summary' }) },
      { sep: true },
      { label: 'Measurement Labels on Drawing', checked: prefs.showLabels, onClick: () => st().setPrefs({ showLabels: !prefs.showLabels }) },
      { label: ui.theme === 'dark' ? 'Light Theme' : 'Dark Theme', onClick: () => st().setUI({ theme: ui.theme === 'dark' ? 'light' : 'dark' }) },
    ],
    Document: [
      { label: 'Page Labels…', onClick: () => st().setDialog({ kind: 'pageLabels' }), disabled: !loaded },
      { label: 'Next Sheet', shortcut: 'PgDn', onClick: () => st().gotoSheetOffset(1), disabled: !loaded },
      { label: 'Previous Sheet', shortcut: 'PgUp', onClick: () => st().gotoSheetOffset(-1), disabled: !loaded },
      { sep: true },
      { label: 'Add PDF to Set…', onClick: cmdAddPdf, disabled: !loaded },
    ],
    Measure: [
      { label: 'Calibrate…', shortcut: 'Shift+Alt+K', onClick: () => st().setTool({ kind: 'calibrate' }), disabled: !loaded },
      { label: 'Set Scale…', onClick: () => st().currentSheetId && st().setDialog({ kind: 'scale', sheetId: st().currentSheetId! }), disabled: !loaded },
      { label: 'Add Viewport', onClick: () => st().setTool({ kind: 'viewport' }), disabled: !loaded },
      { sep: true },
      ...MEASURE_TYPES.map<MenuItem>((t) => ({
        label: TYPE_INFO[t].label,
        shortcut: TYPE_INFO[t].shortcut,
        onClick: () => st().setTool({ kind: 'markup', type: t }),
        disabled: !loaded,
      })),
      { sep: true },
      { label: 'Measurement Settings', onClick: () => st().setUI({ rightPanel: 'measurements' }) },
    ],
    Tools: [
      {
        label: 'Markup',
        disabled: !loaded,
        children: MARKUP_TYPES.map((t) => ({ label: TYPE_INFO[t].label, shortcut: TYPE_INFO[t].shortcut, onClick: () => st().setTool({ kind: 'markup', type: t }) })),
      },
      { label: 'Select', shortcut: 'V', onClick: () => st().setTool({ kind: 'select' }) },
      { label: 'Pan', shortcut: 'Space', onClick: () => st().setTool({ kind: 'pan' }) },
      { label: 'Zoom Rectangle', shortcut: 'Z', onClick: () => st().setTool({ kind: 'zoomrect' }) },
      { sep: true },
      { label: 'Manage Columns…', onClick: () => st().setDialog({ kind: 'columns' }) },
      { label: 'Tool Chest', onClick: () => st().setUI({ rightPanel: 'toolchest' }) },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', onClick: () => st().setDialog({ kind: 'shortcuts' }) },
      { label: 'About Takeoff Studio', onClick: () => st().setDialog({ kind: 'about' }) },
    ],
  };

  return (
    <div className="menubar" ref={ref}>
      <div className="brand">
        <span className="brand-mark">◭</span>
        Takeoff Studio
      </div>
      {Object.entries(menus).map(([name, items]) => (
        <div className="menu-root" key={name}>
          <button
            className={`menu-btn${open === name ? ' open' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setOpen(open === name ? null : name);
            }}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <div className="dropdown">
              <MenuList items={items} onClose={() => setOpen(null)} />
            </div>
          )}
        </div>
      ))}
      <div className="spacer" />
      {loaded && (
        <>
          <span className="project-name" title={projectName}>
            {projectName}
          </span>
          <span className="save-state">{lastSaved ? `Autosaved ${new Date(lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
        </>
      )}
    </div>
  );
}
