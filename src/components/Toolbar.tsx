import { DraftingCompass, FileDown, FolderOpen, Frame, GitCompareArrows, GripVertical, Hand, Maximize, MousePointer2, Redo2, Save, Sigma, Table2, Undo2, Wand2, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import { isPanelOpen } from '../store/dockLayout';
import { useRef } from 'react';
import { beginDockDrag } from './dock/dragging';
import { DockMenuButton } from './dock/PanelHeader';
import type { MarkupType } from '../types';
import { useStore, getState, type ToolMode, type PanelId, featureOn } from '../store/store';
import { TYPE_ICON } from './icons';
import { TYPE_INFO } from '../core/markupTypes';
import { cmdOpenPdf, cmdSave, view } from '../store/commands';
import { exportPdf } from './MenuBar';
import { useShortcuts } from './useShortcuts';

const MARKUP_GROUP: MarkupType[] = ['text', 'callout', 'cloud', 'highlight', 'pen', 'line', 'arrow', 'polyline', 'rectangle', 'ellipse', 'polygon', 'stamp'];
const MEASURE_GROUP: MarkupType[] = ['length', 'polylength', 'area', 'perimeter', 'volume', 'count', 'angle'];

function sameTool(a: ToolMode, b: ToolMode) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'markup' && b.kind === 'markup') return a.type === b.type && !a.chestToolId;
  return true;
}

function TB({ icon: Icon, label, onClick, active, disabled, title, small, locked }: {
  icon: LucideIcon;
  label?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  small?: boolean;
  /** A Pro feature without Pro: marked, and clicking it shows the license window. */
  locked?: boolean;
}) {
  return (
    <button
      className={`tb-btn${active ? ' active' : ''}${small ? ' small' : ''}${locked ? ' locked' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={locked ? `${title ?? label} – a Pro feature` : title ?? label}
      data-testid={`tb-${(label ?? title ?? '').replace(/\s*\(.*$/, '').toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon size={19} strokeWidth={1.7} />
      {label && <span>{label}</span>}
      {locked && <i className="tb-pro">PRO</i>}
    </button>
  );
}

/** True when a panel is currently showing (open in its dock or as an open floating window). */
export function usePanelOpen(id: PanelId) {
  return useStore((s) => isPanelOpen(s.layout, id));
}

export function Toolbar({ placement }: { placement: 'top' | 'left' | 'right' | 'float' }) {
  const tool = useStore((s) => s.tool);
  const loaded = useStore((s) => s.loaded);
  const autoPro = useStore((s) => featureOn(s, 'autoTakeoff'));
  const sc = useShortcuts();
  /** A tooltip with the command's (possibly customized) keys. */
  const keyed = (label: string, id: string) => (sc(id) ? `${label} (${sc(id)})` : label);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const markupsOpen = usePanelOpen('markups');
  const summaryOpen = usePanelOpen('summary');
  const compareOpen = usePanelOpen('compare');
  const autoOpen = usePanelOpen('autotakeoff');
  const locked = useStore((s) => s.layout.locked);
  const pos = useStore((s) => s.layout.toolbar);
  const ref = useRef<HTMLDivElement>(null);
  const st = getState;
  const set = (t: ToolMode) => st().setTool(sameTool(st().tool, t) && t.kind !== 'select' ? { kind: 'select' } : t);
  const vertical = placement === 'left' || placement === 'right';

  return (
    <div
      ref={ref}
      className={`toolbar${vertical ? ' vertical' : ''}${placement === 'float' ? ' floating' : ''}`}
      style={placement === 'float' ? { left: Math.min(pos.x, window.innerWidth - 200), top: Math.min(pos.y, window.innerHeight - 80) } : undefined}
      data-testid="toolbar"
    >
      <div
        className={`tb-grip${locked ? ' locked' : ''}`}
        title={locked ? 'Workspace layout is locked' : 'Drag to dock the toolbar top, left or right, or to float it'}
        onPointerDown={(e) => {
          const r = ref.current?.getBoundingClientRect();
          beginDockDrag(e, 'toolbar', { w: r?.width ?? 600, h: r?.height ?? 60 }, r ? { x: r.left, y: r.top } : undefined);
        }}
        data-testid="toolbar-grip"
      >
        <GripVertical size={14} />
        <DockMenuButton id="toolbar" />
      </div>
      <div className="tb-group">
        <div className="tb-row">
          <TB icon={FolderOpen} label="Open" onClick={cmdOpenPdf} title={keyed('Open PDF drawings (each in its own tab)', 'file.openPdf')} />
          <TB icon={Save} label="Save" onClick={() => void cmdSave()} disabled={!loaded} title={keyed('Save the takeoff into the PDF', 'file.save')} />
          <TB icon={FileDown} label="Export" onClick={exportPdf} disabled={!loaded} title="Export flattened PDF with markups" />
          <TB icon={Undo2} label="Undo" onClick={() => st().undo()} disabled={!canUndo} title={keyed('Undo', 'edit.undo')} />
          <TB icon={Redo2} label="Redo" onClick={() => st().redo()} disabled={!canRedo} title={keyed('Redo', 'edit.redo')} />
        </div>
        <div className="tb-caption">File</div>
      </div>
      <div className="tb-group">
        <div className="tb-row">
          <TB icon={MousePointer2} label="Select" active={tool.kind === 'select'} onClick={() => set({ kind: 'select' })} title={keyed('Select', 'tool.select')} />
          <TB icon={Hand} label="Pan" active={tool.kind === 'pan'} onClick={() => set({ kind: 'pan' })} title="Pan (hold Space)" />
          <TB icon={ZoomIn} label="Zoom" active={tool.kind === 'zoomrect'} onClick={() => set({ kind: 'zoomrect' })} disabled={!loaded} title={keyed('Zoom rectangle', 'tool.zoomrect')} />
          <TB icon={ZoomOut} small onClick={() => view('zoomBy', 0.8)} disabled={!loaded} title={keyed('Zoom out', 'view.zoomOut')} />
          <TB icon={Maximize} small onClick={() => view('fit')} disabled={!loaded} title={keyed('Fit page', 'view.fit')} />
        </div>
        <div className="tb-caption">Navigate</div>
      </div>
      <div className="tb-group">
        <div className="tb-row">
          {MARKUP_GROUP.map((t) => (
            <TB
              key={t}
              icon={TYPE_ICON[t]}
              title={`${TYPE_INFO[t].label}${sc(`tool.${t}`) ? ` (${sc(`tool.${t}`)})` : ''}`}
              label={t === 'text' || t === 'callout' || t === 'cloud' || t === 'highlight' ? TYPE_INFO[t].label.replace(' Box', '') : undefined}
              small={!(t === 'text' || t === 'callout' || t === 'cloud' || t === 'highlight')}
              active={tool.kind === 'markup' && tool.type === t && !tool.chestToolId}
              disabled={!loaded}
              onClick={() => set({ kind: 'markup', type: t })}
            />
          ))}
        </div>
        <div className="tb-caption">Markup</div>
      </div>
      <div className="tb-group">
        <div className="tb-row">
          <TB icon={DraftingCompass} label="Calibrate" active={tool.kind === 'calibrate'} onClick={() => set({ kind: 'calibrate' })} disabled={!loaded} title={keyed('Calibrate scale from a known dimension', 'tool.calibrate')} />
          <TB icon={Frame} label="Viewport" active={tool.kind === 'viewport'} onClick={() => set({ kind: 'viewport' })} disabled={!loaded} title="Draw a viewport with its own scale" />
          {MEASURE_GROUP.map((t) => (
            <TB
              key={t}
              icon={TYPE_ICON[t]}
              label={TYPE_INFO[t].label}
              title={`${TYPE_INFO[t].label} measurement${sc(`tool.${t}`) ? ` (${sc(`tool.${t}`)})` : ''}`}
              active={tool.kind === 'markup' && tool.type === t && !tool.chestToolId}
              disabled={!loaded}
              onClick={() => set({ kind: 'markup', type: t })}
            />
          ))}
        </div>
        <div className="tb-caption">Measure</div>
      </div>
      <div className="tb-group">
        <div className="tb-row">
          <TB icon={Table2} label="Markups" active={markupsOpen} onClick={() => st().togglePanel('markups')} title="Show or hide the Markups List" />
          <TB icon={Sigma} label="Summary" active={summaryOpen} onClick={() => st().togglePanel('summary')} title="Show or hide the Takeoff Summary" />
          <TB icon={GitCompareArrows} label="Compare" active={compareOpen} disabled={!loaded} onClick={() => st().togglePanel('compare')} title="Overlay and compare two sheets" />
          <TB icon={Wand2} label="Auto" active={autoOpen} disabled={!loaded} locked={!autoPro} onClick={() => st().togglePanel('autotakeoff')} title="Automatic takeoff: find labelled beams and tubing and measure them" />
        </div>
        <div className="tb-caption">Data</div>
      </div>
    </div>
  );
}
