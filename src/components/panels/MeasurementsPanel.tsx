import { DraftingCompass, Frame, Pencil, Ruler, Trash2 } from 'lucide-react';
import type { LengthUnit, ProjectSettings, Scale } from '../../types';
import { currentSheet, getState, useStore } from '../../store/store';
import { LENGTH_UNITS, SCALE_PRESETS, isMetric, precisionOptions, scaleFromPreset, defaultPrecision } from '../../core/units';
import { sheetDisplayName } from '../../core/columns';

export function MeasurementsPanel() {
  const sheet = useStore(currentSheet);
  const settings = useStore((s) => s.doc.settings);
  const sheets = useStore((s) => s.doc.sheets);
  const st = getState();

  if (!sheet) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        <div className="panel-header">
          <span className="title">Measurements</span>
        </div>
        <div className="empty-note">Open a drawing set to calibrate scales.</div>
      </div>
    );
  }

  const scale = sheet.scale;
  const setSettings = (p: Partial<ProjectSettings>) => st.updateSettings(p);
  const updateScale = (patch: Partial<Scale>) => scale && st.setScale([sheet.id], { ...scale, ...patch });
  const unscaled = sheets.filter((s) => !s.scale).length;

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <Ruler size={14} />
        <span className="title">Measurements</span>
      </div>
      <div className="panel-body">
        <div className="form" data-testid="measurements">
          <div className="hint" style={{ fontWeight: 600, color: 'var(--text)' }}>
            {sheetDisplayName(sheet)}
          </div>
          <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
            <h4>Sheet Scale</h4>
            <div className={`readout ${scale ? 'big' : ''}`} style={!scale ? { color: 'var(--warn)' } : undefined} data-testid="sheet-scale">
              {scale ? scale.label : 'Not calibrated'}
            </div>
            <div className="field-row">
              <button className="btn sm" onClick={() => st.setTool({ kind: 'calibrate' })} data-testid="btn-calibrate">
                <DraftingCompass size={13} /> Calibrate
              </button>
              <button className="btn sm" onClick={() => st.setDialog({ kind: 'scale', sheetId: sheet.id })}>
                Set Scale…
              </button>
            </div>
            <div className="field">
              <label>Preset</label>
              <select
                value=""
                onChange={(e) => {
                  const p = SCALE_PRESETS.find((x) => x.label === e.target.value);
                  if (p) st.setScale([sheet.id], scaleFromPreset(p, scale && isMetric(scale.unit) === (p.group === 'Metric') ? scale.unit : undefined, undefined));
                }}
              >
                <option value="">Choose a standard scale…</option>
                {(['Architectural', 'Engineering', 'Metric'] as const).map((g) => (
                  <optgroup key={g} label={g}>
                    {SCALE_PRESETS.filter((p) => p.group === g).map((p) => (
                      <option key={p.label}>{p.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {scale && (
              <>
                <div className="field">
                  <label>Units</label>
                  <select value={scale.unit} onChange={(e) => updateScale({ unit: e.target.value as LengthUnit, precision: defaultPrecision(e.target.value as LengthUnit) })}>
                    {LENGTH_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Precision</label>
                  <select value={scale.precision} onChange={(e) => updateScale({ precision: Number(e.target.value) })}>
                    {precisionOptions(scale.unit).map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <button
                    className="btn sm"
                    onClick={() => {
                      st.setScale(
                        sheets.map((s) => s.id),
                        scale,
                      );
                      st.toast(`Applied ${scale.label} to all ${sheets.length} sheets`, 'success');
                    }}
                  >
                    Apply to All Sheets
                  </button>
                  <button
                    className="btn sm"
                    disabled={!unscaled}
                    onClick={() => {
                      st.setScale(
                        sheets.filter((s) => !s.scale).map((s) => s.id),
                        scale,
                      );
                      st.toast(`Applied ${scale.label} to ${unscaled} unscaled sheet(s)`, 'success');
                    }}
                  >
                    Apply to Unscaled ({unscaled})
                  </button>
                </div>
                <button className="btn sm danger" onClick={() => st.setScale([sheet.id], null)}>
                  Clear Sheet Scale
                </button>
              </>
            )}
          </div>

          <div className="form-section">
            <h4>
              <Frame size={12} /> Viewports
            </h4>
            <div className="hint">Areas of the sheet with their own scale (details, enlarged plans). Measurements that start inside a viewport use its scale.</div>
            {sheet.viewports.map((v) => (
              <div className="vp-item" key={v.id}>
                <div className="grow">
                  <b>{v.name}</b>
                  <br />
                  <small>{v.scale.label}</small>
                </div>
                <button className="icon-btn" title="Edit viewport scale" onClick={() => st.setDialog({ kind: 'viewport', sheetId: sheet.id, viewportId: v.id })}>
                  <Pencil size={13} />
                </button>
                <button className="icon-btn" title="Zoom to viewport" onClick={() => st.requestView({ kind: 'zoomTo', rect: v.rect } as never)}>
                  <Frame size={13} />
                </button>
                <button className="icon-btn" title="Delete viewport" onClick={() => st.deleteViewport(sheet.id, v.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="btn sm" onClick={() => st.setTool({ kind: 'viewport' })} data-testid="btn-add-viewport">
              <Frame size={13} /> Add Viewport
            </button>
          </div>

          <div className="form-section">
            <h4>Totals & Display</h4>
            <div className="field">
              <label>Length totals</label>
              <select value={settings.lengthUnit} onChange={(e) => setSettings({ lengthUnit: e.target.value as ProjectSettings['lengthUnit'] })}>
                <option value="ft">Linear feet (LF)</option>
                <option value="in">Inches</option>
                <option value="m">Meters</option>
              </select>
            </div>
            <div className="field">
              <label>Area</label>
              <select value={settings.areaUnit} onChange={(e) => setSettings({ areaUnit: e.target.value as ProjectSettings['areaUnit'] })}>
                <option value="sf">Square feet (SF)</option>
                <option value="sy">Square yards (SY)</option>
                <option value="m2">Square meters (m²)</option>
              </select>
            </div>
            <div className="field">
              <label>Volume</label>
              <select value={settings.volumeUnit} onChange={(e) => setSettings({ volumeUnit: e.target.value as ProjectSettings['volumeUnit'] })}>
                <option value="cy">Cubic yards (CY)</option>
                <option value="cf">Cubic feet (CF)</option>
                <option value="m3">Cubic meters (m³)</option>
              </select>
            </div>
            <div className="field">
              <label>Decimals</label>
              <select value={settings.decimals} onChange={(e) => setSettings({ decimals: Number(e.target.value) })}>
                {[0, 1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={settings.showPerimeterOnArea} onChange={(e) => setSettings({ showPerimeterOnArea: e.target.checked })} />
              Show perimeter on area labels
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
