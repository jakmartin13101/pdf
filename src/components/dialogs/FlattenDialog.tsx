// Flatten Markups: draw markups into the drawing so they are part of the page.
import { useState } from 'react';
import { Layers } from 'lucide-react';
import { currentSheet, getState, useStore } from '../../store/store';
import { flattenMarkups } from '../../store/flatten';
import { sheetLongName } from '../../core/columns';
import { Modal } from './Modal';

type Scope = 'selected' | 'sheet' | 'all';

export function FlattenDialog({ markupIds }: { markupIds?: string[] }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const sheet = useStore(currentSheet);
  const st = getState();
  const chosen = markupIds ?? selection;
  const [scope, setScope] = useState<Scope>(chosen.length ? 'selected' : 'sheet');
  const [keep, setKeep] = useState(false);
  const [labels, setLabels] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const hiddenLayers = new Set(doc.layers.filter((l) => !l.visible).map((l) => l.id));
  const visible = (m: (typeof doc.markups)[number]) => hidden || !hiddenLayers.has(m.layer);
  const ids =
    scope === 'selected'
      ? chosen
      : doc.markups.filter((m) => (scope === 'all' || m.sheetId === sheet?.id) && visible(m) && m.layer !== 'layer-flattened').map((m) => m.id);
  const sheetsTouched = new Set(doc.markups.filter((m) => ids.includes(m.id)).map((m) => m.sheetId)).size;
  const n = ids.length;
  const close = () => st.setDialog(null);
  const run = async () => {
    setBusy(true);
    try {
      const done = await flattenMarkups(ids, { keep, labels });
      st.toast(`Flattened ${done} markup${done === 1 ? '' : 's'} into ${sheetsTouched} sheet${sheetsTouched === 1 ? '' : 's'} – Undo puts them back`, 'success');
      close();
    } catch (e) {
      st.toast(`Could not flatten: ${(e as Error).message}`, 'error');
      setBusy(false);
    }
  };
  const count = (s: Scope) =>
    s === 'selected' ? chosen.length : doc.markups.filter((m) => (s === 'all' || m.sheetId === sheet?.id) && visible(m) && m.layer !== 'layer-flattened').length;
  return (
    <Modal
      title="Flatten Markups"
      icon={<Layers size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={!n || busy} onClick={() => void run()} data-testid="flatten-ok">
            Flatten {n} Markup{n === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="hint">Flattening draws markups into the drawing itself: they become part of the page, like the line work, and exported or printed PDFs show them everywhere.</div>
      <div className="fl-scope" data-testid="flatten-scope">
        {chosen.length > 0 && (
          <label>
            <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} /> Selected markups ({count('selected')})
          </label>
        )}
        <label>
          <input type="radio" checked={scope === 'sheet'} onChange={() => setScope('sheet')} data-testid="flatten-sheet" /> All on this sheet{sheet ? ` – ${sheetLongName(sheet, doc)}` : ''} ({count('sheet')})
        </label>
        <label>
          <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} data-testid="flatten-all" /> All on every sheet ({count('all')})
        </label>
      </div>
      <label className="set-check">
        <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
        <span>Draw measurement labels too</span>
      </label>
      {scope !== 'selected' && hiddenLayers.size > 0 && (
        <label className="set-check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>Include markups on hidden layers</span>
        </label>
      )}
      <label className="set-check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="flatten-keep" />
        <span>Keep them in the takeoff (Markups List and Summary) – moved to a hidden, locked “Flattened” layer so they are not drawn twice</span>
      </label>
      {!keep && <div className="hint warn-text">The flattened markups are removed from the Markups List and Summary. Undo (Ctrl+Z) brings them back.</div>}
    </Modal>
  );
}
