import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3, Plus, Trash2 } from 'lucide-react';
import type { ColumnKind, CustomColumn } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { allColumns, buildRows, customColId } from '../../core/columns';
import { FUNCTIONS, validateFormula } from '../../core/formula';
import { defaultColumns } from '../../core/defaults';

const KINDS: { id: ColumnKind; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'choice', label: 'Choice (list)' },
  { id: 'formula', label: 'Formula' },
];

const BLANK: Omit<CustomColumn, 'id'> = { name: '', kind: 'text', options: [], formula: '', decimals: 2, suffix: '', defaultValue: '' };

export function ColumnsDialog() {
  const doc = useStore((s) => s.doc);
  const list = useStore((s) => s.list);
  const selection = useStore((s) => s.selection);
  const cols = useMemo(() => allColumns(doc.columns), [doc.columns]);
  const [editId, setEditId] = useState<string | null>(null); // custom column id or 'new'
  const editing = editId && editId !== 'new' ? doc.columns.find((c) => c.id === editId) : undefined;
  const [form, setForm] = useState<Omit<CustomColumn, 'id'>>(BLANK);
  const st = getState();

  const visible = list.columns.filter((id) => cols.some((c) => c.id === id));
  const hidden = cols.filter((c) => !visible.includes(c.id));
  const setVisible = (ids: string[]) => st.setList({ columns: ids });
  const move = (id: string, d: number) => {
    const i = visible.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= visible.length) return;
    const n = [...visible];
    [n[i], n[j]] = [n[j], n[i]];
    setVisible(n);
  };

  const startEdit = (c: CustomColumn | null) => {
    if (c) {
      setEditId(c.id);
      setForm({ name: c.name, kind: c.kind, options: c.options ?? [], formula: c.formula ?? '', decimals: c.decimals ?? 2, suffix: c.suffix ?? '', defaultValue: c.defaultValue ?? '' });
    } else {
      setEditId('new');
      setForm(BLANK);
    }
  };

  const formulaError = form.kind === 'formula' ? (form.formula ? validateFormula(form.formula) : 'Enter a formula') : null;
  const nameClash = cols.some((c) => c.name.toLowerCase() === form.name.trim().toLowerCase() && c.custom?.id !== editing?.id);
  const preview = useMemo(() => {
    if (form.kind !== 'formula' || formulaError) return null;
    const sample = doc.markups.find((m) => selection.includes(m.id)) ?? doc.markups[0];
    if (!sample) return null;
    const tmp: CustomColumn = { ...form, id: '__preview', name: form.name || 'Preview' } as CustomColumn;
    const [row] = buildRows({ ...doc, columns: [...doc.columns.filter((c) => c.id !== editing?.id), tmp] }, [sample]);
    return { subject: sample.subject, value: row.display[customColId(tmp)] };
  }, [form, formulaError, doc, selection, editing]);

  const save = () => {
    const clean: Omit<CustomColumn, 'id'> = {
      name: form.name.trim(),
      kind: form.kind,
      ...(form.kind === 'choice' ? { options: (form.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
      ...(form.kind === 'formula' ? { formula: form.formula } : {}),
      ...(form.kind === 'number' || form.kind === 'formula' ? { decimals: form.decimals, suffix: form.suffix || undefined } : {}),
      ...(form.kind !== 'formula' && form.defaultValue ? { defaultValue: form.defaultValue } : {}),
    };
    if (editing) st.updateColumn(editing.id, { ...clean, options: clean.options, formula: clean.formula });
    else st.addColumn(clean);
    setEditId(null);
  };

  const addTemplate = () => {
    const have = new Set(doc.columns.map((c) => c.name.toLowerCase()));
    const missing = defaultColumns().filter((c) => !have.has(c.name.toLowerCase()));
    st.commit((d) => ({ ...d, columns: [...d.columns, ...missing] }));
    st.setList({ columns: [...list.columns, ...missing.map((c) => customColId(c)).filter((id) => !list.columns.includes(id))] });
    st.toast(missing.length ? `Added ${missing.length} columns` : 'Template columns already present', 'success');
  };

  return (
    <Modal
      title="Markup Columns"
      icon={<Columns3 size={16} />}
      size="wide"
      onClose={() => st.setDialog(null)}
      footer={
        <>
          <div className="left">
            <button className="btn sm" onClick={addTemplate}>
              Add Structural Steel Template
            </button>
          </div>
          <button className="btn primary" onClick={() => st.setDialog(null)}>
            Done
          </button>
        </>
      }
    >
      <div className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="hint">Checked columns appear in the Markups List in this order. Custom columns store takeoff data on every markup.</div>
          <div className="col-list">
            {[...visible.map((id) => cols.find((c) => c.id === id)!), ...hidden].map((c) => {
              const isVis = visible.includes(c.id);
              return (
                <div key={c.id} className={`col-item${editing && c.custom?.id === editing.id ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isVis}
                    onChange={(e) => setVisible(e.target.checked ? [...visible, c.id] : visible.filter((x) => x !== c.id))}
                  />
                  <span className="grow">
                    {c.name}{' '}
                    <small>
                      {c.builtin ? 'built-in' : c.custom?.kind}
                      {c.custom?.kind === 'formula' ? ` = ${c.custom.formula}` : ''}
                    </small>
                  </span>
                  {isVis && (
                    <>
                      <button className="icon-btn" onClick={() => move(c.id, -1)} title="Move up">
                        <ArrowUp size={12} />
                      </button>
                      <button className="icon-btn" onClick={() => move(c.id, 1)} title="Move down">
                        <ArrowDown size={12} />
                      </button>
                    </>
                  )}
                  {c.custom && (
                    <button className="btn sm" onClick={() => startEdit(c.custom!)}>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => startEdit(null)} data-testid="new-column">
            <Plus size={13} /> New Custom Column
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editId ? (
            <>
              <b>{editing ? `Edit “${editing.name}”` : 'New Custom Column'}</b>
              <div className="field">
                <label>Name</label>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Piece Mark" data-testid="col-name" />
              </div>
              {nameClash && <div className="error-text">A column with this name already exists.</div>}
              <div className="field">
                <label>Type</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ColumnKind })} data-testid="col-kind">
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.kind === 'choice' && (
                <div className="field">
                  <label>Options</label>
                  <textarea rows={5} value={(form.options ?? []).join('\n')} onChange={(e) => setForm({ ...form, options: e.target.value.split('\n') })} placeholder="One option per line" />
                </div>
              )}
              {form.kind === 'formula' && (
                <>
                  <div className="field">
                    <label>Formula</label>
                    <input value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="Length * Qty * PLF([Member Size])" style={{ fontFamily: 'var(--mono)' }} data-testid="col-formula" />
                  </div>
                  {formulaError ? <div className="error-text">{formulaError}</div> : preview && <div className="ok-text">Preview on “{preview.subject}”: {preview.value}</div>}
                  <div className="formula-help">
                    Reference columns by name: <code>Length</code> (LF), <code>Area</code> (SF), <code>Volume</code> (CY), <code>Count</code>, <code>Depth</code>, <code>Perimeter</code>,{' '}
                    <code>Subject</code>, or any custom column, e.g. <code>Qty</code> or <code>[Member Size]</code>. Operators <code>+ - * / ^</code>, comparisons, <code>&amp;</code> joins text.
                    <br />
                    Functions: {Object.values(FUNCTIONS).map((f, i) => (
                      <span key={f}>
                        {i ? ', ' : ''}
                        <code>{f.split(' – ')[0]}</code>
                      </span>
                    ))}
                    .
                  </div>
                </>
              )}
              {(form.kind === 'number' || form.kind === 'formula') && (
                <div className="field">
                  <label>Decimals / Units</label>
                  <div className="field-row">
                    <select value={form.decimals ?? 2} onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })}>
                      {[0, 1, 2, 3, 4].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    <input value={form.suffix ?? ''} onChange={(e) => setForm({ ...form, suffix: e.target.value })} placeholder="suffix e.g. lbs" />
                  </div>
                </div>
              )}
              {form.kind !== 'formula' && (
                <div className="field">
                  <label>Default value</label>
                  <input value={form.defaultValue ?? ''} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })} />
                </div>
              )}
              <div className="field-row">
                {editing && (
                  <button
                    className="btn danger narrow"
                    onClick={() =>
                      st.setDialog({
                        kind: 'confirm',
                        title: 'Delete Column',
                        message: `Delete “${editing.name}” and its values on all markups?`,
                        onConfirm: () => {
                          st.deleteColumn(editing.id);
                          st.setDialog({ kind: 'columns' });
                        },
                      })
                    }
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                <span />
                <button className="btn narrow" onClick={() => setEditId(null)}>
                  Cancel
                </button>
                <button className="btn primary narrow" disabled={!form.name.trim() || nameClash || !!formulaError} onClick={save} data-testid="col-save">
                  {editing ? 'Save' : 'Add Column'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-note">
              Select <b>Edit</b> on a custom column, or create a new one.
              <br />
              <br />
              Formula columns turn the markup list into a takeoff database, e.g. steel weight:
              <br />
              <code style={{ fontFamily: 'var(--mono)' }}>Qty * (Length * PLF([Member Size]) + Area * PSF([Member Size]))</code>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
