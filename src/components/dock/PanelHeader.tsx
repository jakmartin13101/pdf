import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { getState, useStore, PANEL_TITLES, type DockSide, type PanelId } from '../../store/store';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { beginDockDrag } from './dragging';

export interface PanelContextValue {
  id: PanelId;
  dock: DockSide | 'float';
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function dockMenuItems(id: PanelId | 'toolbar'): MenuItem[] {
  const st = getState();
  const locked = st.layout.locked;
  if (id === 'toolbar') {
    const cur = st.layout.toolbar.dock;
    return [
      ...(['top', 'left', 'right'] as const).map((d) => ({
        label: `Dock ${d[0].toUpperCase()}${d.slice(1)}`,
        checked: cur === d,
        disabled: locked,
        onClick: () => st.setToolbarDock(d),
      })),
      { label: 'Float', checked: cur === 'float', disabled: locked, onClick: () => st.setToolbarDock('float', { x: 220, y: 140 }) },
      { sep: true },
      { label: locked ? 'Unlock Workspace Layout' : 'Lock Workspace Layout', onClick: () => st.setLayoutLocked(!locked) },
    ];
  }
  const cur = st.layout.panels[id].dock;
  return [
    ...(['left', 'right', 'top', 'bottom'] as const).map((d) => ({
      label: `Dock ${d[0].toUpperCase()}${d.slice(1)}`,
      checked: cur === d,
      disabled: locked,
      onClick: () => st.dockPanel(id, d),
    })),
    { label: 'Float', checked: cur === 'float', disabled: locked, onClick: () => st.dockPanel(id, 'float') },
    { sep: true },
    { label: cur === 'float' ? 'Close' : 'Collapse', onClick: () => (cur === 'float' ? st.closeFloat(id) : st.togglePanel(id)) },
    { label: locked ? 'Unlock Workspace Layout' : 'Lock Workspace Layout', onClick: () => st.setLayoutLocked(!locked) },
  ];
}

export function DockMenuButton({ id }: { id: PanelId | 'toolbar' }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        className="icon-btn"
        title="Move panel: dock left, right, top, bottom or float"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 2 });
        }}
        data-testid={`dock-menu-${id}`}
      >
        <PanelsTopLeft size={14} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={dockMenuItems(id)} onClose={() => setMenu(null)} />}
    </>
  );
}

/** Panel title bar: drag it to dock/float the panel; carries the dock menu. */
export function PanelHeader({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  const ctx = useContext(PanelContext);
  const ref = useRef<HTMLDivElement>(null);
  const locked = useStore((s) => s.layout.locked);
  return (
    <div
      ref={ref}
      className={`panel-header${ctx && !locked ? ' draggable' : ''}`}
      onPointerDown={(e) => {
        if (!ctx) return;
        const panel = ref.current?.closest('.panel-host') as HTMLElement | null;
        const r = panel?.getBoundingClientRect();
        beginDockDrag(e, ctx.id, { w: r?.width ?? 320, h: r?.height ?? 400 }, r ? { x: r.left, y: r.top } : undefined);
      }}
      title={ctx && !locked ? `Drag to move ${PANEL_TITLES[ctx.id]}` : undefined}
    >
      {icon}
      <span className="title">{title}</span>
      {children}
      {ctx && <DockMenuButton id={ctx.id} />}
    </div>
  );
}
