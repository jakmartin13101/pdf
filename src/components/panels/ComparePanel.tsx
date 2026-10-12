import { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Eye,
  EyeOff,
  GitCompareArrows,
  Hand,
  Loader2,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { SheetCompare } from '../../types';
import { currentSheet, getState, useStore } from '../../store/store';
import { PanelHeader } from '../dock/PanelHeader';
import { sheetLongName } from '../../core/columns';
import { COMPARE_PRESETS, autoAlign, findSheetChanges, transformKey, type Sensitivity } from '../../core/compare';
import { CommitInput } from '../fields';

const PT_PER_IN = 72;
const fmt = (n: number, d = 2) => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(d);

/** Range input that updates the overlay live and records one undo step per drag. */
function LiveRange({ value, onLive, testId }: { value: number; onLive: (v: number) => void; testId: string }) {
  const st = getState();
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      onPointerDown={() => st.beginChange()}
      onPointerUp={() => st.endChange()}
      onChange={(e) => onLive(Number(e.target.value) / 100)}
      title={`${Math.round(value * 100)}%`}
      data-testid={testId}
    />
  );
}

function LayerRow({ which, cmp, sheetId, label }: { which: 'A' | 'B'; cmp: SheetCompare; sheetId: string; label: React.ReactNode }) {
  const st = getState();
  const k = which === 'A' ? ({ show: 'showA', color: 'colorA', intensity: 'intensityA' } as const) : ({ show: 'showB', color: 'colorB', intensity: 'intensityB' } as const);
  const lower = which.toLowerCase();
  return (
    <div className="cmp-row">
      <button
        className="icon-btn"
        title={cmp[k.show] ? `Hide sheet ${which}` : `Show sheet ${which}`}
        onClick={() => st.updateCompare(sheetId, { [k.show]: !cmp[k.show] })}
        data-testid={`compare-show-${lower}`}
      >
        {cmp[k.show] ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <span className="cmp-badge" style={{ background: cmp[k.color] }}>
        {which}
      </span>
      <input
        type="color"
        value={cmp[k.color]}
        title={`Colour of sheet ${which}`}
        onFocus={() => st.beginChange()}
        onBlur={() => st.endChange()}
        onChange={(e) => st.updateCompare(sheetId, { [k.color]: e.target.value }, true)}
        data-testid={`compare-color-${lower}`}
      />
      <div className="cmp-row-main">
        <div className="cmp-sheet-name">{label}</div>
        <div className="cmp-intensity">
          <span>Intensity</span>
          <LiveRange value={cmp[k.intensity]} onLive={(v) => st.updateCompare(sheetId, { [k.intensity]: v }, true)} testId={`compare-intensity-${lower}`} />
          <span className="cmp-pct">{Math.round(cmp[k.intensity] * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export function ComparePanel() {
  const sheet = useStore(currentSheet);
  const doc = useStore((s) => s.doc);
  const tool = useStore((s) => s.tool);
  const changes = useStore((s) => (sheet ? s.compareChanges[sheet.id] : undefined));
  const [busy, setBusy] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('medium');
  const [step, setStep] = useState(0.1);
  const [pointCount, setPointCount] = useState<2 | 3>(2);
  const st = getState();

  const header = <PanelHeader title="Compare" icon={<GitCompareArrows size={14} />} />;
  if (!sheet) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        {header}
        <div className="empty-note">Open a drawing set to compare sheets.</div>
      </div>
    );
  }
  const cmp = sheet.compare;
  const other = cmp ? doc.sheets.find((s) => s.id === cmp.sheetId) : undefined;
  const overlaid = doc.sheets.filter((s) => s.compare);

  if (!cmp || !other) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        {header}
        <div className="panel-body">
          <div className="form" data-testid="compare-panel">
            <div className="hint">
              Overlay another sheet on <b>{sheetLongName(sheet, doc)}</b> to compare revisions: each sheet's line work is drawn in its own colour, so unchanged work
              shows dark and changes show in colour.
            </div>
            <button className="btn primary" onClick={() => st.setDialog({ kind: 'compare', sheetId: sheet.id })} data-testid="compare-start">
              <GitCompareArrows size={14} /> Compare / Overlay Sheets…
            </button>
            {overlaid.length > 0 && (
              <div className="form-section">
                <h4>Sheets with an overlay</h4>
                {overlaid.map((s) => (
                  <button key={s.id} className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={() => st.setCurrentSheet(s.id)}>
                    {sheetLongName(s, doc)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const t = cmp.transform;
  const setT = (patch: Partial<SheetCompare['transform']>) => st.updateCompare(sheet.id, { transform: { ...t, ...patch }, alignedBy: 'manual', agreement: undefined });
  const nudge = (dx: number, dy: number) => setT({ tx: t.tx + dx * step * PT_PER_IN, ty: t.ty + dy * step * PT_PER_IN });
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      st.toast(`${label.replace('…', '')} failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };
  const auto = () =>
    run('Aligning…', async () => {
      const r = await autoAlign(sheet, other);
      st.updateCompare(sheet.id, { transform: r.transform, alignedBy: r.by, matches: r.matches, agreement: r.agreement, enabled: true });
      st.toast(`Aligned ${r.by === 'text' ? `on ${r.matches} text matches` : 'by image'} · ${Math.round(r.agreement * 100)}% of line work matches`, 'success');
    });
  const find = () =>
    run('Finding changes…', async () => {
      const list = await findSheetChanges(sheet, other, t, sensitivity);
      st.setCompareChanges(sheet.id, { changes: list, transformKey: transformKey(t), visible: true });
      st.toast(list.length ? `Found ${list.length} change${list.length === 1 ? '' : 's'}` : 'No changes found', list.length ? 'success' : 'info');
    });
  const addClouds = () => {
    if (!changes?.changes.length) return;
    const made = st.addMarkups(
      changes.changes.map((c, i) => ({
        type: 'cloud' as const,
        sheetId: sheet.id,
        points: [
          { x: c.x, y: c.y },
          { x: c.x + c.w, y: c.y },
          { x: c.x + c.w, y: c.y + c.h },
          { x: c.x, y: c.y + c.h },
        ],
        extra: {
          subject: 'Revision Change',
          label: `Δ${i + 1}`,
          layer: doc.layers.some((l) => l.id === 'layer-review') ? 'layer-review' : '',
          comments: `${c.kind === 'added' ? 'Only on' : c.kind === 'removed' ? 'Not on' : 'Changed on'} ${sheetLongName(other, doc)}`,
        },
      })),
    );
    const ids = made.map((m) => m.id);
    st.setSelection(ids);
    st.setCompareChanges(sheet.id, { ...changes, visible: false });
    st.toast(`Added ${ids.length} revision cloud${ids.length === 1 ? '' : 's'} to ${sheet.number}`, 'success');
  };
  const status =
    cmp.alignedBy === 'text'
      ? `Auto-aligned on ${cmp.matches ?? 0} text matches`
      : cmp.alignedBy === 'image'
        ? 'Auto-aligned by image'
        : cmp.alignedBy === 'points'
          ? `Aligned by ${cmp.matches ?? 2} points`
          : cmp.alignedBy === 'manual'
            ? 'Adjusted by hand'
            : 'Not aligned yet';
  const stale = changes && changes.transformKey !== transformKey(t);
  const picking = tool.kind === 'alignPoints' && tool.sheetId === sheet.id;
  const moving = tool.kind === 'moveOverlay' && tool.sheetId === sheet.id;

  return (
    <div className="panel" style={{ height: '100%' }}>
      {header}
      <div className="panel-body">
        <div className="form" data-testid="compare-panel">
          <div className="field-row">
            <label className="cmp-switch narrow">
              <input type="checkbox" checked={cmp.enabled} onChange={(e) => st.updateCompare(sheet.id, { enabled: e.target.checked })} data-testid="compare-enabled" />
              Overlay on
            </label>
            <div />
            <button className="icon-btn narrow" title="Remove the overlay from this sheet" onClick={() => st.setCompare(sheet.id, null)} data-testid="compare-remove">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="form-section cmp-layers">
            <h4>Sheets</h4>
            <LayerRow which="A" cmp={cmp} sheetId={sheet.id} label={<b title="This sheet">{sheetLongName(sheet, doc)}</b>} />
            <LayerRow
              which="B"
              cmp={cmp}
              sheetId={sheet.id}
              label={
                <select
                  value={cmp.sheetId}
                  onChange={(e) => st.updateCompare(sheet.id, { sheetId: e.target.value, transform: { scale: 1, rotation: 0, tx: 0, ty: 0 }, alignedBy: null, agreement: undefined })}
                  data-testid="compare-sheet-b"
                >
                  {doc.sheets
                    .filter((s) => s.id !== sheet.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {sheetLongName(s, doc)}
                      </option>
                    ))}
                </select>
              }
            />
            <div className="cmp-presets">
              {COMPARE_PRESETS.map((p) => (
                <button key={p.name} className="btn sm" title={p.name} onClick={() => st.updateCompare(sheet.id, { colorA: p.a, colorB: p.b })}>
                  <span className="cmp-dot" style={{ background: p.a }} />
                  <span className="cmp-dot" style={{ background: p.b }} />
                </button>
              ))}
              <button className="btn sm" onClick={() => st.updateCompare(sheet.id, { colorA: cmp.colorB, colorB: cmp.colorA })} title="Swap the two colours">
                Swap
              </button>
            </div>
            <div className="hint">Overlapping line work is drawn dark; what is only on A shows in A's colour, what is only on B in B's.</div>
          </div>

          <div className="form-section">
            <h4>Alignment</h4>
            <div className="cmp-status" data-testid="compare-status">
              {status}
              {cmp.agreement != null && ` · ${Math.round(cmp.agreement * 100)}% of line work matches`}
            </div>
            <div className="cmp-buttons">
              <button className="btn sm" disabled={!!busy} onClick={auto} data-testid="compare-auto">
                <Wand2 size={13} /> Auto Align
              </button>
              <button
                className={`btn sm${moving ? ' primary' : ''}`}
                onClick={() => st.setTool(moving ? { kind: 'select' } : { kind: 'moveOverlay', sheetId: sheet.id })}
                title="Drag the overlaid sheet into place (Shift keeps it straight)"
                data-testid="compare-move"
              >
                <Hand size={13} /> {moving ? 'Done Moving' : 'Move by Hand'}
              </button>
              <button
                className={`btn sm${picking ? ' primary' : ''}`}
                onClick={() =>
                  picking ? st.setTool({ kind: 'select' }) : st.setTool({ kind: 'alignPoints', sheetId: sheet.id, count: pointCount, ptsA: [], ptsB: [] })
                }
                title="Click points on this sheet, then the same points on the overlaid sheet"
                data-testid="compare-points"
              >
                <Crosshair size={13} /> {picking ? 'Cancel Points' : 'Align by Points'}
              </button>
              <select value={pointCount} onChange={(e) => setPointCount(Number(e.target.value) as 2 | 3)} title="Number of point pairs" data-testid="compare-point-count">
                <option value={2}>2 point pairs</option>
                <option value={3}>3 point pairs</option>
              </select>
            </div>
            {picking && (
              <div className="hint cmp-pick" data-testid="compare-pick-hint">
                {tool.ptsA.length < tool.count
                  ? `Sheet A: click point ${tool.ptsA.length + 1} of ${tool.count} (pick sharp features far apart, e.g. grid intersections).`
                  : `Sheet B: click the same point ${tool.ptsB.length + 1} of ${tool.count}.`}
              </div>
            )}
            <div className="cmp-fine">
              <label>
                X offset (in)
                <CommitInput value={fmt(t.tx / PT_PER_IN, 3)} onCommit={(v) => isFinite(Number(v)) && setT({ tx: Number(v) * PT_PER_IN })} data-testid="compare-dx" />
              </label>
              <label>
                Y offset (in)
                <CommitInput value={fmt(t.ty / PT_PER_IN, 3)} onCommit={(v) => isFinite(Number(v)) && setT({ ty: Number(v) * PT_PER_IN })} data-testid="compare-dy" />
              </label>
              <label>
                Rotation (°)
                <CommitInput value={fmt((t.rotation * 180) / Math.PI, 3)} onCommit={(v) => isFinite(Number(v)) && setT({ rotation: (Number(v) * Math.PI) / 180 })} data-testid="compare-rot" />
              </label>
              <label>
                Scale (%)
                <CommitInput value={fmt(t.scale * 100, 3)} onCommit={(v) => Number(v) > 0 && setT({ scale: Number(v) / 100 })} data-testid="compare-scale" />
              </label>
            </div>
            <div className="cmp-nudge">
              <button className="icon-btn" title="Nudge left" onClick={() => nudge(-1, 0)} data-testid="compare-nudge-left">
                <ArrowLeft size={14} />
              </button>
              <button className="icon-btn" title="Nudge up" onClick={() => nudge(0, -1)}>
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn" title="Nudge down" onClick={() => nudge(0, 1)}>
                <ArrowDown size={14} />
              </button>
              <button className="icon-btn" title="Nudge right" onClick={() => nudge(1, 0)} data-testid="compare-nudge-right">
                <ArrowRight size={14} />
              </button>
              <select value={step} onChange={(e) => setStep(Number(e.target.value))} title="Nudge step (paper inches)">
                <option value={0.01}>0.01"</option>
                <option value={0.1}>0.1"</option>
                <option value={1}>1"</option>
              </select>
              <button className="icon-btn" title="Rotate 0.1° counter-clockwise" onClick={() => setT({ rotation: t.rotation - (0.1 * Math.PI) / 180 })}>
                <RotateCcw size={14} />
              </button>
              <button className="icon-btn" title="Rotate 0.1° clockwise" onClick={() => setT({ rotation: t.rotation + (0.1 * Math.PI) / 180 })}>
                <RotateCw size={14} />
              </button>
              <button className="btn sm" title="Back to no shift, rotation or scaling" onClick={() => setT({ scale: 1, rotation: 0, tx: 0, ty: 0 })} data-testid="compare-reset">
                Reset
              </button>
            </div>
          </div>

          <div className="form-section">
            <h4>Changes</h4>
            <div className="field-row">
              <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)} title="How small a difference to report">
                <option value="low">Large changes only</option>
                <option value="medium">Normal</option>
                <option value="high">Small changes too</option>
              </select>
              <button className="btn sm narrow" disabled={!!busy} onClick={find} data-testid="compare-find">
                <ScanSearch size={13} /> Find Changes
              </button>
            </div>
            {busy && (
              <div className="hint">
                <Loader2 size={12} className="spin" /> {busy}
              </div>
            )}
            {changes && (
              <>
                {stale && <div className="hint" style={{ color: 'var(--warn)' }}>The overlay moved since these were found. Find changes again.</div>}
                <div className="field-row">
                  <label className="cmp-switch">
                    <input type="checkbox" checked={changes.visible} onChange={(e) => st.setCompareChanges(sheet.id, { ...changes, visible: e.target.checked })} />
                    Show {changes.changes.length} change box{changes.changes.length === 1 ? '' : 'es'}
                  </label>
                  <button className="btn sm narrow" disabled={!changes.changes.length} onClick={addClouds} title="Add a revision cloud markup around each change" data-testid="compare-clouds">
                    Add Clouds
                  </button>
                </div>
                <div className="cmp-changes-list">
                  {changes.changes.map((c, i) => (
                    <button
                      key={c.id}
                      className="cmp-change"
                      onClick={() => {
                        if (!changes.visible) st.setCompareChanges(sheet.id, { ...changes, visible: true });
                        st.requestView({ kind: 'zoomTo', rect: { x: c.x - c.w, y: c.y - c.h, w: c.w * 3, h: c.h * 3 } } as never);
                      }}
                      data-testid="compare-change"
                    >
                      <span className="cmp-num">{i + 1}</span>
                      <span className={`cmp-kind ${c.kind}`}>{c.kind === 'added' ? `Only on B` : c.kind === 'removed' ? 'Only on A' : 'Changed'}</span>
                      <small>
                        {fmt(c.w / PT_PER_IN, 1)}" × {fmt(c.h / PT_PER_IN, 1)}"
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
