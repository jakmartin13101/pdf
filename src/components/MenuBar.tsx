import { useEffect, useRef, useState } from 'react';
import { MenuList, type MenuItem } from './ContextMenu';
import { getState, useStore, PANEL_IDS, PANEL_TITLES, type LayoutState, type PanelId } from '../store/store';
import { dockMenuItems } from './dock/PanelHeader';
import { FULL_NAME, ICON_URL, PRODUCT_NAME, SUITE_NAME } from '../brand';
import { cmdAddPdf, cmdCloseProject, cmdOpenExample, cmdOpenPdf, cmdOpenProject, cmdOpenSample, cmdSaveProject, view } from '../store/commands';
import { csvBlob, exportFlattenedPdf, markupsCsv, openReport, summaryCsv, summaryReportHtml } from '../core/export';
import { buildRows } from '../core/columns';
import { fileBytes, safeName } from '../store/project';
import { offerFile } from '../store/files';
import { MEASURE_TYPES, MARKUP_TYPES, TYPE_INFO } from '../core/markupTypes';

function panelOpen(layout: LayoutState, id: PanelId) {
  const p = layout.panels[id];
  return p.dock === 'float' ? p.open : layout.active[p.dock] === id;
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

export function exportMarkupsCsv() {
  const st = getState();
  const rows = buildRows(st.doc);
  void offerFile(csvBlob(markupsCsv(rows, st.list.columns, st.doc)), `${safeName(st.projectName)}_markups.csv`, 'Markups list');
}

export function exportSummaryCsv(groupBy: string | null = 'c:category') {
  const st = getState();
  const rows = buildRows(st.doc);
  void offerFile(csvBlob(summaryCsv(rows, st.doc, groupBy)), `${safeName(st.projectName)}_summary.csv`, 'Takeoff summary');
}

export function printSummary(groupBy: string | null = 'c:category') {
  const st = getState();
  const html = summaryReportHtml(st.projectName, buildRows(st.doc), st.doc, groupBy);
  // Pop-ups are often blocked (always inside a published artifact): offer the report as a file instead.
  if (!openReport(html)) void offerFile(new Blob([html], { type: 'text/html' }), `${safeName(st.projectName)}_summary_report.html`, 'Summary report');
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
  const layout = useStore((s) => s.layout);
  const paneLayout = useStore((s) => s.paneLayout);
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
      { label: 'Open Example Takeoff', onClick: cmdOpenExample },
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
      ...PANEL_IDS.map<MenuItem>((id) => ({ label: PANEL_TITLES[id], checked: panelOpen(layout, id), onClick: () => st().togglePanel(id) })),
      { sep: true },
      { label: 'Measurement Labels on Drawing', checked: prefs.showLabels, onClick: () => st().setPrefs({ showLabels: !prefs.showLabels }) },
      {
        label: 'Theme',
        children: (['system', 'light', 'dark'] as const).map((t) => ({
          label: t === 'system' ? 'Match System' : t === 'light' ? 'Light' : 'Dark',
          checked: ui.theme === t,
          onClick: () => st().setUI({ theme: t }),
        })),
      },
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
      { label: 'Measurement Settings', onClick: () => st().showPanel('measurements') },
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
      { label: 'Tool Chest', onClick: () => st().showPanel('toolchest') },
      { label: 'New Steel Shape / Size Tool…', onClick: () => st().setDialog({ kind: 'shapeTool' }) },
    ],
    Window: [
      { label: 'Single View', checked: paneLayout === 'single', disabled: !loaded, onClick: () => st().setPaneLayout('single') },
      { label: 'Split Vertical', checked: paneLayout === 'vertical', disabled: !loaded, onClick: () => st().setPaneLayout('vertical') },
      { label: 'Split Horizontal', checked: paneLayout === 'horizontal', disabled: !loaded, onClick: () => st().setPaneLayout('horizontal') },
      { label: 'Split Four Ways', checked: paneLayout === 'grid', disabled: !loaded, onClick: () => st().setPaneLayout('grid') },
      { sep: true },
      {
        label: 'Panel Position',
        children: PANEL_IDS.map<MenuItem>((id) => ({ label: PANEL_TITLES[id], children: dockMenuItems(id).filter((i) => !i.sep && !/Workspace|Close|Collapse/.test(i.label ?? '')) })),
      },
      { label: 'Toolbar Position', children: dockMenuItems('toolbar').filter((i) => !i.sep && !/Workspace/.test(i.label ?? '')) },
      { label: 'Lock Workspace Layout', checked: layout.locked, onClick: () => st().setLayoutLocked(!layout.locked) },
      { label: 'Reset Workspace Layout', onClick: () => st().resetLayout() },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', onClick: () => st().setDialog({ kind: 'shortcuts' }) },
      { label: 'Terms of Service', onClick: () => st().setDialog({ kind: 'terms' }) },
      { label: `About ${FULL_NAME}`, onClick: () => st().setDialog({ kind: 'about' }) },
    ],
  };

  return (
    <div className="menubar" ref={ref}>
      <div className="brand">
        <img className="brand-logo" src={ICON_URL} alt="" />
        <span className="brand-name">
          <span className="brand-suite">{SUITE_NAME}</span> {PRODUCT_NAME}
        </span>
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
