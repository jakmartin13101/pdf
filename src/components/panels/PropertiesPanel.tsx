import { useMemo } from 'react';
import { Crosshair, Lock, PackagePlus, Pin } from 'lucide-react';
import type { CountSymbol, LineEnd, LineStyle, Markup, MarkupStatus, MarkupStyle } from '../../types';
import { STATUSES } from '../../types';
import { getState, useStore } from '../../store/store';
import { buildRows, customColId } from '../../core/columns';
import { TYPE_INFO, STAMP_TEXTS } from '../../core/markupTypes';
import { CommitInput, CommitRange, ColorField } from '../fields';
import { formatLength, parseLength } from '../../core/units';
import { viewportAt } from '../../core/measure';
import { TYPE_ICON } from '../icons';
import { COMMON_SHAPES } from '../../core/steelShapes';

/** Columns holding a steel designation get shape suggestions (and feed PLF()/PSF()). */
const isShapeColumn = (name: string) => /member\s*size|shape|section/i.test(name);

const SYMBOLS: CountSymbol[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'check', 'cross'];
const ENDS: LineEnd[] = ['none', 'arrow', 'tick', 'dot'];

function common<T>(items: Markup[], get: (m: Markup) => T): T | undefined {
  if (!items.length) return undefined;
  const first = get(items[0]);
  return items.every((m) => get(m) === first) ? first : undefined;
}

export function PropertiesPanel() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const items = useMemo(() => {
    const s = new Set(selection);
    return doc.markups.filter((m) => s.has(m.id));
  }, [selection, doc.markups]);
  const rows = useMemo(() => buildRows(doc, items), [doc, items]);

  if (!items.length) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        <div className="panel-header">
          <span className="title">Properties</span>
        </div>
        <div className="empty-note">
          Select a markup on the drawing or in the Markups List to view and edit its properties and takeoff data.
        </div>
      </div>
    );
  }

  const st = getState();
  const ids = items.map((m) => m.id);
  const one = items.length === 1 ? items[0] : null;
  const row = one ? rows[0] : null;
  const types = new Set(items.map((m) => m.type));
  const allMeasure = items.every((m) => TYPE_INFO[m.type].measure);
  const setStyle = <K extends keyof MarkupStyle>(k: K, v: MarkupStyle[K]) => st.updateMarkups(ids, (m) => ({ ...m, style: { ...m.style, [k]: v } }));
  const set = (patch: Partial<Markup>) => st.updateMarkups(ids, (m) => ({ ...m, ...patch }));
  const style = (k: keyof MarkupStyle) => common(items, (m) => m.style[k]);
  const Icon = one ? TYPE_ICON[one.type] : null;
  const sheet = one ? doc.sheets.find((s) => s.id === one.sheetId) : undefined;
  const vp = one && sheet && one.points[0] ? viewportAt(sheet, one.points[0]) : undefined;
  const hasLines = items.some((m) => !['count', 'text', 'stamp', 'highlight'].includes(m.type));
  const hasFill = items.some((m) => ['area', 'volume', 'polygon', 'rectangle', 'ellipse', 'cloud', 'text', 'callout', 'count', 'highlight'].includes(m.type));
  const hasEnds = items.every((m) => ['length', 'line', 'arrow', 'polyline', 'polylength', 'callout'].includes(m.type));
  const hasText = items.some((m) => TYPE_INFO[m.type].measure || ['text', 'callout'].includes(m.type));

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        {Icon && <Icon size={14} />}
        <span className="title">{one ? `${TYPE_INFO[one.type].listName}` : `${items.length} markups selected`}</span>
        {one && (
          <button className="icon-btn" title="Zoom to markup" onClick={() => st.focusMarkup(one.id)}>
            <Crosshair size={14} />
          </button>
        )}
        {one && (
          <button className="icon-btn" title="Add to Tool Chest" onClick={() => st.setDialog({ kind: 'toolEdit', setId: st.toolChest[0]?.id ?? '', fromMarkupId: one.id })}>
            <PackagePlus size={14} />
          </button>
        )}
        {one && (
          <button className="icon-btn" title="Use these properties as the default for this tool" onClick={() => {
            st.setTypeDefault(one.type, { style: one.style, subject: one.subject });
            st.toast(`Saved as default ${TYPE_INFO[one.type].label} style`, 'success');
          }}>
            <Pin size={14} />
          </button>
        )}
      </div>
      <div className="panel-body">
        <div className="form" data-testid="properties">
          {one && row && TYPE_INFO[one.type].measure && (
            <>
              <div className="readout big" data-testid="prop-measurement">
                {row.display.measurement || '—'}
              </div>
              <div className="field">
                <label>Scale</label>
                <span className="hint" style={{ color: sheet?.scale || vp ? 'var(--text)' : 'var(--warn)' }}>
                  {row.scale.label}
                  {vp ? ` (viewport “${vp.name}”)` : ''}
                </span>
              </div>
              {(one.type === 'area' || one.type === 'volume') && (
                <div className="field">
                  <label>Perimeter</label>
                  <span className="readout">{row.display.perimeter}</span>
                </div>
              )}
              {one.type === 'volume' && (
                <div className="field">
                  <label>Area</label>
                  <span className="readout">{row.display.area}</span>
                </div>
              )}
              {one.type === 'volume' && (
                <div className="field">
                  <label>Depth</label>
                  <CommitInput
                    value={formatLength(one.depth ?? 0, row.scale.unit === 'ft' ? 'ft-in' : row.scale.unit, 8)}
                    onCommit={(v) => {
                      const d = parseLength(v, row.scale.unit === 'ft-in' || row.scale.unit === 'ft' ? 'in' : row.scale.unit);
                      if (d != null && d >= 0) set({ depth: d });
                      else st.toast('Could not read that depth. Try 6" or 0\'-6"', 'error');
                    }}
                  />
                </div>
              )}
              {one.cutouts?.length ? (
                <div className="field">
                  <label>Cutouts</label>
                  <div className="field-row">
                    <span className="hint">{one.cutouts.length}</span>
                    <button className="btn sm narrow" onClick={() => set({ cutouts: [] })}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : null}
              {(one.type === 'area' || one.type === 'volume') && (
                <button className="btn sm" onClick={() => st.setTool({ kind: 'cutout', markupId: one.id })}>
                  Add Cutout (hole)
                </button>
              )}
            </>
          )}

          <div className={one && TYPE_INFO[one.type].measure ? 'form-section' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <h4>General</h4>
            <div className="field">
              <label>Subject</label>
              <CommitInput value={common(items, (m) => m.subject) ?? ''} placeholder={items.length > 1 ? '(multiple)' : ''} onCommit={(v) => set({ subject: v })} data-testid="prop-subject" />
            </div>
            <div className="field">
              <label>Label</label>
              <CommitInput value={common(items, (m) => m.label) ?? ''} placeholder={items.length > 1 ? '(multiple)' : 'Shown on drawing'} onCommit={(v) => set({ label: v })} />
            </div>
            {(types.has('text') || types.has('callout')) && one && (
              <div className="field">
                <label>Text</label>
                <CommitInput multiline value={one.text ?? ''} onCommit={(v) => set({ text: v })} />
              </div>
            )}
            {types.has('stamp') && one && (
              <div className="field">
                <label>Stamp</label>
                <select value={STAMP_TEXTS.includes(one.text ?? '') ? one.text : '__custom'} onChange={(e) => e.target.value !== '__custom' && set({ text: e.target.value })}>
                  {STAMP_TEXTS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option value="__custom">Custom…</option>
                </select>
              </div>
            )}
            {types.has('stamp') && one && (
              <div className="field">
                <label>Stamp text</label>
                <CommitInput value={one.text ?? ''} onCommit={(v) => set({ text: v })} />
              </div>
            )}
            <div className="field">
              <label>Comments</label>
              <CommitInput multiline value={common(items, (m) => m.comments) ?? ''} onCommit={(v) => set({ comments: v })} />
            </div>
            <div className="field">
              <label>Status</label>
              <select value={common(items, (m) => m.status) ?? ''} onChange={(e) => set({ status: e.target.value as MarkupStatus })}>
                {common(items, (m) => m.status) === undefined && <option value="">(multiple)</option>}
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Layer</label>
              <select value={common(items, (m) => m.layer) ?? '__multi'} onChange={(e) => set({ layer: e.target.value })}>
                {common(items, (m) => m.layer) === undefined && <option value="__multi">(multiple)</option>}
                <option value="">(none)</option>
                {doc.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Author</label>
              <CommitInput value={common(items, (m) => m.author) ?? ''} onCommit={(v) => set({ author: v })} />
            </div>
            <div className="field">
              <label>Options</label>
              <div className="field-row">
                <label className="inline" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!common(items, (m) => m.checked)} onChange={(e) => set({ checked: e.target.checked })} /> Checked
                </label>
                <label className="inline" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!common(items, (m) => !!m.locked)} onChange={(e) => set({ locked: e.target.checked })} /> <Lock size={12} /> Locked
                </label>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Appearance</h4>
            <div className="field">
              <label>Color</label>
              <ColorField value={(style('color') as string) ?? null} onChange={(v) => v && setStyle('color', v)} />
            </div>
            {hasFill && (
              <div className="field">
                <label>Fill</label>
                <ColorField value={(style('fillColor') as string | null) ?? null} allowNone onChange={(v) => setStyle('fillColor', v)} />
              </div>
            )}
            {hasFill && (
              <div className="field">
                <label>Fill opacity</label>
                <CommitRange value={(style('fillOpacity') as number) ?? 0.3} min={0} max={1} step={0.05} onCommit={(v) => setStyle('fillOpacity', v)} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
            )}
            <div className="field">
              <label>Opacity</label>
              <CommitRange value={(style('opacity') as number) ?? 1} min={0.1} max={1} step={0.05} onCommit={(v) => setStyle('opacity', v)} format={(v) => `${Math.round(v * 100)}%`} />
            </div>
            {hasLines && (
              <div className="field">
                <label>Line width</label>
                <CommitRange value={(style('lineWidth') as number) ?? 2} min={0} max={12} step={0.5} onCommit={(v) => setStyle('lineWidth', v)} format={(v) => `${v} pt`} />
              </div>
            )}
            {hasLines && (
              <div className="field">
                <label>Line style</label>
                <div className="seg">
                  {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((ls) => (
                    <button key={ls} className={style('lineStyle') === ls ? 'on' : ''} onClick={() => setStyle('lineStyle', ls)}>
                      {ls}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasEnds && (
              <div className="field">
                <label>Line ends</label>
                <div className="field-row">
                  <select value={(style('lineStart') as string) ?? ''} onChange={(e) => setStyle('lineStart', e.target.value as LineEnd)} title="Start">
                    {ENDS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <select value={(style('lineEnd') as string) ?? ''} onChange={(e) => setStyle('lineEnd', e.target.value as LineEnd)} title="End">
                    {ENDS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {types.has('count') && (
              <>
                <div className="field">
                  <label>Symbol</label>
                  <select value={(style('symbol') as string) ?? ''} onChange={(e) => setStyle('symbol', e.target.value as CountSymbol)}>
                    {SYMBOLS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Symbol size</label>
                  <CommitRange value={(style('symbolSize') as number) ?? 9} min={3} max={40} step={1} onCommit={(v) => setStyle('symbolSize', v)} />
                </div>
              </>
            )}
            {hasText && (
              <div className="field">
                <label>Font size</label>
                <CommitRange value={(style('fontSize') as number) ?? 14} min={6} max={72} step={1} onCommit={(v) => setStyle('fontSize', v)} format={(v) => `${v} pt`} />
              </div>
            )}
          </div>

          {doc.columns.length > 0 && (
            <div className="form-section">
              <h4>Takeoff Data (Custom Columns)</h4>
              {doc.columns.map((c) => {
                const id = customColId(c);
                if (c.kind === 'formula') {
                  return (
                    <div className="field" key={c.id}>
                      <label title={c.formula}>{c.name}</label>
                      <span className="readout" title={`= ${c.formula}`}>
                        {one && row ? row.display[id] || '0' : rows.reduce((s, r) => s + (Number(r.values[id]) || 0), 0).toLocaleString('en-US', { maximumFractionDigits: c.decimals ?? 2 }) + (c.suffix ? ` ${c.suffix}` : '') + ' (sum)'}
                      </span>
                    </div>
                  );
                }
                const val = common(items, (m) => (m.custom[c.id] ?? '') as string | number);
                return (
                  <div className="field" key={c.id}>
                    <label title={c.name}>{c.name}</label>
                    {c.kind === 'choice' || isShapeColumn(c.name) ? (
                      <ChoiceInput
                        value={val === undefined ? undefined : String(val)}
                        options={c.kind === 'choice' ? c.options ?? [] : COMMON_SHAPES}
                        onCommit={(v) => st.setCustomValue(ids, c.id, v)}
                      />
                    ) : (
                      <CommitInput
                        value={val === undefined ? '' : String(val)}
                        placeholder={val === undefined ? '(multiple)' : c.defaultValue ? `default ${c.defaultValue}` : ''}
                        inputMode={c.kind === 'number' ? 'decimal' : undefined}
                        onCommit={(v) => {
                          if (c.kind === 'number') {
                            if (v.trim() === '') st.setCustomValue(ids, c.id, '');
                            else if (isFinite(Number(v))) st.setCustomValue(ids, c.id, Number(v));
                            else st.toast(`${c.name} must be a number`, 'error');
                          } else st.setCustomValue(ids, c.id, v);
                        }}
                        data-testid={`prop-col-${c.id}`}
                      />
                    )}
                  </div>
                );
              })}
              <button className="btn sm" onClick={() => st.setDialog({ kind: 'columns' })}>
                Manage Columns…
              </button>
            </div>
          )}
          {allMeasure && items.length > 1 && (
            <div className="form-section">
              <h4>Selection Totals</h4>
              <SelectionTotals rows={rows} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceInput({ value, options, onCommit }: { value: string | undefined; options: string[]; onCommit: (v: string) => void }) {
  const listId = useMemo(() => `opts-${Math.random().toString(36).slice(2)}`, []);
  return (
    <>
      <CommitInput value={value ?? ''} placeholder={value === undefined ? '(multiple)' : 'Choose or type…'} list={listId} onCommit={onCommit} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

function SelectionTotals({ rows }: { rows: ReturnType<typeof buildRows> }) {
  const doc = useStore((s) => s.doc);
  const sum = (k: string) => rows.reduce((s, r) => s + (Number(r.values[k]) || 0), 0);
  const s = doc.settings;
  const entries: [string, number, string][] = [
    ['Count', sum('count'), 'EA'],
    ['Length', sum('length'), s.lengthUnit === 'ft' ? 'LF' : s.lengthUnit],
    ['Area', sum('area'), s.areaUnit.toUpperCase()],
    ['Volume', sum('volume'), s.volumeUnit.toUpperCase()],
  ];
  return (
    <>
      {entries
        .filter(([, v]) => v)
        .map(([k, v, u]) => (
          <div className="field" key={k}>
            <label>{k}</label>
            <span className="readout">
              {v.toLocaleString('en-US', { maximumFractionDigits: k === 'Count' ? 0 : s.decimals, minimumFractionDigits: k === 'Count' ? 0 : s.decimals })} {u}
            </span>
          </div>
        ))}
    </>
  );
}
