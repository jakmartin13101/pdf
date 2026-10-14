// Combine report: the stock lengths to order for every size, with the pieces nested on them and the
// cutting plan for each bar (Tools → Combine Report, or the Takeoff Summary).
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Printer, Ruler, Scissors } from 'lucide-react';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import { buildTakeoffRows } from '../../core/details';
import { combinePlan, type CombineSettings, type SizePlan } from '../../core/combine';
import { combineCsv, combineReportHtml, combineTotals, lenText, orderText, piecesText } from '../../core/combineReport';
import { fmtNumber, parseLength } from '../../core/units';
import { CommitInput } from '../fields';
import { offerFile } from '../../store/files';
import { safeName } from '../../store/project';
import { openReport } from '../../core/export';

/** A length setting typed as ft-in (bare numbers in `unit`). */
export function LengthSetting({ value, unit, onChange, testId, metric }: { value: number; unit: 'in' | 'ft'; onChange: (inches: number) => void; testId?: string; metric?: boolean }) {
  return (
    <CommitInput
      value={lenText(value, metric)}
      onCommit={(v) => {
        const n = parseLength(v, metric ? 'mm' : unit);
        if (n == null || n < 0) getState().toast(`“${v}” is not a length`, 'error');
        else onChange(n);
      }}
      style={{ width: 90 }}
      data-testid={testId}
    />
  );
}

/** One bar of the cutting plan, drawn to scale: the pieces, the machine allowance and the drop. */
function BarPlan({ bar, allowance, metric }: { bar: SizePlan['bars'][number]; allowance: number; metric: boolean }) {
  const pct = (n: number) => `${Math.max(0.6, (n / bar.stock) * 100)}%`;
  return (
    <div className="cmb-bar" data-testid="combine-bar">
      <b className="cmb-stock">{lenText(bar.stock, metric)}</b>
      <div className="cmb-track" title={`Drop ${lenText(Math.max(0, bar.drop), metric)}`}>
        {bar.pieces.map((p, i) => (
          <span key={i} className={`cmb-piece${p.detail ? ' detail' : ''}`} style={{ width: pct(p.length) }} title={`${lenText(p.length, metric)}${p.detail ? ` · ${p.detail}` : ''} · ${p.sheet}`}>
            {lenText(p.length, metric)}
          </span>
        ))}
        <span className="cmb-machine" style={{ width: pct(allowance) }} title={`Machine allowance ${lenText(allowance, metric)}`} />
      </div>
      <span className="cmb-drop">drop {lenText(Math.max(0, bar.drop), metric)}</span>
    </div>
  );
}

export function CombineDialog() {
  const doc = useStore((s) => s.doc);
  const settings = useStore((s) => s.prefs.combine);
  const currentSheetId = useStore((s) => s.currentSheetId);
  const projectName = useStore((s) => s.projectName);
  const st = getState();
  const [scope, setScope] = useState<'all' | 'sheet'>('all');
  const [withDetails, setWithDetails] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const metric = doc.settings.lengthUnit === 'm';
  const set = (patch: Partial<CombineSettings>) => st.setPrefs({ combine: { ...settings, ...patch } });

  const plans = useMemo(() => {
    const rows = buildTakeoffRows(doc, withDetails).filter((r) => scope === 'all' || r.markup.sheetId === currentSheetId);
    return combinePlan(rows, doc, settings);
  }, [doc, withDetails, scope, currentSheetId, settings]);
  const t = combineTotals(plans);
  const close = () => st.setDialog(null);
  const title = `${projectName || 'Takeoff'}`;
  const toggle = (size: string) => {
    const n = new Set(open);
    if (n.has(size)) n.delete(size);
    else n.add(size);
    setOpen(n);
  };

  return (
    <Modal
      title="Combine Report"
      icon={<Scissors size={16} />}
      size="wide"
      onClose={close}
      footer={
        <>
          <div className="left hint">
            {t.pieces} pieces on {t.bars} bars · order {lenText(t.stockLength, metric)}
            {t.stockLength ? ` · drop ${fmtNumber((t.dropLength / t.stockLength) * 100, 1)}%` : ''}
            {t.weight ? ` · ${fmtNumber(t.weight, 0)} lb` : ''}
          </div>
          <button
            className="btn"
            disabled={!plans.length}
            onClick={() => void offerFile(new Blob([combineCsv(plans, metric)], { type: 'text/csv' }), `${safeName(title)}_combine.csv`, 'Combine report')}
            data-testid="combine-csv"
          >
            <Download size={13} /> CSV
          </button>
          <button
            className="btn"
            disabled={!plans.length}
            onClick={() => {
              const html = combineReportHtml(title, plans, settings, metric);
              if (!openReport(html)) void offerFile(new Blob([html], { type: 'text/html' }), `${safeName(title)}_combine_report.html`, 'Combine report');
            }}
            data-testid="combine-print"
          >
            <Printer size={13} /> Print / PDF
          </button>
          <button className="btn primary" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <div className="hint">
        The length measurements of each size (Member Size, else the label) nested on the stock lengths you can order, using as little material as it can. Each bar keeps
        the machine allowance; every cut loses the kerf.
      </div>
      <div className="field-row cmb-opts" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <label className="inline">
          Machine allowance per bar
          <LengthSetting value={settings.allowance} unit="in" metric={metric} onChange={(v) => set({ allowance: v })} testId="combine-allowance" />
        </label>
        <label className="inline">
          Kerf per cut
          <LengthSetting value={settings.kerf} unit="in" metric={metric} onChange={(v) => set({ kerf: v })} testId="combine-kerf" />
        </label>
        <div className="seg">
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
            All Sheets
          </button>
          <button className={scope === 'sheet' ? 'on' : ''} onClick={() => setScope('sheet')} data-testid="combine-scope-sheet">
            Current Sheet
          </button>
        </div>
        <label className="inline" title="The lengths standard details add (clip angles, posts…)">
          <input type="checkbox" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} data-testid="combine-details" /> Standard detail material
        </label>
        <button className="btn sm narrow" onClick={() => st.setDialog({ kind: 'settings', tab: 'combine' })} data-testid="combine-stock">
          <Ruler size={12} /> Stock Lengths…
        </button>
      </div>
      {plans.length ? (
        <div className="cmb-scroll">
          <table className="grid cmb-table" data-testid="combine-table">
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                <th>Size</th>
                <th>Pieces</th>
                <th className="num">Cut length</th>
                <th>Order</th>
                <th className="num">Ordered</th>
                <th className="num">Drop</th>
                <th className="num">Weight</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const isOpen = open.has(p.size);
                return [
                  <tr key={p.size} className="row" onClick={() => toggle(p.size)} data-testid="combine-row" data-size={p.size}>
                    <td>{p.bars.length ? isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</td>
                    <td>
                      <b>{p.size}</b> {p.shape && <span className="hint">{p.shape}</span>}
                    </td>
                    <td title={piecesText(p, metric)} className="cmb-pieces">
                      {p.pieces.length} · {piecesText(p, metric)}
                    </td>
                    <td className="num">{lenText(p.pieceLength, metric)}</td>
                    <td data-testid="combine-order">
                      {p.noStock ? (
                        <span className="warn-text" title="Add stock lengths for this shape in Settings → Combine">
                          No stock lengths for {p.shape || 'this shape'}
                        </span>
                      ) : (
                        <b>{orderText(p, metric)}</b>
                      )}
                      {p.tooLong.length > 0 && (
                        <div className="warn-text" title="Longer than the longest stock length">
                          {p.tooLong.length} too long – splice
                        </div>
                      )}
                    </td>
                    <td className="num">{lenText(p.stockLength, metric)}</td>
                    <td className="num">{lenText(p.dropLength, metric)}</td>
                    <td className="num">{p.plf ? `${fmtNumber((p.stockLength / 12) * p.plf, 0)} lb` : ''}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${p.size}-plan`} className="cmb-plan-row">
                      <td />
                      <td colSpan={7}>
                        <div className="cmb-plan" data-testid="combine-plan">
                          {p.bars.map((b, i) => (
                            <BarPlan key={i} bar={b} allowance={settings.allowance} metric={metric} />
                          ))}
                          <button
                            className="btn sm narrow"
                            onClick={() => {
                              st.setSelection([...new Set(p.pieces.map((x) => x.markupId))]);
                              close();
                            }}
                          >
                            Select These Markups
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-note" data-testid="combine-empty">
          No length measurements with a size yet. Take off members with a size tool, a Tool Chest tool with a Member Size, or the automatic takeoff.
        </div>
      )}
    </Modal>
  );
}
