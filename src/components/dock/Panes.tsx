// Split view: panes in the main window, and panes detached into their own window.
//
// A detached pane is still part of this app: it renders through a React portal, so it shares the
// store, the toolbar, the menus and the panels of the main window. Clicking (or focusing) any pane
// makes it the active one, and tools act on the active pane. In the desktop app (and in browsers
// that allow pop-ups) a detached pane is a real window that can go to another monitor; otherwise it
// floats inside the main window.

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, PanelTopClose, Plus, X } from 'lucide-react';
import { docTitle, findSheet, getState, isDirty, paneDoc, useStore, type Pane } from '../../store/store';
import { syncTree, type PaneNode } from '../../store/paneTree';
import { Viewer } from '../viewer/Viewer';
import { sheetDisplayName } from '../../core/columns';
import { FULL_NAME } from '../../brand';
import { OwnerWindowContext } from '../ownerWindow';
import { cmdCloseTab, cmdCloseTabs, cmdOpenPdf, handleAppShortcut } from '../../store/commands';
import { saveDocument } from '../../store/project';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { useShortcuts } from '../useShortcuts';

const st = getState;

// ---------------------------------------------------------------------------
// Document tabs
//
// Each pane has a tab per document (PDF) open in it. Tabs drag to another place in the strip, onto
// another pane's strip or drawing (Ctrl to copy rather than move), and into detached windows too:
// those are portals of this same app, so the tab being dragged is simply remembered here.

let dragging: { docId: string; from: string } | null = null;
const TAB_TYPE = 'application/x-takeoff-tab';
const isTabDrag = (e: React.DragEvent) => !!dragging && e.dataTransfer.types.includes(TAB_TYPE);

/** Menu items for a document tab (its right-click menu, and Window → Document Tab). */
export function tabMenuItems(paneId: string, docId: string, sc: (id: string) => string | undefined): MenuItem[] {
  const s = st();
  const pane = s.panes.find((p) => p.id === paneId);
  if (!pane) return [];
  const others = s.panes.filter((p) => p.id !== paneId);
  const attached = s.panes.filter((p) => !p.detached).length;
  const paneName = (p: Pane) => `Pane ${s.panes.indexOf(p) + 1}${p.detached ? ' (window)' : ''}`;
  return [
    { label: 'Save', shortcut: sc('file.save'), onClick: () => void saveDocument(docId) },
    { label: 'Save As…', shortcut: sc('file.saveAs'), onClick: () => void saveDocument(docId, { as: true }) },
    { sep: true },
    { label: 'Close', shortcut: sc('tab.close'), onClick: () => cmdCloseTab(paneId, docId) },
    {
      label: 'Close Others',
      disabled: pane.tabs.length < 2,
      onClick: () => cmdCloseTabs(paneId, pane.tabs.filter((t) => t.docId !== docId).map((t) => t.docId)),
    },
    { sep: true },
    {
      label: 'Move to Pane',
      disabled: !others.length,
      children: others.map((p) => ({ label: paneName(p), onClick: () => st().moveTab(docId, paneId, p.id) })),
    },
    {
      label: 'Also Show in Pane',
      disabled: !others.length,
      children: others.map((p) => ({ label: paneName(p), onClick: () => st().moveTab(docId, paneId, p.id, { copy: true }) })),
    },
    { label: 'Move to New Pane', shortcut: sc('tab.newPane'), disabled: attached >= 4, onClick: () => st().tabToNewPane(paneId, docId) },
    {
      label: 'Move to New Window',
      disabled: attached >= 4,
      onClick: () => {
        st().tabToNewPane(paneId, docId);
        st().detachPane(st().activePaneId, 'window');
      },
    },
  ];
}

function DocTabs({ pane }: { pane: Pane }) {
  const docs = useStore((s) => s.docs);
  // Documents with unsaved changes (a string, so the selector stays stable).
  const dirty = useStore((s) => s.docs.filter((d) => isDirty(s, d.id)).map((d) => d.id).join(' '));
  const sc = useShortcuts();
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Keep the active tab in sight when the strip is too narrow for all of them.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.doc-tab.active');
    const strip = ref.current;
    if (!el || !strip) return;
    if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft;
    else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth;
  }, [pane.docId, pane.tabs.length]);

  const indexAt = (x: number) => {
    const tabs = [...(ref.current?.querySelectorAll<HTMLElement>('.doc-tab') ?? [])];
    const i = tabs.findIndex((t) => {
      const r = t.getBoundingClientRect();
      return x < r.left + r.width / 2;
    });
    return i < 0 ? tabs.length : i;
  };
  const addMenu = (e: React.MouseEvent) => {
    const elsewhere = docs.filter((d) => !pane.tabs.some((t) => t.docId === d.id));
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 2,
      items: [
        {
          label: 'Open PDF…',
          shortcut: sc('file.openPdf'),
          onClick: () => {
            st().setActivePane(pane.id);
            void cmdOpenPdf();
          },
        },
        ...(elsewhere.length ? [{ sep: true }, ...elsewhere.map<MenuItem>((d) => ({ label: `Show ${docTitle(d.name)} Here`, onClick: () => st().openTab(pane.id, d.id) }))] : []),
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
        st().moveTab(d.docId, d.from, pane.id, { index: indexAt(e.clientX), copy: e.ctrlKey });
      }}
      data-testid="doc-tabs"
    >
      {pane.tabs.map((t, i) => {
        const d = docs.find((x) => x.id === t.docId);
        if (!d) return null;
        const active = t.docId === pane.docId;
        const unsaved = dirty.split(' ').includes(t.docId);
        return (
          <div
            key={t.docId}
            role="tab"
            aria-selected={active}
            className={`doc-tab${active ? ' active' : ''}${dropAt === i ? ' drop-before' : ''}${unsaved ? ' unsaved' : ''}`}
            title={`${d.path ?? d.name}${unsaved ? ' – unsaved changes' : ''}\nDrag to another pane to move it there (hold Ctrl to show it in both)`}
            draggable
            onDragStart={(e) => {
              dragging = { docId: t.docId, from: pane.id };
              e.dataTransfer.effectAllowed = 'copyMove';
              e.dataTransfer.setData(TAB_TYPE, t.docId);
              e.dataTransfer.setData('text/plain', d.name);
            }}
            onDragEnd={() => {
              dragging = null;
              setDropAt(null);
            }}
            onClick={() => st().openTab(pane.id, t.docId)}
            onAuxClick={(e) => e.button === 1 && cmdCloseTab(pane.id, t.docId)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              st().setActivePane(pane.id);
              setMenu({ x: e.clientX, y: e.clientY, items: tabMenuItems(pane.id, t.docId, sc) });
            }}
            data-testid="doc-tab"
            data-doc={t.docId}
          >
            <FileText size={12} className="doc-tab-icon" />
            <span className="doc-tab-name">{docTitle(d.name)}</span>
            {unsaved && <span className="doc-tab-dot" title="Unsaved changes" data-testid="doc-tab-unsaved" />}
            <button
              className="doc-tab-x"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                cmdCloseTab(pane.id, t.docId);
              }}
              data-testid="doc-tab-close"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      <div className={`doc-tab-end${dropAt === pane.tabs.length ? ' drop-before' : ''}`} />
      <button className="icon-btn doc-tab-add" title="Open a PDF, or show another open document here" onClick={addMenu} data-testid="doc-tab-add">
        <Plus size={13} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function PaneHeader({ pane, index, onDragStart }: { pane: Pane; index: number; onDragStart?: (e: React.PointerEvent) => void }) {
  const sheets = useStore((s) => paneDoc(s, pane.id).sheets);
  const multi = useStore((s) => s.panes.length > 1);
  const active = useStore((s) => s.activePaneId === pane.id);
  const canDetach = useStore((s) => s.panes.filter((p) => !p.detached).length > 1);
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
          {sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {sheetDisplayName(s)}
            </option>
          ))}
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
          st().moveTab(d.docId, d.from, pane.id, { copy: e.ctrlKey });
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

/**
 * The divider between two panes (or groups) of a split: dragging it shares their space, each kept at least
 * MIN_PANE px.
 */
const MIN_PANE = 90;
function PaneDivider({ dir, path, a, container }: { dir: 'row' | 'col'; path: number[]; a: number; container: React.RefObject<HTMLDivElement> }) {
  return (
    <div
      className={`splitter-${dir === 'row' ? 'v' : 'h'} pane-divider`}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = container.current;
        if (!el) return;
        let last = dir === 'row' ? e.clientX : e.clientY;
        const move = (ev: PointerEvent) => {
          const node = nodeAt(st().paneTree, path);
          if (!node || 'pane' in node) return;
          const cur = dir === 'row' ? ev.clientX : ev.clientY;
          const total = Math.max(1, dir === 'row' ? el.clientWidth : el.clientHeight);
          const W = node.sizes.reduce((x, y) => x + y, 0);
          const dw = ((cur - last) * W) / total;
          const min = (MIN_PANE * W) / total;
          const sizes = [...node.sizes];
          if (sizes[a] + dw < min || sizes[a + 1] - dw < min) return;
          sizes[a] += dw;
          sizes[a + 1] -= dw;
          last = cur;
          st().setPaneSizes(path, sizes);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      data-testid="pane-divider"
    />
  );
}

function nodeAt(tree: PaneNode, path: number[]): PaneNode | null {
  let n: PaneNode = tree;
  for (const i of path) {
    if ('pane' in n) return null;
    n = n.children[i];
    if (!n) return null;
  }
  return n;
}

/** A pane, or a split of panes side by side or one above the other (each of which may be split again). */
function PaneNodeView({ node, path, style }: { node: PaneNode; path: number[]; style?: CSSProperties }) {
  const panes = useStore((s) => s.panes);
  const ref = useRef<HTMLDivElement>(null);
  if ('pane' in node) {
    const pane = panes.find((p) => p.id === node.pane);
    return pane ? <PaneView pane={pane} index={panes.indexOf(pane)} style={style} /> : null;
  }
  return (
    <div className={`pane-split ${node.dir}`} ref={ref} style={style} data-testid="pane-split" data-dir={node.dir}>
      {node.children.map((c, i) => (
        <Fragment key={'pane' in c ? c.pane : `s${i}`}>
          {i > 0 && <PaneDivider dir={node.dir} path={path} a={i - 1} container={ref} />}
          <PaneNodeView node={c} path={[...path, i]} style={{ flex: `${node.sizes[i] ?? 1} 1 0` }} />
        </Fragment>
      ))}
    </div>
  );
}

/** Panes in the main window, split as often as wanted. */
export function PaneArea() {
  const panes = useStore((s) => s.panes);
  const stored = useStore((s) => s.paneTree);
  const attached = panes.filter((p) => !p.detached);
  // The tree always holds exactly the attached panes.
  const tree = syncTree(stored, attached.map((p) => p.id));
  return <div className="pane-area">{tree && <PaneNodeView node={tree} path={[]} style={{ flex: 1 }} />}</div>;
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
  const sheetName = useStore((s) => sheetDisplayName(findSheet(s, pane.sheetId)?.sheet));
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
