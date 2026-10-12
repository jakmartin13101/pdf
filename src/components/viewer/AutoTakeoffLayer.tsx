// Preview of the members found by the automatic takeoff: each member line in its size's colour with
// the label it was read from boxed. Click a member to leave it out (or put it back).
import { autoIncluded, getState, type AutoMember, type AutoTakeoffState } from '../../store/store';
import { sizeColor } from '../../core/autoTakeoff';

export function AutoTakeoffLayer({ members, state, zoom, clickable }: { members: AutoMember[]; state: AutoTakeoffState; zoom: number; clickable: boolean }) {
  const toggle = (id: string) => {
    const a = getState().autoTakeoff;
    if (!a) return;
    getState().setAutoTakeoff({ ...a, excluded: a.excluded.includes(id) ? a.excluded.filter((x) => x !== id) : [...a.excluded, id] });
  };
  return (
    <g className="auto-takeoff" pointerEvents={clickable ? undefined : 'none'}>
      {members.map((m) => {
        const on = autoIncluded(state, m);
        const color = on ? sizeColor(m.size) : '#8a8f98';
        const b = m.labelBox;
        const pad = 2 / zoom;
        return (
          <g key={m.id} data-testid="auto-member" data-included={on ? 'yes' : 'no'} data-size={m.size}>
            <line
              x1={m.p1.x}
              y1={m.p1.y}
              x2={m.p2.x}
              y2={m.p2.y}
              stroke={color}
              strokeOpacity={on ? 0.55 : 0.6}
              strokeWidth={Math.max(m.width + 4 / zoom, 6 / zoom)}
              strokeDasharray={on ? undefined : `${6 / zoom} ${4 / zoom}`}
              strokeLinecap="butt"
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
          </g>
        );
      })}
    </g>
  );
}
