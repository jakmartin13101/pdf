import { useEffect, useMemo, useState } from 'react';
import { Hash, ScanText, Tags, Wand2 } from 'lucide-react';
import type { Rect } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { detectSheetLabel, linesInRegion } from '../../core/pdf';
import { guessLabelRole, labelFromBox, titleCase, type LabelRole } from '../../core/text';

type Drafts = Record<string, { number: string; title: string }>;

// Pending edits and the box survive while the user draws a box on the drawing.
let pending: { drafts: Drafts; picked: string[] } | null = null;
let lastBox: Rect | null = null;

const ROLES: { id: LabelRole; label: string }[] = [
  { id: 'number', label: 'Sheet number' },
  { id: 'title', label: 'Sheet title' },
  { id: 'both', label: 'Number and title' },
];

export function PageLabelsDialog({ region }: { region?: { purpose: 'number' | 'title' | 'label'; rect: Rect } }) {
  const sheets = useStore((s) => s.doc.sheets);
  const currentSheetId = useStore((s) => s.currentSheetId);
  const [drafts, setDrafts] = useState<Drafts>(() => pending?.drafts ?? Object.fromEntries(sheets.map((s) => [s.id, { number: s.number, title: s.title }])));
  // Pages to read and number: all to start with.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(pending?.picked ?? sheets.map((s) => s.id)));
  const [box] = useState<Rect | null>(region?.rect ?? lastBox);
  const [role, setRole] = useState<LabelRole>(region && region.purpose !== 'label' ? region.purpose : 'number');
  const [boxText, setBoxText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('A-');
  const [startNo, setStartNo] = useState(1);
  const st = getState();
  const cur = sheets.find((s) => s.id === currentSheetId) ?? sheets[0];

  const readBox = async (r: Rect, as: LabelRole) => {
    const targets = sheets.filter((s) => picked.has(s.id));
    setBusy(`Reading the box on ${targets.length} page${targets.length === 1 ? '' : 's'}…`);
    const next: Drafts = { ...drafts };
    const texts: Record<string, string> = {};
    let found = 0;
    for (const s of targets) {
      const lines = await linesInRegion(s.fileId, s.pageIndex, r, s.width, s.height);
      texts[s.id] = lines.join(' / ');
      const got = labelFromBox(lines, as);
      if (got.number || got.title) {
        found++;
        next[s.id] = { ...next[s.id], ...got };
      }
    }
    setDrafts(next);
    setBoxText(texts);
    setBusy(null);
    setMsg(
      found
        ? `Read the box on ${found} of ${targets.length} page${targets.length === 1 ? '' : 's'}. Review and click Apply.`
        : 'No text in that box. Scanned drawings have no text layer – type the labels instead.',
    );
  };

  useEffect(() => {
    pending = null;
    if (!region) return;
    lastBox = region.rect;
    void (async () => {
      // Guess what the box holds from the page it was drawn on.
      let as = role;
      if (region.purpose === 'label' && cur) {
        as = guessLabelRole(await linesInRegion(cur.fileId, cur.pageIndex, region.rect, cur.width, cur.height));
        setRole(as);
      }
      await readBox(region.rect, as);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    pending = null;
    st.setDialog(null);
  };

  const pickBox = () => {
    pending = { drafts, picked: [...picked] };
    st.setDialog(null);
    st.setTool({ kind: 'region', purpose: 'label' });
    st.toast('Drag a box around the sheet number or title in the title block', 'info');
  };

  const autoDetect = async () => {
    setBusy('Detecting sheet numbers and titles from title blocks…');
    const next: Drafts = { ...drafts };
    let found = 0;
    const targets = sheets.filter((s) => picked.has(s.id));
    for (const s of targets) {
      const d = await detectSheetLabel(s.fileId, s.pageIndex, s.width, s.height);
      if (d?.number) {
        found++;
        next[s.id] = { number: d.number, title: d.title ? titleCase(d.title) : next[s.id].title };
      }
    }
    setDrafts(next);
    setBusy(null);
    setMsg(found ? `Detected labels on ${found} of ${targets.length} pages.` : 'No sheet numbers found. Use "Read from a Box" and box the sheet number in the title block.');
  };

  const changed = sheets.filter((s) => drafts[s.id] && (drafts[s.id].number !== s.number || drafts[s.id].title !== s.title));
  const pick = (ids: string[]) => setPicked(new Set(ids));
  const unlabelled = useMemo(() => sheets.filter((s) => /^\d+$/.test(s.number) || / – Page \d+$/.test(s.title)).map((s) => s.id), [sheets]);

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
              msg && (
                <span className="hint" data-testid="labels-msg">
                  {msg}
                </span>
              )
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
        Give each page a sheet number and title. Box the number (or title, or both) once on a page: the same spot is read on every ticked page. Or detect them from the title
        blocks, or number the pages in order.
      </div>
      <div className="field-row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm narrow" onClick={pickBox} disabled={!!busy} data-testid="labels-box">
          <ScanText size={13} /> Read from a Box on the Page…
        </button>
        <button className="btn sm narrow" onClick={autoDetect} disabled={!!busy} data-testid="labels-detect">
          <Wand2 size={13} /> Auto-detect from Title Blocks
        </button>
        <span className="narrow" style={{ flex: 1 }} />
        <span className="narrow hint">In order:</span>
        <input className="narrow" style={{ width: 60 }} value={prefix} onChange={(e) => setPrefix(e.target.value)} title="Prefix" />
        <input className="narrow" style={{ width: 52 }} type="number" value={startNo} onChange={(e) => setStartNo(Number(e.target.value))} title="Start number" />
        <button
          className="btn sm narrow"
          onClick={() => {
            const next = { ...drafts };
            sheets.filter((s) => picked.has(s.id)).forEach((s, i) => (next[s.id] = { ...next[s.id], number: `${prefix}${startNo + i}` }));
            setDrafts(next);
          }}
          title="Number the ticked pages in order"
          data-testid="labels-number"
        >
          <Hash size={13} /> Number
        </button>
      </div>

      {box && (
        <div className="pl-box" data-testid="labels-box-panel">
          <svg className="pl-mini" viewBox="0 0 100 70" aria-label="Where the box is on the page">
            <rect x={1} y={1} width={98} height={68} className="pl-page" />
            <rect x={1 + box.x * 98} y={1 + box.y * 68} width={Math.max(1.5, box.w * 98)} height={Math.max(1.5, box.h * 68)} className="pl-region" />
          </svg>
          <div className="pl-box-main">
            <label className="inline">
              The box holds the
              <select value={role} onChange={(e) => setRole(e.target.value as LabelRole)} data-testid="labels-role">
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row" style={{ justifyContent: 'flex-start' }}>
              <button className="btn sm narrow primary" disabled={!!busy || !picked.size} onClick={() => void readBox(box, role)} data-testid="labels-read">
                Read the Box on {picked.size === sheets.length ? `All ${sheets.length} Pages` : `${picked.size} Ticked Page${picked.size === 1 ? '' : 's'}`}
              </button>
              <button className="btn sm narrow" onClick={pickBox} disabled={!!busy}>
                Draw Another Box…
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="field-row pl-pick" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <span className="hint narrow">Pages:</span>
        <button className="btn sm narrow" onClick={() => pick(sheets.map((s) => s.id))} data-testid="labels-pick-all">
          All
        </button>
        <button className="btn sm narrow" onClick={() => pick([])} data-testid="labels-pick-none">
          None
        </button>
        <button className="btn sm narrow" disabled={!unlabelled.length} onClick={() => pick(unlabelled)} title="Pages still numbered 1, 2, 3… or titled by file name">
          Unlabelled ({unlabelled.length})
        </button>
        <span className="hint narrow" data-testid="labels-picked">
          {picked.size} of {sheets.length} ticked
        </span>
      </div>
      <div className="labels-scroll">
        <table className="labels-table">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: 60 }}>Page</th>
              {box && <th style={{ width: 170 }}>In the box</th>}
              <th style={{ width: 130 }}>Sheet Number</th>
              <th>Sheet Title</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s, i) => {
              const d = drafts[s.id] ?? { number: s.number, title: s.title };
              const ch = d.number !== s.number || d.title !== s.title;
              return (
                <tr key={s.id} className={`${ch ? 'changed' : ''}${picked.has(s.id) ? '' : ' unpicked'}`} data-testid="label-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={picked.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        setPicked(next);
                      }}
                      data-testid="label-pick"
                    />
                  </td>
                  <td className="hint">{i + 1}</td>
                  <td className="hint">p.{s.pageIndex + 1}</td>
                  {box && (
                    <td className="hint pl-read" title={boxText[s.id]} data-testid="label-box-text">
                      {boxText[s.id] ?? ''}
                    </td>
                  )}
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
