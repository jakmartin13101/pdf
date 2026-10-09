import { useState, type ReactNode } from 'react';
import { Files, Layers, Ruler, SlidersHorizontal, Sigma, Table2, Wrench, X } from 'lucide-react';
import { getState, useStore, PANEL_IDS, PANEL_TITLES, type DockSide, type PanelId } from '../../store/store';
import { PanelContext, DockMenuButton } from './PanelHeader';
import { beginDockDrag, consumeDragClick } from './dragging';
import { SheetsPanel } from '../panels/SheetsPanel';
import { ToolChestPanel } from '../panels/ToolChestPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { MeasurementsPanel } from '../panels/MeasurementsPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { MarkupsList } from '../bottom/MarkupsList';
import { SummaryPanel } from '../bottom/SummaryPanel';

export const PANEL_ICONS: Record<PanelId, (p: { size?: number }) => ReactNode> = {
  sheets: (p) => <Files {...p} />,
  toolchest: (p) => <Wrench {...p} />,
  properties: (p) => <SlidersHorizontal {...p} />,
  measurements: (p) => <Ruler {...p} />,
  layers: (p) => <Layers {...p} />,
  markups: (p) => <Table2 {...p} />,
  summary: (p) => <Sigma {...p} />,
};

/** Panels that only make sense once drawings are open. */
const NEEDS_DOCUMENT = new Set<PanelId>(['sheets', 'markups', 'summary']);

function PanelBody({ id }: { id: PanelId }) {
  const loaded = useStore((s) => s.loaded);
  if (!loaded && NEEDS_DOCUMENT.has(id)) return <div className="empty-note">Open a drawing set to use {PANEL_TITLES[id]}.</div>;
  switch (id) {
    case 'sheets':
      return <SheetsPanel />;
    case 'toolchest':
      return <ToolChestPanel />;
    case 'properties':
      return <PropertiesPanel />;
    case 'measurements':
      return <MeasurementsPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'markups':
      return <MarkupsList />;
    case 'summary':
      return <SummaryPanel />;
  }
}

export function PanelHost({ id, dock }: { id: PanelId; dock: DockSide | 'float' }) {
  return (
    <PanelContext.Provider value={{ id, dock }}>
      <div className="panel-host" data-panel={id}>
        <PanelBody id={id} />
      </div>
    </PanelContext.Provider>
  );
}

export function Splitter({ dir, onDrag, onEnd }: { dir: 'v' | 'h'; onDrag: (delta: number) => void; onEnd?: () => void }) {
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
          onEnd?.();
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

/** Left/right dock: a vertical tab strip plus the open panel. */
export function SideDock({ side }: { side: 'left' | 'right' }) {
  const layout = useStore((s) => s.layout);
  const panels = PANEL_IDS.filter((id) => layout.panels[id].dock === side);
  const active = layout.active[side];
  const st = getState;
  const strip = (
    <div className={`side-tabs ${side}`} data-testid={`dock-${side}`}>
      {panels.map((id) => (
        <button
          key={id}
          className={`side-tab${active === id ? ' active' : ''}`}
          title={`${PANEL_TITLES[id]} – click to show or hide, drag to move`}
          onClick={() => !consumeDragClick() && st().togglePanel(id)}
          onPointerDown={(e) => beginDockDrag(e, id, { w: layout.size[side], h: 420 }, undefined, { fromTab: true })}
          data-testid={`tab-${PANEL_TITLES[id].toLowerCase().replace(/\s+/g, '-')}`}
        >
          {PANEL_ICONS[id]({ size: 17 })}
        </button>
      ))}
    </div>
  );
  if (!panels.length) return null;
  const content = active && panels.includes(active) && (
    <>
      {side === 'right' && <Splitter dir="v" onDrag={(d) => st().setDockSize('right', Math.max(220, Math.min(640, st().layout.size.right - d)))} />}
      <div className={`side-panel ${side}`} style={{ width: layout.size[side] }}>
        <PanelHost id={active} dock={side} />
      </div>
      {side === 'left' && <Splitter dir="v" onDrag={(d) => st().setDockSize('left', Math.max(170, Math.min(640, st().layout.size.left + d)))} />}
    </>
  );
  return side === 'left' ? (
    <>
      {strip}
      {content}
    </>
  ) : (
    <>
      {content}
      {strip}
    </>
  );
}

/** Top/bottom dock: a tab bar plus the open panel. */
export function EdgeDock({ side }: { side: 'top' | 'bottom' }) {
  const layout = useStore((s) => s.layout);
  const panels = PANEL_IDS.filter((id) => layout.panels[id].dock === side);
  const active = layout.active[side];
  const st = getState;
  if (!panels.length) return null;
  const open = !!active && panels.includes(active);
  const resize = (d: number) =>
    st().setDockSize(side, Math.max(120, Math.min(window.innerHeight - 220, st().layout.size[side] + (side === 'bottom' ? -d : d))));
  return (
    <div className={`edge-dock ${side}`} style={{ height: open ? layout.size[side] : undefined }} data-testid={`dock-${side}`}>
      {side === 'bottom' && open && <Splitter dir="h" onDrag={resize} />}
      <div className="bottom-tabs">
        {panels.map((id) => (
          <button
            key={id}
            className={`bottom-tab${active === id ? ' active' : ''}`}
            onClick={() => !consumeDragClick() && st().togglePanel(id)}
            onPointerDown={(e) => beginDockDrag(e, id, { w: 760, h: layout.size[side] }, undefined, { fromTab: true })}
            title={`${PANEL_TITLES[id]} – click to show or hide, drag to move`}
            data-testid={`tab-${id}`}
          >
            {PANEL_ICONS[id]({ size: 14 })} {PANEL_TITLES[id]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {open && <DockMenuButton id={active!} />}
      </div>
      {open && <PanelHost id={active!} dock={side} />}
      {side === 'top' && open && <Splitter dir="h" onDrag={resize} />}
    </div>
  );
}

function FloatWindow({ id, z }: { id: PanelId; z: number }) {
  const place = useStore((s) => s.layout.panels[id]);
  const [live, setLive] = useState<{ w: number; h: number } | null>(null);
  const r = place.float;
  const w = live?.w ?? r.w;
  const h = live?.h ?? r.h;
  const x = Math.max(0, Math.min(r.x, window.innerWidth - 120));
  const y = Math.max(0, Math.min(r.y, window.innerHeight - 60));
  return (
    <div
      className="float-win"
      style={{ left: x, top: y, width: w, height: h, zIndex: 1500 + z }}
      onPointerDown={() => getState().layout.floatOrder.at(-1) !== id && getState().setFloatRect(id, {})}
      data-testid={`float-${id}`}
    >
      <PanelHost id={id} dock="float" />
      <button className="icon-btn float-close" title="Close" onClick={() => getState().closeFloat(id)}>
        <X size={13} />
      </button>
      <div
        className="float-resize"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const sx = e.clientX;
          const sy = e.clientY;
          let size = { w, h };
          const move = (ev: PointerEvent) => {
            size = { w: Math.max(240, w + ev.clientX - sx), h: Math.max(180, h + ev.clientY - sy) };
            setLive(size);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            getState().setFloatRect(id, size);
            setLive(null);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
    </div>
  );
}

export function FloatingPanels() {
  const layout = useStore((s) => s.layout);
  const floats = PANEL_IDS.filter((id) => layout.panels[id].dock === 'float' && layout.panels[id].open);
  const order = (id: PanelId) => {
    const i = layout.floatOrder.indexOf(id);
    return i < 0 ? 0 : i + 1;
  };
  return (
    <>
      {floats.map((id) => (
        <FloatWindow key={id} id={id} z={order(id)} />
      ))}
    </>
  );
}

/** While a panel or the toolbar is being dragged: highlight dock targets and show a ghost. */
export function DropOverlay() {
  const drag = useStore((s) => s.panelDrag);
  if (!drag) return null;
  const area = document.querySelector('.main-area')?.getBoundingClientRect();
  if (!area) return null;
  const zones: DockSide[] = drag.id === 'toolbar' ? ['top', 'left', 'right'] : ['left', 'right', 'top', 'bottom'];
  const zoneRect = (z: DockSide) => {
    const t = 48;
    switch (z) {
      case 'left':
        return { left: area.left, top: area.top, width: t + 16, height: area.height };
      case 'right':
        return { left: area.right - t - 16, top: area.top, width: t + 16, height: area.height };
      case 'top':
        return { left: area.left, top: area.top, width: area.width, height: t };
      case 'bottom':
        return { left: area.left, top: area.bottom - t, width: area.width, height: t };
    }
  };
  const title = drag.id === 'toolbar' ? 'Toolbar' : PANEL_TITLES[drag.id];
  return (
    <div className="drop-overlay">
      {zones.map((z) => (
        <div key={z} className={`drop-zone${drag.zone === z ? ' hot' : ''}`} style={zoneRect(z)}>
          Dock {z}
        </div>
      ))}
      <div className={`drop-ghost${drag.zone === 'float' ? ' floating' : ''}`} style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: Math.min(drag.w, 420), height: Math.min(drag.h, 300) }}>
        {title}
        <small>{drag.zone === 'float' ? 'Release to float here' : `Release to dock ${drag.zone}`}</small>
      </div>
    </div>
  );
}
