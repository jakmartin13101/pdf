import { useEffect, useState } from 'react';
import { Hash, ScanText, Tags, Wand2 } from 'lucide-react';
import type { Rect } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { detectSheetLabel, textInRegion } from '../../core/pdf';
import { titleCase } from '../../core/text';

type Drafts = Record<string, { number: string; title: string }>;

// Pending edits survive while the user picks a title-block region on the drawing.
let pending: Drafts | null = null;

export function PageLabelsDialog({ region }: { region?: { purpose: 'number' | 'title'; rect: Rect } }) {
  const sheets = useStore((s) => s.doc.sheets);
  const files = useStore((s) => s.doc.files);
  const [drafts, setDrafts] = useState<Drafts>(() => pending ?? Object.fromEntries(sheets.map((s) => [s.id, { number: s.number, title: s.title }])));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('A-');
  const [startNo, setStartNo] = useState(1);
  const st = getState();

  useEffect(() => {
    pending = null;
    if (!region) return;
    (async () => {
      setBusy(`Reading sheet ${region.purpose}s from the selected region…`);
      const next: Drafts = { ...drafts };
      let found = 0;
      for (const s of sheets) {
        const text = await textInRegion(s.fileId, s.pageIndex, region.rect, s.width, s.height);
        if (text) {
          found++;
          next[s.id] = { ...next[s.id], [region.purpose]: region.purpose === 'number' ? text.replace(/\s+/g, '') : titleCase(text) };
        }
      }
      setDrafts(next);
      setBusy(null);
      setMsg(found ? `Read ${region.purpose}s from ${found} of ${sheets.length} sheets. Review and click Apply.` : 'No text found in that region. Scanned drawings have no text layer – type labels manually.');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    pending = null;
    st.setDialog(null);
  };

  const pickRegion = (purpose: 'number' | 'title') => {
    pending = drafts;
    st.setDialog(null);
    st.setTool({ kind: 'region', purpose });
    st.toast(`Drag a box around the sheet ${purpose} in the title block`, 'info');
  };

  const autoDetect = async () => {
    setBusy('Detecting sheet numbers and titles from title blocks…');
    const next: Drafts = { ...drafts };
    let found = 0;
    for (const s of sheets) {
      const d = await detectSheetLabel(s.fileId, s.pageIndex, s.width, s.height);
      if (d?.number) {
        found++;
        next[s.id] = { number: d.number, title: d.title ? titleCase(d.title) : next[s.id].title };
      }
    }
    setDrafts(next);
    setBusy(null);
    setMsg(found ? `Detected labels on ${found} of ${sheets.length} sheets.` : 'No sheet numbers found. Use "Number from region" and box the sheet number in the title block.');
  };

  const changed = sheets.filter((s) => drafts[s.id] && (drafts[s.id].number !== s.number || drafts[s.id].title !== s.title));
  const fileName = (id: string) => files.find((f) => f.id === id)?.name ?? '';

  return (
    <Modal
      title="Page Labels"
      icon={<Tags size={16} />}
      size="wide"
      onClose={close}
      footer={
        <>
          <div className="left">
            {busy ? (
              <>
                <span className="spinner" /> {busy}
              </>
            ) : (
              msg && <span className="hint">{msg}</span>
            )}
          </div>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!changed.length}
            onClick={() => {
              st.setSheetLabels(Object.fromEntries(changed.map((s) => [s.id, drafts[s.id]])));
              st.toast(`Updated ${changed.length} sheet label${changed.length === 1 ? '' : 's'}`, 'success');
              close();
            }}
            data-testid="labels-apply"
          >
            Apply {changed.length ? `(${changed.length})` : ''}
          </button>
        </>
      }
    >
      <div className="hint">
        Give each page a sheet number and title so the set can be navigated and every markup is tagged with its sheet. Read them from the title block automatically, or box the
        sheet number/title once and the same region is read on every page.
      </div>
      <div className="field-row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm narrow" onClick={autoDetect} disabled={!!busy} data-testid="labels-detect">
          <Wand2 size={13} /> Auto-detect from Title Blocks
        </button>
        <button className="btn sm narrow" onClick={() => pickRegion('number')} disabled={!!busy}>
          <ScanText size={13} /> Number from Region…
        </button>
        <button className="btn sm narrow" onClick={() => pickRegion('title')} disabled={!!busy}>
          <ScanText size={13} /> Title from Region…
        </button>
        <span className="narrow" style={{ flex: 1 }} />
        <span className="narrow hint">Sequential:</span>
        <input className="narrow" style={{ width: 60 }} value={prefix} onChange={(e) => setPrefix(e.target.value)} title="Prefix" />
        <input className="narrow" style={{ width: 52 }} type="number" value={startNo} onChange={(e) => setStartNo(Number(e.target.value))} title="Start number" />
        <button
          className="btn sm narrow"
          onClick={() => {
            const next = { ...drafts };
            sheets.forEach((s, i) => (next[s.id] = { ...next[s.id], number: `${prefix}${startNo + i}` }));
            setDrafts(next);
          }}
        >
          <Hash size={13} /> Number
        </button>
      </div>
      <div className="labels-scroll">
        <table className="labels-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 170 }}>Source</th>
              <th style={{ width: 140 }}>Sheet Number</th>
              <th>Sheet Title</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s, i) => {
              const d = drafts[s.id] ?? { number: s.number, title: s.title };
              const ch = d.number !== s.number || d.title !== s.title;
              return (
                <tr key={s.id} className={ch ? 'changed' : ''}>
                  <td className="hint">{i + 1}</td>
                  <td className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }} title={fileName(s.fileId)}>
                    {fileName(s.fileId)} p.{s.pageIndex + 1}
                  </td>
                  <td>
                    <input value={d.number} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, number: e.target.value } })} data-testid="label-number" />
                  </td>
                  <td>
                    <input value={d.title} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, title: e.target.value } })} data-testid="label-title" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
