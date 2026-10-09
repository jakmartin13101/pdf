import { useState } from 'react';
import { Wrench } from 'lucide-react';
import type { ChestTool, CountSymbol, FontFamily, LineStyle, MarkupType } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { defaultStyle, MARKUP_TYPES, MEASURE_TYPES, STAMP_TEXTS, TYPE_INFO } from '../../core/markupTypes';
import { ColorField } from '../fields';
import { ToolSwatch } from '../icons';
import { uid } from '../../core/ids';
import { formatLength, parseLength } from '../../core/units';

export function ToolEditDialog({ setId, toolId, fromMarkupId }: { setId: string; toolId?: string; fromMarkupId?: string }) {
  const sets = useStore((s) => s.toolChest);
  const columns = useStore((s) => s.doc.columns);
  const layers = useStore((s) => s.doc.layers);
  const st = getState();
  const existing = toolId ? sets.flatMap((s) => s.tools).find((t) => t.id === toolId) : undefined;
  const [tool, setTool] = useState<ChestTool>(() => {
    if (existing) return structuredClone(existing);
    if (fromMarkupId) {
      const t = st.toolFromMarkup(fromMarkupId);
      if (t) return t;
    }
    return { id: uid('tool'), name: 'New Tool', type: 'length', subject: 'New Tool', style: defaultStyle('length'), custom: {} };
  });
  const [targetSet, setTargetSet] = useState(sets.some((s) => s.id === setId) ? setId : sets[0]?.id ?? '');
  const [depthText, setDepthText] = useState(formatLength(tool.depth ?? 4, 'ft-in', 8));
  const close = () => st.setDialog(null);
  const s = tool.style;
  const setStyle = (patch: Partial<ChestTool['style']>) => setTool({ ...tool, style: { ...s, ...patch } });
  const editableCols = columns.filter((c) => c.kind !== 'formula');

  const save = () => {
    let setIdToUse = targetSet;
    if (!setIdToUse) setIdToUse = st.addToolSet('My Tools');
    const depth = tool.type === 'volume' ? parseLength(depthText, 'in') ?? 4 : undefined;
    const custom = Object.fromEntries(Object.entries(tool.custom).filter(([, v]) => v !== '' && v != null));
    st.upsertTool(setIdToUse, { ...tool, name: tool.name.trim() || tool.subject, depth, custom });
    st.toast(`${existing ? 'Updated' : 'Added'} tool “${tool.name}”`, 'success');
    close();
  };

  return (
    <Modal
      title={existing ? 'Tool Properties' : 'Add Tool to Tool Chest'}
      icon={<Wrench size={16} />}
      size="mid"
      onClose={close}
      footer={
        <>
          <div className="left">
            <ToolSwatch tool={tool} size={30} />
          </div>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!tool.name.trim()} data-testid="tool-save">
            {existing ? 'Save' : 'Add Tool'}
          </button>
        </>
      }
    >
      <div className="two-col">
        <div className="form" style={{ padding: 0 }}>
          <div className="field">
            <label>Tool name</label>
            <input autoFocus value={tool.name} onChange={(e) => setTool({ ...tool, name: e.target.value })} data-testid="tool-name" />
          </div>
          <div className="field">
            <label>Tool set</label>
            <select value={targetSet} onChange={(e) => setTargetSet(e.target.value)}>
              {sets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={tool.type}
              onChange={(e) => {
                const type = e.target.value as MarkupType;
                const d = defaultStyle(type);
                setTool({ ...tool, type, style: { ...d, color: s.color, fillColor: d.fillColor ? s.color : null, lineWidth: s.lineWidth } });
              }}
              disabled={!!fromMarkupId}
            >
              <optgroup label="Measurements">
                {MEASURE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_INFO[t].label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Markups">
                {MARKUP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_INFO[t].label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label>Subject</label>
            <input value={tool.subject} onChange={(e) => setTool({ ...tool, subject: e.target.value })} placeholder="e.g. W18x35" data-testid="tool-subject" />
          </div>
          <div className="field">
            <label>Label</label>
            <input value={tool.label ?? ''} onChange={(e) => setTool({ ...tool, label: e.target.value || undefined })} placeholder="Text shown on drawing" />
          </div>
          {tool.type === 'stamp' && (
            <div className="field">
              <label>Stamp text</label>
              <input list="stamp-texts" value={tool.text ?? ''} onChange={(e) => setTool({ ...tool, text: e.target.value })} />
              <datalist id="stamp-texts">
                {STAMP_TEXTS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          )}
          {tool.type === 'volume' && (
            <div className="field">
              <label>Depth</label>
              <input value={depthText} onChange={(e) => setDepthText(e.target.value)} placeholder={`e.g. 4" or 0'-6"`} />
            </div>
          )}
          <div className="field">
            <label>Layer</label>
            <select value={tool.layer ?? ''} onChange={(e) => setTool({ ...tool, layer: e.target.value || undefined })}>
              <option value="">(none)</option>
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-section">
            <h4>Appearance</h4>
            <div className="field">
              <label>Color</label>
              <ColorField value={s.color} onChange={(v) => v && setStyle({ color: v })} />
            </div>
            <div className="field">
              <label>Fill</label>
              <ColorField value={s.fillColor} allowNone onChange={(v) => setStyle({ fillColor: v })} />
            </div>
            <div className="field">
              <label>Line width</label>
              <input type="number" min={0} max={20} step={0.5} value={s.lineWidth} onChange={(e) => setStyle({ lineWidth: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Line style</label>
              <div className="seg">
                {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((ls) => (
                  <button key={ls} className={s.lineStyle === ls ? 'on' : ''} onClick={() => setStyle({ lineStyle: ls })}>
                    {ls}
                  </button>
                ))}
              </div>
            </div>
            {tool.type === 'count' && (
              <div className="field">
                <label>Symbol</label>
                <div className="field-row">
                  <select value={s.symbol} onChange={(e) => setStyle({ symbol: e.target.value as CountSymbol })}>
                    {(['circle', 'square', 'triangle', 'diamond', 'star', 'check', 'cross'] as CountSymbol[]).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <input type="number" min={3} max={40} value={s.symbolSize} onChange={(e) => setStyle({ symbolSize: Number(e.target.value) })} title="Size" />
                </div>
              </div>
            )}
            <div className="field">
              <label>Font</label>
              <div className="field-row">
                <select value={s.fontFamily ?? 'Helvetica'} onChange={(e) => setStyle({ fontFamily: e.target.value as FontFamily })}>
                  <option value="Helvetica">Arial / Helvetica</option>
                  <option value="Times">Times New Roman</option>
                  <option value="Courier">Courier New</option>
                </select>
                <input type="number" min={6} max={72} value={s.fontSize} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })} title="Font size" style={{ width: 64 }} className="narrow" />
                <label className="narrow" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={TYPE_INFO[tool.type].measure ? s.fontBold !== false : !!s.fontBold}
                    onChange={(e) => setStyle({ fontBold: e.target.checked })}
                  />{' '}
                  Bold
                </label>
              </div>
            </div>
          </div>
          <div className="form-section">
            <h4>Size / label tool</h4>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!tool.sizeTool}
                onChange={(e) =>
                  setTool({
                    ...tool,
                    sizeTool: e.target.checked ? { family: '', value: tool.label ?? tool.subject, setSubject: true, setMemberSize: false } : undefined,
                  })
                }
                data-testid="tool-size-toggle"
              />
              Type the label in the Tool Chest (kept on the tool until changed)
            </label>
            {tool.sizeTool && (
              <>
                <div className="field">
                  <label>Current label</label>
                  <input value={tool.sizeTool.value} onChange={(e) => setTool({ ...tool, sizeTool: { ...tool.sizeTool!, value: e.target.value } })} />
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={tool.sizeTool.setSubject} onChange={(e) => setTool({ ...tool, sizeTool: { ...tool.sizeTool!, setSubject: e.target.checked } })} /> Also use it as the
                  Subject
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={tool.sizeTool.setMemberSize} onChange={(e) => setTool({ ...tool, sizeTool: { ...tool.sizeTool!, setMemberSize: e.target.checked } })} /> Also
                  write it to Member Size
                </label>
              </>
            )}
          </div>
        </div>
        <div className="form" style={{ padding: 0 }}>
          <h4 style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Column values applied to new markups</h4>
          {editableCols.map((c) => (
            <div className="field" key={c.id}>
              <label title={c.name}>{c.name}</label>
              {c.kind === 'choice' ? (
                <select value={String(tool.custom[c.name] ?? '')} onChange={(e) => setTool({ ...tool, custom: { ...tool.custom, [c.name]: e.target.value } })}>
                  <option value="">(blank)</option>
                  {(c.options ?? []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(tool.custom[c.name] ?? '')}
                  placeholder={c.defaultValue ? `default ${c.defaultValue}` : ''}
                  onChange={(e) => setTool({ ...tool, custom: { ...tool.custom, [c.name]: c.kind === 'number' && e.target.value !== '' && isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value } })}
                />
              )}
            </div>
          ))}
          {!editableCols.length && <div className="hint">This project has no custom columns. Add them in Tools → Manage Columns.</div>}
        </div>
      </div>
    </Modal>
  );
}
