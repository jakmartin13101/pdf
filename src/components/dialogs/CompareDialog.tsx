import { useMemo, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import type { Sheet } from '../../types';
import { getState, useStore } from '../../store/store';
import { sheetLabel, sheetLongName } from '../../core/columns';
import { COMPARE_PRESETS, autoAlign, newCompare } from '../../core/compare';
import { Modal } from './Modal';

/** Best partner for a sheet: the same sheet number from another file (a revision), else the next sheet. */
export function suggestCompare(sheet: Sheet, sheets: Sheet[]): Sheet | undefined {
  const others = sheets.filter((s) => s.id !== sheet.id);
  return (
    others.find((s) => s.fileId !== sheet.fileId && sheetLabel(s) === sheetLabel(sheet)) ??
    others.find((s) => sheetLabel(s) === sheetLabel(sheet)) ??
    others[sheets.indexOf(sheet) % Math.max(1, others.length)]
  );
}

/** Pick two sheets to overlay. The overlay lives on sheet A; sheet B is drawn over it. */
export function CompareDialog({ sheetId }: { sheetId?: string }) {
  const doc = useStore((s) => s.doc);
  const currentSheetId = useStore((s) => s.currentSheetId);
  const st = getState();
  const [aId, setAId] = useState(sheetId ?? currentSheetId ?? doc.sheets[0]?.id ?? '');
  const a = doc.sheets.find((s) => s.id === aId);
  const suggested = useMemo(() => (a ? suggestCompare(a, doc.sheets) : undefined), [a, doc.sheets]);
  const [bId, setBId] = useState<string | null>(null);
  const b = doc.sheets.find((s) => s.id === (bId ?? suggested?.id));
  const [preset, setPreset] = useState(0);
  const [align, setAlign] = useState(true);
  const close = () => st.setDialog(null);

  const start = async () => {
    if (!a || !b) return;
    const p = COMPARE_PRESETS[preset];
    close();
    st.setCompare(a.id, newCompare(b.id, { colorA: p.a, colorB: p.b }));
    st.setCompareChanges(a.id, null);
    st.setCurrentSheet(a.id);
    st.showPanel('compare');
    st.requestView({ kind: 'fit' });
    if (!align) return;
    st.setBusy('Aligning sheets…');
    try {
      const r = await autoAlign(a, b);
      st.updateCompare(a.id, { transform: r.transform, alignedBy: r.by, matches: r.matches, agreement: r.agreement });
      st.toast(`Overlay aligned ${r.by === 'text' ? `on ${r.matches} text matches` : 'by image'} · ${Math.round(r.agreement * 100)}% of line work matches`, 'success');
    } catch (e) {
      st.toast(`Could not align automatically: ${(e as Error).message}. Use Align by Points.`, 'error');
    } finally {
      st.setBusy(null);
    }
  };

  return (
    <Modal
      title="Compare / Overlay Sheets"
      icon={<GitCompareArrows size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={!a || !b} onClick={start} data-testid="compare-ok">
            Overlay
          </button>
        </>
      }
    >
      <div className="hint">
        Sheet B is drawn over sheet A, each in its own colour. Line work on both sheets shows dark; what changed shows in A's or B's colour. Add the revised drawings to the
        set first (File → Open PDF), then pick the two versions here.
      </div>
      <div className="field">
        <label>
          <span className="cmp-badge" style={{ background: COMPARE_PRESETS[preset].a }}>
            A
          </span>{' '}
          Sheet
        </label>
        <select value={aId} onChange={(e) => (setAId(e.target.value), setBId(null))} data-testid="compare-a">
          {doc.sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {sheetLongName(s, doc)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>
          <span className="cmp-badge" style={{ background: COMPARE_PRESETS[preset].b }}>
            B
          </span>{' '}
          Overlay
        </label>
        <select value={b?.id ?? ''} onChange={(e) => setBId(e.target.value)} data-testid="compare-b">
          {doc.sheets
            .filter((s) => s.id !== aId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {sheetLongName(s, doc)}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <label>Colours</label>
        <div className="cmp-presets">
          {COMPARE_PRESETS.map((p, i) => (
            <button key={p.name} className={`btn sm${i === preset ? ' primary' : ''}`} title={p.name} onClick={() => setPreset(i)}>
              <span className="cmp-dot" style={{ background: p.a }} />
              <span className="cmp-dot" style={{ background: p.b }} />
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} data-testid="compare-autoalign" />
        Align automatically (matches the sheets' text, or their line work for scans)
      </label>
      {a?.compare && <div className="hint" style={{ color: 'var(--warn)' }}>This replaces the overlay already on {sheetLabel(a)}.</div>}
    </Modal>
  );
}
