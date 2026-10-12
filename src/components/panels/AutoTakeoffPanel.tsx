// Automatic takeoff: find the labelled beams and tubing on a sheet, review them on the drawing, and
// create length measurements for them in one step.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, ScanLine, Trash2, Wand2 } from 'lucide-react';
import type { ChestTool, CustomValue, DocState, Markup, Scale, Sheet, ToolSet } from '../../types';
import { autoIncluded, currentSheet, getState, useStore, type AutoMember, type AutoTakeoffState } from '../../store/store';
import { PanelHeader } from '../dock/PanelHeader';
import { sheetLongName } from '../../core/columns';
import { normName } from '../../core/formula';
import { defaultStyle } from '../../core/markupTypes';
import { scaleAt, viewportAt } from '../../core/measure';
import { pageVectors } from '../../core/pdf';
import { lsGet, lsSet } from '../../core/persistence';
import { MEMBER_FAMILIES, existingMeasurements, extendMember, findMemberLabels, matchMembers, printedScales, sizeColor, type MemberFamily } from '../../core/autoTakeoff';
import { findPreset, fmtNumber, formatLength, lengthToReport, parseLength, scaleFromPreset, LENGTH_SUFFIX } from '../../core/units';

interface Options {
  families: MemberFamily[];
  scope: 'sheet' | 'all';
  skipExisting: boolean;
  /** Added to each end, e.g. to reach the grid lines (a length like 0'-6"). */
  extend: string;
  /** Set a sheet's scale from the one printed on it when it has none. */
  useprinted: boolean;
}

const DEFAULTS: Options = {
  families: MEMBER_FAMILIES.filter((f) => f.on).map((f) => f.id),
  scope: 'sheet',
  skipExisting: true,
  extend: '',
  useprinted: true,
};

const same = (a: string, b: string) => normName(a) === normName(b);

/** The Tool Chest tool that takes off this size as a length, if there is one. */
export function chestToolForSize(chest: ToolSet[], size: string): ChestTool | undefined {
  const tools = chest.flatMap((s) => s.tools).filter((t) => t.type === 'length' || t.type === 'polylength');
  const memberSize = (t: ChestTool) => Object.entries(t.custom).find(([k]) => normName(k) === 'membersize')?.[1];
  const hits = tools.filter((t) => same(String(memberSize(t) ?? ''), size) || (t.sizeTool && same(t.sizeTool.value, size)) || same(t.subject, size));
  return hits.find((t) => t.type === 'length') ?? hits[0];
}

/** Markup fields for a member: from its Tool Chest tool when there is one, else plain steel. */
function markupFields(doc: DocState, tool: ChestTool | undefined, m: AutoMember): Partial<Markup> {
  const byName = new Map(doc.columns.map((c) => [normName(c.name), c]));
  const custom: Record<string, CustomValue> = {};
  const put = (name: string, v: CustomValue) => {
    const c = byName.get(normName(name));
    if (c && c.kind !== 'formula') custom[c.id] = v;
  };
  if (tool) for (const [k, v] of Object.entries(tool.custom)) put(k, v);
  else {
    put('Category', 'Structural Steel');
    put('Material', 'Steel');
    put('Qty', 1);
  }
  put('Member Size', m.size);
  const layers = new Set(doc.layers.map((l) => l.id));
  const layer = tool?.layer && layers.has(tool.layer) ? tool.layer : layers.has('layer-takeoff') ? 'layer-takeoff' : '';
  return {
    subject: tool && !tool.sizeTool ? tool.subject : m.size,
    label: m.size,
    style: tool ? { ...tool.style } : { ...defaultStyle('length'), color: sizeColor(m.size), lineWidth: 3 },
    custom,
    layer,
    toolId: tool?.id,
    text: undefined,
    comments: `Automatic takeoff from the label “${m.text}”`,
  };
}

export function AutoTakeoffPanel() {
  const doc = useStore((s) => s.doc);
  const sheet = useStore(currentSheet);
  const result = useStore((s) => s.autoTakeoff);
  const chest = useStore((s) => s.toolChest);
  const [opts, setOptsState] = useState<Options>(() => ({ ...DEFAULTS, ...lsGet<Partial<Options>>('ts.autoTakeoff', {}) }));
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const st = getState();
  const setOpts = (p: Partial<Options>) => {
    const next = { ...opts, ...p };
    setOptsState(next);
    lsSet('ts.autoTakeoff', next);
    if (p.skipExisting !== undefined && result) st.setAutoTakeoff({ ...result, skipExisting: p.skipExisting });
  };

  const sheetsById = useMemo(() => new Map(doc.sheets.map((s) => [s.id, s])), [doc.sheets]);
  const extendIn = opts.extend.trim() ? parseLength(opts.extend, 'ft-in') : 0;

  /** The scale a member will be measured with (null: the sheet has none and none is printed). */
  const scaleFor = (sh: Sheet, m: AutoMember): Scale | null => {
    const mid = { x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 };
    if (sh.scale || viewportAt(sh, mid)) return scaleAt(sh, mid);
    const printed = result?.printed[sh.id] ?? [];
    const p = opts.useprinted && printed.length === 1 ? findPreset(printed[0]) : undefined;
    return p ? scaleFromPreset(p) : null;
  };
  const pointsFor = (m: AutoMember, scale: Scale | null) => extendMember(m, extendIn && scale ? extendIn / scale.realPerPt : 0);

  const find = async () => {
    const sheets = opts.scope === 'all' ? doc.sheets : sheet ? [sheet] : [];
    if (!sheets.length) return;
    const members: AutoMember[] = [];
    const printed: Record<string, string[]> = {};
    try {
      for (const [i, sh] of sheets.entries()) {
        setBusy(`Reading ${sheetLongName(sh, doc)}${sheets.length > 1 ? ` (${i + 1} of ${sheets.length})` : ''}…`);
        const { strokes, texts } = await pageVectors(sh.fileId, sh.pageIndex);
        const found = matchMembers(findMemberLabels(texts, opts.families), strokes);
        const taken = existingMeasurements(found, doc.markups.filter((m) => m.sheetId === sh.id));
        for (const f of found) members.push({ ...f, id: `${sh.id}:${f.id}`, sheetId: sh.id, existingId: taken.get(f.id) });
        if (!sh.scale) printed[sh.id] = printedScales(texts).map((p) => p.preset.label);
      }
      st.setAutoTakeoff({ members, excluded: [], sizesOff: [], sheetIds: sheets.map((s) => s.id), printed, skipExisting: opts.skipExisting });
      setOpen({});
      const n = members.length;
      st.toast(n ? `Found ${n} member${n === 1 ? '' : 's'}` : 'No labelled beams or tubing found', n ? 'success' : 'info');
    } catch (e) {
      st.toast(`Could not read the drawing: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const groups = useMemo(() => {
    if (!result) return [];
    const by = new Map<string, AutoMember[]>();
    for (const m of result.members) {
      const list = by.get(m.size) ?? [];
      list.push(m);
      by.set(m.size, list);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [result]);

  const header = (
    <PanelHeader title="Auto Takeoff" icon={<Wand2 size={14} />}>
      {result && (
        <button className="icon-btn" title="Clear the results" onClick={() => st.setAutoTakeoff(null)} data-testid="auto-clear">
          <Trash2 size={14} />
        </button>
      )}
    </PanelHeader>
  );
  if (!sheet) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        {header}
        <div className="empty-note">Open a drawing set to take off beams and tubing automatically.</div>
      </div>
    );
  }

  const included = result ? result.members.filter((m) => autoIncluded(result, m)) : [];
  const lengthOf = (m: AutoMember) => {
    const sh = sheetsById.get(m.sheetId);
    const sc = sh ? scaleFor(sh, m) : null;
    if (!sc) return null;
    const [a, b] = pointsFor(m, sc);
    return { inches: Math.hypot(b.x - a.x, b.y - a.y) * sc.realPerPt, scale: sc };
  };
  const unscaledSheets = result
    ? result.sheetIds
        .map((id) => sheetsById.get(id)!)
        .filter((sh) => sh && result.members.some((m) => m.sheetId === sh.id && !scaleFor(sh, m)))
    : [];
  const printedUsed = result
    ? result.sheetIds.map((id) => sheetsById.get(id)!).filter((sh) => sh && !sh.scale && opts.useprinted && result.printed[sh.id]?.length === 1 && result.members.some((m) => m.sheetId === sh.id))
    : [];

  const create = () => {
    if (!result || !included.length) return;
    const scales: Record<string, Scale> = {};
    for (const sh of printedUsed) {
      const p = findPreset(result.printed[sh.id][0]);
      if (p) scales[sh.id] = scaleFromPreset(p);
    }
    const items = included.map((m) => {
      const sh = sheetsById.get(m.sheetId)!;
      return { sheetId: m.sheetId, points: pointsFor(m, scaleFor(sh, m)), extra: markupFields(doc, chestToolForSize(chest, m.size), m) };
    });
    st.setTool({ kind: 'select' });
    const made = st.applyAutoTakeoff(items, scales);
    st.setAutoTakeoff(null);
    st.setSelection(made.filter((m) => m.sheetId === sheet.id).map((m) => m.id));
    const sizes = [...new Set(made.map((m) => m.label))];
    const scaleNote = Object.keys(scales).length ? ` · scale ${Object.values(scales)[0].label} set from the drawing` : '';
    st.toast(`Added ${made.length} length measurement${made.length === 1 ? '' : 's'} (${sizes.length} size${sizes.length === 1 ? '' : 's'})${scaleNote}`, 'success');
  };

  const setResult = (patch: Partial<AutoTakeoffState>) => result && st.setAutoTakeoff({ ...result, ...patch });
  const settings = doc.settings;
  const total = (list: AutoMember[]) => list.reduce((n, m) => n + (lengthOf(m)?.inches ?? 0), 0);
  const fmtTotal = (inches: number) => `${fmtNumber(lengthToReport(inches, settings), settings.decimals)} ${LENGTH_SUFFIX[settings.lengthUnit]}`;

  return (
    <div className="panel" style={{ height: '100%' }}>
      {header}
      <div className="panel-body">
        <div className="form" data-testid="auto-panel">
          <div className="hint">
            Finds member-size labels (W24x55, HSS8x4x1/4, Pipe 4 Std…) and measures the line each one names, using the sheet's scale. Review the members on the
            drawing, then create the measurements.
          </div>

          <div className="form-section">
            <h4>Look for</h4>
            <div className="auto-families">
              {MEMBER_FAMILIES.map((f) => (
                <label key={f.id} title={f.hint}>
                  <input
                    type="checkbox"
                    checked={opts.families.includes(f.id)}
                    onChange={(e) => setOpts({ families: e.target.checked ? [...opts.families, f.id] : opts.families.filter((x) => x !== f.id) })}
                    data-testid={`auto-family-${f.id}`}
                  />
                  {f.label}
                  <small>{f.hint}</small>
                </label>
              ))}
            </div>
            <div className="field-row">
              <select value={opts.scope} onChange={(e) => setOpts({ scope: e.target.value as Options['scope'] })} data-testid="auto-scope">
                <option value="sheet">This sheet ({sheet.number || sheet.title})</option>
                <option value="all">All {doc.sheets.length} sheets</option>
              </select>
              <button className="btn primary narrow" disabled={!!busy || !opts.families.length} onClick={() => void find()} data-testid="auto-find">
                <ScanLine size={14} /> Find Members
              </button>
            </div>
            <label className="auto-opt">
              <input type="checkbox" checked={opts.skipExisting} onChange={(e) => setOpts({ skipExisting: e.target.checked })} data-testid="auto-skip-existing" />
              Skip members already taken off
            </label>
            <label className="auto-opt">
              <input type="checkbox" checked={opts.useprinted} onChange={(e) => setOpts({ useprinted: e.target.checked })} data-testid="auto-use-printed" />
              Sheets without a scale: use the scale printed on the drawing
            </label>
            <label className="auto-opt">
              Add to each end
              <input
                className={opts.extend.trim() && extendIn === null ? 'bad' : ''}
                value={opts.extend}
                placeholder={`0'-0"`}
                onChange={(e) => setOpts({ extend: e.target.value })}
                title="Lengthen each member at both ends, e.g. to reach the grid lines or column centres"
                style={{ width: 70 }}
                data-testid="auto-extend"
              />
            </label>
            {busy && (
              <div className="hint">
                <Loader2 size={12} className="spin" /> {busy}
              </div>
            )}
          </div>

          {result && (
            <div className="form-section">
              <h4>Found</h4>
              <div className="cmp-status" data-testid="auto-status">
                {result.members.length
                  ? `${result.members.length} member${result.members.length === 1 ? '' : 's'} in ${groups.length} size${groups.length === 1 ? '' : 's'}${
                      result.members.some((m) => m.existingId) ? ` · ${result.members.filter((m) => m.existingId).length} already taken off` : ''
                    }`
                  : 'No labelled beams or tubing found. Labels must sit beside the member line, parallel to it.'}
              </div>
              {printedUsed.map((sh) => (
                <div key={sh.id} className="hint" data-testid="auto-scale-note">
                  {sheetLongName(sh, doc)} has no scale yet: the drawing says <b>{result.printed[sh.id][0]}</b>, which will be set when you create the measurements.
                </div>
              ))}
              {unscaledSheets.map((sh) => (
                <div key={sh.id} className="hint warn-text" data-testid="auto-scale-warn">
                  {sheetLongName(sh, doc)} has no scale
                  {(result.printed[sh.id]?.length ?? 0) > 1 ? ` and shows several (${result.printed[sh.id].join(', ')})` : ''}. Calibrate it or set its scale for real lengths.
                  <button className="btn sm" onClick={() => st.setDialog({ kind: 'scale', sheetId: sh.id })}>
                    Set Scale…
                  </button>
                </div>
              ))}
              <div className="auto-groups">
                {groups.map(([size, list]) => {
                  const sizeOn = !result.sizesOff.includes(size);
                  const inc = list.filter((m) => autoIncluded(result, m));
                  const expanded = open[size];
                  return (
                    <div key={size} className="auto-group" data-testid="auto-group" data-size={size}>
                      <div className="auto-group-head">
                        <button className="icon-btn" onClick={() => setOpen({ ...open, [size]: !expanded })} title={expanded ? 'Hide members' : 'Show members'}>
                          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <input
                          type="checkbox"
                          checked={sizeOn}
                          onChange={() => setResult({ sizesOff: sizeOn ? [...result.sizesOff, size] : result.sizesOff.filter((x) => x !== size) })}
                          title={sizeOn ? 'Leave this size out' : 'Include this size'}
                          data-testid="auto-size-check"
                        />
                        <span className="swatch" style={{ background: sizeColor(size) }} />
                        <span className="grow auto-size">{size}</span>
                        <span className="auto-count" data-testid="auto-size-count">
                          {inc.length}
                          {inc.length !== list.length ? `/${list.length}` : ''}
                        </span>
                        <span className="auto-len">{fmtTotal(total(inc))}</span>
                      </div>
                      {expanded && (
                        <div className="auto-members">
                          {list.map((m) => {
                            const on = autoIncluded(result, m);
                            const l = lengthOf(m);
                            const sh = sheetsById.get(m.sheetId)!;
                            return (
                              <div key={m.id} className={`auto-member${on ? '' : ' off'}`} data-testid="auto-member-row">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={!sizeOn}
                                  onChange={() =>
                                    setResult({
                                      excluded: on ? [...result.excluded, m.id] : result.excluded.filter((x) => x !== m.id),
                                      ...(m.existingId && !on && result.skipExisting ? { skipExisting: false } : {}),
                                    })
                                  }
                                />
                                <button
                                  className="auto-zoom"
                                  onClick={() => {
                                    if (st.currentSheetId !== m.sheetId) st.setCurrentSheet(m.sheetId);
                                    const x = Math.min(m.p1.x, m.p2.x);
                                    const y = Math.min(m.p1.y, m.p2.y);
                                    const w = Math.abs(m.p2.x - m.p1.x);
                                    const h = Math.abs(m.p2.y - m.p1.y);
                                    const pad = Math.max(w, h) * 0.4 + 30;
                                    st.requestView({ kind: 'zoomTo', rect: { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 } } as never);
                                  }}
                                  title="Zoom to this member"
                                >
                                  {result.sheetIds.length > 1 && <small>{sh.number || sh.title}</small>}
                                  <span>{l ? formatLength(l.inches, l.scale.unit, l.scale.precision) : 'no scale'}</span>
                                  {m.existingId && <em>taken off</em>}
                                  {m.dashed && <em>dashed</em>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {result.members.length > 0 && (
                <>
                  <div className="auto-total">
                    <span>Total</span>
                    <span data-testid="auto-total-count">{included.length}</span>
                    <span>{fmtTotal(total(included))}</span>
                  </div>
                  <div className="hint">Click a member on the drawing to leave it out or put it back.</div>
                  <button className="btn primary" disabled={!included.length} onClick={create} data-testid="auto-create">
                    <Wand2 size={14} /> Create {included.length} Measurement{included.length === 1 ? '' : 's'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
