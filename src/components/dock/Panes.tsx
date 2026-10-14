// Split view: panes in the main window, and panes detached into their own window.
//
// A detached pane is still part of this app: it renders through a React portal, so it shares the
// store, the toolbar, the menus and the panels of the main window. Clicking (or focusing) any pane
// makes it the active one, and tools act on the active pane. In the desktop app (and in browsers
// that allow pop-ups) a detached pane is a real window that can go to another monitor; otherwise it
// floats inside the main window.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, PanelTopClose, Plus, X } from 'lucide-react';
import { getState, useStore, type Pane } from '../../store/store';
import { Viewer } from '../viewer/Viewer';
import { sheetDisplayName } from '../../core/columns';
import { FULL_NAME } from '../../brand';
import { OwnerWindowContext } from '../ownerWindow';
import { cmdOpenPdf, handleAppShortcut } from '../../store/commands';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { useShortcuts } from '../useShortcuts';

const st = getState;

// ---------------------------------------------------------------------------
// Document tabs
//
// Each pane has a tab per open document (PDF file). Tabs drag to another place in the strip, onto
// another pane's strip or drawing (Ctrl to copy rather than move), and into detached windows too:
// those are portals of this same app, so the tab being dragged is simply remembered here.

let dragging: { fileId: string; from: string } | null = null;
const TAB_TYPE = 'application/x-takeoff-tab';
const isTabDrag = (e: React.DragEvent) => !!dragging && e.dataTransfer.types.includes(TAB_TYPE);

const docName = (name: string) => name.replace(/\.pdf$/i, '');

/** Menu items for a document tab (its right-click menu, and Window → Document Tab). */
export function tabMenuItems(paneId: string, fileId: string, sc: (id: string) => string | undefined): MenuItem[] {
  const s = st();
  const pane = s.panes.find((p) => p.id === paneId);
  if (!pane) return [];
  const others = s.panes.filter((p) => p.id !== paneId);
  const attached = s.panes.filter((p) => !p.detached).length;
  const paneName = (p: Pane) => `Pane ${s.panes.indexOf(p) + 1}${p.detached ? ' (window)' : ''}`;
  return [
    { label: 'Close Tab', shortcut: sc('tab.close'), onClick: () => st().closeTab(paneId, fileId) },
    {
      label: 'Close Other Tabs',
      disabled: pane.tabs.length < 2,
      onClick: () => pane.tabs.filter((t) => t.fileId !== fileId).forEach((t) => st().closeTab(paneId, t.fileId)),
    },
    { sep: true },
    {
      label: 'Move to Pane',
      disabled: !others.length,
      children: others.map((p) => ({ label: paneName(p), onClick: () => st().moveTab(fileId, paneId, p.id) })),
    },
    {
      label: 'Also Show in Pane',
      disabled: !others.length,
      children: others.map((p) => ({ label: paneName(p), onClick: () => st().moveTab(fileId, paneId, p.id, { copy: true }) })),
    },
    { label: 'Move to New Pane', shortcut: sc('tab.newPane'), disabled: attached >= 4, onClick: () => st().tabToNewPane(paneId, fileId) },
    {
      label: 'Move to New Window',
      disabled: attached >= 4,
      onClick: () => {
        st().tabToNewPane(paneId, fileId);
        st().detachPane(st().activePaneId, 'window');
      },
    },
  ];
}

function DocTabs({ pane }: { pane: Pane }) {
  const files = useStore((s) => s.doc.files);
  const sheets = useStore((s) => s.doc.sheets);
  const lonely = useStore((s) => !pane.detached && s.panes.filter((p) => !p.detached).length === 1 && pane.tabs.length === 1);
  const sc = useShortcuts();
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const activeFile = sheets.find((x) => x.id === pane.sheetId)?.fileId;
  // Keep the active tab in sight when the strip is too narrow for all of them.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.doc-tab.active');
    const strip = ref.current;
    if (!el || !strip) return;
    if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft;
    else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth;
  }, [activeFile, pane.tabs.length]);

  const indexAt = (x: number) => {
    const tabs = [...(ref.current?.querySelectorAll<HTMLElement>('.doc-tab') ?? [])];
    const i = tabs.findIndex((t) => {
      const r = t.getBoundingClientRect();
      return x < r.left + r.width / 2;
    });
    return i < 0 ? tabs.length : i;
  };
  const addMenu = (e: React.MouseEvent) => {
    const closed = files.filter((f) => !pane.tabs.some((t) => t.fileId === f.id) && sheets.some((x) => x.fileId === f.id));
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 2,
      items: [
        ...closed.map<MenuItem>((f) => ({ label: docName(f.name), onClick: () => st().openTab(pane.id, f.id) })),
        ...(closed.length ? [{ sep: true }] : []),
        {
          label: 'Open PDF…',
          shortcut: sc('file.openPdf'),
          onClick: () => {
            st().setActivePane(pane.id);
            void cmdOpenPdf();
          },
        },
      ],
    });
  };

  return (
    <div
      className="doc-tabs"
      role="tablist"
      ref={ref}
      onDragOver={(e) => {
        if (!isTabDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
        setDropAt(indexAt(e.clientX));
      }}
      onDragLeave={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setDropAt(null);
      }}
      onDrop={(e) => {
        if (!isTabDrag(e) || !dragging) return;
        e.preventDefault();
        e.stopPropagation();
        const d = dragging;
        dragging = null;
        setDropAt(null);
        st().moveTab(d.fileId, d.from, pane.id, { index: indexAt(e.clientX), copy: e.ctrlKey });
      }}
      data-testid="doc-tabs"
    >
      {pane.tabs.map((t, i) => {
        const f = files.find((x) => x.id === t.fileId);
        if (!f) return null;
        const active = t.fileId === activeFile;
        const count = sheets.filter((x) => x.fileId === t.fileId).length;
        return (
          <div
            key={t.fileId}
            role="tab"
            aria-selected={active}
            className={`doc-tab${active ? ' active' : ''}${dropAt === i ? ' drop-before' : ''}`}
            title={`${f.name} · ${count} sheet${count === 1 ? '' : 's'}\nDrag to another pane to move it there (hold Ctrl to show it in both)`}
            draggable
            onDragStart={(e) => {
              dragging = { fileId: t.fileId, from: pane.id };
              e.dataTransfer.effectAllowed = 'copyMove';
              e.dataTransfer.setData(TAB_TYPE, t.fileId);
              e.dataTransfer.setData('text/plain', f.name);
            }}
            onDragEnd={() => {
              dragging = null;
              setDropAt(null);
            }}
            onClick={() => st().openTab(pane.id, t.fileId)}
            onAuxClick={(e) => e.button === 1 && !lonely && st().closeTab(pane.id, t.fileId)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              st().setActivePane(pane.id);
              setMenu({ x: e.clientX, y: e.clientY, items: tabMenuItems(pane.id, t.fileId, sc) });
            }}
            data-testid="doc-tab"
            data-file={t.fileId}
          >
            <FileText size={12} className="doc-tab-icon" />
            <span className="doc-tab-name">{docName(f.name)}</span>
            {!lonely && (
              <button
                className="doc-tab-x"
                title="Close tab (the document stays in the project)"
                onClick={(e) => {
                  e.stopPropagation();
                  st().closeTab(pane.id, t.fileId);
                }}
                data-testid="doc-tab-close"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
      <div className={`doc-tab-end${dropAt === pane.tabs.length ? ' drop-before' : ''}`} />
      <button className="icon-btn doc-tab-add" title="Open a document in this pane" onClick={addMenu} data-testid="doc-tab-add">
        <Plus size={13} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function PaneHeader({ pane, index, onDragStart }: { pane: Pane; index: number; onDragStart?: (e: React.PointerEvent) => void }) {
  const sheets = useStore((s) => s.doc.sheets);
  const files = useStore((s) => s.doc.files);
  const multi = useStore((s) => s.panes.length > 1);
  const active = useStore((s) => s.activePaneId === pane.id);
  const canDetach = useStore((s) => s.panes.filter((p) => !p.detached).length > 1);
  const activeFile = sheets.find((x) => x.id === pane.sheetId)?.fileId;
  // The sheet picker lists the sheets of the document on show; other documents are a tab away.
  const own = sheets.filter((x) => x.fileId === activeFile);
  return (
    <div
      className={`pane-head${multi && active ? ' active' : ''}${onDragStart ? ' draggable' : ''}`}
      onPointerDown={(e) => {
        st().setActivePane(pane.id);
        if (onDragStart && !(e.target as HTMLElement).closest('select,button,.doc-tab')) onDragStart(e);
      }}
      data-testid="pane-head"
    >
      {multi && <span className="pane-num">{index + 1}</span>}
      <DocTabs pane={pane} />
      {multi && (
        <select value={pane.sheetId ?? ''} onChange={(e) => st().setPaneSheet(pane.id, e.target.value)} title="Sheet shown in this pane" data-testid="pane-sheet">
          {(own.length ? own : sheets).map((s) => (
            <option key={s.id} value={s.id}>
              {sheetDisplayName(s)}
            </option>
          ))}
          {files.length > 1 &&
            sheets.some((x) => x.fileId !== activeFile) && (
              <optgroup label="Other documents">
                {sheets
                  .filter((x) => x.fileId !== activeFile)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {sheetDisplayName(s)}
                    </option>
                  ))}
              </optgroup>
            )}
        </select>
      )}
      {!multi ? null : pane.detached ? (
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
      {multi && (
        <button className="icon-btn" title="Close this pane" onClick={() => st().closePane(pane.id)} data-testid="pane-close">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Detach a pane: a separate window where possible, otherwise a window floating in the app. */
export function detach(id: string) {
  st().detachPane(id, 'window');
}

function PaneView({ pane, index, style, onDragStart }: { pane: Pane; index: number; style?: CSSProperties; onDragStart?: (e: React.PointerEvent) => void }) {
  const loaded = useStore((s) => s.loaded);
  // A document tab (or a sheet from the Sheets panel) dragged over the drawing of this pane.
  const [over, setOver] = useState<'tab' | 'sheet' | null>(null);
  const accepts = (e: React.DragEvent) => (isTabDrag(e) && dragging!.from !== pane.id ? 'tab' : e.dataTransfer.types.includes('text/sheet') ? 'sheet' : null);
  return (
    <div
      className="pane"
      style={style}
      onDragOver={(e) => {
        const kind = accepts(e);
        if (e.dataTransfer.types.includes('Files')) st().setActivePane(pane.id); // PDFs dropped here open in this pane
        if (!kind) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = kind === 'tab' && !e.ctrlKey ? 'move' : 'copy';
        if (over !== kind) setOver(kind);
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
      }}
      onDrop={(e) => {
        const kind = accepts(e);
        setOver(null);
        if (!kind) return;
        e.preventDefault();
        e.stopPropagation();
        if (kind === 'tab' && dragging) {
          const d = dragging;
          dragging = null;
          st().moveTab(d.fileId, d.from, pane.id, { copy: e.ctrlKey });
        } else {
          const sheetId = e.dataTransfer.getData('text/sheet');
          st().setActivePane(pane.id);
          if (sheetId) st().setPaneSheet(pane.id, sheetId);
        }
      }}
      data-testid="pane"
      data-pane={pane.id}
    >
      {loaded && <PaneHeader pane={pane} index={index} onDragStart={onDragStart} />}
      <Viewer paneId={pane.id} />
      {over && (
        <div className="pane-drop" data-testid="pane-drop">
          <span>{over === 'tab' ? 'Drop to open the document in this pane (Ctrl: keep it in both)' : 'Drop to show this sheet here'}</span>
        </div>
      )}
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
