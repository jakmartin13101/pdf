import { useEffect, useRef, useState } from 'react';
import { TIER_NAMES, accessName, hasFeature } from '../core/license';
import { MenuList, type MenuItem } from './ContextMenu';
import { getState, isDirty, listStyleOf, useStore, PANEL_IDS, PANEL_TITLES, type LayoutState, type PanelId, useAccess } from '../store/store';
import { dockMenuItems } from './dock/PanelHeader';
import { useShortcuts } from './useShortcuts';
import { FULL_NAME, ICON_URL, PRODUCT_NAME, SUITE_NAME } from '../brand';
import { cmdCloseAll, cmdCloseDocument, cmdLabelsFromBox, cmdSplitAtMax, cmdToggleCrosshair, cmdOpenExample, cmdOpenPdf, cmdOpenSample, cmdSave, cmdSaveAll, cmdSaveAs, exportPdf, view } from '../store/commands';
import { tabMenuItems } from './dock/Panes';
import { csvBlob, markupsCsv, openReport, summaryCsv, summaryReportHtml } from '../core/export';
import { buildTakeoffRows } from '../core/details';
import { safeName } from '../store/project';
import { offerFile } from '../store/files';
import { MEASURE_TYPES, MARKUP_TYPES, TYPE_INFO } from '../core/markupTypes';
import { isPanelOpen } from '../store/dockLayout';

const panelOpen = (layout: LayoutState, id: PanelId) => isPanelOpen(layout, id);

export { exportPdf };

export function exportMarkupsCsv() {
  const st = getState();
  const rows = buildTakeoffRows(st.doc, st.list.showDetails);
  void offerFile(csvBlob(markupsCsv(rows, listStyleOf(st).columns, st.doc)), `${safeName(st.projectName)}_markups.csv`, 'Markups list');
}

export function exportSummaryCsv(groupBy: string | null = 'c:category') {
  const st = getState();
  const rows = buildTakeoffRows(st.doc, st.list.showDetails);
  void offerFile(csvBlob(summaryCsv(rows, st.doc, groupBy)), `${safeName(st.projectName)}_summary.csv`, 'Takeoff summary');
}

export function printSummary(groupBy: string | null = 'c:category') {
  const st = getState();
  const html = summaryReportHtml(st.projectName, buildTakeoffRows(st.doc, st.list.showDetails), st.doc, groupBy);
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
  const attachedCount = useStore((s) => s.panes.filter((p) => !p.detached).length);
  const license = useStore((s) => s.license);
  const access = useAccess();
  const pro = hasFeature(access, 'combine');
  const panes = useStore((s) => s.panes);
  const activePaneId = useStore((s) => s.activePaneId);
  const prefs = useStore((s) => s.prefs);
  const sc = useShortcuts();
  const anyDirty = useStore((s) => s.docs.some((d) => isDirty(s, d.id)));

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
  // Window menu: the active pane's document tabs.
  const docTabItems = (): MenuItem[] => {
    const pane = panes.find((p) => p.id === activePaneId);
    const fileId = st().doc.sheets.find((x) => x.id === pane?.sheetId)?.fileId;
    const many = (pane?.tabs.length ?? 0) > 1;
    return [
      { label: 'Next Document Tab', shortcut: sc('tab.next'), disabled: !loaded || !many, onClick: () => st().cycleTab(1) },
      { label: 'Previous Document Tab', shortcut: sc('tab.prev'), disabled: !loaded || !many, onClick: () => st().cycleTab(-1) },
      { label: 'Document Tab', disabled: !loaded || !pane || !fileId, children: pane && fileId ? tabMenuItems(pane.id, fileId, sc) : [] },
    ];
  };
  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'Open PDF…', shortcut: sc('file.openPdf'), onClick: cmdOpenPdf },
      { label: 'Open Sample Drawing Set', onClick: cmdOpenSample },
      { label: 'Open Example Takeoff', onClick: cmdOpenExample },
      { sep: true },
      { label: 'Save', shortcut: sc('file.save'), onClick: () => void cmdSave(), disabled: !loaded },
      { label: 'Save As…', shortcut: sc('file.saveAs'), onClick: () => void cmdSaveAs(), disabled: !loaded },
      { label: 'Save All', shortcut: sc('file.saveAll'), onClick: () => void cmdSaveAll(), disabled: !loaded || !anyDirty },
      { sep: true },
      {
        label: 'Export',
        disabled: !loaded,
        children: [
          { label: 'Flattened PDF with Markups…', onClick: exportPdf },
          { label: 'Markups List (CSV)', onClick: exportMarkupsCsv },
          { label: 'Takeoff Summary (CSV)', onClick: () => exportSummaryCsv() },
          { label: 'Takeoff Summary Report (Print / PDF)', onClick: () => printSummary() },
          { label: `Combine Report (Stock to Order)…${pro ? '' : ' (Pro)'}`, onClick: () => st().setDialog({ kind: 'combine' }) },
        ],
      },
      { sep: true },
      { label: 'Close', shortcut: sc('file.close') ?? sc('tab.close'), onClick: () => cmdCloseDocument(), disabled: !loaded },
      { label: 'Close All', onClick: cmdCloseAll, disabled: !loaded },
    ],
    Edit: [
      { label: 'Undo', shortcut: sc('edit.undo'), onClick: () => st().undo(), disabled: !canUndo },
      { label: 'Redo', shortcut: sc('edit.redo'), onClick: () => st().redo(), disabled: !canRedo },
      { sep: true },
      { label: 'Copy', shortcut: sc('edit.copy'), onClick: () => st().copySelection(), disabled: !hasSel },
      { label: 'Paste', shortcut: sc('edit.paste'), onClick: () => st().paste(), disabled: !loaded },
      { label: 'Duplicate', shortcut: sc('edit.duplicate'), onClick: () => st().duplicateSelection(), disabled: !hasSel },
      { label: 'Delete', shortcut: sc('edit.delete'), onClick: () => st().deleteMarkups(st().selection), disabled: !hasSel },
      { sep: true },
      {
        label: 'Select All on Sheet',
        shortcut: sc('edit.selectAll'),
        onClick: () => {
          const s = st();
          s.setSelection(s.doc.markups.filter((m) => m.sheetId === s.currentSheetId).map((m) => m.id));
        },
        disabled: !loaded,
      },
      { label: 'Deselect', shortcut: 'Esc', onClick: () => st().setSelection([]) },
      { sep: true },
      { label: 'Flatten Markups…', shortcut: sc('edit.flatten'), onClick: () => st().setDialog({ kind: 'flatten' }), disabled: !loaded || !st().doc.markups.length },
      { label: 'Split at Maximum Length', onClick: () => cmdSplitAtMax(), disabled: !loaded || !st().selection.length },
      { sep: true },
      { label: 'Settings & Preferences…', shortcut: sc('app.settings'), onClick: () => st().setDialog({ kind: 'settings' }) },
    ],
    View: [
      { label: 'Fit Page', shortcut: sc('view.fit'), onClick: () => view('fit'), disabled: !loaded },
      { label: 'Fit Width', shortcut: sc('view.fitWidth'), onClick: () => view('fitWidth'), disabled: !loaded },
      { label: 'Actual Size', onClick: () => view('actual'), disabled: !loaded },
      { label: 'Zoom In', shortcut: sc('view.zoomIn'), onClick: () => view('zoomBy', 1.25), disabled: !loaded },
      { label: 'Zoom Out', shortcut: sc('view.zoomOut'), onClick: () => view('zoomBy', 0.8), disabled: !loaded },
      { sep: true },
      ...PANEL_IDS.map<MenuItem>((id) => ({ label: PANEL_TITLES[id], checked: panelOpen(layout, id), onClick: () => st().togglePanel(id) })),
      { sep: true },
      { label: 'Measurement Labels on Drawing', checked: prefs.showLabels, onClick: () => st().setPrefs({ showLabels: !prefs.showLabels }) },
      { label: 'Standard Detail Material on Drawing', checked: prefs.detailMarks.show, onClick: () => st().setPrefs({ detailMarks: { ...prefs.detailMarks, show: !prefs.detailMarks.show } }) },
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
      { label: 'Page Labels…', shortcut: sc('doc.pageLabels'), onClick: () => st().setDialog({ kind: 'pageLabels' }), disabled: !loaded },
      { label: 'Page Labels from a Box…', shortcut: sc('doc.labelsFromBox'), onClick: cmdLabelsFromBox, disabled: !loaded },
      { label: 'Compare / Overlay Sheets…', onClick: () => st().setDialog({ kind: 'compare' }), disabled: !loaded || st().doc.sheets.length < 2 },
      { label: 'Next Sheet', shortcut: sc('sheet.next'), onClick: () => st().gotoSheetOffset(1), disabled: !loaded },
      { label: 'Previous Sheet', shortcut: sc('sheet.prev'), onClick: () => st().gotoSheetOffset(-1), disabled: !loaded },
    ],
    Measure: [
      { label: 'Calibrate…', shortcut: sc('tool.calibrate'), onClick: () => st().setTool({ kind: 'calibrate' }), disabled: !loaded },
      { label: 'Set Scale…', onClick: () => st().currentSheetId && st().setDialog({ kind: 'scale', sheetId: st().currentSheetId! }), disabled: !loaded },
      { label: 'Add Viewport', onClick: () => st().setTool({ kind: 'viewport' }), disabled: !loaded },
      { sep: true },
      ...MEASURE_TYPES.map<MenuItem>((t) => ({
        label: TYPE_INFO[t].label,
        shortcut: sc(`tool.${t}`),
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
        children: MARKUP_TYPES.map((t) => ({ label: TYPE_INFO[t].label, shortcut: sc(`tool.${t}`), onClick: () => st().setTool({ kind: 'markup', type: t }) })),
      },
      { label: 'Select', shortcut: sc('tool.select'), onClick: () => st().setTool({ kind: 'select' }) },
      { label: 'Pan', shortcut: 'Space', onClick: () => st().setTool({ kind: 'pan' }) },
      { label: 'Zoom Rectangle', shortcut: sc('tool.zoomrect'), onClick: () => st().setTool({ kind: 'zoomrect' }) },
      { sep: true },
      { label: 'Manage Columns…', onClick: () => st().setDialog({ kind: 'columns' }) },
      { label: 'Standard Details…', onClick: () => st().setDialog({ kind: 'details' }) },
      { label: `Combine Report…${pro ? '' : ' (Pro)'}`, shortcut: sc('report.combine'), disabled: !loaded, onClick: () => st().setDialog({ kind: 'combine' }) },
      { label: `Automatic Takeoff (Beams & Tubing)…${pro ? '' : ' (Pro)'}`, disabled: !loaded, onClick: () => st().showPanel('autotakeoff') },
      { label: 'Tool Chest', onClick: () => st().showPanel('toolchest') },
      { label: 'New Steel Shape / Size Tool…', onClick: () => st().setDialog({ kind: 'shapeTool' }) },
    ],
    Settings: [
      { label: 'Settings & Preferences…', shortcut: sc('app.settings'), onClick: () => st().setDialog({ kind: 'settings', tab: 'general' }) },
      { label: 'Units & Totals…', onClick: () => st().setDialog({ kind: 'settings', tab: 'units' }) },
      { label: 'Drawing & Editing…', onClick: () => st().setDialog({ kind: 'settings', tab: 'editing' }) },
      { label: 'Length Measurements…', onClick: () => st().setDialog({ kind: 'settings', tab: 'lengths' }) },
      { label: 'Detail Marks…', onClick: () => st().setDialog({ kind: 'settings', tab: 'details' }) },
      { label: 'Auto Takeoff Line Styles…', onClick: () => st().setDialog({ kind: 'settings', tab: 'auto' }) },
      { label: 'Workspace…', onClick: () => st().setDialog({ kind: 'settings', tab: 'workspace' }) },
      { sep: true },
      { label: 'Snap to Drawing', checked: prefs.snapContent, onClick: () => st().setPrefs({ snapContent: !prefs.snapContent }) },
      { label: 'Snap to Markups', checked: prefs.snapMarkup, onClick: () => st().setPrefs({ snapMarkup: !prefs.snapMarkup }) },
      { label: 'Ortho', checked: prefs.ortho, onClick: () => st().setPrefs({ ortho: !prefs.ortho }) },
      { label: 'Full-Screen Crosshairs', shortcut: sc('view.crosshair'), checked: prefs.crosshair !== 'off', onClick: () => cmdToggleCrosshair() },
      { label: 'Move View at Edge While Drawing', checked: prefs.autoPan, onClick: () => st().setPrefs({ autoPan: !prefs.autoPan }) },
      { label: 'Keep Tool Active (Reuse)', checked: prefs.reuse, onClick: () => st().setPrefs({ reuse: !prefs.reuse }) },
      { label: 'Measurement Labels on Drawing', checked: prefs.showLabels, onClick: () => st().setPrefs({ showLabels: !prefs.showLabels }) },
      { label: 'Standard Detail Material on Drawing', checked: prefs.detailMarks.show, onClick: () => st().setPrefs({ detailMarks: { ...prefs.detailMarks, show: !prefs.detailMarks.show } }) },
      {
        label: 'Theme',
        children: (['system', 'light', 'dark'] as const).map((t) => ({
          label: t === 'system' ? 'Match System' : t === 'light' ? 'Light' : 'Dark',
          checked: ui.theme === t,
          onClick: () => st().setUI({ theme: t }),
        })),
      },
      { sep: true },
      { label: 'Lock Workspace Layout', checked: layout.locked, onClick: () => st().setLayoutLocked(!layout.locked) },
      { label: 'Reset Workspace Layout', onClick: () => st().resetLayout() },
    ],
    Window: [
      ...docTabItems(),
      { sep: true },
      { label: 'Split Vertical', shortcut: sc('view.splitV'), disabled: !loaded, onClick: () => st().splitPane('row') },
      { label: 'Split Horizontal', shortcut: sc('view.splitH'), disabled: !loaded, onClick: () => st().splitPane('col') },
      { label: 'Split Four Ways', shortcut: sc('view.split4'), disabled: !loaded, onClick: () => st().splitPane('grid') },
      { label: 'Single View (Close Other Panes)', shortcut: sc('view.single'), checked: attachedCount === 1, disabled: !loaded || attachedCount === 1, onClick: () => st().singleView() },
      {
        label: 'Detach Active Pane',
        disabled: !loaded || panes.filter((p) => !p.detached).length < 2 || !!panes.find((p) => p.id === activePaneId)?.detached,
        onClick: () => st().detachPane(activePaneId, 'window'),
      },
      {
        label: 'Return Detached Panes to Main Window',
        disabled: !panes.some((p) => p.detached),
        onClick: () => panes.filter((p) => p.detached).forEach((p) => st().attachPane(p.id)),
      },
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
      { label: 'License…', onClick: () => st().setDialog({ kind: 'license' }) },
      { sep: true },
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
      <button
        className={`tier-pill ${access.tier ?? 'none'}${access.trial ? ' trial' : ''}`}
        title={
          license.state === 'valid'
            ? `${PRODUCT_NAME} ${TIER_NAMES[license.info.tier]} – licensed to ${license.info.name}`
            : access.trial
              ? `Basic trial: ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left. Click to enter a license key.`
              : 'No license. Click to enter a license key.'
        }
        onClick={() => st().setDialog({ kind: 'license' })}
        data-testid="license-badge"
      >
        {accessName(access)}
        {access.trial && <span className="trial-days"> · {access.daysLeft}d</span>}
      </button>
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
