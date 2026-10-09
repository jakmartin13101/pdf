import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { useOwnerWindow } from './ownerWindow';

export interface MenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  sep?: boolean;
  children?: MenuItem[];
}

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="menu-list" role="menu">
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            className={`menu-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}${open === i ? ' open' : ''}`}
            onMouseEnter={() => setOpen(it.children ? i : null)}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled || it.children) return;
              onClose();
              it.onClick?.();
            }}
          >
            <span className="menu-check">{it.checked ? <Check size={13} /> : null}</span>
            <span className="menu-label">{it.label}</span>
            {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
            {it.children && <ChevronRight size={13} className="menu-arrow" />}
            {it.children && open === i && (
              <div className="submenu">
                <MenuList items={it.children} onClose={onClose} />
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/** Floating context menu at client coordinates, rendered in a portal. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  // Menus open in the window they were invoked from (detached panes have their own window).
  const win = useOwnerWindow();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, win.innerWidth - r.width - 6), y: Math.min(y, win.innerHeight - r.height - 6) });
  }, [x, y, win]);
  useEffect(() => {
    const close = (e: Event) => {
      // No instanceof Node: events from another window come from another realm.
      if (ref.current && e.target && ref.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    win.addEventListener('pointerdown', close, true);
    win.addEventListener('keydown', onKey);
    win.addEventListener('blur', onClose);
    return () => {
      win.removeEventListener('pointerdown', close, true);
      win.removeEventListener('keydown', onKey);
      win.removeEventListener('blur', onClose);
    };
  }, [onClose, win]);
  return createPortal(
    // React portals bubble synthetic events to their React parents (e.g. the viewer), so stop them here.
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuList items={items} onClose={onClose} />
    </div>,
    win.document.body,
  );
}
