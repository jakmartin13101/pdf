// Settings & Preferences (Settings menu): personal preferences, the project's units, drawing and
// editing behaviour, automatic takeoff line styles and the workspace.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react';
import { COMMANDS, COMMAND_BY_ID, chordFromEvent, chordLabel, conflicts, resolveBindings } from '../../core/keymap';
import type { AutoStyleRule, LineStyle, ProjectSettings } from '../../types';
import { defaultListStyle, getState, useStore, type PerfPrefs, type SettingsTab } from '../../store/store';
import { cmdExportListStyle, cmdImportListStyle, cmdSaveDefaultListStyle } from '../../store/commands';
import { allColumns } from '../../core/columns';
import { desktop, type GpuMode } from '../../brand';
import { AUTO_MATCH, autoStyleFor, defaultAutoStyles, isAutoMarkup, newAutoStyle, withRule } from '../../core/autoStyles';
import { MEMBER_FAMILIES } from '../../core/autoTakeoff';
import { formatLength, parseLength } from '../../core/units';
import { CommitInput } from '../fields';
import { LineSample, StepSelect } from '../EndAdjuster';
import { Modal } from './Modal';

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: 'general', label: 'General', hint: 'You, theme and tools' },
  { id: 'units', label: 'Units & Totals', hint: 'This project' },
  { id: 'editing', label: 'Drawing & Editing', hint: 'Snapping and adjusting' },
  { id: 'keys', label: 'Keyboard', hint: 'Shortcuts for commands' },
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
      <Check checked={ui.showHiddenTools} onChange={(v) => st.setUI({ showHiddenTools: v })}>
        Show hidden Tool Chest tools
      </Check>
      <div className="hint">Preferences are yours: they stay on this computer and apply to every project.</div>
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
              value={formatLength(nudge.real, 'ft-in', 16)}
              onCommit={(v) => {
                const n = parseLength(v, 'in');
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
      <LineSample style={r} width={44} />
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
  const [tryIt, setTryIt] = useState('W24x55');
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
      size="wide"
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
          {tab === 'list' && <ListDefaults />}
          {tab === 'auto' && <AutoTakeoff />}
          {tab === 'speed' && <Speed />}
          {tab === 'workspace' && <Workspace />}
        </div>
      </div>
    </Modal>
  );
}
