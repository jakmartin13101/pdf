import { getState, type DockSide, type PanelDrag, type PanelId } from '../../store/store';
import { MAX_SECTIONS, sectionCount, sectionOf, sectionPanels } from '../../store/dockLayout';

type Drop = Pick<PanelDrag, 'zone' | 'target' | 'hint'>;

/**
 * A dock section under the pointer: dropping near its end (the last quarter of its height down a side,
 * of its width across the top or bottom) – or its start – splits a new section off there; anywhere
 * else on it joins its tabs.
 */
function sectionAt(x: number, y: number, id: PanelId): Drop | null {
  const el = document
    .elementsFromPoint(x, y)
    .map((e) => e.closest<HTMLElement>('[data-dock-section]'))
    .find((e): e is HTMLElement => !!e);
  if (!el) return null;
  const [side, idx] = el.dataset.dockSection!.split(':') as [DockSide, string];
  const section = Number(idx);
  const l = getState().layout;
  const r = el.getBoundingClientRect();
  const vertical = side === 'left' || side === 'right';
  const strip = el.classList.contains('side-tab-group');
  const own = l.panels[id].dock === side ? sectionOf(l, id) : -1;
  const alone = own >= 0 && sectionPanels(l, side, own).length === 1;
  // Room for one more section (a panel alone in its section takes that section with it), and not
  // splitting a panel off from nothing but itself.
  const canSplit = !strip && (sectionCount(l, side) < MAX_SECTIONS || alone) && !(own === section && alone);
  const rel = vertical ? (y - r.top) / Math.max(1, r.height) : (x - r.left) / Math.max(1, r.width);
  if (canSplit && (rel > 0.75 || rel < 0.25)) {
    const after = rel > 0.75;
    const band = vertical
      ? { left: r.left, width: r.width, top: after ? r.top + r.height * 0.6 : r.top, height: r.height * 0.4 }
      : { top: r.top, height: r.height, left: after ? r.left + r.width * 0.6 : r.left, width: r.width * 0.4 };
    return {
      zone: side,
      target: { section: after ? section + 1 : section, split: true },
      hint: { ...band, label: `New section ${vertical ? (after ? 'below' : 'above') : after ? 'to the right' : 'to the left'}` },
    };
  }
  return { zone: side, target: { section }, hint: { left: r.left, top: r.top, width: r.width, height: r.height, label: 'Add to these tabs' } };
}

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
  const dropAt = (x: number, y: number): Drop => (id !== 'toolbar' && sectionAt(x, y, id)) || { zone: zoneAt(x, y, allowBottom) };
  const move = (ev: PointerEvent) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    started = true;
    getState().setPanelDrag({ id, x: ev.clientX, y: ev.clientY, dx, dy, w: size.w, h: size.h, ...dropAt(ev.clientX, ev.clientY) });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const st = getState();
    st.setPanelDrag(null);
    if (!started) return;
    suppressClickUntil = Date.now() + 250;
    const drop = dropAt(ev.clientX, ev.clientY);
    const zone = drop.zone ?? 'float';
    const x = Math.max(0, ev.clientX - dx);
    const y = Math.max(0, ev.clientY - dy);
    if (id === 'toolbar') {
      if (zone === 'bottom') return;
      st.setToolbarDock(zone, zone === 'float' ? { x, y } : undefined);
    } else st.dockPanel(id, zone, zone === 'float' ? { x, y, w: Math.max(260, size.w), h: Math.max(220, size.h) } : undefined, drop.target);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
