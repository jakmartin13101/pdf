import { useEffect, useMemo, useState } from 'react';
import { DraftingCompass, Frame, Ruler } from 'lucide-react';
import type { LengthUnit, Pt, Rect, Scale } from '../../types';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';
import {
  LENGTH_UNITS,
  SCALE_PRESETS,
  PT_PER_IN,
  calibratedScale,
  customScale,
  defaultPrecision,
  formatLength,
  isMetric,
  parseLength,
  precisionOptions,
  scaleFromPreset,
} from '../../core/units';
import { dist, pointInRect } from '../../core/geometry';
import { sheetDisplayName } from '../../core/columns';

function UnitPrecision({ unit, precision, onChange }: { unit: LengthUnit; precision: number; onChange: (u: LengthUnit, p: number) => void }) {
  return (
    <>
      <div className="field">
        <label>Display units</label>
        <select value={unit} onChange={(e) => onChange(e.target.value as LengthUnit, defaultPrecision(e.target.value as LengthUnit))}>
          {LENGTH_UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Precision</label>
        <select value={precision} onChange={(e) => onChange(unit, Number(e.target.value))}>
          {precisionOptions(unit).map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

type ApplyTo = 'sheet' | 'all' | 'unscaled' | string; // or `vp:<id>`

function ApplyToField({ value, onChange, sheetId, viewportIds }: { value: ApplyTo; onChange: (v: ApplyTo) => void; sheetId: string; viewportIds?: { id: string; name: string }[] }) {
  const sheets = useStore((s) => s.doc.sheets);
  const sheet = sheets.find((s) => s.id === sheetId);
  const unscaled = sheets.filter((s) => !s.scale).length;
  return (
    <div className="field">
      <label>Apply to</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid="apply-to">
        {viewportIds?.map((v) => (
          <option key={v.id} value={`vp:${v.id}`}>
            Viewport “{v.name}”
          </option>
        ))}
        <option value="sheet">This sheet ({sheet?.number})</option>
        <option value="all">All sheets ({sheets.length})</option>
        <option value="unscaled">Sheets without a scale ({unscaled})</option>
      </select>
    </div>
  );
}

function applyScale(sheetId: string, scale: Scale, to: ApplyTo) {
  const st = getState();
  if (to.startsWith('vp:')) {
    st.updateViewport(sheetId, to.slice(3), { scale });
    st.toast(`Viewport scale set to ${scale.label}`, 'success');
    return;
  }
  const sheets = st.doc.sheets;
  const ids = to === 'all' ? sheets.map((s) => s.id) : to === 'unscaled' ? sheets.filter((s) => !s.scale || s.id === sheetId).map((s) => s.id) : [sheetId];
  st.setScale(ids, scale);
  st.toast(`Scale ${scale.label} applied to ${ids.length} sheet${ids.length === 1 ? '' : 's'}`, 'success');
}

// ---------------------------------------------------------------------------

export function CalibrateDialog({ sheetId, pts }: { sheetId: string; pts: [Pt, Pt] }) {
  const sheet = useStore((s) => s.doc.sheets.find((x) => x.id === sheetId));
  const st = getState();
  const pdfDist = dist(pts[0], pts[1]);
  const prevUnit = sheet?.scale?.unit ?? 'ft-in';
  const [known, setKnown] = useState('');
  const [unit, setUnit] = useState<LengthUnit>(prevUnit);
  const [precision, setPrecision] = useState(sheet?.scale?.precision ?? defaultPrecision(prevUnit));
  const vps = sheet?.viewports.filter((v) => pointInRect(pts[0], v.rect) && pointInRect(pts[1], v.rect)) ?? [];
  const [applyTo, setApplyTo] = useState<ApplyTo>(vps.length ? `vp:${vps[vps.length - 1].id}` : 'sheet');
  const realIn = parseLength(known, unit);
  const scale = realIn && realIn > 0 ? calibratedScale(realIn, pdfDist, unit, precision) : null;
  if (!sheet) return null;
  const close = () => st.setDialog(null);
  const ok = () => {
    if (!scale) return;
    applyScale(sheet.id, scale, applyTo);
    close();
  };
  return (
    <Modal
      title="Calibrate"
      icon={<DraftingCompass size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={!scale} onClick={ok} data-testid="calibrate-ok">
            OK
          </button>
        </>
      }
    >
      <div className="hint">
        {sheetDisplayName(sheet)} — the selected line measures <b>{formatLength(pdfDist / PT_PER_IN, 'in', 3)}</b> on paper. Enter the real-world distance it represents.
      </div>
      <div className="field">
        <label>Known distance</label>
        <input
          autoFocus
          value={known}
          onChange={(e) => setKnown(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
          placeholder={isMetric(unit) ? 'e.g. 6.1 m or 6100 mm' : `e.g. 20'-0" or 20' or 240"`}
          data-testid="calibrate-input"
        />
      </div>
      {known && !scale && <div className="error-text">Could not read “{known}”. Try 20'-0", 20', 20-6, 240" or 6.1 m.</div>}
      <UnitPrecision
        unit={unit}
        precision={precision}
        onChange={(u, p) => {
          setUnit(u);
          setPrecision(p);
        }}
      />
      <ApplyToField value={applyTo} onChange={setApplyTo} sheetId={sheet.id} viewportIds={vps} />
      {scale && (
        <div className="ok-text" data-testid="calibrate-result">
          Resulting scale: <b>{scale.label}</b>
          {realIn ? ` · ${formatLength(realIn, unit, precision)}` : ''}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function ScaleEditor({ initial, onChange }: { initial: Scale | null; onChange: (s: Scale | null) => void }) {
  const initPreset = initial ? SCALE_PRESETS.find((p) => Math.abs(p.realPerPt - initial.realPerPt) / p.realPerPt < 0.001)?.label : undefined;
  const [mode, setMode] = useState<'preset' | 'custom'>(initial && !initPreset ? 'custom' : 'preset');
  const [preset, setPreset] = useState(initPreset ?? `1/8" = 1'-0"`);
  const [paper, setPaper] = useState('1');
  const [paperUnit, setPaperUnit] = useState<'in' | 'mm'>('in');
  const [real, setReal] = useState(initial && !initPreset ? formatLength(initial.realPerPt * PT_PER_IN, 'ft-in', 16) : `10'-0"`);
  const p0 = SCALE_PRESETS.find((p) => p.label === preset);
  const [unit, setUnit] = useState<LengthUnit>(initial?.unit ?? p0?.unit ?? 'ft-in');
  const [precision, setPrecision] = useState(initial?.precision ?? defaultPrecision(unit));

  const scale = useMemo(() => {
    if (mode === 'preset') {
      const p = SCALE_PRESETS.find((x) => x.label === preset);
      return p ? scaleFromPreset(p, unit, precision) : null;
    }
    const pv = parseFloat(paper);
    const rv = parseLength(real, unit);
    if (!pv || !rv) return null;
    return customScale(pv, paperUnit, rv, unit, precision);
  }, [mode, preset, paper, paperUnit, real, unit, precision]);

  useEffect(() => onChange(scale), [scale, onChange]);

  return (
    <>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <button className={mode === 'preset' ? 'on' : ''} onClick={() => setMode('preset')}>
          Standard
        </button>
        <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>
          Custom
        </button>
      </div>
      {mode === 'preset' ? (
        <div className="field">
          <label>Scale</label>
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              const p = SCALE_PRESETS.find((x) => x.label === e.target.value);
              if (p && isMetric(p.unit) !== isMetric(unit)) {
                setUnit(p.unit);
                setPrecision(defaultPrecision(p.unit));
              }
            }}
            data-testid="scale-preset"
          >
            {(['Architectural', 'Engineering', 'Metric'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {SCALE_PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.label}>{p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        <div className="field">
          <label>Paper = Real</label>
          <div className="field-row">
            <input value={paper} onChange={(e) => setPaper(e.target.value)} style={{ width: 50 }} className="narrow" />
            <select value={paperUnit} onChange={(e) => setPaperUnit(e.target.value as 'in' | 'mm')} className="narrow">
              <option value="in">in</option>
              <option value="mm">mm</option>
            </select>
            <span className="narrow">=</span>
            <input value={real} onChange={(e) => setReal(e.target.value)} placeholder={`e.g. 13'-4"`} />
          </div>
        </div>
      )}
      <UnitPrecision
        unit={unit}
        precision={precision}
        onChange={(u, p) => {
          setUnit(u);
          setPrecision(p);
        }}
      />
      {scale ? <div className="ok-text">Scale: {scale.label}</div> : <div className="error-text">Enter a valid scale.</div>}
    </>
  );
}

export function ScaleDialog({ sheetId }: { sheetId: string }) {
  const sheet = useStore((s) => s.doc.sheets.find((x) => x.id === sheetId));
  const [scale, setScale] = useState<Scale | null>(null);
  const [applyTo, setApplyTo] = useState<ApplyTo>('sheet');
  const st = getState();
  if (!sheet) return null;
  const close = () => st.setDialog(null);
  return (
    <Modal
      title="Set Scale"
      icon={<Ruler size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!scale}
            onClick={() => {
              applyScale(sheet.id, scale!, applyTo);
              close();
            }}
            data-testid="scale-ok"
          >
            OK
          </button>
        </>
      }
    >
      <div className="hint">{sheetDisplayName(sheet)} — choose the drawing scale noted on the sheet, or calibrate from a known dimension instead.</div>
      <ScaleEditor initial={sheet.scale} onChange={setScale} />
      <ApplyToField value={applyTo} onChange={setApplyTo} sheetId={sheet.id} />
    </Modal>
  );
}

export function ViewportDialog({ sheetId, rect, viewportId }: { sheetId: string; rect?: Rect; viewportId?: string }) {
  const sheet = useStore((s) => s.doc.sheets.find((x) => x.id === sheetId));
  const existing = sheet?.viewports.find((v) => v.id === viewportId);
  const [name, setName] = useState(existing?.name ?? `Viewport ${(sheet?.viewports.length ?? 0) + 1}`);
  const [scale, setScale] = useState<Scale | null>(null);
  const st = getState();
  if (!sheet) return null;
  const close = () => st.setDialog(null);
  return (
    <Modal
      title={existing ? 'Edit Viewport' : 'New Viewport'}
      icon={<Frame size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!scale || !name.trim()}
            onClick={() => {
              if (existing) st.updateViewport(sheet.id, existing.id, { name: name.trim(), scale: scale! });
              else if (rect) st.addViewport(sheet.id, { name: name.trim(), rect, scale: scale! });
              st.toast(`Viewport “${name.trim()}” set to ${scale!.label}`, 'success');
              close();
            }}
            data-testid="viewport-ok"
          >
            OK
          </button>
        </>
      }
    >
      <div className="hint">Measurements that start inside this viewport use its scale instead of the sheet scale. You can also calibrate inside the viewport later.</div>
      <div className="field">
        <label>Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Detail 2/S2.01" data-testid="viewport-name" />
      </div>
      <ScaleEditor initial={existing?.scale ?? sheet.scale} onChange={setScale} />
    </Modal>
  );
}
