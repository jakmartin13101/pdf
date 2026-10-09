import { getState, type DockSide, type PanelId } from '../../store/store';

/** Edge zones of the workspace that accept a dropped panel or toolbar. */
export function zoneAt(x: number, y: number, allowBottom: boolean): DockSide | 'float' {
  const ws = document.querySelector('.main-area')?.getBoundingClientRect();
  if (!ws) return 'float';
  const edge = 64;
  if (x >= ws.left && x <= ws.left + edge && y >= ws.top && y <= ws.bottom) return 'left';
  if (x <= ws.right && x >= ws.right - edge && y >= ws.top && y <= ws.bottom) return 'right';
  if (y >= ws.top - 8 && y <= ws.top + 48 && x >= ws.left && x <= ws.right) return 'top';
  if (allowBottom && y <= ws.bottom + 8 && y >= ws.bottom - 48 && x >= ws.left && x <= ws.right) return 'bottom';
  return 'float';
}

/**
 * Start dragging a panel (or the toolbar) from a pointerdown. The drag only begins after a small
 * movement so plain clicks on headers and tabs keep working. Dropping on a workspace edge docks it;
 * anywhere else floats it at the drop position.
 */
let suppressClickUntil = 0;

/** True right after a drag ended, so the click that follows the drop doesn't also toggle a tab. */
export function consumeDragClick() {
  return Date.now() < suppressClickUntil;
}

export function beginDockDrag(
  e: React.PointerEvent,
  id: PanelId | 'toolbar',
  size: { w: number; h: number },
  origin?: { x: number; y: number },
  opts: { fromTab?: boolean } = {},
) {
  if (e.button !== 0 || getState().layout.locked) return;
  const target = e.target as HTMLElement;
  // Header buttons and inputs keep working; tabs are buttons that double as drag handles.
  if (!opts.fromTab && target.closest('button, input, select, textarea, a')) return;
  const sx = e.clientX;
  const sy = e.clientY;
  const dx = origin ? sx - origin.x : Math.min(size.w / 2, 80);
  const dy = origin ? sy - origin.y : 14;
  let started = false;
  const allowBottom = id !== 'toolbar';
  const move = (ev: PointerEvent) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    started = true;
    getState().setPanelDrag({ id, x: ev.clientX, y: ev.clientY, dx, dy, w: size.w, h: size.h, zone: zoneAt(ev.clientX, ev.clientY, allowBottom) });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const st = getState();
    st.setPanelDrag(null);
    if (!started) return;
    suppressClickUntil = Date.now() + 250;
    const zone = zoneAt(ev.clientX, ev.clientY, allowBottom);
    const x = Math.max(0, ev.clientX - dx);
    const y = Math.max(0, ev.clientY - dy);
    if (id === 'toolbar') {
      if (zone === 'bottom') return;
      st.setToolbarDock(zone, zone === 'float' ? { x, y } : undefined);
    } else st.dockPanel(id, zone, zone === 'float' ? { x, y, w: Math.max(260, size.w), h: Math.max(220, size.h) } : undefined);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
