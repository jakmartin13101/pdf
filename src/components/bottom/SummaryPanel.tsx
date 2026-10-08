import { useMemo, useState } from 'react';
import type { CustomColumn, DocState } from '../../types';
import { Download, Printer } from 'lucide-react';
import { getState, useStore } from '../../store/store';
import { allColumns, customColId } from '../../core/columns';
import { buildSummary, primaryQuantity, summableCustomColumns } from '../../core/summary';
import { AREA_SUFFIX, LENGTH_SUFFIX, VOLUME_SUFFIX, fmtNumber } from '../../core/units';
import { useFilteredRows } from './MarkupsList';
import { exportSummaryCsv, printSummary } from '../MenuBar';
import { downloadText, summaryCsv } from '../../core/export';
import { safeName } from '../../store/project';

export function SummaryPanel() {
  const doc = useStore((s) => s.doc);
  const projectName = useStore((s) => s.projectName);
  const { rows, filtered } = useFilteredRows();
  const [groupBy, setGroupBy] = useState<string | null>('c:category');
  const [useFilter, setUseFilter] = useState(false);
  const source = useFilter ? filtered : rows;
  const validGroup = groupBy && allColumns(doc.columns).some((c) => c.id === groupBy) ? groupBy : null;
  const { groups, total } = useMemo(() => buildSummary(source, doc, validGroup), [source, doc, validGroup]);
  const extras = summableCustomColumns(doc);
  const s = doc.settings;
  const groupOptions = allColumns(doc.columns).filter((c) => !c.numeric && ['subject', 'page', 'type', 'layer', 'status', 'author'].includes(c.id) || (c.custom && c.custom.kind !== 'number' && c.custom.kind !== 'formula'));
  const n = (v: number, d = s.decimals) => (v ? fmtNumber(v, d) : '');
  const weightCol = extras.find((c) => /weight/i.test(c.name));
  const weight = weightCol ? total.extras[customColId(weightCol)] ?? 0 : 0;

  const selectIds = (ids: string[]) => {
    const st = getState();
    st.setSelection(ids);
    if (ids.length === 1) st.focusMarkup(ids[0]);
  };

  return (
    <div className="panel-body summary" data-testid="summary">
      <div className="kpis">
        <div className="kpi">
          <small>Markups</small>
          <b>{fmtNumber(total.markups, 0)}</b>
        </div>
        <div className="kpi">
          <small>Count</small>
          <b>{fmtNumber(total.count, 0)} EA</b>
        </div>
        <div className="kpi">
          <small>Length</small>
          <b>
            {fmtNumber(total.length, 1)} {LENGTH_SUFFIX[s.lengthUnit]}
          </b>
        </div>
        <div className="kpi">
          <small>Area</small>
          <b>
            {fmtNumber(total.area, 1)} {AREA_SUFFIX[s.areaUnit]}
          </b>
        </div>
        <div className="kpi">
          <small>Volume</small>
          <b>
            {fmtNumber(total.volume, 2)} {VOLUME_SUFFIX[s.volumeUnit]}
          </b>
        </div>
        {weightCol && (
          <div className="kpi">
            <small>{weightCol.name}</small>
            <b>
              {fmtNumber(weight, 0)} {weightCol.suffix ?? ''} {weightCol.suffix === 'lbs' && weight ? <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>({fmtNumber(weight / 2000, 2)} tons)</span> : null}
            </b>
          </div>
        )}
      </div>
      <div className="summary-head">
        <h3>Takeoff Summary</h3>
        <label className="inline" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-dim)' }}>
          Group by
          <select value={validGroup ?? ''} onChange={(e) => setGroupBy(e.target.value || null)}>
            <option value="">None</option>
            {groupOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={useFilter} onChange={(e) => setUseFilter(e.target.checked)} /> Use Markups List filters
        </label>
        <div style={{ flex: 1 }} />
        <button
          className="btn sm"
          onClick={() => (useFilter ? downloadText(summaryCsv(filtered, doc, validGroup), `${safeName(projectName)}_summary.csv`) : exportSummaryCsv(validGroup))}
        >
          <Download size={13} /> CSV
        </button>
        <button className="btn sm" onClick={() => printSummary(validGroup)}>
          <Printer size={13} /> Report
        </button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th style={{ width: '24%' }}>
              <div className="th-inner">Subject</div>
            </th>
            <th>
              <div className="th-inner">Quantity</div>
            </th>
            <th>
              <div className="th-inner">Markups</div>
            </th>
            <th>
              <div className="th-inner">Count (EA)</div>
            </th>
            <th>
              <div className="th-inner">Length ({LENGTH_SUFFIX[s.lengthUnit]})</div>
            </th>
            <th>
              <div className="th-inner">Area ({AREA_SUFFIX[s.areaUnit]})</div>
            </th>
            <th>
              <div className="th-inner">Volume ({VOLUME_SUFFIX[s.volumeUnit]})</div>
            </th>
            {extras.map((c) => (
              <th key={c.id}>
                <div className="th-inner">
                  {c.name}
                  {c.suffix ? ` (${c.suffix})` : ''}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <SummaryGroupRows key={g.name} g={g} grouped={!!validGroup} extras={extras} n={n} onSelect={selectIds} doc={doc} />
          ))}
          {!groups.length && (
            <tr>
              <td colSpan={7 + extras.length} className="empty-note">
                No takeoff data yet.
              </td>
            </tr>
          )}
        </tbody>
        {total.markups > 0 && (
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td />
              <td className="num">{total.markups}</td>
              <td className="num">{n(total.count, 0)}</td>
              <td className="num">{n(total.length)}</td>
              <td className="num">{n(total.area)}</td>
              <td className="num">{n(total.volume)}</td>
              {extras.map((c) => (
                <td key={c.id} className="num">
                  {n(total.extras[customColId(c)] ?? 0, c.decimals ?? s.decimals)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SummaryGroupRows({
  g,
  grouped,
  extras: ex,
  n: fmt,
  onSelect,
  doc,
}: {
  g: ReturnType<typeof buildSummary>['groups'][0];
  grouped: boolean;
  extras: CustomColumn[];
  n: (v: number, d?: number) => string;
  onSelect: (ids: string[]) => void;
  doc: DocState;
}) {
  const s = doc.settings;
  return (
    <>
      {grouped && (
        <tr className="cat">
          <td colSpan={7 + ex.length}>{g.name}</td>
        </tr>
      )}
      {g.lines.map((l) => (
        <tr key={l.subject} className="row" onClick={() => onSelect(l.ids)} title="Click to select these markups" data-testid="summary-row">
          <td>
            <span className="color-dot" style={{ background: l.color, marginRight: 7 }} />
            {l.subject}
          </td>
          <td className="num" style={{ fontWeight: 700 }}>
            {primaryQuantity(l, doc)}
          </td>
          <td className="num">{l.markups}</td>
          <td className="num">{fmt(l.count, 0)}</td>
          <td className="num">{fmt(l.length)}</td>
          <td className="num">{fmt(l.area)}</td>
          <td className="num">{fmt(l.volume)}</td>
          {ex.map((c) => (
            <td key={c.id} className="num">
              {fmt(l.extras[customColId(c)] ?? 0, c.decimals ?? s.decimals)}
            </td>
          ))}
        </tr>
      ))}
      {grouped && g.lines.length > 1 && (
        <tr className="group">
          <td>{g.name} subtotal</td>
          <td />
          <td className="num">{g.total.markups}</td>
          <td className="num">{fmt(g.total.count, 0)}</td>
          <td className="num">{fmt(g.total.length)}</td>
          <td className="num">{fmt(g.total.area)}</td>
          <td className="num">{fmt(g.total.volume)}</td>
          {ex.map((c) => (
            <td key={c.id} className="num">
              {fmt(g.total.extras[customColId(c)] ?? 0, c.decimals ?? s.decimals)}
            </td>
          ))}
        </tr>
      )}
    </>
  );
}
