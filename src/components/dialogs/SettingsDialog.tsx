// Settings & Preferences (Settings menu): personal preferences, the project's units, drawing and
// editing behaviour, automatic takeoff line styles and the workspace.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react';
import { COMMANDS, COMMAND_BY_ID, chordFromEvent, chordLabel, conflicts, resolveBindings } from '../../core/keymap';
import type { AutoStyleRule, CountSymbol, LengthUnit, LineStyle, ProjectSettings } from '../../types';
import { COUNT_SYMBOLS, OTHER_SHAPES, defaultDetailStyles, lookStyle, newDetailStyle, type DetailShapeStyle } from '../../core/detailMarks';
import { dashArray, symbolPath } from '../../core/shapes';
import { defaultListStyle, getState, useStore, type PerfPrefs, type SettingsTab } from '../../store/store';
import { cmdConvertSubjects, cmdExportListStyle, cmdImportListStyle, cmdSaveDefaultListStyle } from '../../store/commands';
import { DEFAULT_SUBJECTS, cleanSubjects, findSubject } from '../../core/subjects';
import { defaultCombineSettings, type CombineSettings } from '../../core/combine';
import { lenText } from '../../core/combineReport';
import { LengthSetting } from './CombineDialog';
import { allColumns } from '../../core/columns';
import { desktop, type GpuMode } from '../../brand';
import { AUTO_MATCH, autoStyleFor, defaultAutoStyles, isAutoMarkup, newAutoStyle, withRule } from '../../core/autoStyles';
import { MEMBER_FAMILIES } from '../../core/autoTakeoff';
import { LENGTH_UNITS, bareUnit, fmtLen, fmtNumber, parseLength, precisionOptions, userPrecisionFor, type UserUnits } from '../../core/units';
import { CommitInput } from '../fields';
import { LineSample, StepSelect } from '../EndAdjuster';
import { Modal } from './Modal';

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: 'general', label: 'General', hint: 'You, theme and tools' },
  { id: 'units', label: 'Units & Totals', hint: 'Feet-inches, metric, totals' },
  { id: 'editing', label: 'Drawing & Editing', hint: 'Snapping and adjusting' },
  { id: 'lengths', label: 'Length Measurements', hint: 'Maximum length by shape' },
  { id: 'keys', label: 'Keyboard', hint: 'Shortcuts for commands' },
  { id: 'subjects', label: 'Subjects', hint: 'Shapes markups can have' },
  { id: 'details', label: 'Detail Marks', hint: 'Detail material by shape' },
  { id: 'combine', label: 'Combine', hint: 'Stock lengths to order' },
  { id: 'list', label: 'Markups List', hint: 'Default columns for new files' },
  { id: 'auto', label: 'Auto Takeoff', hint: 'Line styles by subject' },
  { id: 'speed', label: 'Speed & Graphics', hint: 'Graphics card, rendering' },
  { id: 'workspace', label: 'Workspace', hint: 'Panels and toolbar' },
];

const LINE_STYLES: { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

function Check({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testId?: string }) {
  return (
    <label className="set-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{children}</span>
    </label>
  );
}

function General() {
  const prefs = useStore((s) => s.prefs);
  const ui = useStore((s) => s.ui);
  const st = getState();
  return (
    <>
      <div className="field">
        <label>Author name</label>
        <input value={prefs.author} onChange={(e) => st.setPrefs({ author: e.target.value })} data-testid="set-author" />
      </div>
      <div className="field">
        <label>Theme</label>
        <select value={ui.theme} onChange={(e) => st.setUI({ theme: e.target.value as 'dark' | 'light' | 'system' })} data-testid="set-theme">
          <option value="system">Match system</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="field">
        <label>Mouse wheel</label>
        <select value={prefs.wheelZoom ? 'zoom' : 'scroll'} onChange={(e) => st.setPrefs({ wheelZoom: e.target.value === 'zoom' })}>
          <option value="zoom">Zoom (Ctrl+wheel also zooms)</option>
          <option value="scroll">Scroll / pan (Ctrl+wheel zooms)</option>
        </select>
      </div>
      <Check checked={prefs.showLabels} onChange={(v) => st.setPrefs({ showLabels: v })}>
        Show measurement labels on the drawing
      </Check>
      <Check checked={prefs.reuse} onChange={(v) => st.setPrefs({ reuse: v })}>
        Keep a tool active after placing a markup (Reuse)
      </Check>
      <Check checked={prefs.autoProperties} onChange={(v) => st.setPrefs({ autoProperties: v })} testId="set-auto-properties">
        Show the Properties panel when a markup is drawn or selected
      </Check>
      <Check checked={ui.showHiddenTools} onChange={(v) => st.setUI({ showHiddenTools: v })}>
        Show hidden Tool Chest tools
      </Check>
      <div className="hint">Preferences are yours: they stay on this computer and apply to every project.</div>
    </>
  );
}

/** The units you measure and type lengths in: yours, for every project. */
function YourUnits() {
  const u = useStore((s) => s.prefs.units);
  const st = getState();
  const set = (patch: Partial<UserUnits>) => st.setPrefs({ units: { ...u, ...patch } });
  return (
    <>
      <h4 className="set-h">Your units</h4>
      <div className="field">
        <label>Measure in</label>
        <select
          value={u.unit}
          onChange={(e) => {
            const unit = e.target.value as LengthUnit;
            set({ unit, precision: userPrecisionFor(unit) });
          }}
          data-testid="set-user-unit"
        >
          {LENGTH_UNITS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Precision</label>
        <select value={u.precision} onChange={(e) => set({ precision: Number(e.target.value) })} data-testid="set-user-precision">
          {precisionOptions(u.unit).map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <Check checked={u.perSheet} onChange={(v) => set({ perSheet: v })} testId="set-user-per-sheet">
        Show each sheet's measurements in the units of its own scale
      </Check>
      <div className="hint">
        Measurements, heights, piece lengths and maximums are shown in these units, and lengths you type are rewritten in them:{' '}
        <b>0-28</b> becomes <b>{fmtLen(28)}</b>. A sheet calibrated in the same units keeps its own precision. Yours: on this computer, for every project.
      </div>
      <h4 className="set-h">This project</h4>
    </>
  );
}

function Units() {
  const settings = useStore((s) => s.doc.settings);
  const loaded = useStore((s) => s.loaded);
  const st = getState();
  const set = (p: Partial<ProjectSettings>) => st.updateSettings(p);
  return (
    <>
      <YourUnits />
      <div className="hint">{loaded ? 'Saved with this project (undo with Ctrl+Z).' : 'Open a project to change its units.'}</div>
      <div className="field">
        <label>Length totals</label>
        <select value={settings.lengthUnit} disabled={!loaded} onChange={(e) => set({ lengthUnit: e.target.value as ProjectSettings['lengthUnit'] })} data-testid="set-length-unit">
          <option value="ft">Linear feet (LF)</option>
          <option value="in">Inches</option>
          <option value="m">Meters</option>
        </select>
      </div>
      <div className="field">
        <label>Area</label>
        <select value={settings.areaUnit} disabled={!loaded} onChange={(e) => set({ areaUnit: e.target.value as ProjectSettings['areaUnit'] })}>
          <option value="sf">Square feet (SF)</option>
          <option value="sy">Square yards (SY)</option>
          <option value="m2">Square meters (m²)</option>
        </select>
      </div>
      <div className="field">
        <label>Volume</label>
        <select value={settings.volumeUnit} disabled={!loaded} onChange={(e) => set({ volumeUnit: e.target.value as ProjectSettings['volumeUnit'] })}>
          <option value="cy">Cubic yards (CY)</option>
          <option value="cf">Cubic feet (CF)</option>
          <option value="m3">Cubic meters (m³)</option>
        </select>
      </div>
      <div className="field">
        <label>Decimals</label>
        <select value={settings.decimals} disabled={!loaded} onChange={(e) => set({ decimals: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Check checked={settings.showPerimeterOnArea} onChange={(v) => loaded && set({ showPerimeterOnArea: v })}>
        Show perimeter on area labels
      </Check>
      <div className="hint">
        Sheet scales are set per sheet: <b>Measure → Calibrate</b> or <b>Set Scale</b>, and viewports for details at another scale.
      </div>
    </>
  );
}

function Editing() {
  const prefs = useStore((s) => s.prefs);
  const st = getState();
  const nudge = prefs.nudge;
  return (
    <>
      <h4 className="set-h">Snapping</h4>
      <Check checked={prefs.snapContent} onChange={(v) => st.setPrefs({ snapContent: v })}>
        Snap to the drawing's line work (endpoints, midpoints, intersections)
      </Check>
      <Check checked={prefs.snapMarkup} onChange={(v) => st.setPrefs({ snapMarkup: v })}>
        Snap to markups
      </Check>
      <Check checked={prefs.ortho} onChange={(v) => st.setPrefs({ ortho: v })}>
        Ortho: draw at 0° / 45° / 90°
      </Check>

      <h4 className="set-h">Fine adjustment</h4>
      <div className="field">
        <label>Arrow keys move by</label>
        <div className="field-row">
          <select value={nudge.unit} onChange={(e) => st.setPrefs({ nudge: { ...nudge, unit: e.target.value as 'px' | 'real' } })} data-testid="set-nudge-unit">
            <option value="px">Screen pixels</option>
            <option value="real">A drawing length</option>
          </select>
          {nudge.unit === 'px' ? (
            <input
              type="number"
              min={1}
              max={50}
              value={nudge.px}
              onChange={(e) => st.setPrefs({ nudge: { ...nudge, px: Math.max(1, Number(e.target.value) || 1) } })}
              style={{ width: 70 }}
              className="narrow"
            />
          ) : (
            <CommitInput
              value={fmtLen(nudge.real)}
              onCommit={(v) => {
                const n = parseLength(v, bareUnit('in'));
                if (n && n > 0) st.setPrefs({ nudge: { ...nudge, real: n } });
                else st.toast(`Could not read that length. Try 1" or 0'-6"`, 'error');
              }}
              style={{ width: 90 }}
              className="narrow"
              data-testid="set-nudge-real"
            />
          )}
        </div>
      </div>
      <div className="hint">Shift + arrow moves 10 times as far. A drawing length uses each markup's own scale.</div>
      <div className="field">
        <label>End adjustment step</label>
        <StepSelect metric={false} testId="set-adjust-step" />
      </div>
      <div className="hint">
        The step for the − / + buttons that lengthen or shorten a measurement's ends (Properties → <i>Adjust Ends</i>, and members in the Auto Takeoff panel).
      </div>

    </>
  );
}

/** Settings → Keyboard: every command's shortcuts; record new ones, remove or reset them. */
function Keyboard() {
  const overrides = useStore((s) => s.prefs.keys);
  const st = getState();
  const bindings = resolveBindings(overrides);
  const [filter, setFilter] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const [clash, setClash] = useState<{ id: string; chord: string; others: string[] } | null>(null);
  const setKeys = (id: string, keys: string[]) => st.setPrefs({ keys: { ...overrides, [id]: keys } });
  const add = (id: string, chord: string, replace = false) => {
    const others = conflicts(chord, bindings, id);
    if (others.length && !replace) {
      setClash({ id, chord, others });
      return;
    }
    const next = { ...overrides };
    for (const o of others) next[o] = (bindings.get(o) ?? []).filter((k) => k !== chord);
    next[id] = [...(bindings.get(id) ?? []).filter((k) => k !== chord), chord];
    st.setPrefs({ keys: next });
    setClash(null);
    setRecording(null);
  };
  const q = filter.trim().toLowerCase();
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  const changed = Object.keys(overrides).length;
  return (
    <>
      <div className="field-row">
        <input placeholder="Search commands or keys" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="keys-search" />
        <button className="btn sm narrow" disabled={!changed} onClick={() => st.setPrefs({ keys: {} })} data-testid="keys-reset-all">
          <RotateCcw size={12} /> Reset All
        </button>
      </div>
      <div className="hint">
        Click <b>+</b> next to a command and press the keys. Single keys (like <kbd>L</kbd>) work on the drawing; add Ctrl, Shift or Alt for more. Fixed keys: Space (hold) pans,
        Esc cancels, Enter finishes a shape, arrows move the selection.
      </div>
      {clash && (
        <div className="set-clash" data-testid="keys-clash">
          <b>{chordLabel(clash.chord)}</b> is used by {clash.others.map((o) => COMMAND_BY_ID.get(o)?.label).join(', ')}.
          <button className="btn sm narrow" onClick={() => add(clash.id, clash.chord, true)} data-testid="keys-replace">
            Use it for {COMMAND_BY_ID.get(clash.id)?.label}
          </button>
          <button className="btn sm narrow" onClick={() => setClash(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="set-keys" data-testid="keys-list">
        {groups.map((g) => {
          const cmds = COMMANDS.filter((c) => c.group === g && (!q || c.label.toLowerCase().includes(q) || (bindings.get(c.id) ?? []).some((k) => k.toLowerCase().includes(q))));
          if (!cmds.length) return null;
          return (
            <div key={g} className="set-keys-group">
              <h4 className="set-h">{g}</h4>
              {cmds.map((c) => {
                const keys = bindings.get(c.id) ?? [];
                const custom = c.id in overrides;
                return (
                  <div key={c.id} className={`set-key${custom ? ' custom' : ''}`} data-testid="key-row" data-command={c.id}>
                    <span className="grow">{c.label}</span>
                    <span className="set-chords">
                      {keys.map((k) => (
                        <span key={k} className="set-chord">
                          <kbd>{chordLabel(k)}</kbd>
                          <button className="icon-btn" title="Remove this shortcut" onClick={() => setKeys(c.id, keys.filter((x) => x !== k))} data-testid="key-remove">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      {recording === c.id ? (
                        <input
                          className="set-record"
                          autoFocus
                          readOnly
                          value="Press keys…"
                          onBlur={() => setRecording(null)}
                          onKeyDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.key === 'Escape') return setRecording(null);
                            const chord = chordFromEvent(e.nativeEvent);
                            if (chord) add(c.id, chord);
                          }}
                          data-testid="key-record"
                        />
                      ) : (
                        <button className="icon-btn" title="Add a shortcut" onClick={() => (setClash(null), setRecording(c.id))} data-testid="key-add">
                          <Plus size={12} />
                        </button>
                      )}
                      {custom && (
                        <button
                          className="icon-btn"
                          title="Back to the default"
                          onClick={() => {
                            const next = { ...overrides };
                            delete next[c.id];
                            st.setPrefs({ keys: next });
                          }}
                          data-testid="key-default"
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function RuleRow({ r, i, n, onChange, onMove, onRemove }: { r: AutoStyleRule; i: number; n: number; onChange: (p: Partial<AutoStyleRule>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className={`set-rule${r.enabled ? '' : ' off'}`} data-testid="style-rule">
      <input type="checkbox" checked={r.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} title={r.enabled ? 'On' : 'Off'} />
      <select value={r.match} onChange={(e) => onChange({ match: e.target.value as AutoStyleRule['match'] })} data-testid="rule-match">
        {AUTO_MATCH.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <input value={r.text} placeholder="e.g. W" onChange={(e) => onChange({ text: e.target.value })} data-testid="rule-text" />
      <input type="color" value={r.color} onChange={(e) => onChange({ color: e.target.value })} title="Line colour" data-testid="rule-color" />
      <span className="rule-font" title="Colour of the measurement label (the size)">
        <input type="color" value={r.fontColor || r.color} onChange={(e) => onChange({ fontColor: e.target.value })} data-testid="rule-font-color" />
        {r.fontColor ? (
          <button className="icon-btn" title="Same colour as the line" onClick={() => onChange({ fontColor: undefined })} data-testid="rule-font-same">
            <X size={11} />
          </button>
        ) : (
          <small className="hint">line</small>
        )}
      </span>
      <input
        type="number"
        min={0.5}
        max={12}
        step={0.5}
        value={r.lineWidth}
        onChange={(e) => onChange({ lineWidth: Math.min(12, Math.max(0.5, Number(e.target.value) || 1)) })}
        title="Line width"
        data-testid="rule-width"
      />
      <select value={r.lineStyle} onChange={(e) => onChange({ lineStyle: e.target.value as LineStyle })} data-testid="rule-style">
        {LINE_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <select value={Math.round(r.opacity * 100)} onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })} title="Opacity">
        {[100, 85, 70, 55, 40].map((o) => (
          <option key={o} value={o}>
            {o}%
          </option>
        ))}
      </select>
      <LineSample style={r} width={44} label />
      <span className="set-rule-btns">
        <button className="icon-btn" title="Move up (checked first)" disabled={i === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} />
        </button>
        <button className="icon-btn" title="Move down" disabled={i === n - 1} onClick={() => onMove(1)}>
          <ArrowDown size={13} />
        </button>
        <button className="icon-btn" title="Delete rule" onClick={onRemove} data-testid="rule-delete">
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

function AutoTakeoff() {
  const prefs = useStore((s) => s.prefs);
  const markups = useStore((s) => s.doc.markups);
  const st = getState();
  const [tryIt, setTryIt] = useState('W24X55');
  const rules = prefs.autoStyles;
  const setRules = (autoStyles: AutoStyleRule[]) => st.setPrefs({ autoStyles });
  const opts = prefs.auto;
  const setOpts = (p: Partial<typeof opts>) => st.setPrefs({ auto: { ...opts, ...p } });
  const hit = tryIt.trim() ? autoStyleFor(rules, tryIt) : undefined;
  const autos = markups.filter(isAutoMarkup);
  const restyle = () => {
    let changed = 0;
    st.updateMarkups(
      autos.map((m) => m.id),
      (m) => {
        const r = autoStyleFor(rules, m.subject) ?? autoStyleFor(rules, m.label);
        if (!r) return m;
        changed++;
        return { ...m, style: withRule(m.style, r), auto: true };
      },
    );
    st.toast(changed ? `Restyled ${changed} auto measurement${changed === 1 ? '' : 's'}` : 'No rule matches the existing auto measurements', changed ? 'success' : 'info');
  };

  return (
    <>
      <h4 className="set-h">Line style by subject</h4>
      <div className="hint">
        Measurements made by the automatic takeoff get the line of the first rule their subject matches – e.g. subjects starting with <b>W</b> as a green line. Put
        specific rules (W30) above general ones (W).
      </div>
      <div className="set-rules" data-testid="style-rules">
        <div className="set-rule head">
          <span />
          <span>Subject</span>
          <span />
          <span>Colour</span>
          <span>Text</span>
          <span>Width</span>
          <span>Line</span>
          <span>Opacity</span>
          <span />
          <span />
        </div>
        {rules.map((r, i) => (
          <RuleRow
            key={r.id}
            r={r}
            i={i}
            n={rules.length}
            onChange={(p) => setRules(rules.map((x) => (x.id === r.id ? { ...x, ...p } : x)))}
            onMove={(d) => {
              const next = [...rules];
              [next[i], next[i + d]] = [next[i + d], next[i]];
              setRules(next);
            }}
            onRemove={() => setRules(rules.filter((x) => x.id !== r.id))}
          />
        ))}
        {!rules.length && <div className="hint" style={{ padding: 6 }}>No rules: auto measurements use the Tool Chest tool's look or a colour per size.</div>}
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm narrow" onClick={() => setRules([...rules, newAutoStyle({ text: '' })])} data-testid="rule-add">
          <Plus size={12} /> Add Rule
        </button>
        <button className="btn sm narrow" onClick={() => setRules(defaultAutoStyles())} data-testid="rule-reset">
          <RotateCcw size={12} /> Reset to Defaults
        </button>
      </div>
      <div className="field">
        <label>Try a subject</label>
        <div className="field-row">
          <input value={tryIt} onChange={(e) => setTryIt(e.target.value)} data-testid="rule-try" />
          <span className="narrow set-try" data-testid="rule-try-result">
            {hit ? (
              <>
                <LineSample style={hit} width={40} /> {AUTO_MATCH.find((m) => m.id === hit.match)?.label} “{hit.text}”
              </>
            ) : (
              'no rule'
            )}
          </span>
        </div>
      </div>
      <div className="field">
        <label>No rule matches</label>
        <select value={prefs.autoUseToolStyle ? 'tool' : 'size'} onChange={(e) => st.setPrefs({ autoUseToolStyle: e.target.value === 'tool' })} data-testid="set-auto-fallback">
          <option value="tool">Tool Chest tool for the size, else a colour per size</option>
          <option value="size">A colour per size</option>
        </select>
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm narrow" disabled={!autos.length} onClick={restyle} data-testid="rule-restyle">
          Apply to {autos.length} Existing Auto Measurement{autos.length === 1 ? '' : 's'}
        </button>
      </div>

      <h4 className="set-h">Finding members</h4>
      <div className="auto-families">
        {MEMBER_FAMILIES.map((f) => (
          <label key={f.id} title={f.hint}>
            <input type="checkbox" checked={opts.families.includes(f.id)} onChange={(e) => setOpts({ families: e.target.checked ? [...opts.families, f.id] : opts.families.filter((x) => x !== f.id) })} />
            {f.label}
            <small>{f.hint}</small>
          </label>
        ))}
      </div>
      <Check checked={opts.skipExisting} onChange={(v) => setOpts({ skipExisting: v })}>
        Skip members already taken off
      </Check>
      <Check checked={opts.useprinted} onChange={(v) => setOpts({ useprinted: v })}>
        Sheets without a scale: use the scale printed on the drawing
      </Check>
      <div className="field">
        <label>Add to each end</label>
        <input value={opts.extend} placeholder={`0'-0"`} onChange={(e) => setOpts({ extend: e.target.value })} style={{ maxWidth: 110 }} />
      </div>
    </>
  );
}

const GPU_STATUS: Record<string, string> = {
  '2d_canvas': '2D canvas (drawings)',
  gpu_compositing: 'Compositing (pan and zoom)',
  rasterization: 'Rasterization',
  webgl: 'WebGL',
};
const statusText = (v: string) => (v.startsWith('enabled') ? 'Graphics card' : v.includes('software') ? 'Software' : v.replace(/_/g, ' '));

function Speed() {
  const perf = useStore((s) => s.prefs.perf);
  const st = getState();
  const set = (p: Partial<PerfPrefs>) => st.setPrefs({ perf: { ...perf, ...p } });
  const [gfx, setGfx] = useState<Awaited<ReturnType<NonNullable<typeof desktop>['graphics'] & {}>> | null>(null);
  useEffect(() => {
    void desktop?.graphics?.().then(setGfx);
  }, []);
  const renderer = useMemo(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch {
      return null;
    }
  }, []);
  return (
    <>
      <h4 className="set-h">Graphics card</h4>
      {desktop?.graphics ? (
        <>
          <div className="field">
            <label>Hardware acceleration</label>
            <select
              value={gfx?.saved ?? 'auto'}
              onChange={async (e) => {
                await desktop!.setGraphics!(e.target.value as GpuMode);
                setGfx(await desktop!.graphics!());
              }}
              data-testid="set-gpu"
            >
              <option value="auto">On (recommended)</option>
              <option value="force">On, even for graphics drivers Chromium does not trust</option>
              <option value="off">Off – software only (for display problems)</option>
            </select>
          </div>
          {gfx && gfx.saved !== gfx.mode && (
            <div className="set-clash">
              Restart BuildSuite Takeoff Studio to apply this.
              <button className="btn sm narrow" onClick={() => void desktop!.relaunch!()}>
                Restart Now
              </button>
            </div>
          )}
          {gfx && (
            <table className="set-gpu" data-testid="gpu-status">
              <tbody>
                {Object.entries(GPU_STATUS).map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className={gfx.status[k]?.startsWith('enabled') ? 'ok-text' : 'hint'}>{gfx.status[k] ? statusText(gfx.status[k]) : '–'}</td>
                  </tr>
                ))}
                <tr>
                  <td>Graphics</td>
                  <td className="hint">{renderer ?? 'not reported'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      ) : (
        <div className="hint" data-testid="gpu-status">
          In a browser, the browser decides whether to use the graphics card (its <i>Use hardware acceleration</i> setting). Graphics: <b>{renderer ?? 'not reported'}</b>
        </div>
      )}
      <Check checked={perf.hwa} onChange={(v) => set({ hwa: v })} testId="set-hwa">
        Draw PDFs on graphics-card canvases (applies to drawings opened after the change)
      </Check>

      <h4 className="set-h">Opening and rendering</h4>
      <Check checked={perf.prefetch} onChange={(v) => set({ prefetch: v })} testId="set-prefetch">
        Render the next and previous sheets ahead, so paging through a set is instant
      </Check>
      <div className="field">
        <label>Rendered pages kept</label>
        <select value={perf.cache} onChange={(e) => set({ cache: e.target.value as PerfPrefs['cache'] })} data-testid="set-cache">
          <option value="small">Few (about 80 MB of memory)</option>
          <option value="normal">Normal (about 190 MB)</option>
          <option value="large">Many (about 440 MB)</option>
        </select>
      </div>
      <Check checked={perf.backgroundLabels} onChange={(v) => set({ backgroundLabels: v })}>
        Large sets (over 12 pages): show the drawing first, read sheet numbers from the title blocks afterwards
      </Check>
      <div className="hint">Kept pages show at once when you come back to them; switching pages and the thumbnails use them too.</div>
    </>
  );
}

/** Lengths that can be ordered, as chips with × and a box to add one (bare numbers are feet). */
function StockLengths({ lengths, onChange, metric, testId }: { lengths: number[]; onChange: (l: number[]) => void; metric: boolean; testId: string }) {
  const [add, setAdd] = useState('');
  const doAdd = () => {
    const n = parseLength(add, metric ? 'm' : 'ft');
    if (n == null || n <= 0) {
      if (add.trim()) getState().toast(`“${add}” is not a length`, 'error');
      return;
    }
    onChange([...new Set([...lengths, Math.round(n * 1000) / 1000])].sort((a, b) => a - b));
    setAdd('');
  };
  return (
    <div className="cmb-lengths" data-testid={testId}>
      {lengths.map((l) => (
        <span key={l} className="set-chip cmb-chip" data-testid="stock-length">
          {lenText(l, metric)}
          <button className="icon-btn" title="Remove this length" onClick={() => onChange(lengths.filter((x) => x !== l))} data-testid="stock-length-remove">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        className="cmb-add"
        value={add}
        placeholder={metric ? '+ e.g. 12' : "+ e.g. 30'"}
        onChange={(e) => setAdd(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && doAdd()}
        onBlur={doAdd}
        data-testid="stock-length-add"
      />
    </div>
  );
}

/** Combine report settings: the machine allowance, the kerf and the lengths each shape can be ordered in. */
function CombineStock() {
  const c = useStore((s) => s.prefs.combine);
  const metric = useStore((s) => s.doc.settings.lengthUnit === 'm');
  const [shape, setShape] = useState('');
  const st = getState();
  const set = (patch: Partial<CombineSettings>) => st.setPrefs({ combine: { ...c, ...patch } });
  const setLengths = (i: number, lengths: number[]) => set({ stock: c.stock.map((x, j) => (j === i ? { ...x, lengths } : x)) });
  const adding = shape.trim();
  const clash = !!adding && c.stock.some((x) => x.shape.toUpperCase() === adding.toUpperCase());
  const addShape = () => {
    if (!adding || clash) return;
    set({ stock: [...c.stock, { shape: adding, lengths: [...c.other] }] });
    setShape('');
  };
  return (
    <>
      <div className="hint">
        The Combine Report (Tools → Combine Report) nests the pieces of each size on the lengths you can order. Each bar keeps an allowance for the machine; each cut
        loses the kerf. Bare numbers are feet for stock lengths and inches for the allowance and kerf.
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start', gap: 16 }}>
        <label className="inline">
          Machine allowance per bar
          <LengthSetting value={c.allowance} unit="in" metric={metric} onChange={(v) => set({ allowance: v })} testId="set-combine-allowance" />
        </label>
        <label className="inline">
          Kerf per cut
          <LengthSetting value={c.kerf} unit="in" metric={metric} onChange={(v) => set({ kerf: v })} testId="set-combine-kerf" />
        </label>
      </div>
      <h4 className="set-h">Stock lengths by shape</h4>
      <div className="cmb-stock-table" data-testid="stock-table">
        {c.stock.map((x, i) => (
          <div key={x.shape} className="cmb-stock-row" data-testid="stock-shape" data-shape={x.shape}>
            <b>{x.shape}</b>
            <StockLengths lengths={x.lengths} metric={metric} onChange={(l) => setLengths(i, l)} testId="stock-lengths" />
            <button className="icon-btn" title={`Remove ${x.shape}`} onClick={() => set({ stock: c.stock.filter((_, j) => j !== i) })} data-testid="stock-shape-remove">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div className="cmb-stock-row" data-testid="stock-other">
          <b title="Shapes not in the list">Other</b>
          <StockLengths lengths={c.other} metric={metric} onChange={(other) => set({ other })} testId="stock-other-lengths" />
          <span />
        </div>
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <input
          className="narrow"
          style={{ width: 120 }}
          value={shape}
          placeholder="Shape, e.g. RB"
          onChange={(e) => setShape(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addShape()}
          data-testid="stock-shape-input"
        />
        <button className="btn sm narrow primary" disabled={!adding || clash} onClick={addShape} data-testid="stock-shape-add">
          <Plus size={12} /> Add Shape
        </button>
        <button className="btn sm narrow" onClick={() => st.setPrefs({ combine: defaultCombineSettings() })} data-testid="stock-reset">
          <RotateCcw size={12} /> Reset to Defaults
        </button>
        {clash && <span className="hint">Already in the list.</span>}
      </div>
      <div className="hint">
        Sizes whose shape is not in the list (joists, rebar, plate…) use the lengths under Other; with none there, they are listed in the report but not planned.
      </div>
    </>
  );
}

/** The subjects markups can have: shapes, added and removed by the user. */
/** A maximum length: ft-in (bare numbers are feet), blank for none. */
function MaxInput({ value, onChange, testId }: { value: number; onChange: (inches: number) => void; testId?: string }) {
  return (
    <CommitInput
      value={value > 0 ? fmtLen(value) : ''}
      placeholder="No maximum"
      onCommit={(v) => {
        if (!v.trim()) return onChange(0);
        const n = parseLength(v, bareUnit('ft'));
        if (n == null || n <= 0) getState().toast(`“${v}” is not a length`, 'error');
        else onChange(n);
      }}
      style={{ width: 120 }}
      className="narrow"
      data-testid={testId}
    />
  );
}

/** Settings → Length Measurements: the longest piece of each shape; longer measurements are broken up. */
function MaxLengths() {
  const ml = useStore((s) => s.prefs.maxLengths);
  const subjects = useStore((s) => s.prefs.subjects);
  const loaded = useStore((s) => s.loaded);
  const st = getState();
  const set = (p: Partial<typeof ml>) => st.setPrefs({ maxLengths: { ...ml, ...p } });
  const setShape = (shape: string, inches: number) => {
    const byShape = Object.fromEntries(Object.entries(ml.byShape).filter(([k]) => k.toLowerCase() !== shape.toLowerCase()));
    if (inches > 0) byShape[shape] = inches;
    set({ byShape });
  };
  const own = (shape: string) => Object.entries(ml.byShape).find(([k]) => k.toLowerCase() === shape.toLowerCase())?.[1] ?? 0;
  // The subjects, then shapes with a maximum that are no longer subjects (so they can be cleared).
  const shapes = [...subjects, ...Object.keys(ml.byShape).filter((k) => !subjects.some((x) => x.toLowerCase() === k.toLowerCase()))];
  const [all, setAll] = useState('');
  return (
    <>
      <div className="hint">
        The longest piece you take off for each shape. A length or polylength measurement longer than its shape's maximum is taken off as pieces along the same
        line, each a markup of its own on the drawing and in the Markups List: with W at 40'-0", a 63'-0" line becomes a 40'-0" W and a 23'-0" W. A markup's
        shape is its subject, else the shape of its Member Size. Bare numbers are feet.
      </div>
      <Check checked={ml.enabled} onChange={(v) => set({ enabled: v })} testId="set-max-enabled">
        Break measurements longer than their shape's maximum length into pieces
      </Check>
      <Check checked={ml.autoTakeoff} onChange={(v) => set({ autoTakeoff: v })} testId="set-max-auto">
        Also members found by the automatic takeoff
      </Check>
      <table className="grid set-max-table" data-testid="max-table">
        <thead>
          <tr>
            <th>Shape</th>
            <th>Maximum length</th>
          </tr>
        </thead>
        <tbody>
          {shapes.map((sh) => (
            <tr key={sh} data-testid="max-row" data-shape={sh}>
              <td>
                <b>{sh}</b>
                {!subjects.some((x) => x.toLowerCase() === sh.toLowerCase()) && <span className="hint"> (not a subject)</span>}
              </td>
              <td>
                <MaxInput value={own(sh)} onChange={(v) => setShape(sh, v)} testId="max-input" />
              </td>
            </tr>
          ))}
          <tr data-testid="max-row" data-shape="*">
            <td>
              <b>Other shapes</b> <span className="hint">and no shape</span>
            </td>
            <td>
              <MaxInput value={ml.other} onChange={(v) => set({ other: v })} testId="max-other" />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="field-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <input className="narrow" style={{ width: 100 }} value={all} placeholder="e.g. 40'" onChange={(e) => setAll(e.target.value)} data-testid="max-all-input" />
        <button
          className="btn sm narrow"
          disabled={!all.trim()}
          onClick={() => {
            const n = parseLength(all, 'ft');
            if (n == null || n <= 0) return st.toast(`“${all}” is not a length`, 'error');
            set({ byShape: Object.fromEntries(shapes.map((sh) => [sh, n])) });
            setAll('');
          }}
          data-testid="max-all"
        >
          Set Every Shape
        </button>
        <button className="btn sm narrow" disabled={!Object.keys(ml.byShape).length && !ml.other} onClick={() => set({ byShape: {}, other: 0 })} data-testid="max-clear">
          <RotateCcw size={12} /> Clear All
        </button>
      </div>
      <div className="hint">
        New measurements are broken as you draw them. For measurements already taken off: select them, right-click → <i>Split at Maximum Length</i> (also
        <i> Edit → Split at Maximum Length</i>){loaded ? '' : ' once a file is open'}.
      </div>
    </>
  );
}

const SYMBOL_NAMES: Record<CountSymbol, string> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  diamond: 'Diamond',
  star: 'Star',
  check: 'Check',
  cross: 'Cross',
};

/** A small picture of a shape's detail marks: its line and its count mark. */
function DetailLookSample({ look }: { look: DetailShapeStyle }) {
  const line = lookStyle(look.line);
  const r = Math.min(8, Math.max(2, look.count.size));
  const open = look.count.symbol === 'check' || look.count.symbol === 'cross';
  return (
    <svg width={92} height={24} viewBox="0 0 92 24" className="dm-sample" aria-hidden>
      {look.line.show && (
        <line
          x1={4}
          y1={16}
          x2={54}
          y2={16}
          stroke={look.line.color}
          strokeWidth={Math.min(8, look.line.width)}
          strokeDasharray={dashArray(line)?.map((n) => Math.min(n, 12)).join(' ')}
          strokeLinecap="round"
        />
      )}
      {look.count.show && (
        <path
          d={symbolPath(look.count.symbol, { x: 74, y: 12 }, r)}
          fill={open ? 'none' : look.count.color}
          fillOpacity={0.8}
          stroke={look.count.color}
          strokeWidth={open ? Math.max(1.2, r * 0.3) : 1}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Settings → Detail Marks: how the material standard details add is drawn, shape by shape. */
function DetailMarksSettings() {
  const dm = useStore((s) => s.prefs.detailMarks);
  const styles = useStore((s) => s.prefs.detailStyles);
  const subjects = useStore((s) => s.prefs.subjects);
  const [add, setAdd] = useState('');
  const st = getState();
  const setDm = (p: Partial<typeof dm>) => st.setPrefs({ detailMarks: { ...dm, ...p } });
  const set = (list: DetailShapeStyle[]) => st.setPrefs({ detailStyles: list });
  const patch = (id: string, kind: 'count' | 'line', p: Partial<DetailShapeStyle['count']> | Partial<DetailShapeStyle['line']>) =>
    set(styles.map((x) => (x.id === id ? { ...x, [kind]: { ...x[kind], ...p } } : x)));
  // Shapes first in the order added, "other shapes" last.
  const rows = [...styles.filter((x) => x.shape !== OTHER_SHAPES), ...styles.filter((x) => x.shape === OTHER_SHAPES)];
  const adding = add.trim();
  const clash = !!adding && styles.some((x) => x.shape.toLowerCase() === adding.toLowerCase());
  const doAdd = () => {
    if (!adding || clash || adding === OTHER_SHAPES) return;
    const other = styles.find((x) => x.shape === OTHER_SHAPES);
    const n = newDetailStyle(adding);
    set([...styles.filter((x) => x.shape !== OTHER_SHAPES), other ? { ...n, count: { ...other.count }, line: { ...other.line } } : n, ...(other ? [other] : [])]);
    setAdd('');
  };
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
  return (
    <>
      <div className="hint">
        The material a standard detail adds is drawn next to its markup: full-length material as a <b>line</b> the same length and direction as the markup, pieces at
        a spacing as <b>count marks</b> along it, and counted pieces as a <b>count mark</b> with the number by the markup's label. Set how each shape's material is
        drawn – a material's shape comes from its size (L4X4X3/8 is an L), else its subject.
      </div>
      <Check checked={dm.show} onChange={(v) => setDm({ show: v })} testId="set-detail-marks">
        Draw standard detail material on the drawing
      </Check>
      <div className="field-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <label className="inline">
          Space from the markup
          <select value={dm.gap} onChange={(e) => setDm({ gap: Number(e.target.value) })} data-testid="set-detail-mark-gap">
            {[...new Set([2, 4, 8, 14, dm.gap])]
              .sort((a, b) => a - b)
              .map((g) => (
                <option key={g} value={g}>
                  {g === 2 ? 'Tight' : g === 4 ? 'Small' : g === 8 ? 'Medium' : g === 14 ? 'Wide' : `${g} pt`} ({fmtNumber(g / 72, 3)}")
                </option>
              ))}
          </select>
        </label>
        <label className="inline">
          Text size
          <select value={dm.textScale} onChange={(e) => setDm({ textScale: Number(e.target.value) })} data-testid="set-detail-mark-text">
            {[...new Set([0.6, 0.75, 0.85, 1, 1.25, dm.textScale])]
              .sort((a, b) => a - b)
              .map((g) => (
                <option key={g} value={g}>
                  {Math.round(g * 100)}% of the markup's label
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="dm-scroll">
        <table className="grid dm-table" data-testid="detail-style-table">
          <thead>
            <tr>
              <th rowSpan={2}>Shape</th>
              <th rowSpan={2}>Looks like</th>
              <th colSpan={5} className="dm-group">
                Count marks <span className="hint">× quantity, @ spacing</span>
              </th>
              <th colSpan={5} className="dm-group">
                Lines <span className="hint">full length</span>
              </th>
              <th rowSpan={2} />
            </tr>
            <tr>
              <th title="Draw counted material">Show</th>
              <th>Symbol</th>
              <th title="Symbol size in points (1/72&quot;)">Size</th>
              <th>Colour</th>
              <th title="Write the number of pieces and the size">Label</th>
              <th title="Draw full-length material">Show</th>
              <th>Line</th>
              <th title="Line width in points (1/72&quot;)">Width</th>
              <th>Colour</th>
              <th title="Write the size along the line">Label</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const other = x.shape === OTHER_SHAPES;
              return (
                <tr key={x.id} data-testid="detail-style" data-shape={x.shape}>
                  <td>
                    <b>{other ? 'Other shapes' : x.shape}</b>
                  </td>
                  <td>
                    <DetailLookSample look={x} />
                  </td>
                  <td className="c">
                    <input type="checkbox" checked={x.count.show} onChange={(e) => patch(x.id, 'count', { show: e.target.checked })} data-testid="ds-count-show" />
                  </td>
                  <td>
                    <select value={x.count.symbol} onChange={(e) => patch(x.id, 'count', { symbol: e.target.value as CountSymbol })} data-testid="ds-count-symbol">
                      {COUNT_SYMBOLS.map((sy) => (
                        <option key={sy} value={sy}>
                          {SYMBOL_NAMES[sy]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="dm-num"
                      min={1}
                      max={30}
                      step={0.5}
                      value={x.count.size}
                      onChange={(e) => patch(x.id, 'count', { size: num(e.target.value, 1, 30) })}
                      data-testid="ds-count-size"
                    />
                  </td>
                  <td>
                    <input type="color" value={x.count.color} onChange={(e) => patch(x.id, 'count', { color: e.target.value })} data-testid="ds-count-color" />
                  </td>
                  <td className="c">
                    <input type="checkbox" checked={x.count.label} onChange={(e) => patch(x.id, 'count', { label: e.target.checked })} data-testid="ds-count-label" />
                  </td>
                  <td className="c">
                    <input type="checkbox" checked={x.line.show} onChange={(e) => patch(x.id, 'line', { show: e.target.checked })} data-testid="ds-line-show" />
                  </td>
                  <td>
                    <select value={x.line.lineStyle} onChange={(e) => patch(x.id, 'line', { lineStyle: e.target.value as LineStyle })} data-testid="ds-line-style">
                      {LINE_STYLES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="dm-num"
                      min={0.5}
                      max={12}
                      step={0.5}
                      value={x.line.width}
                      onChange={(e) => patch(x.id, 'line', { width: num(e.target.value, 0.5, 12) })}
                      data-testid="ds-line-width"
                    />
                  </td>
                  <td>
                    <input type="color" value={x.line.color} onChange={(e) => patch(x.id, 'line', { color: e.target.value })} data-testid="ds-line-color" />
                  </td>
                  <td className="c">
                    <input type="checkbox" checked={x.line.label} onChange={(e) => patch(x.id, 'line', { label: e.target.checked })} data-testid="ds-line-label" />
                  </td>
                  <td>
                    {!other && (
                      <button className="icon-btn" title={`Remove ${x.shape} (its material is drawn like other shapes)`} onClick={() => set(styles.filter((y) => y.id !== x.id))} data-testid="ds-remove">
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <input
          className="narrow"
          style={{ width: 120 }}
          value={add}
          list="dm-subjects"
          placeholder="Shape, e.g. RB"
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doAdd()}
          data-testid="ds-add-input"
        />
        <datalist id="dm-subjects">
          {subjects
            .filter((sub) => !styles.some((x) => x.shape.toLowerCase() === sub.toLowerCase()))
            .map((sub) => (
              <option key={sub} value={sub} />
            ))}
        </datalist>
        <button className="btn sm narrow primary" disabled={!adding || clash} onClick={doAdd} data-testid="ds-add">
          <Plus size={12} /> Add Shape
        </button>
        <button className="btn sm narrow" onClick={() => set(defaultDetailStyles())} data-testid="ds-reset">
          <RotateCcw size={12} /> Reset to Defaults
        </button>
        {clash && <span className="hint">Already in the list.</span>}
      </div>
      <div className="hint">
        Sizes are in points (72 to the inch on the sheet). The text is written in each mark's colour. These are yours: they apply to every file, on the screen and
        in flattened PDFs.
      </div>
    </>
  );
}

function Subjects() {
  const subjects = useStore((s) => s.prefs.subjects);
  const markups = useStore((s) => s.doc.markups);
  const loaded = useStore((s) => s.loaded);
  const [add, setAdd] = useState('');
  const st = getState();
  const set = (list: string[]) => st.setPrefs({ subjects: cleanSubjects(list) });
  const used = (s: string) => markups.filter((m) => findSubject(m.subject, [s])).length;
  const others = markups.filter((m) => m.subject && !findSubject(m.subject, subjects)).length;
  const adding = add.trim();
  const clash = !!adding && !!findSubject(adding, subjects);
  const doAdd = () => {
    if (!adding || clash) return;
    set([...subjects, adding]);
    setAdd('');
  };
  const move = (i: number, d: -1 | 1) => {
    const n = [...subjects];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    set(n);
  };
  return (
    <>
      <div className="hint">
        A markup's subject is the shape it takes off. These are the subjects to pick from (in the Markups List, Properties and the Tool Chest editor). New markups
        get the shape of their size: W24X55 → W, HSS6X6X3/8 → HSS. The size itself is the Member Size and the label, and the Takeoff Summary lists each size on its
        own line. The list is yours: it applies to every file.
      </div>
      <div className="set-subjects" data-testid="subject-list">
        {subjects.map((s, i) => (
          <div key={s} className="set-subject" data-testid="subject-item">
            <b>{s}</b>
            <span className="hint">{loaded ? `${used(s)} used` : ''}</span>
            <span className="set-rule-btns">
              <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={13} />
              </button>
              <button className="icon-btn" title="Move down" disabled={i === subjects.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={13} />
              </button>
              <button className="icon-btn" title={`Remove ${s}`} onClick={() => set(subjects.filter((x) => x !== s))} data-testid="subject-remove">
                <X size={13} />
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <input
          className="narrow"
          style={{ width: 120 }}
          value={add}
          placeholder="e.g. WT, RB, FB"
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doAdd()}
          data-testid="subject-add-input"
        />
        <button className="btn sm narrow primary" disabled={!adding || clash} onClick={doAdd} data-testid="subject-add">
          <Plus size={12} /> Add
        </button>
        <button className="btn sm narrow" onClick={() => set([...DEFAULT_SUBJECTS])} data-testid="subject-reset">
          <RotateCcw size={12} /> Reset to Defaults
        </button>
        {clash && <span className="hint">Already in the list.</span>}
      </div>

      <h4 className="set-h">This file</h4>
      <div className="hint" data-testid="subject-others">
        {loaded
          ? others
            ? `${others} markup${others === 1 ? ' has a subject' : 's have subjects'} that ${others === 1 ? 'is' : 'are'} not in the list (shown in italics in the Markups List), e.g. from before subjects were shapes.`
            : 'Every markup in this file has a subject from the list (or none).'
          : 'Open a file to check its subjects.'}
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button className="btn sm narrow" disabled={!loaded || !others} onClick={() => cmdConvertSubjects(false)} title="W24X55 → W (the size goes to Member Size when it is empty)" data-testid="subject-convert">
          Change Sizes to Shapes
        </button>
        <button className="btn sm narrow" disabled={!loaded || !others} onClick={() => cmdConvertSubjects(true)} title="Also clear subjects that name no shape in the list" data-testid="subject-convert-clear">
          … and Clear the Rest
        </button>
      </div>
    </>
  );
}

/** The Markups List style files opened from now on start with. */
function ListDefaults() {
  const prefs = useStore((s) => s.prefs);
  const loaded = useStore((s) => s.loaded);
  const style = defaultListStyle(prefs);
  const cols = allColumns(style.columns, style.labels);
  const names = style.visible.map((id) => cols.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  return (
    <>
      <div className="hint">
        Each file keeps its own Markups List layout: which columns show, their order, widths and header names, and its custom columns. Files you open from now on start with
        this default. Change a file's layout in the list itself (drag headers, right-click a header, or Columns…), then save it as the default here or from the list's style
        button.
      </div>
      <h4 className="set-h">Default layout {prefs.listStyle ? '' : '(built-in)'}</h4>
      <div className="set-chips" data-testid="list-default-columns">
        {names.map((n, i) => (
          <span key={i} className="set-chip">
            {n}
          </span>
        ))}
      </div>
      <div className="hint">{style.columns.length} custom columns.</div>
      <div className="field-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button className="btn sm narrow primary" disabled={!loaded} onClick={cmdSaveDefaultListStyle} data-testid="list-default-save">
          Use This File's Layout
        </button>
        <button className="btn sm narrow" onClick={() => void cmdExportListStyle('default')} data-testid="list-default-export">
          Export…
        </button>
        <button className="btn sm narrow" onClick={() => void cmdImportListStyle(true, false)} data-testid="list-default-import">
          Import…
        </button>
        <button className="btn sm narrow" disabled={!prefs.listStyle} onClick={() => getState().setPrefs({ listStyle: null })} data-testid="list-default-reset">
          <RotateCcw size={12} /> Back to Built-in
        </button>
      </div>
      <div className="hint">Export keeps a copy of the layout (a backup, or to use on another computer); Import makes a saved layout the default again.</div>
    </>
  );
}

function Workspace() {
  const layout = useStore((s) => s.layout);
  const st = getState();
  return (
    <>
      <Check checked={layout.locked} onChange={(v) => st.setLayoutLocked(v)}>
        Lock the workspace layout (panels and toolbar stay where they are)
      </Check>
      <div className="field">
        <label>Toolbar</label>
        <select value={layout.toolbar.dock} disabled={layout.locked} onChange={(e) => st.setToolbarDock(e.target.value as typeof layout.toolbar.dock, { x: 220, y: 140 })}>
          <option value="top">Top</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="float">Floating</option>
        </select>
      </div>
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm narrow" onClick={() => st.resetLayout()}>
          <RotateCcw size={12} /> Reset Workspace Layout
        </button>
      </div>
      <div className="hint">Panels can also be dragged by their header to another side, or floated; right-click a panel header for its position menu.</div>
    </>
  );
}

export function SettingsDialog({ tab: initial }: { tab?: SettingsTab }) {
  const st = getState();
  const [tab, setTab] = useState<SettingsTab>(initial ?? 'general');
  const close = () => st.setDialog(null);
  return (
    <Modal
      title="Settings & Preferences"
      icon={<Settings size={16} />}
      size="xwide"
      onClose={close}
      footer={
        <>
          <div className="left hint">Changes apply right away.</div>
          <button className="btn primary" onClick={close} data-testid="settings-done">
            Done
          </button>
        </>
      }
    >
      <div className="settings" data-testid="settings">
        <nav className="set-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`set-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} data-testid={`set-tab-${t.id}`}>
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </nav>
        <div className="set-body form" data-testid={`set-page-${tab}`}>
          {tab === 'general' && <General />}
          {tab === 'units' && <Units />}
          {tab === 'editing' && <Editing />}
          {tab === 'keys' && <Keyboard />}
          {tab === 'lengths' && <MaxLengths />}
          {tab === 'subjects' && <Subjects />}
          {tab === 'details' && <DetailMarksSettings />}
          {tab === 'combine' && <CombineStock />}
          {tab === 'list' && <ListDefaults />}
          {tab === 'auto' && <AutoTakeoff />}
          {tab === 'speed' && <Speed />}
          {tab === 'workspace' && <Workspace />}
        </div>
      </div>
    </Modal>
  );
}
