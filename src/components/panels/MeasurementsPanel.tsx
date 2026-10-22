// Measurements panel: the measuring tools in a row, the page scale, and the measurement properties of
// the selection – Subject, Label, its dimensions (Depth, Width, and a count's Height) and the units it is
// written in. A count with a Height takes off a length (3 plates × 1'-2" = 3'-6"); a Width gives an area.
import { useMemo } from 'react';
import { DraftingCompass, Frame, Pencil, Ruler, Trash2 } from 'lucide-react';
import type { LengthUnit, Markup, MarkupUnits, ProjectSettings, Scale } from '../../types';
import { currentSheet, getState, useStore } from '../../store/store';
import { PanelHeader } from '../dock/PanelHeader';
import { CommitInput, SubjectSelect } from '../fields';
import { PropSection } from './PropertiesPanel';
import { TYPE_ICON } from '../icons';
import { useShortcuts } from '../useShortcuts';
import { MEASURE_TYPES, TYPE_INFO } from '../../core/markupTypes';
import { areaText, computeMeasure, dimText, markupHeight, scaleForMarkup, takesDepth, takesHeight, takesWidth, volumeText } from '../../core/measure';
import { LENGTH_UNITS, SCALE_PRESETS, bareUnit, defaultPrecision, fmtNumber, formatLength, isMetric, parseLength, precisionOptions, scaleFromPreset, userUnits } from '../../core/units';
import { sheetDisplayName } from '../../core/columns';
import { sizeText } from '../../core/steelShapes';
import { useNextMarkup } from '../useNextMarkup';

function common<T>(items: Markup[], get: (m: Markup) => T): T | undefined {
  if (!items.length) return undefined;
  const first = get(items[0]);
  return items.every((m) => get(m) === first) ? first : undefined;
}

const UNIT_SHORT: Record<LengthUnit, string> = { 'ft-in': `ft' in"`, ft: 'ft', in: 'in', m: 'm', cm: 'cm', mm: 'mm' };
const AREA_UNITS: { id: NonNullable<MarkupUnits['area']>; label: string }[] = [
  { id: 'sf', label: 'sf' },
  { id: 'sy', label: 'sy' },
  { id: 'm2', label: 'm²' },
];
const VOLUME_UNITS: { id: NonNullable<MarkupUnits['volume']>; label: string }[] = [
  { id: 'cy', label: 'cy' },
  { id: 'cf', label: 'cf' },
  { id: 'm3', label: 'm³' },
];

/** The measuring tools, one button each (Calibrate first), the one in use highlighted. */
function ToolRow() {
  const tool = useStore((s) => s.tool);
  const loaded = useStore((s) => s.loaded);
  const sc = useShortcuts();
  const st = getState();
  const tip = (name: string, cmd: string) => (sc(cmd) ? `${name} (${sc(cmd)})` : name);
  return (
    <div className="meas-tools" data-testid="meas-tools">
      <button
        className={`icon-btn${tool.kind === 'calibrate' ? ' active' : ''}`}
        title={tip('Calibrate', 'tool.calibrate')}
        disabled={!loaded}
        onClick={() => st.setTool({ kind: 'calibrate' })}
        data-testid="meas-tool-calibrate"
      >
        <DraftingCompass size={17} />
      </button>
      <span className="meas-tools-sep" />
      {MEASURE_TYPES.map((t) => {
        const Icon = TYPE_ICON[t];
        const on = tool.kind === 'markup' && tool.type === t;
        return (
          <button
            key={t}
            className={`icon-btn${on ? ' active' : ''}`}
            title={tip(TYPE_INFO[t].label, `tool.${t}`)}
            disabled={!loaded}
            onClick={() => st.setTool(on ? { kind: 'select' } : { kind: 'markup', type: t })}
            data-testid={`meas-tool-${t}`}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A dimension typed in any way (0-28, 2'-4", 28"), shown in the measurement's unit for them. Bare numbers
 * are `bare` (inches for Depth and Width, feet for Height).
 */
function DimInput({
  value,
  placeholder,
  onCommit,
  testId,
  items,
  bare = 'in',
}: {
  value: number | undefined | null;
  placeholder: string;
  onCommit: (inches: number | undefined) => void;
  testId: string;
  items: Markup[];
  bare?: LengthUnit;
}) {
  const st = getState();
  const unitOf = common(items, (m) => m.units?.dim);
  const show = (n: number) => dimText({ units: unitOf ? { dim: unitOf } : undefined }, n);
  return (
    <CommitInput
      value={value == null ? '' : show(value)}
      placeholder={value === null ? '(multiple)' : placeholder}
      onCommit={(t) => {
        if (!t.trim()) return onCommit(undefined);
        const n = parseLength(t, unitOf ?? bareUnit(bare));
        if (n == null || n < 0) return st.toast(`“${t}” is not a length`, 'error');
        onCommit(n);
      }}
      data-testid={testId}
    />
  );
}

/**
 * Subject, Label, the dimensions and the units of the selected measurements – or, `forTool`, of the next
 * one the picked tool draws (changes kept in the tool).
 */
function MeasurementProperties({ items, forTool }: { items: Markup[]; forTool?: boolean }) {
  const doc = useStore((s) => s.doc);
  const st = getState();
  const ids = items.map((m) => m.id);
  const types = new Set(items.map((m) => m.type));
  const type = types.size === 1 ? items[0].type : null;
  const update = (fn: (m: Markup) => Markup) => (forTool ? st.editNextMarkup(fn) : st.updateMarkups(ids, fn));
  const set = (patch: Partial<Markup>) => update((m) => ({ ...m, ...patch }));
  const setUnits = (patch: Partial<MarkupUnits>) =>
    update((m) => {
      const u = { ...m.units, ...patch };
      for (const k of Object.keys(u) as (keyof MarkupUnits)[]) if (!u[k]) delete u[k];
      return { ...m, units: Object.keys(u).length ? u : undefined };
    });
  const all = (f: (t: Markup['type']) => boolean) => [...types].every(f);
  const heightCol = doc.columns.find((c) => c.id === 'height');
  /** A value common to all, null when they differ. */
  const same = <T,>(get: (m: Markup) => T): T | null => {
    const v = common(items, get);
    return v === undefined && items.some((m) => get(m) !== get(items[0])) ? null : (v as T);
  };
  const depth = same((m) => m.depth);
  const width = same((m) => m.width);
  const height = same((m) => markupHeight(m) || undefined);
  const lengthUnit = common(items, (m) => m.units?.length ?? '');
  const areaUnit = common(items, (m) => m.units?.area ?? '');
  const volumeUnit = common(items, (m) => m.units?.volume ?? '');
  const dimUnit = common(items, (m) => m.units?.dim ?? '');
  const you = UNIT_SHORT[userUnits().unit];
  const one = items.length === 1 ? items[0] : null;
  const sheet = one ? doc.sheets.find((s) => s.id === one.sheetId) : undefined;
  const scale = one ? scaleForMarkup(one, sheet) : null;
  const v = one && scale ? computeMeasure(one, scale) : null;
  const hasVolume = items.some((m) => m.type === 'volume' || (m.depth ?? 0) > 0);

  return (
    <div className="form meas-props" data-testid="meas-props">
      <div className="field">
        <label>Subject</label>
        <SubjectSelect value={common(items, (m) => m.subject) ?? ''} multiple={common(items, (m) => m.subject) === undefined} onChange={(s) => set({ subject: s })} editList data-testid="meas-subject" />
      </div>
      <div className="field">
        <label>Label</label>
        <CommitInput value={common(items, (m) => m.label) ?? ''} placeholder={items.length > 1 ? '(multiple)' : 'Shown on drawing'} onCommit={(l) => set({ label: sizeText(l) })} data-testid="meas-label" />
      </div>
      {all(takesDepth) && (
        <div className="field">
          <label>Depth</label>
          <div className="field-row">
            <DimInput
              items={items}
              value={depth}
              placeholder={`e.g. ${dimText({ units: dimUnit ? { dim: dimUnit } : undefined }, 0.5)}`}
              onCommit={(d) => update((m) => ({ ...m, depth: m.type === 'volume' ? d ?? 0 : d }))}
              testId="meas-depth"
            />
            <select
              className="narrow meas-unit"
              value={dimUnit ?? ''}
              title="The unit Depth, Width and Height are written in"
              onChange={(e) => setUnits({ dim: (e.target.value || undefined) as LengthUnit | undefined })}
              data-testid="meas-dim-unit"
            >
              {dimUnit === undefined && <option value="">(multiple)</option>}
              <option value="">{you}</option>
              {LENGTH_UNITS.filter((u) => u.id !== userUnits().unit).map((u) => (
                <option key={u.id} value={u.id}>
                  {UNIT_SHORT[u.id]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {all(takesWidth) && (
        <div className="field">
          <label>Width</label>
          <DimInput items={items} value={width} placeholder={`e.g. ${dimText({ units: dimUnit ? { dim: dimUnit } : undefined }, 7)}`} onCommit={(w) => set({ width: w })} testId="meas-width" />
        </div>
      )}
      {all(takesHeight) && (
        <div className="field">
          <label>Height</label>
          <DimInput
            items={items}
            value={height}
            placeholder="Length of each piece"
            bare="ft-in"
            onCommit={(h) => {
              if (!heightCol) return st.toast('This project has no Height column (Tools → Manage Columns)', 'error');
              if (forTool) update((m) => ({ ...m, custom: { ...m.custom, [heightCol.id]: h ?? '' } }));
              else st.setCustomValue(ids, heightCol.id, h ?? '');
            }}
            testId="meas-height"
          />
        </div>
      )}
      {all((t) => t !== 'area' && t !== 'volume' && t !== 'angle') && (
        <div className="field">
          <label>Length</label>
          <select value={lengthUnit ?? ''} onChange={(e) => setUnits({ length: (e.target.value || undefined) as LengthUnit | undefined })} data-testid="meas-length-unit">
            {lengthUnit === undefined && <option value="">(multiple)</option>}
            <option value="">{you}</option>
            {LENGTH_UNITS.filter((u) => u.id !== userUnits().unit).map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {all((t) => t !== 'angle') && (
        <div className="field">
          <label>Area</label>
          <select value={areaUnit ?? ''} onChange={(e) => setUnits({ area: (e.target.value || undefined) as MarkupUnits['area'] })} data-testid="meas-area-unit">
            {areaUnit === undefined && <option value="">(multiple)</option>}
            <option value="">{`${doc.settings.areaUnit === 'm2' ? 'm²' : doc.settings.areaUnit} (project)`}</option>
            {AREA_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasVolume && (
        <div className="field">
          <label>Volume</label>
          <select value={volumeUnit ?? ''} onChange={(e) => setUnits({ volume: (e.target.value || undefined) as MarkupUnits['volume'] })} data-testid="meas-volume-unit">
            {volumeUnit === undefined && <option value="">(multiple)</option>}
            <option value="">{`${doc.settings.volumeUnit === 'm3' ? 'm³' : doc.settings.volumeUnit} (project)`}</option>
            {VOLUME_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {one && v && scale && !forTool && (
        <div className="meas-result" data-testid="meas-result">
          {v.count != null && (
            <div>
              <span>Count</span>
              <b>{fmtNumber(v.count, 0)}</b>
            </div>
          )}
          {v.length != null && (
            <div>
              <span>{one.type === 'count' ? `Length (${fmtNumber(v.count ?? 0, 0)} × ${dimText(one, markupHeight(one))})` : 'Length'}</span>
              <b data-testid="meas-result-length">{formatLength(v.length, scale.unit, scale.precision)}</b>
            </div>
          )}
          {v.area != null && (
            <div>
              <span>Area</span>
              <b data-testid="meas-result-area">{areaText(one, v.area, scale, doc.settings)}</b>
            </div>
          )}
          {v.volume != null && (
            <div>
              <span>Volume</span>
              <b data-testid="meas-result-volume">{volumeText(one, v.volume, scale, doc.settings)}</b>
            </div>
          )}
        </div>
      )}
      {type === 'count' && !height && <div className="hint">A Height takes off a length: each piece counted that long (3 × 1'-2" = 3'-6"). With a Width, an area.</div>}
    </div>
  );
}

/** The sheet's scale: calibrate, presets, units, viewports. */
function PageScale() {
  const sheet = useStore(currentSheet);
  const sheets = useStore((s) => s.doc.sheets);
  const st = getState();
  if (!sheet) return <div className="empty-note">Open a drawing set to calibrate scales.</div>;
  const scale = sheet.scale;
  const updateScale = (patch: Partial<Scale>) => scale && st.setScale([sheet.id], { ...scale, ...patch });
  const unscaled = sheets.filter((s) => !s.scale).length;
  return (
    <div className="form" data-testid="measurements">
      <div className="hint" style={{ fontWeight: 600, color: 'var(--text)' }}>
        {sheetDisplayName(sheet)}
      </div>
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
      <h4 className="meas-sub">
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
  );
}

/** The project's units for totals. */
function TotalsDisplay() {
  const settings = useStore((s) => s.doc.settings);
  const st = getState();
  const setSettings = (p: Partial<ProjectSettings>) => st.updateSettings(p);
  return (
    <div className="form">
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
  );
}

export function MeasurementsPanel() {
  const selection = useStore((s) => s.selection);
  const markups = useStore((s) => s.doc.markups);
  const loaded = useStore((s) => s.loaded);
  useStore((s) => s.prefs.units); // dimensions are written in your units
  const selected = useMemo(() => {
    const s = new Set(selection);
    return markups.filter((m) => s.has(m.id) && TYPE_INFO[m.type].measure);
  }, [selection, markups]);
  // A measuring tool picked and nothing selected: the next measurement, to set up before drawing.
  const next = useNextMarkup();
  const forTool = !selection.length && !!next && TYPE_INFO[next.type].measure;
  const items = useMemo(() => (forTool ? [next!] : selected), [forTool, next, selected]);
  const types = new Set(items.map((m) => m.type));
  const title = forTool
    ? `Next ${TYPE_INFO[items[0].type].label} Measurement`
    : types.size === 1
      ? `${TYPE_INFO[items[0].type].label} Measurement Properties`
      : 'Measurement Properties';

  return (
    <div className="panel" style={{ height: '100%' }}>
      <PanelHeader title="Measurements" icon={<Ruler size={14} />} />
      <ToolRow />
      <div className="panel-body meas-body">
        <PropSection id="meas-scale" title="Page Scale" defaultOpen>
          <PageScale />
        </PropSection>
        <PropSection id="meas-props" title={title} hint={items.length > 1 ? `${items.length} selected` : undefined} defaultOpen>
          {items.length ? (
            <MeasurementProperties items={items} forTool={forTool} />
          ) : (
            <div className="hint meas-empty">{loaded ? 'Select a measurement to see its Subject, Label, dimensions and units.' : 'Open a drawing set to measure.'}</div>
          )}
        </PropSection>
        <PropSection id="meas-totals" title="Totals & Display" hint="This project">
          <TotalsDisplay />
        </PropSection>
      </div>
    </div>
  );
}
