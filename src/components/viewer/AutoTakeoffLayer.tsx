// Preview of the members found by the automatic takeoff: each member drawn with the line it will get
// (Settings → Auto Takeoff line styles) and the label it was read from boxed. Click a member to leave it
// out (or put it back); drag the square at either end to fine-adjust it.
import { useMemo, useRef } from 'react';
import type { Pt, Sheet } from '../../types';
import { autoIncluded, getState, useStore, type AutoMember, type AutoTakeoffState } from '../../store/store';
import { autoLook } from '../../core/autoStyles';
import { dashArray } from '../../core/shapes';
import { projectOnLine } from '../../core/geometry';
import { querySnap, snapIndex, type SnapIndex } from '../../core/pdf';

/** Page point under the pointer (the SVG's viewBox is in page points). */
function toPage(el: SVGElement, clientX: number, clientY: number): Pt | null {
  const svg = el.ownerSVGElement;
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function AutoTakeoffLayer({ members, state, zoom, clickable, sheet }: { members: AutoMember[]; state: AutoTakeoffState; zoom: number; clickable: boolean; sheet: Sheet }) {
  const chest = useStore((s) => s.toolChest);
  const prefs = useStore((s) => s.prefs);
  const snap = useRef<SnapIndex | null>(null);
  const looks = useMemo(() => {
    const out = new Map<string, ReturnType<typeof autoLook>>();
    for (const m of members) if (!out.has(m.size)) out.set(m.size, autoLook(chest, prefs, m.size));
    return out;
  }, [members, chest, prefs]);

  const update = (id: string, fn: (m: AutoMember) => AutoMember, focus = true) => {
    const a = getState().autoTakeoff;
    if (!a) return;
    getState().setAutoTakeoff({ ...a, members: a.members.map((m) => (m.id === id ? fn(m) : m)), ...(focus ? { focusId: id } : {}) });
  };
  const toggle = (id: string) => {
    const a = getState().autoTakeoff;
    if (!a) return;
    getState().setAutoTakeoff({ ...a, excluded: a.excluded.includes(id) ? a.excluded.filter((x) => x !== id) : [...a.excluded, id] });
  };

  /** Drag one end: along the member (snapping to the drawing), or anywhere with Alt. */
  const startDrag = (e: React.PointerEvent<SVGRectElement>, m: AutoMember, end: 'p1' | 'p2') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    void snapIndex(sheet.fileId, sheet.pageIndex).then((idx) => (snap.current = idx));
    const fixed = end === 'p1' ? m.p2 : m.p1;
    const along = end === 'p1' ? m.p1 : m.p2;
    const orig = m.orig ?? { p1: m.p1, p2: m.p2 };
    const move = (ev: PointerEvent) => {
      let p = toPage(el, ev.clientX, ev.clientY);
      if (!p) return;
      const s = !ev.ctrlKey && prefs.snapContent && snap.current ? querySnap(snap.current, p, 10 / zoom) : null;
      if (s) p = s.pt;
      if (!ev.altKey) p = projectOnLine(p, fixed, along);
      // Keep the member at least a point long and pointing the same way.
      if (Math.hypot(p.x - fixed.x, p.y - fixed.y) < 1) return;
      if (!ev.altKey && (p.x - fixed.x) * (along.x - fixed.x) + (p.y - fixed.y) * (along.y - fixed.y) <= 0) return;
      const pt = p;
      update(m.id, (x) => ({ ...x, [end]: pt, orig }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    update(m.id, (x) => x);
  };

  const hs = 8 / zoom;
  return (
    <g className="auto-takeoff" pointerEvents={clickable ? undefined : 'none'}>
      {members.map((m) => {
        const on = autoIncluded(state, m);
        const style = looks.get(m.size)?.style;
        const color = on ? style?.color ?? '#1aa34a' : '#8a8f98';
        const focused = state.focusId === m.id;
        const lw = Math.max((style?.lineWidth ?? 3) + 1.5 / zoom, 4 / zoom);
        const dash = on && style ? dashArray({ ...style, lineWidth: lw }) : [6 / zoom, 4 / zoom];
        const b = m.labelBox;
        const pad = 2 / zoom;
        return (
          <g key={m.id} data-testid="auto-member" data-included={on ? 'yes' : 'no'} data-size={m.size} data-focused={focused ? 'yes' : undefined}>
            {focused && <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke="#ffb300" strokeOpacity={0.45} strokeWidth={lw + 8 / zoom} strokeLinecap="round" />}
            <line
              x1={m.p1.x}
              y1={m.p1.y}
              x2={m.p2.x}
              y2={m.p2.y}
              stroke={color}
              strokeOpacity={on ? Math.min(0.85, style?.opacity ?? 1) : 0.6}
              strokeWidth={lw}
              strokeDasharray={dash?.join(' ')}
              strokeLinecap="butt"
              data-testid="auto-member-line"
            />
            <rect x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} rx={3 / zoom} fill="none" stroke={color} strokeWidth={1.2 / zoom} />
            {clickable && (
              <line
                x1={m.p1.x}
                y1={m.p1.y}
                x2={m.p2.x}
                y2={m.p2.y}
                stroke="transparent"
                strokeWidth={14 / zoom}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  toggle(m.id);
                }}
              >
                <title>
                  {m.size}
                  {on ? ' – click to leave out' : ' – left out, click to include'}
                </title>
              </line>
            )}
            {clickable &&
              on &&
              (['p1', 'p2'] as const).map((end, i) => {
                const kind = m.orig ? 'end' : m.ends?.[i] ?? 'end';
                return (
                  <rect
                    key={end}
                    x={m[end].x - hs / 2}
                    y={m[end].y - hs / 2}
                    width={hs}
                    height={hs}
                    className={`auto-handle ${kind}`}
                    stroke={color}
                    strokeWidth={1.5 / zoom}
                    onPointerDown={(e) => startDrag(e, m, end)}
                    data-testid={`auto-handle-${end}`}
                    data-end={kind}
                  >
                    <title>
                      {kind === 'midpoint' ? 'Estimated end: halfway between two labels (no column found). ' : kind === 'column' ? 'Stops at a column. ' : ''}
                      Drag to adjust this end (snaps to the drawing; Alt: move freely, Ctrl: no snapping)
                    </title>
                  </rect>
                );
              })}
          </g>
        );
      })}
    </g>
  );
}
