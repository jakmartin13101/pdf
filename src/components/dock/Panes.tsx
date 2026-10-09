// Split view: panes in the main window, and panes detached into their own window.
//
// A detached pane is still part of this app: it renders through a React portal, so it shares the
// store, the toolbar, the menus and the panels of the main window. Clicking (or focusing) any pane
// makes it the active one, and tools act on the active pane. In the desktop app (and in browsers
// that allow pop-ups) a detached pane is a real window that can go to another monitor; otherwise it
// floats inside the main window.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, PanelTopClose, X } from 'lucide-react';
import { getState, useStore, type Pane } from '../../store/store';
import { Viewer } from '../viewer/Viewer';
import { sheetDisplayName } from '../../core/columns';
import { FULL_NAME } from '../../brand';
import { OwnerWindowContext } from '../ownerWindow';
import { handleAppShortcut } from '../../store/commands';

const st = getState;

function PaneHeader({ pane, index, onDragStart }: { pane: Pane; index: number; onDragStart?: (e: React.PointerEvent) => void }) {
  const sheets = useStore((s) => s.doc.sheets);
  const active = useStore((s) => s.activePaneId === pane.id);
  const canDetach = useStore((s) => s.panes.filter((p) => !p.detached).length > 1);
  return (
    <div
      className={`pane-head${active ? ' active' : ''}${onDragStart ? ' draggable' : ''}`}
      onPointerDown={(e) => {
        st().setActivePane(pane.id);
        if (onDragStart && !(e.target as HTMLElement).closest('select,button')) onDragStart(e);
      }}
      data-testid="pane-head"
    >
      <span className="pane-num">{index + 1}</span>
      <select value={pane.sheetId ?? ''} onChange={(e) => st().setPaneSheet(pane.id, e.target.value)} title="Sheet shown in this pane" data-testid="pane-sheet">
        {sheets.map((s) => (
          <option key={s.id} value={s.id}>
            {sheetDisplayName(s)}
          </option>
        ))}
      </select>
      <div style={{ flex: 1 }} />
      {pane.detached ? (
        <button className="icon-btn" title="Put this pane back in the main window" onClick={() => st().attachPane(pane.id)} data-testid="pane-attach">
          <PanelTopClose size={13} />
        </button>
      ) : (
        canDetach && (
          <button className="icon-btn" title="Detach into its own window (move and resize it anywhere)" onClick={() => detach(pane.id)} data-testid="pane-detach">
            <ExternalLink size={13} />
          </button>
        )
      )}
      <button className="icon-btn" title="Close this pane" onClick={() => st().closePane(pane.id)} data-testid="pane-close">
        <X size={13} />
      </button>
    </div>
  );
}

/** Detach a pane: a separate window where possible, otherwise a window floating in the app. */
export function detach(id: string) {
  st().detachPane(id, 'window');
}

function PaneView({ pane, index, style, onDragStart }: { pane: Pane; index: number; style?: CSSProperties; onDragStart?: (e: React.PointerEvent) => void }) {
  const multi = useStore((s) => s.panes.length > 1);
  return (
    <div className="pane" style={style} data-testid="pane" data-pane={pane.id}>
      {multi && <PaneHeader pane={pane} index={index} onDragStart={onDragStart} />}
      <Viewer paneId={pane.id} />
    </div>
  );
}

function PaneDivider({ dir, container }: { dir: 'v' | 'h'; container: React.RefObject<HTMLDivElement> }) {
  // Ratio-based: the split follows the pointer position within the container.
  return (
    <div
      className={`splitter-${dir} pane-divider`}
      onPointerDown={(e) => {
        e.preventDefault();
        const rect = container.current?.getBoundingClientRect();
        if (!rect) return;
        const move = (ev: PointerEvent) => {
          const r = dir === 'v' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
          st().setPaneSplit(dir === 'v' ? { x: Math.min(0.85, Math.max(0.15, r)) } : { y: Math.min(0.85, Math.max(0.15, r)) });
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

/** Panes in the main window: one, a side-by-side or stacked pair, three (two over one) or four. */
export function PaneArea() {
  const panes = useStore((s) => s.panes);
  const layout = useStore((s) => s.paneLayout);
  const split = useStore((s) => s.paneSplit);
  const ref = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const row2Ref = useRef<HTMLDivElement>(null);
  const attached = panes.filter((p) => !p.detached);
  const num = (p: Pane) => panes.indexOf(p);
  if (attached.length <= 1) {
    return (
      <div className="pane-area" ref={ref}>
        {attached[0] && <PaneView pane={attached[0]} index={num(attached[0])} style={{ flex: 1 }} />}
      </div>
    );
  }
  if (attached.length === 2) {
    const vertical = layout !== 'horizontal';
    const r = vertical ? split.x : split.y;
    return (
      <div className={`pane-area ${vertical ? 'row' : 'col'}`} ref={ref}>
        <PaneView pane={attached[0]} index={num(attached[0])} style={{ flex: r }} />
        <PaneDivider dir={vertical ? 'v' : 'h'} container={ref} />
        <PaneView pane={attached[1]} index={num(attached[1])} style={{ flex: 1 - r }} />
      </div>
    );
  }
  const [a, b, c, d] = attached;
  return (
    <div className="pane-area col" ref={ref}>
      <div className="pane-row" ref={rowRef} style={{ flex: split.y }}>
        <PaneView pane={a} index={num(a)} style={{ flex: split.x }} />
        <PaneDivider dir="v" container={rowRef} />
        <PaneView pane={b} index={num(b)} style={{ flex: 1 - split.x }} />
      </div>
      <PaneDivider dir="h" container={ref} />
      <div className="pane-row" ref={row2Ref} style={{ flex: 1 - split.y }}>
        <PaneView pane={c} index={num(c)} style={{ flex: d ? split.x : 1 }} />
        {d && <PaneDivider dir="v" container={row2Ref} />}
        {d && <PaneView pane={d} index={num(d)} style={{ flex: 1 - split.x }} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detached panes

/** A detached pane floating inside the main window: drag its header to move, the corner to resize. */
function FloatingPane({ pane, index }: { pane: Pane; index: number }) {
  const g = pane.detached!;
  const active = useStore((s) => s.activePaneId === pane.id);
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const r = live ?? g;
  const x = Math.max(0, Math.min(r.x, window.innerWidth - 160));
  const y = Math.max(0, Math.min(r.y, window.innerHeight - 80));
  const drag = (e: React.PointerEvent, kind: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let next = { x, y, w: r.w, h: r.h };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      next = kind === 'move' ? { ...next, x: x + dx, y: Math.max(0, y + dy) } : { ...next, w: Math.max(320, r.w + dx), h: Math.max(240, r.h + dy) };
      setLive(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      st().setPaneWindow(pane.id, next);
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`pane-float${active ? ' active' : ''}`} style={{ left: x, top: y, width: r.w, height: r.h, zIndex: active ? 1450 : 1440 }} data-testid="pane-float">
      <PaneView pane={pane} index={index} style={{ flex: 1 }} onDragStart={(e) => drag(e, 'move')} />
      <div className="float-resize" onPointerDown={(e) => drag(e, 'resize')} title="Resize" />
    </div>
  );
}

/** Copy the app's styles and theme into a pop-out window so the pane looks the same there. */
function prepareWindow(win: Window, title: string) {
  const doc = win.document;
  doc.title = title;
  doc.head.innerHTML = '';
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  doc.head.appendChild(meta);
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
    if (node.tagName === 'LINK') {
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(l);
    } else {
      const s = doc.createElement('style');
      s.textContent = node.textContent;
      doc.head.appendChild(s);
    }
  }
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    const l = doc.createElement('link');
    l.rel = 'icon';
    l.href = icon.href;
    doc.head.appendChild(l);
  }
  const theme = document.documentElement.dataset.theme;
  if (theme) doc.documentElement.dataset.theme = theme;
  else delete doc.documentElement.dataset.theme;
  doc.body.className = 'popout-body';
  doc.body.innerHTML = '';
  const root = doc.createElement('div');
  root.className = 'popout-root';
  doc.body.appendChild(root);
  return root;
}

/** A detached pane in its own browser/desktop window. Falls back to floating when pop-ups are blocked. */
function PopoutPane({ pane, index }: { pane: Pane; index: number }) {
  const [host, setHost] = useState<{ win: Window; root: HTMLElement } | null>(null);
  const sheetName = useStore((s) => sheetDisplayName(s.doc.sheets.find((x) => x.id === pane.sheetId)));
  const theme = useStore((s) => s.ui.theme);

  useEffect(() => {
    let teardown: (() => void) | null = null;
    // Open on the next tick: React's development double-mount runs both effects synchronously, so
    // only the surviving one opens a window.
    const timer = window.setTimeout(() => {
      const g = pane.detached!;
      const left = Math.round(window.screenX + g.x);
      const top = Math.round(window.screenY + g.y);
      let win: Window | null = null;
      let root: HTMLElement | null = null;
      try {
        win = window.open('', `takeoff-pane-${pane.id}-${Date.now()}`, `popup=yes,width=${g.w},height=${g.h},left=${left},top=${top}`);
        if (win) root = prepareWindow(win, `${FULL_NAME} – Pane ${index + 1}`);
      } catch {
        // A pop-up we cannot script (sandboxed page): use a floating pane instead.
        win?.close();
        win = null;
      }
      if (!win || !root) {
        st().setPaneWindow(pane.id, { mode: 'float' });
        return;
      }
      const w = win;
      let closingByApp = false;
      const onFocus = () => st().setActivePane(pane.id);
      const onGone = () => {
        // The user closed the window: close the pane with it.
        if (!closingByApp) st().closePane(pane.id);
      };
      w.addEventListener('focus', onFocus);
      w.addEventListener('keydown', handleAppShortcut);
      w.addEventListener('pagehide', onGone);
      const poll = window.setInterval(() => w.closed && onGone(), 600);
      // Closing or reloading the main window takes its pop-outs along.
      const closeAll = () => {
        closingByApp = true;
        w.close();
      };
      window.addEventListener('pagehide', closeAll);
      setHost({ win: w, root });
      w.focus();
      st().setActivePane(pane.id);
      teardown = () => {
        closingByApp = true;
        window.clearInterval(poll);
        window.removeEventListener('pagehide', closeAll);
        w.removeEventListener('focus', onFocus);
        w.removeEventListener('keydown', handleAppShortcut);
        w.removeEventListener('pagehide', onGone);
        w.close();
        setHost(null);
      };
    }, 0);
    return () => {
      window.clearTimeout(timer);
      teardown?.();
    };
    // Open the window once per pane; geometry changes after that are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  // Keep the window title and theme in step with the app.
  useEffect(() => {
    if (!host) return;
    host.win.document.title = `${sheetName || `Pane ${index + 1}`} – ${FULL_NAME}`;
  }, [host, sheetName, index]);
  useEffect(() => {
    if (!host) return;
    const t = document.documentElement.dataset.theme;
    if (t) host.win.document.documentElement.dataset.theme = t;
    else delete host.win.document.documentElement.dataset.theme;
  }, [host, theme]);

  if (!host) return null;
  return createPortal(
    <OwnerWindowContext.Provider value={host.win}>
      <PaneView pane={pane} index={index} style={{ flex: 1 }} />
    </OwnerWindowContext.Provider>,
    host.root,
  );
}

export function DetachedPanes() {
  const panes = useStore((s) => s.panes);
  return (
    <>
      {panes.map((p, i) =>
        !p.detached ? null : p.detached.mode === 'window' ? <PopoutPane key={p.id} pane={p} index={i} /> : <FloatingPane key={p.id} pane={p} index={i} />,
      )}
    </>
  );
}
