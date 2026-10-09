import { useState } from 'react';
import type { ChestTool, CountSymbol, FontFamily, LineEnd, LineStyle, MarkupType } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { defaultStyle, MEASURE_TYPES, TYPE_INFO } from '../../core/markupTypes';
import { normalizeSize, plf, psf, SHAPE_FAMILIES } from '../../core/steelShapes';
import { ColorField } from '../fields';
import { ToolSwatch } from '../icons';
import { uid } from '../../core/ids';
import { BeamIcon } from '../panels/ToolChestPanel';

const GRADE_BY_FAMILY: Record<string, string> = { W: 'A992', WT: 'A992', HP: 'A572 Gr. 50', HSS: 'A500 Gr. C', Pipe: 'A53 Gr. B' };
const FONTS: { id: FontFamily; label: string }[] = [
  { id: 'Helvetica', label: 'Arial / Helvetica' },
  { id: 'Times', label: 'Times New Roman' },
  { id: 'Courier', label: 'Courier New' },
];

/**
 * Create or edit a "size tool": a Tool Chest tool whose label (e.g. W18x35) is typed in the chest and
 * stays with the tool. Works for any measurement type, not just steel.
 */
export function ShapeToolDialog({ setId, toolId }: { setId?: string; toolId?: string }) {
  const sets = useStore((s) => s.toolChest);
  const layers = useStore((s) => s.doc.layers);
  const st = getState();
  const existing = toolId ? sets.flatMap((s) => s.tools).find((t) => t.id === toolId) : undefined;
  const [familyIdx, setFamilyIdx] = useState(() => {
    if (!existing?.sizeTool) return 0;
    const i = SHAPE_FAMILIES.findIndex((f) => f.id === existing.sizeTool!.family && (f.id || f.example === ''));
    return i < 0 ? SHAPE_FAMILIES.length - 1 : i;
  });
  const family = SHAPE_FAMILIES[familyIdx];
  const [tool, setTool] = useState<ChestTool>(() =>
    existing
      ? structuredClone(existing)
      : {
          id: uid('tool'),
          name: 'W Shape',
          type: 'length',
          subject: 'W Shape',
          style: { ...defaultStyle('length'), color: '#e8112d', lineWidth: 3, fontFamily: 'Helvetica', fontBold: true },
          layer: 'layer-takeoff',
          custom: { Category: 'Structural Steel', Material: 'Steel', Grade: 'A992', Qty: 1 },
          sizeTool: { family: 'W', value: 'W18x35', setSubject: true, setMemberSize: true },
        },
  );
  const [targetSet, setTargetSet] = useState(sets.some((s) => s.id === setId) ? setId! : existing ? sets.find((s) => s.tools.some((t) => t.id === existing.id))?.id ?? '' : sets[0]?.id ?? '');
  const cfg = tool.sizeTool!;
  const s = tool.style;
  const setStyle = (patch: Partial<ChestTool['style']>) => setTool({ ...tool, style: { ...s, ...patch } });
  const setCfg = (patch: Partial<NonNullable<ChestTool['sizeTool']>>) => setTool({ ...tool, sizeTool: { ...cfg, ...patch } });
  const close = () => st.setDialog(null);
  const size = normalizeSize(cfg.family, cfg.value);
  const weight = plf(size) || psf(size);
  const isSteel = !!family.id || family.example === '24K6';

  const pickFamily = (i: number) => {
    const f = SHAPE_FAMILIES[i];
    setFamilyIdx(i);
    const name = f.id ? `${f.id} Shape` : f.example ? 'Joist' : 'Size Tool';
    const steel = !!f.id || !!f.example;
    setTool({
      ...tool,
      name: existing ? tool.name : name,
      subject: existing ? tool.subject : name,
      custom: steel
        ? { ...tool.custom, Category: tool.custom.Category ?? 'Structural Steel', Grade: GRADE_BY_FAMILY[f.id] ?? tool.custom.Grade ?? 'A36' }
        : tool.custom,
      sizeTool: { ...cfg, family: f.id, value: existing ? cfg.value : f.example, setMemberSize: steel ? true : cfg.setMemberSize },
    });
  };

  const changeType = (type: MarkupType) => {
    const d = defaultStyle(type);
    setTool({
      ...tool,
      type,
      style: { ...d, color: s.color, fillColor: d.fillColor ? s.color : null, lineWidth: type === 'count' ? d.lineWidth : s.lineWidth, fontFamily: s.fontFamily, fontBold: s.fontBold, fontSize: s.fontSize },
    });
  };

  const save = () => {
    const id = targetSet || st.addToolSet('My Tools');
    st.upsertTool(id, { ...tool, name: tool.name.trim() || 'Size Tool', sizeTool: { ...cfg, value: size } });
    st.toast(`${existing ? 'Updated' : 'Added'} size tool “${tool.name}”. Type a size in its box in the Tool Chest.`, 'success');
    close();
  };

  return (
    <Modal
      title={existing ? 'Size Tool Properties' : 'New Steel Shape / Size Tool'}
      icon={<BeamIcon size={16} />}
      size="mid"
      onClose={close}
      footer={
        <>
          <div className="left">
            <ToolSwatch tool={tool} size={30} />
            <span className="hint">
              Label on drawing: <b style={{ color: s.color, fontFamily: s.fontFamily === 'Times' ? 'Times New Roman, serif' : s.fontFamily === 'Courier' ? 'Courier New, monospace' : undefined }}>{size || '—'}</b>
              {weight ? ` · ${weight} ${psf(size) && !plf(size) ? 'lb/sf' : 'lb/ft'}` : ''}
            </span>
          </div>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} data-testid="shape-tool-save">
            {existing ? 'Save' : 'Add Tool'}
          </button>
        </>
      }
    >
      <div className="hint">
        A size tool keeps the size you type in the Tool Chest (for example <b>W18x35</b>) and labels every markup you place with it until you type a different size. Set the
        colour, line and font once here.
      </div>
      <div className="two-col">
        <div className="form" style={{ padding: 0 }}>
          <div className="field">
            <label>Shape family</label>
            <select value={familyIdx} onChange={(e) => pickFamily(Number(e.target.value))} data-testid="shape-family">
              {SHAPE_FAMILIES.map((f, i) => (
                <option key={i} value={i}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Starting size</label>
            <input value={cfg.value} onChange={(e) => setCfg({ value: e.target.value })} placeholder={family.example || 'Label text'} data-testid="shape-size" />
          </div>
          <div className="field">
            <label>Measure as</label>
            <select value={tool.type} onChange={(e) => changeType(e.target.value as MarkupType)} data-testid="shape-type">
              {MEASURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_INFO[t].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tool name</label>
            <input value={tool.name} onChange={(e) => setTool({ ...tool, name: e.target.value })} data-testid="shape-name" />
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
            <label>Size is also</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={cfg.setSubject} onChange={(e) => setCfg({ setSubject: e.target.checked })} /> the Subject (groups the takeoff by size)
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={cfg.setMemberSize} onChange={(e) => setCfg({ setMemberSize: e.target.checked })} /> Member Size (drives weight)
              </label>
            </div>
          </div>
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
          {isSteel && (
            <div className="field">
              <label>Grade</label>
              <input value={String(tool.custom.Grade ?? '')} onChange={(e) => setTool({ ...tool, custom: { ...tool.custom, Grade: e.target.value } })} />
            </div>
          )}
        </div>
        <div className="form" style={{ padding: 0 }}>
          <div className="field">
            <label>Color</label>
            <ColorField value={s.color} onChange={(v) => v && setStyle({ color: v, fillColor: s.fillColor ? v : s.fillColor })} />
          </div>
          {tool.type !== 'count' && (
            <>
              <div className="field">
                <label>Line width</label>
                <input type="number" min={0.5} max={20} step={0.5} value={s.lineWidth} onChange={(e) => setStyle({ lineWidth: Number(e.target.value) })} />
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
            </>
          )}
          {(tool.type === 'length' || tool.type === 'polylength') && (
            <div className="field">
              <label>Line ends</label>
              <div className="field-row">
                {(['lineStart', 'lineEnd'] as const).map((k) => (
                  <select key={k} value={s[k]} onChange={(e) => setStyle({ [k]: e.target.value as LineEnd })}>
                    {(['none', 'arrow', 'tick', 'dot'] as LineEnd[]).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          )}
          {tool.type === 'count' && (
            <div className="field">
              <label>Symbol</label>
              <div className="field-row">
                <select value={s.symbol} onChange={(e) => setStyle({ symbol: e.target.value as CountSymbol })}>
                  {(['circle', 'square', 'triangle', 'diamond', 'star', 'check', 'cross'] as CountSymbol[]).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <input type="number" min={3} max={40} value={s.symbolSize} onChange={(e) => setStyle({ symbolSize: Number(e.target.value) })} title="Symbol size" />
              </div>
            </div>
          )}
          {(tool.type === 'area' || tool.type === 'volume') && (
            <div className="field">
              <label>Fill</label>
              <ColorField value={s.fillColor} allowNone onChange={(v) => setStyle({ fillColor: v })} />
            </div>
          )}
          <div className="field">
            <label>Label font</label>
            <select value={s.fontFamily ?? 'Helvetica'} onChange={(e) => setStyle({ fontFamily: e.target.value as FontFamily })} data-testid="shape-font">
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Font size</label>
            <div className="field-row">
              <input type="number" min={6} max={72} value={s.fontSize} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })} />
              <label className="narrow" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={s.fontBold !== false} onChange={(e) => setStyle({ fontBold: e.target.checked })} /> Bold
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
