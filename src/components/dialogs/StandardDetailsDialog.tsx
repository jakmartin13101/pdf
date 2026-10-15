import { useMemo, useRef, useState } from 'react';
import { Copy, Download, Hand, Minus, PackagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import type { DetailCondition, DetailItem, DocState, StandardDetail } from '../../types';
import { getState, useStore } from '../../store/store';
import { buildRows, customColId, type Row } from '../../core/columns';
import { normName } from '../../core/formula';
import {
  DETAIL_OPS,
  DETAIL_RULES,
  applyDetailAssignments,
  columnValues,
  conditionColumns,
  describeDetail,
  detailApplies,
  detailMatches,
  detailRows,
  detailUid,
  exampleDetails,
  newDetail,
  newDetailItem,
  parseDetailLength,
  type DetailAssignment,
} from '../../core/details';
import { normalizeSize, plf } from '../../core/steelShapes';
import { fmtLen, fmtNumber, LENGTH_SUFFIX, normalizeLengthText } from '../../core/units';
import { offerFile } from '../../store/files';
import { Modal } from './Modal';

const OTHER = '__other__';

/** Value picker: the values that column holds in this takeoff, or a typed value. */
function ValuePicker({ cond, rows, onChange }: { cond: DetailCondition; rows: Row[]; onChange: (v: string) => void }) {
  const values = useMemo(() => columnValues(rows, cond.column), [rows, cond.column]);
  const known = values.some((v) => v.value === cond.value);
  const [typing, setTyping] = useState(() => !!cond.value && !known);
  if (typing || cond.op === 'contains') {
    return (
      <div className="dd-value">
        <input value={cond.value} placeholder="Type a value" onChange={(e) => onChange(e.target.value)} data-testid="cond-value-text" autoFocus={typing} />
        {cond.op !== 'contains' && values.length > 0 && (
          <button className="icon-btn" title="Pick from the values in this column" onClick={() => setTyping(false)}>
            <X size={12} />
          </button>
        )}
      </div>
    );
  }
  return (
    <select
      value={known ? cond.value : ''}
      onChange={(e) => {
        if (e.target.value === OTHER) setTyping(true);
        else onChange(e.target.value);
      }}
      data-testid="cond-value"
    >
      <option value="" disabled>
        {values.length ? 'Choose a value…' : 'No values yet'}
      </option>
      {values.map((v) => (
        <option key={v.value} value={v.value}>
          {v.value} ({v.count})
        </option>
      ))}
      <option value={OTHER}>Other value…</option>
    </select>
  );
}

function ItemRow({ item, onChange, onRemove, canRemove }: { item: DetailItem; onChange: (patch: Partial<DetailItem>) => void; onRemove: () => void; canRemove: boolean }) {
  const len = parseDetailLength(item.length);
  const sp = item.rule === 'spacing' ? parseDetailLength(item.value) : null;
  const w = plf(item.size);
  return (
    <div className="dd-item" data-testid="detail-item-row">
      <input value={item.subject} placeholder="e.g. Clip Angle" onChange={(e) => onChange({ subject: e.target.value })} data-testid="item-subject" />
      <input
        value={item.size}
        placeholder="e.g. L4X4X3/8"
        onChange={(e) => onChange({ size: e.target.value })}
        onBlur={(e) => onChange({ size: normalizeSize('', e.target.value) })}
        title={w ? `${fmtNumber(w, 2)} lb/ft` : 'Steel sizes (W, HSS, L, PL, Pipe…) give a weight per foot'}
        data-testid="item-size"
      />
      <input
        value={item.rule === 'full' ? '' : item.length}
        disabled={item.rule === 'full'}
        placeholder={item.rule === 'full' ? 'measured' : `e.g. 0'-9"`}
        onChange={(e) => onChange({ length: e.target.value })}
        onBlur={(e) => len && onChange({ length: normalizeLengthText(e.target.value, 'in') })}
        title={len ? fmtLen(len) : 'Length of each piece (bare numbers are inches). Leave blank to count only.'}
        className={item.length.trim() && !len ? 'bad' : ''}
        data-testid="item-length"
      />
      <select value={item.rule} onChange={(e) => onChange({ rule: e.target.value as DetailItem['rule'], value: e.target.value === 'spacing' ? '' : item.rule === 'spacing' ? '1' : item.value })} data-testid="item-rule">
        {DETAIL_RULES.map((r) => (
          <option key={r.id} value={r.id} title={r.hint}>
            {r.label}
          </option>
        ))}
      </select>
      <div className="dd-qty">
        <span className="dd-prefix">{item.rule === 'spacing' ? '@' : '×'}</span>
        <input
          value={item.value}
          placeholder={item.rule === 'spacing' ? `48 or 4'-0"` : '1'}
          onChange={(e) => onChange({ value: e.target.value })}
          onBlur={(e) => sp && onChange({ value: normalizeLengthText(e.target.value, 'in') })}
          title={item.rule === 'spacing' ? (sp ? `${fmtLen(sp)} on center` : 'Spacing on center (bare numbers are inches)') : item.rule === 'full' ? 'Number of runs' : 'Pieces per markup (per counted item on counts)'}
          className={item.rule === 'spacing' && item.value.trim() && !sp ? 'bad' : ''}
          data-testid="item-value"
        />
        <span className="dd-suffix">{item.rule === 'spacing' ? 'OC' : item.rule === 'full' ? 'runs' : 'EA'}</span>
      </div>
      <label className="dd-end" title="Add one piece for the far end (posts at both ends)">
        <input type="checkbox" checked={item.addEnd} disabled={item.rule !== 'spacing'} onChange={(e) => onChange({ addEnd: e.target.checked })} />
        +1
      </label>
      <label className="dd-end" title="Galvanized: the material's Finish is Galvanize">
        <input type="checkbox" checked={!!item.galv} onChange={(e) => onChange({ galv: e.target.checked || undefined })} data-testid="item-galv" />
        Galv
      </label>
      <button className="icon-btn" title="Remove this material" disabled={!canRemove} onClick={onRemove}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function Preview({ detail, doc, rows }: { detail: StandardDetail; doc: DocState; rows: Row[] }) {
  const s = doc.settings;
  const weightCol = doc.columns.find((c) => (c.kind === 'formula' || c.kind === 'number') && /weight/i.test(c.name));
  const lines = useMemo(() => {
    const out = detailRows({ ...doc, standardDetails: [{ ...detail, enabled: true }] }, rows);
    return detail.items.map((it) => {
      const mine = out.filter((r) => r.detail?.itemId === it.id);
      return {
        item: it,
        key: mine[0]?.detail?.summaryKey ?? (it.subject || it.size || 'Material'),
        pieces: mine.reduce((n, r) => n + (Number(r.values.count) || 0), 0),
        length: mine.reduce((n, r) => n + (Number(r.values.length) || 0), 0),
        weight: weightCol ? mine.reduce((n, r) => n + (Number(r.values[customColId(weightCol)]) || 0), 0) : 0,
        warnings: mine.filter((r) => r.detail?.warning).length,
      };
    });
  }, [detail, doc, rows, weightCol]);
  return (
    <table className="grid dd-preview" data-testid="detail-preview">
      <thead>
        <tr>
          <th>Material added</th>
          <th className="num">Pieces</th>
          <th className="num">Length ({LENGTH_SUFFIX[s.lengthUnit]})</th>
          {weightCol && <th className="num">{weightCol.name}</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.item.id}>
            <td>
              {l.key}
              {l.warnings > 0 && <span className="dd-warn"> ⚠ {l.warnings} markup{l.warnings === 1 ? '' : 's'} can't use this rule</span>}
            </td>
            <td className="num">{fmtNumber(l.pieces, l.pieces % 1 ? 2 : 0)}</td>
            <td className="num">{l.length ? fmtNumber(l.length, s.decimals) : ''}</td>
            {weightCol && <td className="num">{l.weight ? `${fmtNumber(l.weight, weightCol.decimals ?? 0)}${weightCol.suffix ? ` ${weightCol.suffix}` : ''}` : ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Condition for a markup: its Member Size when it has one, else its Subject. */
function conditionOf(doc: DocState, markupId: string): DetailCondition | null {
  const m = doc.markups.find((x) => x.id === markupId);
  if (!m) return null;
  const size = doc.columns.find((c) => normName(c.name) === 'membersize');
  const v = size ? String(m.custom[size.id] ?? '').trim() : '';
  return v ? { column: customColId(size!), op: 'eq', value: v } : { column: 'subject', op: 'eq', value: m.subject };
}

/**
 * A new detail for some markups: added to them by hand. Its IF rule is filled in from the markups
 * (their shared Member Size or Subject), so switching on "Apply automatically" covers the rest.
 */
function detailForMarkups(doc: DocState, ids: string[]): StandardDetail {
  const conds = ids.map((id) => conditionOf(doc, id)).filter((c): c is DetailCondition => !!c);
  const same = conds.length > 0 && conds.every((c) => c.column === conds[0].column && c.value === conds[0].value);
  const name = same && conds[0].value ? `${conds[0].value} detail` : `Detail for ${ids.length} markups`;
  return newDetail({ name, auto: false, ...(conds[0] ? { conditions: [conds[0]] } : {}) });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function StandardDetailsDialog({ detailId, newForMarkupId, newForMarkupIds }: { detailId?: string; newForMarkupId?: string; newForMarkupIds?: string[] }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const st = getState();
  const baseRows = useMemo(() => buildRows(doc), [doc]);
  const columns = useMemo(() => conditionColumns(doc), [doc]);
  const catCol = doc.columns.find((c) => normName(c.name) === 'category');
  const saved = doc.standardDetails ?? [];
  const [start] = useState(() => {
    const ids = (newForMarkupIds ?? (newForMarkupId ? [newForMarkupId] : [])).filter((id) => doc.markups.some((m) => m.id === id));
    const list = structuredClone(saved);
    const pending: DetailAssignment[] = [];
    if (ids.length) {
      const d = detailForMarkups(doc, ids);
      list.push(d);
      pending.push({ detailId: d.id, markupIds: ids, on: true });
    }
    return { list, pending, selId: (ids.length ? list[list.length - 1]?.id : detailId ?? list[0]?.id) ?? null };
  });
  const [draft, setDraft] = useState<StandardDetail[]>(start.list);
  // Details added to / taken off markups by hand in this dialog; applied on Save.
  const [pending, setPending] = useState<DetailAssignment[]>(start.pending);
  const [selId, setSelId] = useState<string | null>(start.selId);
  const fileRef = useRef<HTMLInputElement>(null);
  const sel = draft.find((d) => d.id === selId) ?? null;
  const dirty = pending.length > 0 || JSON.stringify(draft) !== JSON.stringify(saved);

  // The takeoff as it will be after Save: markups carry the pending by-hand changes.
  const rows = useMemo(() => {
    if (!pending.length) return baseRows;
    const next = applyDetailAssignments({ ...doc, standardDetails: draft }, pending);
    const byId = new Map(next.markups.map((m) => [m.id, m]));
    return baseRows.map((r) => ({ ...r, markup: byId.get(r.markup.id) ?? r.markup }));
  }, [baseRows, doc, draft, pending]);
  const previewDoc = useMemo(() => (pending.length ? { ...doc, markups: rows.map((r) => r.markup) } : doc), [doc, rows, pending.length]);

  const update = (id: string, fn: (d: StandardDetail) => StandardDetail) => setDraft((all) => all.map((d) => (d.id === id ? fn(d) : d)));
  const patch = (p: Partial<StandardDetail>) => sel && update(sel.id, (d) => ({ ...d, ...p }));
  const setCond = (i: number, p: Partial<DetailCondition>) => sel && patch({ conditions: sel.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const setItem = (id: string, p: Partial<DetailItem>) => sel && patch({ items: sel.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  /** Markups a detail applies to: by its rule, and by hand only. */
  const coverage = (d: StandardDetail, among: Row[] = rows) => {
    const on = { ...d, enabled: true };
    let rule = 0;
    let hand = 0;
    for (const r of among) {
      if (!detailApplies(r, on)) continue;
      if (detailMatches(r, on)) rule++;
      else hand++;
    }
    return { rule, hand, total: rule + hand };
  };
  const selectedRows = useMemo(() => {
    const ids = new Set(selection);
    return rows.filter((r) => ids.has(r.markup.id));
  }, [rows, selection]);
  const assign = (on: boolean) => {
    if (!sel || !selectedRows.length) return;
    setPending((p) => [...p, { detailId: sel.id, markupIds: selectedRows.map((r) => r.markup.id), on }]);
  };

  const add = (d: StandardDetail) => {
    setDraft((all) => [...all, d]);
    setSelId(d.id);
  };
  const remove = (id: string) => {
    const i = draft.findIndex((d) => d.id === id);
    const next = draft.filter((d) => d.id !== id);
    setDraft(next);
    setSelId(next[Math.min(i, next.length - 1)]?.id ?? null);
  };

  const close = () => {
    if (dirty && !window.confirm('Discard your changes to the standard details?')) return;
    st.setDialog(null);
  };
  const save = () => {
    const clean = draft.map((d) => ({ ...d, name: d.name.trim() || 'Standard Detail', conditions: d.conditions.filter((c) => c.column) }));
    st.setStandardDetails(clean, pending);
    st.toast(`Saved ${plural(clean.length, 'standard detail')}`, 'success');
    st.setDialog(null);
  };

  const exportJson = () => {
    const names = Object.fromEntries(columns.map((c) => [c.id, c.name]));
    const payload = { app: 'takeoff-studio', kind: 'standard-details', version: 1, columns: names, details: draft };
    void offerFile(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'standard-details.json', 'Standard details');
  };
  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: StandardDetail[] = Array.isArray(data) ? data : data.details;
      if (!Array.isArray(list)) throw new Error('No standard details in this file');
      const names: Record<string, string> = data.columns ?? {};
      // Custom column ids differ between projects: match by column name when the id is unknown here.
      const resolve = (id: string) => (columns.some((c) => c.id === id) ? id : columns.find((c) => normName(c.name) === normName(names[id] ?? ''))?.id ?? id);
      const imported = list.map((d) => ({
        ...newDetail(),
        ...d,
        id: detailUid('sd'),
        conditions: (d.conditions ?? []).map((c) => ({ ...c, column: resolve(c.column) })),
        items: (d.items ?? []).map((it) => ({ ...newDetailItem(), ...it, id: detailUid('di') })),
      }));
      setDraft((all) => [...all, ...imported]);
      if (imported[0]) setSelId(imported[0].id);
      st.toast(`Imported ${imported.length} standard detail${imported.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      st.toast(`Could not import: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Modal
      title="Standard Details"
      icon={<PackagePlus size={16} />}
      size="wide"
      onClose={close}
      footer={
        <>
          <div className="left hint">Material is added to every markup that matches or that it was added to by hand, and updates as the takeoff changes.</div>
          <button className="btn" onClick={() => st.setDialog(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} data-testid="details-save">
            Save
          </button>
        </>
      }
    >
      <div className="details-dialog">
        <div className="dd-list">
          <div className="dd-list-head">
            <button className="btn sm" onClick={() => add(newDetail())} data-testid="detail-new">
              <Plus size={13} /> New
            </button>
            <button className="icon-btn" title="Import standard details (.json)" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
            </button>
            <button className="icon-btn" title="Export standard details (.json)" disabled={!draft.length} onClick={exportJson}>
              <Download size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importJson(f);
              }}
            />
          </div>
          {draft.map((d) => {
            const c = coverage(d);
            const tip = [d.auto === false ? 'Added by hand only' : `${plural(c.rule, 'markup')} by rule`, c.hand ? `${c.hand} by hand` : ''].filter(Boolean).join(', ');
            return (
              <div key={d.id} className={`dd-entry${d.id === selId ? ' on' : ''}${d.enabled ? '' : ' off'}`} onClick={() => setSelId(d.id)} data-testid="detail-entry">
                <input type="checkbox" checked={d.enabled} title={d.enabled ? 'On – click to turn off' : 'Off – click to turn on'} onClick={(e) => e.stopPropagation()} onChange={(e) => update(d.id, (x) => ({ ...x, enabled: e.target.checked }))} />
                <span className="grow">{d.name || 'Untitled'}</span>
                {d.auto === false && <Hand size={12} className="dd-hand" aria-label="By hand" />}
                <small title={tip}>{c.total}</small>
              </div>
            );
          })}
          {!draft.length && (
            <div className="hint" style={{ padding: 8 }}>
              No standard details yet. A standard detail adds material wherever the takeoff matches, e.g. two clip angles at every W24 beam, or handrail posts every 4'-0".
              <button
                className="btn sm"
                style={{ marginTop: 8 }}
                onClick={() => {
                  const ex = exampleDetails(doc);
                  setDraft(ex);
                  setSelId(ex[0].id);
                }}
                data-testid="detail-examples"
              >
                Add Example Details
              </button>
            </div>
          )}
        </div>

        {sel ? (
          <div className="dd-editor">
            <div className="field-row">
              <input className="dd-name" value={sel.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Detail name" data-testid="detail-name" />
              <button className="icon-btn narrow" title="Duplicate" onClick={() => add({ ...structuredClone(sel), id: detailUid('sd'), name: `${sel.name} copy`, items: sel.items.map((it) => ({ ...it, id: detailUid('di') })) })}>
                <Copy size={14} />
              </button>
              <button className="icon-btn narrow" title="Delete this detail" onClick={() => remove(sel.id)} data-testid="detail-delete">
                <Trash2 size={14} />
              </button>
            </div>

            <div className={`dd-section${sel.auto === false ? ' dd-dim' : ''}`}>
              <h4 className="dd-head">
                <span>
                  <span className="dd-kw">IF</span> the markup's
                </span>
                <label className="dd-auto" title="Off: the rule is not used – the detail goes only on the markups you add it to by hand">
                  <input type="checkbox" checked={sel.auto !== false} onChange={(e) => patch({ auto: e.target.checked ? undefined : false })} data-testid="detail-auto" />
                  Apply automatically
                </label>
              </h4>
              {sel.conditions.map((c, i) => (
                <div className="dd-cond" key={i} data-testid="detail-condition">
                  {i > 0 && <span className="dd-and">AND</span>}
                  <select value={c.column} onChange={(e) => setCond(i, { column: e.target.value, value: '' })} data-testid="cond-column">
                    {columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value as DetailCondition['op'] })} className="dd-op" data-testid="cond-op">
                    {DETAIL_OPS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ValuePicker key={`${c.column}:${c.op}`} cond={c} rows={baseRows} onChange={(value) => setCond(i, { value })} />
                  <button className="icon-btn" title="Remove condition" disabled={sel.conditions.length < 2} onClick={() => patch({ conditions: sel.conditions.filter((_, j) => j !== i) })}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="field-row" style={{ justifyContent: 'space-between' }}>
                <button className="btn sm narrow" onClick={() => patch({ conditions: [...sel.conditions, { column: 'subject', op: 'eq', value: '' }] })}>
                  <Plus size={12} /> AND condition
                </button>
                <span className="hint narrow" data-testid="detail-matches">
                  {(() => {
                    const c = coverage(sel);
                    const byRule = sel.auto === false ? 'Rule not used' : `Matches ${plural(c.rule, 'markup')}`;
                    return c.hand ? `${byRule} + ${c.hand} added by hand` : byRule;
                  })()}
                </span>
              </div>
            </div>

            <div className="dd-section" data-testid="detail-by-hand">
              <h4>
                <span className="dd-kw">
                  <Hand size={11} />
                </span>
                By hand – the selected markups
              </h4>
              {selectedRows.length ? (
                <div className="field-row dd-hand-row">
                  <span className="grow" data-testid="detail-selected">
                    {(() => {
                      const c = coverage(sel, selectedRows);
                      return `${plural(selectedRows.length, 'markup')} selected – ${c.total === selectedRows.length ? (c.total === 1 ? 'it has' : 'all have') : `${c.total} ${c.total === 1 ? 'has' : 'have'}`} this detail`;
                    })()}
                  </span>
                  <button className="btn sm narrow" onClick={() => assign(true)} data-testid="detail-add-selected">
                    <Plus size={12} /> Add to Selected
                  </button>
                  <button className="btn sm narrow" onClick={() => assign(false)} data-testid="detail-remove-selected">
                    <Minus size={12} /> Take off Selected
                  </button>
                </div>
              ) : (
                <div className="hint">Select markups in the drawing or the Markups List (Ctrl+click or drag a box for several), then right-click them → Standard Details, or open this dialog to add a detail to them by hand.</div>
              )}
            </div>

            <div className="dd-section">
              <h4>
                <span className="dd-kw">ADD</span> material
              </h4>
              <div className="dd-item dd-item-head">
                <span>Subject</span>
                <span>Size</span>
                <span>Length (each)</span>
                <span>Quantity by</span>
                <span>Spacing / qty</span>
                <span />
                <span title="Galvanized: the Finish is Galvanize">Finish</span>
                <span />
              </div>
              {sel.items.map((it) => (
                <ItemRow key={it.id} item={it} onChange={(p) => setItem(it.id, p)} onRemove={() => patch({ items: sel.items.filter((x) => x.id !== it.id) })} canRemove={sel.items.length > 1} />
              ))}
              <div className="field-row">
                <button className="btn sm narrow" onClick={() => patch({ items: [...sel.items, newDetailItem()] })} data-testid="add-item">
                  <Plus size={12} /> Material
                </button>
                {catCol && (
                  <label className="inline narrow">
                    Category
                    <select value={sel.category} onChange={(e) => patch({ category: e.target.value })} data-testid="detail-category">
                      <option value="">Same as the markup</option>
                      {(catCol.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                      {sel.category && !(catCol.options ?? []).includes(sel.category) && <option>{sel.category}</option>}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="dd-formula" data-testid="detail-formula">
              {describeDetail(sel, doc)}
            </div>
            <Preview detail={sel} doc={previewDoc} rows={rows} />
          </div>
        ) : (
          <div className="dd-editor empty-note">Create a standard detail, or add the examples to start from.</div>
        )}
      </div>
    </Modal>
  );
}
