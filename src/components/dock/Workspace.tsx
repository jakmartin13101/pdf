import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Files, GitCompareArrows, Layers, Ruler, SlidersHorizontal, Sigma, Table2, Wand2, Wrench, X } from 'lucide-react';
import { getState, useStore, PANEL_IDS, PANEL_TITLES, type DockSide, type PanelId } from '../../store/store';
import { PanelContext, DockMenuButton } from './PanelHeader';
import { beginDockDrag, consumeDragClick } from './dragging';
import { dockPanels, sectionCount, sectionPanels } from '../../store/dockLayout';
import { SheetsPanel } from '../panels/SheetsPanel';
import { ToolLibraryPanel } from '../panels/ToolLibraryPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { MeasurementsPanel } from '../panels/MeasurementsPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { ComparePanel } from '../panels/ComparePanel';
import { AutoTakeoffPanel } from '../panels/AutoTakeoffPanel';
import { TakeoffList } from '../bottom/TakeoffList';
import { SummaryPanel } from '../bottom/SummaryPanel';

export const PANEL_ICONS: Record<PanelId, (p: { size?: number }) => ReactNode> = {
  sheets: (p) => <Files {...p} />,
  toollibrary: (p) => <Wrench {...p} />,
  properties: (p) => <SlidersHorizontal {...p} />,
  measurements: (p) => <Ruler {...p} />,
  layers: (p) => <Layers {...p} />,
  compare: (p) => <GitCompareArrows {...p} />,
  autotakeoff: (p) => <Wand2 {...p} />,
  markups: (p) => <Table2 {...p} />,
  summary: (p) => <Sigma {...p} />,
};

/** Panels that only make sense once drawings are open. */
const NEEDS_DOCUMENT = new Set<PanelId>(['sheets', 'compare', 'autotakeoff', 'markups', 'summary']);

function PanelBody({ id }: { id: PanelId }) {
  const loaded = useStore((s) => s.loaded);
  if (!loaded && NEEDS_DOCUMENT.has(id)) return <div className="empty-note">Open a drawing set to use {PANEL_TITLES[id]}.</div>;
  switch (id) {
    case 'sheets':
      return <SheetsPanel />;
    case 'toollibrary':
      return <ToolLibraryPanel />;
    case 'properties':
      return <PropertiesPanel />;
    case 'measurements':
      return <MeasurementsPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'compare':
      return <ComparePanel />;
    case 'autotakeoff':
      return <AutoTakeoffPanel />;
    case 'markups':
      return <TakeoffList />;
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

export function Splitter({ dir, onDrag, onEnd, className }: { dir: 'v' | 'h'; onDrag: (delta: number) => void; onEnd?: () => void; className?: string }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`splitter-${dir}${dragging ? ' dragging' : ''}${className ? ` ${className}` : ''}`}
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

/**
 * A dock's sections, one after another (down a side dock, across a top/bottom dock), with splitters
 * between them: dragging one shares the space between its two neighbours. `fixed` sections (collapsed
 * ones in a top/bottom dock) keep their own size.
 */
function SectionStack({ side, dir, sections }: { side: DockSide; dir: 'column' | 'row'; sections: { index: number; node: ReactNode; fixed?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const split = useStore((s) => s.layout.split[side]);
  const resize = (a: number, b: number, d: number) => {
    const el = ref.current;
    if (!el) return;
    const st = getState();
    const sizes = [...st.layout.split[side]];
    const total = Math.max(1, dir === 'column' ? el.clientHeight : el.clientWidth);
    const W = sections.filter((x) => !x.fixed).reduce((t, x) => t + (sizes[x.index] ?? 1), 0);
    const dw = (d * W) / total;
    const min = (70 * W) / total; // keep every section at least ~70 px
    const wa = (sizes[a] ?? 1) + dw;
    const wb = (sizes[b] ?? 1) - dw;
    if (wa < min || wb < min) return;
    sizes[a] = wa;
    sizes[b] = wb;
    st.setSectionSizes(side, sizes);
  };
  return (
    <div ref={ref} className={`dock-sections ${dir}`}>
      {sections.map((x, i) => {
        const prev = sections[i - 1];
        return (
          <Fragment key={x.index}>
            {prev &&
              (!prev.fixed && !x.fixed ? (
                <Splitter dir={dir === 'column' ? 'h' : 'v'} onDrag={(d) => resize(prev.index, x.index, d)} />
              ) : (
                <div className="dock-divider" />
              ))}
            <div
              className={`dock-section${x.fixed ? ' fixed' : ''}`}
              style={{ flex: x.fixed ? '0 0 auto' : `${split[x.index] ?? 1} 1 0` }}
              data-dock-section={`${side}:${x.index}`}
              data-testid="dock-section"
            >
              {x.node}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Left/right dock: a vertical tab strip (a group of tabs per section) plus the sections' open panels. */
export function SideDock({ side }: { side: 'left' | 'right' }) {
  const layout = useStore((s) => s.layout);
  const st = getState;
  const panels = dockPanels(layout, side);
  if (!panels.length) return null;
  const n = sectionCount(layout, side);
  const groups = Array.from({ length: n }, (_, s) => sectionPanels(layout, side, s));
  const open = groups.map((_, s) => ({ s, id: layout.active[side][s] })).filter((x): x is { s: number; id: PanelId } => !!x.id);
  const strip = (
    <div className={`side-tabs ${side}`} data-testid={`dock-${side}`}>
      {groups.map((g, s) => (
        <div key={s} className="side-tab-group" data-dock-section={`${side}:${s}`} data-testid="side-tab-group">
          {g.map((id) => (
            <button
              key={id}
              className={`side-tab${layout.active[side][s] === id ? ' active' : ''}`}
              title={`${PANEL_TITLES[id]} – click to show or hide, drag to move${n > 1 ? ` (section ${s + 1} of ${n})` : ''}`}
              onClick={() => !consumeDragClick() && st().togglePanel(id)}
              onPointerDown={(e) => beginDockDrag(e, id, { w: layout.size[side], h: 420 }, undefined, { fromTab: true })}
              data-testid={`tab-${PANEL_TITLES[id].toLowerCase().replace(/\s+/g, '-')}`}
            >
              {PANEL_ICONS[id]({ size: 17 })}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
  // The dock's width: dragged at its inner edge (on small screens, where the panel lies over the drawing,
  // by the grip on the panel's edge).
  const resizeWidth = (d: number) => {
    const max = Math.max(320, window.innerWidth - 260);
    st().setDockSize(side, Math.max(160, Math.min(max, st().layout.size[side] + (side === 'left' ? d : -d))));
  };
  const content = open.length > 0 && (
    <>
      {side === 'right' && <Splitter dir="v" onDrag={resizeWidth} />}
      <div className={`side-panel ${side}`} style={{ width: layout.size[side], ['--side-w' as string]: `${layout.size[side]}px` }}>
        <SectionStack side={side} dir="column" sections={open.map((x) => ({ index: x.s, node: <PanelHost id={x.id} dock={side} /> }))} />
        <Splitter dir="v" className="side-grip" onDrag={resizeWidth} />
      </div>
      {side === 'left' && <Splitter dir="v" onDrag={resizeWidth} />}
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

/** Top/bottom dock: its sections side by side, each a tab bar plus its open panel. */
export function EdgeDock({ side }: { side: 'top' | 'bottom' }) {
  const layout = useStore((s) => s.layout);
  const st = getState;
  const panels = dockPanels(layout, side);
  if (!panels.length) return null;
  const n = sectionCount(layout, side);
  const anyOpen = layout.active[side].some(Boolean);
  const resize = (d: number) =>
    st().setDockSize(side, Math.max(120, Math.min(window.innerHeight - 220, st().layout.size[side] + (side === 'bottom' ? -d : d))));
  const sections = Array.from({ length: n }, (_, s) => {
    const active = layout.active[side][s];
    return {
      index: s,
      fixed: !active,
      node: (
        <>
          <div className="bottom-tabs">
            {sectionPanels(layout, side, s).map((id) => (
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
            {active && <DockMenuButton id={active} />}
          </div>
          {active && <PanelHost id={active} dock={side} />}
        </>
      ),
    };
  });
  return (
    <div className={`edge-dock ${side}`} style={{ height: anyOpen ? layout.size[side] : undefined }} data-testid={`dock-${side}`}>
      {side === 'bottom' && anyOpen && <Splitter dir="h" onDrag={resize} />}
      <SectionStack side={side} dir="row" sections={sections} />
      {side === 'top' && anyOpen && <Splitter dir="h" onDrag={resize} />}
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
  const hint = drag.hint;
  return (
    <div className="drop-overlay">
      {zones.map((z) => (
        <div key={z} className={`drop-zone${drag.zone === z && !hint ? ' hot' : ''}`} style={zoneRect(z)}>
          Dock {z}
        </div>
      ))}
      {hint && (
        <div className="drop-section" style={{ left: hint.left, top: hint.top, width: hint.width, height: hint.height }} data-testid="drop-section">
          {hint.label}
        </div>
      )}
      <div className={`drop-ghost${drag.zone === 'float' ? ' floating' : ''}`} style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: Math.min(drag.w, 420), height: Math.min(drag.h, 300) }}>
        {title}
        <small>{drag.zone === 'float' ? 'Release to float here' : hint ? hint.label : `Release to dock ${drag.zone}`}</small>
      </div>
    </div>
  );
}
