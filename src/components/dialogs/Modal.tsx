import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Where each window was moved to (by title), so it opens there again this session. */
const placed = new Map<string, { x: number; y: number }>();

/** Keep at least the title bar on the screen. */
function clampPos(x: number, y: number, w: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 80 - w), window.innerWidth - 80),
    y: Math.min(Math.max(y, 0), window.innerHeight - 40),
  };
}

/**
 * A program window (dialog). It does not dim or block the program behind it: drag its title bar to
 * move it out of the way, and the drawing and panels behind it keep working.
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  size,
  icon,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'wide' | 'xwide' | 'mid';
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => placed.get(title) ?? null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // A window moved earlier stays on the screen when the program window got smaller.
  useEffect(() => {
    if (!pos || !ref.current) return;
    const c = clampPos(pos.x, pos.y, ref.current.offsetWidth);
    if (c.x !== pos.x || c.y !== pos.y) setPos(c);
  }, [pos]);

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    el.classList.add('moving');
    const move = (ev: PointerEvent) => {
      last = clampPos(ev.clientX - dx, ev.clientY - dy, r.width);
      setPos(last);
    };
    const up = () => {
      el.classList.remove('moving');
      placed.set(title, last);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={`modal-back${pos ? ' placed' : ''}`}>
      <div
        ref={ref}
        className={`modal ${size ?? ''}`}
        role="dialog"
        aria-label={title}
        data-testid="modal"
        style={pos ? { left: pos.x, top: pos.y } : undefined}
      >
        <div className="modal-head" onPointerDown={startMove} onDoubleClick={() => (placed.delete(title), setPos(null))} title="Drag to move · double-click to centre">
          {icon}
          <span className="title">{title}</span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
