// Add Detail (right-click on one or more selected markups): tick the standard details to put on the
// selection – or take off – with a preview of the material added, or start a new detail for them.
import { useMemo, useState } from 'react';
import { PackagePlus, Plus } from 'lucide-react';
import type { StandardDetail } from '../../types';
import { getState, useStore } from '../../store/store';
import { buildRows, customColId } from '../../core/columns';
import { applyDetailAssignments, describeDetail, detailApplies, detailMatches, detailRows, exampleDetails, type DetailAssignment } from '../../core/details';
import { fmtNumber, LENGTH_SUFFIX } from '../../core/units';
import { Modal } from './Modal';

type Want = 'all' | 'none' | 'keep';

export function AddDetailDialog({ markupIds }: { markupIds: string[] }) {
  const doc = useStore((s) => s.doc);
  const st = getState();
  const ids = useMemo(() => new Set(markupIds), [markupIds]);
  const items = useMemo(() => doc.markups.filter((m) => ids.has(m.id)), [doc.markups, ids]);
  const rows = useMemo(() => buildRows(doc, items), [doc, items]);
  const details = doc.standardDetails ?? [];
  // What the user wants per detail: on all the selected markups, on none, or as it is now.
  const [want, setWant] = useState<Record<string, Want>>({});

  const coverage = (d: StandardDetail, among = rows) => among.filter((r) => detailApplies(r, { ...d, enabled: true })).length;
  const assignments: DetailAssignment[] = details.flatMap((d) => {
    const w = want[d.id] ?? 'keep';
    if (w === 'keep') return [];
    return [{ detailId: d.id, markupIds: items.map((m) => m.id), on: w === 'all' }];
  });
  // Details switched off are switched on when they are added by hand here.
  const turnOn = new Set(details.filter((d) => !d.enabled && want[d.id] === 'all').map((d) => d.id));

  const after = useMemo(() => {
    const next = applyDetailAssignments({ ...doc, standardDetails: details.map((d) => (turnOn.has(d.id) ? { ...d, enabled: true } : d)) }, assignments);
    const nextRows = buildRows(next, next.markups.filter((m) => ids.has(m.id)));
    return { doc: next, rows: nextRows, material: detailRows(next, nextRows) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, want]);

  const weightCol = doc.columns.find((c) => (c.kind === 'formula' || c.kind === 'number') && /weight/i.test(c.name));
  const lines = useMemo(() => {
    const by = new Map<string, { key: string; detail: string; pieces: number; length: number; weight: number; warn: number }>();
    for (const r of after.material) {
      const key = r.detail?.summaryKey ?? r.markup.subject;
      const cur = by.get(key) ?? { key, detail: r.detail?.detailName ?? '', pieces: 0, length: 0, weight: 0, warn: 0 };
      cur.pieces += Number(r.values.count) || 0;
      cur.length += Number(r.values.length) || 0;
      if (weightCol) cur.weight += Number(r.values[customColId(weightCol)]) || 0;
      if (r.detail?.warning) cur.warn++;
      by.set(key, cur);
    }
    return [...by.values()];
  }, [after.material, weightCol]);

  const n = items.length;
  const subjects = [...new Set(items.map((m) => m.subject || m.label).filter(Boolean))];
  const close = () => st.setDialog(null);
  const apply = () => {
    if (!assignments.length) return close();
    st.setStandardDetails(
      details.map((d) => (turnOn.has(d.id) ? { ...d, enabled: true } : d)),
      assignments,
    );
    const added = assignments.filter((a) => a.on).length;
    const off = assignments.length - added;
    st.toast([added && `Added ${added} detail${added === 1 ? '' : 's'}`, off && `took off ${off}`].filter(Boolean).join(', ') + ` – ${n} markup${n === 1 ? '' : 's'}`, 'success');
    close();
  };
  const s = doc.settings;

  return (
    <Modal
      title={`Add Detail – ${n} markup${n === 1 ? '' : 's'}`}
      icon={<PackagePlus size={16} />}
      size="mid"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => st.setDialog({ kind: 'details', newForMarkupIds: items.map((m) => m.id) })} data-testid="add-detail-new">
            <Plus size={13} /> New Detail for {n === 1 ? 'This' : `These ${n}`}…
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply} disabled={!assignments.length} data-testid="add-detail-apply">
            Apply
          </button>
        </>
      }
    >
      <div className="hint">
        {subjects.slice(0, 4).join(', ')}
        {subjects.length > 4 ? ` and ${subjects.length - 4} more` : ''}. Tick a detail to add it to {n === 1 ? 'this markup' : `all ${n}`}, untick it to take it off.
      </div>
      {details.length ? (
        <div className="ad-list" data-testid="add-detail-list">
          {details.map((d) => {
            const now = coverage(d);
            const w = want[d.id] ?? 'keep';
            const checked = w === 'all' || (w === 'keep' && now === n);
            const partial = w === 'keep' && now > 0 && now < n;
            const byRule = rows.filter((r) => d.auto !== false && detailMatches(r, { ...d, enabled: true })).length;
            return (
              <label key={d.id} className={`ad-item${d.enabled ? '' : ' off'}`} data-testid="add-detail-item">
                <input
                  type="checkbox"
                  checked={checked}
                  ref={(el) => {
                    if (el) el.indeterminate = partial;
                  }}
                  onChange={() => setWant({ ...want, [d.id]: checked ? 'none' : 'all' })}
                />
                <span className="ad-main">
                  <b>{d.name || 'Untitled'}</b>
                  <small className="ad-formula">{describeDetail(d, doc)}</small>
                </span>
                <small className="ad-state">
                  {w !== 'keep' ? (w === 'all' ? 'will add' : 'will take off') : now ? (now === n ? 'on all' : `on ${now} of ${n}`) : ''}
                  {w === 'keep' && byRule ? ` · ${byRule} by rule` : ''}
                  {!d.enabled ? ' · switched off' : ''}
                </small>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="empty-note">
          No standard details yet.
          <div className="field-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="btn sm narrow" onClick={() => st.setDialog({ kind: 'details', newForMarkupIds: items.map((m) => m.id) })}>
              <Plus size={12} /> New Detail for {n === 1 ? 'This' : `These ${n}`}…
            </button>
            <button className="btn sm narrow" onClick={() => st.setStandardDetails(exampleDetails(doc))}>
              Add Example Details
            </button>
          </div>
        </div>
      )}
      <table className="grid dd-preview" data-testid="add-detail-preview">
        <thead>
          <tr>
            <th>Material on the selection</th>
            <th className="num">Pieces</th>
            <th className="num">Length ({LENGTH_SUFFIX[s.lengthUnit]})</th>
            {weightCol && <th className="num">{weightCol.name}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>
                {l.key}
                <small className="hint"> · {l.detail}</small>
                {l.warn > 0 && <span className="dd-warn"> ⚠ {l.warn}</span>}
              </td>
              <td className="num">{fmtNumber(l.pieces, l.pieces % 1 ? 2 : 0)}</td>
              <td className="num">{l.length ? fmtNumber(l.length, s.decimals) : ''}</td>
              {weightCol && <td className="num">{l.weight ? `${fmtNumber(l.weight, weightCol.decimals ?? 0)}${weightCol.suffix ? ` ${weightCol.suffix}` : ''}` : ''}</td>}
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={weightCol ? 4 : 3} className="hint">
                No material from standard details on the selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Modal>
  );
}
