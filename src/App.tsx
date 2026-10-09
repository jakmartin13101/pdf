import { useEffect, useRef, useState } from 'react';
import { BookOpen, FolderOpen, Files, FileJson, Ruler } from 'lucide-react';
import { useStore, getState, currentSheet } from './store/store';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { DropOverlay, EdgeDock, FloatingPanels, SideDock } from './components/dock/Workspace';
import { DetachedPanes, PaneArea } from './components/dock/Panes';
import { ShapeToolDialog } from './components/dialogs/ShapeToolDialog';
import { CalibrateDialog, ScaleDialog, ViewportDialog } from './components/dialogs/ScaleDialogs';
import { PageLabelsDialog } from './components/dialogs/PageLabelsDialog';
import { ColumnsDialog } from './components/dialogs/ColumnsDialog';
import { ToolEditDialog } from './components/dialogs/ToolEditDialog';
import { AboutDialog, ConfirmDialog, SettingsDialog, ShortcutsDialog } from './components/dialogs/MiscDialogs';
import { TermsDialog } from './components/dialogs/TermsDialog';
import { StandardDetailsDialog } from './components/dialogs/StandardDetailsDialog';
import { openPdfFiles, openProjectFile, restoreAutosave, startAutosave } from './store/project';
import { cmdOpenExample, cmdOpenPdf, cmdOpenProject, cmdOpenSample, handleAppShortcut } from './store/commands';
import { sheetDisplayName } from './core/columns';
import { downloadsCapability } from './core/persistence';
import { FULL_NAME, ICON_URL, PRODUCT_NAME, SUITE_NAME, desktop } from './brand';

function StartScreen() {
  return (
    <div className="start">
      <div className="start-card">
        <div>
          <h1>
            <img className="start-logo" src={ICON_URL} alt="" />
            <span>
              <small className="start-suite">{SUITE_NAME}</small>
              {PRODUCT_NAME}
            </span>
          </h1>
          <p className="lead">
            Turn construction drawings into an interactive takeoff workspace: label sheets, calibrate scales, measure lengths and areas, count items with standardized tools, and work
            with every quantity in an editable markup database.
          </p>
          <div className="start-actions">
            <button className="start-action" onClick={cmdOpenExample} data-testid="open-example">
              <span className="ico">
                <Ruler size={20} />
              </span>
              <span>
                <b>Open Example Takeoff</b>
                <small>The sample set calibrated, with steel, deck and concrete already taken off</small>
              </span>
            </button>
            <button className="start-action" onClick={cmdOpenSample} data-testid="open-sample">
              <span className="ico">
                <BookOpen size={20} />
              </span>
              <span>
                <b>Open Sample Drawing Set</b>
                <small>7-sheet warehouse set: foundation, framing, details at mixed scales, arch, MEP</small>
              </span>
            </button>
            <button className="start-action" onClick={cmdOpenPdf}>
              <span className="ico">
                <FolderOpen size={20} />
              </span>
              <span>
                <b>Open PDF Drawings…</b>
                <small>Choose one or more PDFs (or drop them anywhere) to build a sheet set</small>
              </span>
            </button>
            <button className="start-action" onClick={cmdOpenProject}>
              <span className="ico">
                <FileJson size={20} />
              </span>
              <span>
                <b>Open Project…</b>
                <small>A saved .takeoff.json project with drawings and takeoff data</small>
              </span>
            </button>
          </div>
        </div>
        <div className="workflow">
          <h3>Workflow</h3>
          <ol>
            <li>
              <span>
                Import drawings<small>Multiple PDFs become one navigable sheet set</small>
              </span>
            </li>
            <li>
              <span>
                Organize & label sheets<small>S1.01 – Foundation Plan… read from title blocks</small>
              </span>
            </li>
            <li>
              <span>
                Calibrate scale<small>Per sheet, plus viewports for details</small>
              </span>
            </li>
            <li>
              <span>
                Create standardized tools<small>Tool Chest: W-shapes, HSS, deck, counts…</small>
              </span>
            </li>
            <li>
              <span>
                Measure, count & mark up<small>Length, polylength, area, volume, count</small>
              </span>
            </li>
            <li>
              <span>
                Review the Markups List<small>Edit, filter, sort and group the data</small>
              </span>
            </li>
            <li>
              <span>
                Summarize & export<small>Quantities, weights, CSV, report, PDF</small>
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Opens dropped or launched files: a project file replaces the project, PDFs are added to it. */
async function openGivenFiles(files: File[]) {
  const project = files.find((f) => f.name.toLowerCase().endsWith('.json'));
  if (project) await openProjectFile(project);
  else if (files.length) await openPdfFiles(files, getState().loaded ? 'append' : 'new');
}

function Dialogs() {
  const d = useStore((s) => s.dialog);
  // Dialogs open in the main window: bring it forward when a detached pane had the focus.
  useEffect(() => {
    if (d && !document.hasFocus()) window.focus();
  }, [d]);
  if (!d) return null;
  switch (d.kind) {
    case 'calibrate':
      return <CalibrateDialog sheetId={d.sheetId} pts={d.pts} />;
    case 'scale':
      return <ScaleDialog sheetId={d.sheetId} />;
    case 'viewport':
      return <ViewportDialog sheetId={d.sheetId} rect={d.rect} viewportId={d.viewportId} />;
    case 'pageLabels':
      return <PageLabelsDialog region={d.region} />;
    case 'columns':
      return <ColumnsDialog />;
    case 'details':
      return <StandardDetailsDialog detailId={d.detailId} newForMarkupId={d.newForMarkupId} />;
    case 'shapeTool':
      return <ShapeToolDialog setId={d.setId} toolId={d.toolId} />;
    case 'toolEdit':
      return <ToolEditDialog setId={d.setId} toolId={d.toolId} fromMarkupId={d.fromMarkupId} />;
    case 'settings':
      return <SettingsDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'terms':
      return <TermsDialog />;
    case 'about':
      return <AboutDialog />;
    case 'confirm':
      return <ConfirmDialog title={d.title} message={d.message} onConfirm={d.onConfirm} />;
  }
}

function DocBar() {
  const sheet = useStore(currentSheet);
  const projectName = useStore((s) => s.projectName);
  const markupCount = useStore((s) => s.doc.markups.filter((m) => m.sheetId === s.currentSheetId).length);
  if (!sheet) return <div className="docbar" />;
  const scaleOk = !!sheet.scale;
  return (
    <div className="docbar">
      <div className="doc-tab" title={projectName}>
        <Files size={13} />
        <span>{sheet.number}</span>
        <span className="sheet-sub">{sheet.title}</span>
      </div>
      <span className="hint">{markupCount} markup{markupCount === 1 ? '' : 's'} on this sheet</span>
      <div className="spacer" />
      {sheet.viewports.length > 0 && <span className="hint">{sheet.viewports.length} viewport{sheet.viewports.length === 1 ? '' : 's'}</span>}
      <button
        className={`scale-chip ${scaleOk ? 'ok' : 'warn'}`}
        onClick={() => getState().setDialog({ kind: 'scale', sheetId: sheet.id })}
        title={scaleOk ? `Sheet scale – click to change` : 'This sheet has no scale. Click to set one, or use Calibrate.'}
        data-testid="scale-chip"
      >
        <Ruler size={12} />
        {scaleOk ? sheet.scale!.label : 'Scale not set – calibrate'}
      </button>
    </div>
  );
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const ui = useStore((s) => s.ui);
  const busy = useStore((s) => s.busy);
  const toasts = useStore((s) => s.toasts);
  const sheet = useStore(currentSheet);
  const [booting, setBooting] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // "system" leaves the root alone so the viewer's own light/dark setting (or the OS) decides.
  const appliedTheme = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === 'system') {
      if (appliedTheme.current) delete root.dataset.theme;
      appliedTheme.current = false;
    } else {
      root.dataset.theme = ui.theme;
      appliedTheme.current = true;
    }
  }, [ui.theme]);

  useEffect(() => {
    document.title = sheet ? `${sheetDisplayName(sheet)} · ${FULL_NAME}` : FULL_NAME;
  }, [sheet]);

  useEffect(() => {
    void downloadsCapability();
    startAutosave();
    const params = new URLSearchParams(location.search);
    (async () => {
      const restored = await restoreAutosave();
      const launchFiles = desktop ? await desktop.takeOpenFiles().catch(() => []) : [];
      if (launchFiles.length) await openGivenFiles(launchFiles.map((f) => new File([f.data], f.name)));
      // The published build opens straight into a working example; locally the start screen shows.
      else if (!restored && (import.meta.env.VITE_OPEN_EXAMPLE === '1' || location.hash === '#example')) await cmdOpenExample();
      else if (!restored && params.has('sample')) await cmdOpenSample();
      setBooting(false);
    })();
    // Desktop: files opened from Explorer while the app is already running.
    return desktop?.onOpenFiles((files) => void openGivenFiles(files.map((f) => new File([f.data], f.name))));
  }, []);

  // Global shortcuts that are not tied to the drawing (detached panes bind the same handler).
  useEffect(() => {
    window.addEventListener('keydown', handleAppShortcut);
    return () => window.removeEventListener('keydown', handleAppShortcut);
  }, []);

  // Drag & drop PDFs / project files anywhere.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current++;
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragOver(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      void openGivenFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const st = getState;
  const layout = useStore((s) => s.layout);
  const tb = layout.toolbar.dock;

  return (
    <div className={`app${layout.locked ? ' layout-locked' : ''}`}>
      <MenuBar />
      {tb === 'top' && <Toolbar placement="top" />}
      <DocBar />
      <div className="main-area">
        {loaded && <EdgeDock side="top" />}
        <div className="workspace">
          {tb === 'left' && <Toolbar placement="left" />}
          <SideDock side="left" />
          <div className="center-col" style={{ position: 'relative' }}>
            <PaneArea />
            {!loaded && !booting && <StartScreen />}
          </div>
          <SideDock side="right" />
          {tb === 'right' && <Toolbar placement="right" />}
        </div>
        {loaded && <EdgeDock side="bottom" />}
      </div>
      <StatusBar />
      <FloatingPanels />
      <DetachedPanes />
      {tb === 'float' && <Toolbar placement="float" />}
      <DropOverlay />
      <Dialogs />
      {dragOver && <div className="drop-hint">Drop PDF drawings to {loaded ? 'add them to the set' : 'open them'}</div>}
      {busy && (
        <div className="busy">
          <div className="busy-card">
            <span className="spinner" /> {busy}
          </div>
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => st().dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
