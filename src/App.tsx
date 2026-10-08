import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, FolderOpen, Files, FileJson, Layers, Ruler, SlidersHorizontal, Sigma, Table2, Wrench } from 'lucide-react';
import { useStore, getState, currentSheet } from './store/store';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { Viewer } from './components/viewer/Viewer';
import { SheetsPanel } from './components/panels/SheetsPanel';
import { ToolChestPanel } from './components/panels/ToolChestPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { MeasurementsPanel } from './components/panels/MeasurementsPanel';
import { LayersPanel } from './components/panels/LayersPanel';
import { MarkupsList } from './components/bottom/MarkupsList';
import { SummaryPanel } from './components/bottom/SummaryPanel';
import { CalibrateDialog, ScaleDialog, ViewportDialog } from './components/dialogs/ScaleDialogs';
import { PageLabelsDialog } from './components/dialogs/PageLabelsDialog';
import { ColumnsDialog } from './components/dialogs/ColumnsDialog';
import { ToolEditDialog } from './components/dialogs/ToolEditDialog';
import { AboutDialog, ConfirmDialog, SettingsDialog, ShortcutsDialog } from './components/dialogs/MiscDialogs';
import { openPdfFiles, openProjectFile, restoreAutosave, startAutosave } from './store/project';
import { cmdOpenPdf, cmdOpenProject, cmdOpenSample, cmdSaveProject } from './store/commands';
import { sheetDisplayName } from './core/columns';

function Splitter({ dir, onDrag }: { dir: 'v' | 'h'; onDrag: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`splitter-${dir}${dragging ? ' dragging' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        let last = dir === 'v' ? e.clientX : e.clientY;
        setDragging(true);
        const move = (ev: PointerEvent) => {
          const cur = dir === 'v' ? ev.clientX : ev.clientY;
          onDrag(cur - last);
          last = cur;
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function SideTab({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`side-tab${active ? ' active' : ''}`} title={title} onClick={onClick} data-testid={`tab-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {children}
    </button>
  );
}

function StartScreen() {
  return (
    <div className="start">
      <div className="start-card">
        <div>
          <h1>
            <span className="brand-mark" style={{ width: 30, height: 30, fontSize: 17 }}>
              ◭
            </span>
            Takeoff Studio
          </h1>
          <p className="lead">
            Turn construction drawings into an interactive takeoff workspace: label sheets, calibrate scales, measure lengths and areas, count items with standardized tools, and work
            with every quantity in an editable markup database.
          </p>
          <div className="start-actions">
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

function Dialogs() {
  const d = useStore((s) => s.dialog);
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
    case 'toolEdit':
      return <ToolEditDialog setId={d.setId} toolId={d.toolId} fromMarkupId={d.fromMarkupId} />;
    case 'settings':
      return <SettingsDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
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

  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);

  useEffect(() => {
    document.title = sheet ? `${sheetDisplayName(sheet)} · Takeoff Studio` : 'Takeoff Studio';
  }, [sheet]);

  useEffect(() => {
    startAutosave();
    const params = new URLSearchParams(location.search);
    (async () => {
      const restored = await restoreAutosave();
      if (!restored && params.has('sample')) await cmdOpenSample();
      setBooting(false);
    })();
  }, []);

  // Global shortcuts that are not tied to the drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'o') {
        e.preventDefault();
        cmdOpenPdf();
      } else if (e.key === 's') {
        e.preventDefault();
        if (getState().loaded) cmdSaveProject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      const files = [...(e.dataTransfer?.files ?? [])];
      const project = files.find((f) => f.name.endsWith('.json'));
      if (project) void openProjectFile(project);
      else if (files.length) void openPdfFiles(files, getState().loaded && e.shiftKey ? 'append' : getState().loaded ? 'append' : 'new');
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
  const setLeft = (p: typeof ui.leftPanel) => st().setUI({ leftPanel: ui.leftPanel === p ? null : p });
  const setRight = (p: typeof ui.rightPanel) => st().setUI({ rightPanel: ui.rightPanel === p ? null : p });
  const setBottom = (p: typeof ui.bottomPanel) => st().setUI({ bottomPanel: p });

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <DocBar />
      <div className="workspace">
        <div className="side-tabs">
          <SideTab active={ui.leftPanel === 'sheets'} title="Sheets" onClick={() => setLeft('sheets')}>
            <Files size={17} />
          </SideTab>
        </div>
        {ui.leftPanel && loaded && (
          <>
            <div style={{ width: ui.leftWidth, display: 'flex', minWidth: 0 }}>
              <SheetsPanel />
            </div>
            <Splitter dir="v" onDrag={(d) => st().setUI({ leftWidth: Math.max(160, Math.min(520, st().ui.leftWidth + d)) })} />
          </>
        )}
        <div className="center-col" style={{ position: 'relative' }}>
          <Viewer />
          {!loaded && !booting && <StartScreen />}
        </div>
        {ui.rightPanel && (
          <>
            <Splitter dir="v" onDrag={(d) => st().setUI({ rightWidth: Math.max(220, Math.min(620, st().ui.rightWidth - d)) })} />
            <div style={{ width: ui.rightWidth, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {ui.rightPanel === 'toolchest' && <ToolChestPanel />}
              {ui.rightPanel === 'properties' && <PropertiesPanel />}
              {ui.rightPanel === 'measurements' && <MeasurementsPanel />}
              {ui.rightPanel === 'layers' && <LayersPanel />}
            </div>
          </>
        )}
        <div className="side-tabs right">
          <SideTab active={ui.rightPanel === 'toolchest'} title="Tool Chest" onClick={() => setRight('toolchest')}>
            <Wrench size={17} />
          </SideTab>
          <SideTab active={ui.rightPanel === 'properties'} title="Properties" onClick={() => setRight('properties')}>
            <SlidersHorizontal size={17} />
          </SideTab>
          <SideTab active={ui.rightPanel === 'measurements'} title="Measurements" onClick={() => setRight('measurements')}>
            <Ruler size={17} />
          </SideTab>
          <SideTab active={ui.rightPanel === 'layers'} title="Layers" onClick={() => setRight('layers')}>
            <Layers size={17} />
          </SideTab>
        </div>
      </div>
      {loaded ? (
        <div className="bottom" style={{ height: ui.bottomPanel ? ui.bottomHeight : 33 }}>
          {ui.bottomPanel && <Splitter dir="h" onDrag={(d) => st().setUI({ bottomHeight: Math.max(120, Math.min(window.innerHeight - 220, st().ui.bottomHeight - d)) })} />}
          <div className="bottom-tabs">
            <button className={`bottom-tab${ui.bottomPanel === 'markups' ? ' active' : ''}`} onClick={() => setBottom(ui.bottomPanel === 'markups' ? null : 'markups')} data-testid="tab-markups">
              <Table2 size={14} /> Markups List
            </button>
            <button className={`bottom-tab${ui.bottomPanel === 'summary' ? ' active' : ''}`} onClick={() => setBottom(ui.bottomPanel === 'summary' ? null : 'summary')} data-testid="tab-summary">
              <Sigma size={14} /> Takeoff Summary
            </button>
          </div>
          {ui.bottomPanel === 'markups' && <MarkupsList />}
          {ui.bottomPanel === 'summary' && <SummaryPanel />}
        </div>
      ) : (
        <div />
      )}
      <StatusBar />
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
