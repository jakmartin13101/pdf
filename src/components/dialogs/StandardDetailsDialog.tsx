import { useMemo, useRef, useState } from 'react';
import { Copy, Download, PackagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import type { DetailCondition, DetailItem, DocState, StandardDetail } from '../../types';
import { getState, useStore } from '../../store/store';
import { buildRows, customColId, type Row } from '../../core/columns';
import { normName } from '../../core/formula';
import {
  DETAIL_OPS,
  DETAIL_RULES,
  columnValues,
  conditionColumns,
  describeDetail,
  detailMatches,
  detailRows,
  detailUid,
  exampleDetails,
  newDetail,
  newDetailItem,
  parseDetailLength,
} from '../../core/details';
import { normalizeSize, plf } from '../../core/steelShapes';
import { fmtNumber, formatLength, LENGTH_SUFFIX } from '../../core/units';
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
        placeholder="e.g. L4x4x3/8"
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
        title={len ? formatLength(len, 'ft-in', 16) : 'Length of each piece (bare numbers are inches). Leave blank to count only.'}
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
          title={item.rule === 'spacing' ? (sp ? `${formatLength(sp, 'ft-in', 16)} on center` : 'Spacing on center (bare numbers are inches)') : item.rule === 'full' ? 'Number of runs' : 'Pieces per markup (per counted item on counts)'}
          className={item.rule === 'spacing' && item.value.trim() && !sp ? 'bad' : ''}
          data-testid="item-value"
        />
        <span className="dd-suffix">{item.rule === 'spacing' ? 'OC' : item.rule === 'full' ? 'runs' : 'EA'}</span>
      </div>
      <label className="dd-end" title="Add one piece for the far end (posts at both ends)">
        <input type="checkbox" checked={item.addEnd} disabled={item.rule !== 'spacing'} onChange={(e) => onChange({ addEnd: e.target.checked })} />
        +1
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

/** Condition for a new detail made from a markup: its Member Size when it has one, else its Subject. */
function conditionFor(doc: DocState, markupId?: string): DetailCondition | null {
  const m = markupId ? doc.markups.find((x) => x.id === markupId) : undefined;
  if (!m) return null;
  const size = doc.columns.find((c) => normName(c.name) === 'membersize');
  const v = size ? String(m.custom[size.id] ?? '').trim() : '';
  return v ? { column: customColId(size!), op: 'eq', value: v } : { column: 'subject', op: 'eq', value: m.subject };
}

export function StandardDetailsDialog({ detailId, newForMarkupId }: { detailId?: string; newForMarkupId?: string }) {
  const doc = useStore((s) => s.doc);
  const st = getState();
  const rows = useMemo(() => buildRows(doc), [doc]);
  const columns = useMemo(() => conditionColumns(doc), [doc]);
  const catCol = doc.columns.find((c) => normName(c.name) === 'category');
  const saved = doc.standardDetails ?? [];
  const [draft, setDraft] = useState<StandardDetail[]>(() => {
    const list = structuredClone(saved);
    const cond = conditionFor(doc, newForMarkupId);
    if (cond) list.push(newDetail({ name: `${cond.value} detail`, conditions: [cond] }));
    return list;
  });
  const [selId, setSelId] = useState<string | null>(() => (newForMarkupId ? draft[draft.length - 1]?.id : detailId ?? draft[0]?.id) ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sel = draft.find((d) => d.id === selId) ?? null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const update = (id: string, fn: (d: StandardDetail) => StandardDetail) => setDraft((all) => all.map((d) => (d.id === id ? fn(d) : d)));
  const patch = (p: Partial<StandardDetail>) => sel && update(sel.id, (d) => ({ ...d, ...p }));
  const setCond = (i: number, p: Partial<DetailCondition>) => sel && patch({ conditions: sel.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const setItem = (id: string, p: Partial<DetailItem>) => sel && patch({ items: sel.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  const matchCount = (d: StandardDetail) => rows.filter((r) => detailMatches(r, { ...d, enabled: true })).length;

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
    st.setStandardDetails(clean);
    st.toast(`Saved ${clean.length} standard detail${clean.length === 1 ? '' : 's'}`, 'success');
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
          <div className="left hint">Material is added to every markup that matches, and updates as the takeoff changes.</div>
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
            const n = matchCount(d);
            return (
              <div key={d.id} className={`dd-entry${d.id === selId ? ' on' : ''}${d.enabled ? '' : ' off'}`} onClick={() => setSelId(d.id)} data-testid="detail-entry">
                <input type="checkbox" checked={d.enabled} title={d.enabled ? 'On – click to turn off' : 'Off – click to turn on'} onClick={(e) => e.stopPropagation()} onChange={(e) => update(d.id, (x) => ({ ...x, enabled: e.target.checked }))} />
                <span className="grow">{d.name || 'Untitled'}</span>
                <small title={`${n} matching markup${n === 1 ? '' : 's'}`}>{n}</small>
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

            <div className="dd-section">
              <h4>
                <span className="dd-kw">IF</span> the markup's
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
                  <ValuePicker key={`${c.column}:${c.op}`} cond={c} rows={rows} onChange={(value) => setCond(i, { value })} />
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
                  Matches {matchCount(sel)} markup{matchCount(sel) === 1 ? '' : 's'}
                </span>
              </div>
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
            <Preview detail={sel} doc={doc} rows={rows} />
          </div>
        ) : (
          <div className="dd-editor empty-note">Create a standard detail, or add the examples to start from.</div>
        )}
      </div>
    </Modal>
  );
}
