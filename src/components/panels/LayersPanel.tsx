import { useMemo, useState } from 'react';
import { ArrowDownToLine, Eye, EyeOff, Layers as LayersIcon, Plus, Trash2 } from 'lucide-react';
import { getState, useStore } from '../../store/store';
import { PanelHeader } from '../dock/PanelHeader';

export function LayersPanel() {
  const layers = useStore((s) => s.doc.layers);
  const markups = useStore((s) => s.doc.markups);
  const selection = useStore((s) => s.selection);
  const [editing, setEditing] = useState<string | null>(null);
  const st = getState();
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of markups) c.set(m.layer, (c.get(m.layer) ?? 0) + 1);
    return c;
  }, [markups]);

  return (
    <div className="panel" style={{ height: '100%' }}>
      <PanelHeader title="Layers" icon={<LayersIcon size={14} />}>
        <button className="icon-btn" title="New layer" onClick={() => setEditing(st.addLayer('New Layer'))}>
          <Plus size={14} />
        </button>
      </PanelHeader>
      <div className="panel-body">
        <div className="form">
          <div className="hint">Organize markups into layers. Hidden layers are not drawn, and are excluded from flattened PDF exports.</div>
          <div className="layer-item">
            <span style={{ width: 24 }} />
            <span className="grow">
              (No layer) <small>· {counts.get('') ?? 0}</small>
            </span>
            <button className="icon-btn" title="Move selected markups to no layer" disabled={!selection.length} onClick={() => st.updateMarkups(selection, (m) => ({ ...m, layer: '' }))}>
              <ArrowDownToLine size={13} />
            </button>
          </div>
          {layers.map((l) => (
            <div className="layer-item" key={l.id}>
              <button className="icon-btn" title={l.visible ? 'Hide layer' : 'Show layer'} onClick={() => st.updateLayer(l.id, { visible: !l.visible })}>
                {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              {editing === l.id ? (
                <input
                  autoFocus
                  defaultValue={l.name}
                  className="grow"
                  onBlur={(e) => {
                    st.updateLayer(l.id, { name: e.target.value.trim() || l.name });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="grow" onDoubleClick={() => setEditing(l.id)} style={{ opacity: l.visible ? 1 : 0.5 }}>
                  {l.name} <small>· {counts.get(l.id) ?? 0}</small>
                </span>
              )}
              <button className="icon-btn" title="Move selected markups to this layer" disabled={!selection.length} onClick={() => st.updateMarkups(selection, (m) => ({ ...m, layer: l.id }))}>
                <ArrowDownToLine size={13} />
              </button>
              <button className="icon-btn" title="Delete layer (markups move to no layer)" onClick={() => st.deleteLayer(l.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="field-row">
            <button className="btn sm" onClick={() => layers.forEach((l) => !l.visible && st.updateLayer(l.id, { visible: true }))}>
              Show All
            </button>
            <button className="btn sm" onClick={() => layers.forEach((l) => l.visible && st.updateLayer(l.id, { visible: false }))}>
              Hide All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
