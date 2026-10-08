import { Info, Keyboard, Settings } from 'lucide-react';
import { getState, useStore } from '../../store/store';
import { Modal } from './Modal';

export function ConfirmDialog({ title, message, onConfirm }: { title: string; message: string; onConfirm: () => void }) {
  const st = getState();
  const close = () => st.setDialog(null);
  return (
    <Modal
      title={title}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              close();
              onConfirm();
            }}
            data-testid="confirm-ok"
          >
            OK
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  );
}

export function SettingsDialog() {
  const prefs = useStore((s) => s.prefs);
  const ui = useStore((s) => s.ui);
  const st = getState();
  return (
    <Modal title="Preferences" icon={<Settings size={16} />} onClose={() => st.setDialog(null)} footer={<button className="btn primary" onClick={() => st.setDialog(null)}>Done</button>}>
      <div className="field">
        <label>Author name</label>
        <input value={prefs.author} onChange={(e) => st.setPrefs({ author: e.target.value })} />
      </div>
      <div className="field">
        <label>Mouse wheel</label>
        <select value={prefs.wheelZoom ? 'zoom' : 'scroll'} onChange={(e) => st.setPrefs({ wheelZoom: e.target.value === 'zoom' })}>
          <option value="zoom">Zoom (Ctrl+wheel also zooms)</option>
          <option value="scroll">Scroll / pan (Ctrl+wheel zooms)</option>
        </select>
      </div>
      <div className="field">
        <label>Theme</label>
        <select value={ui.theme} onChange={(e) => st.setUI({ theme: e.target.value as 'dark' | 'light' })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="field">
        <label>Tool behaviour</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={prefs.reuse} onChange={(e) => st.setPrefs({ reuse: e.target.checked })} /> Keep tool active after placing (Reuse)
        </label>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select tool'],
  ['Space (hold) / middle mouse', 'Pan'],
  ['Mouse wheel', 'Zoom at cursor (configurable)'],
  ['Z', 'Zoom rectangle'],
  ['Ctrl+0 / Ctrl+9', 'Fit page / Fit width'],
  ['Ctrl+= / Ctrl+-', 'Zoom in / out'],
  ['PgUp / PgDn', 'Previous / next sheet'],
  ['Shift+Alt+K', 'Calibrate'],
  ['Shift+Alt+L', 'Length'],
  ['Shift+Alt+M', 'Polylength'],
  ['Shift+Alt+A', 'Area'],
  ['Shift+Alt+P', 'Perimeter'],
  ['Shift+Alt+V', 'Volume'],
  ['Shift+Alt+C', 'Count'],
  ['Shift+Alt+G', 'Angle'],
  ['T Q C R E L A N G P H', 'Text, Callout, Cloud, Rectangle, Ellipse, Line, Arrow, Polyline, Polygon, Pen, Highlight'],
  ['Enter / double-click / right-click', 'Finish polyline, area, perimeter…'],
  ['Backspace', 'Remove last vertex while drawing'],
  ['Shift while drawing', 'Constrain to 45°'],
  ['Esc', 'Cancel drawing / deselect / back to Select'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'],
  ['Delete', 'Delete selected markups'],
  ['Arrow keys (Shift)', 'Nudge selected markups'],
  ['Ctrl+O / Ctrl+S', 'Open PDF / save project'],
];

export function ShortcutsDialog() {
  const st = getState();
  return (
    <Modal title="Keyboard Shortcuts" icon={<Keyboard size={16} />} size="mid" onClose={() => st.setDialog(null)}>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function AboutDialog() {
  const st = getState();
  return (
    <Modal title="About Takeoff Studio" icon={<Info size={16} />} onClose={() => st.setDialog(null)}>
      <p style={{ margin: 0 }}>
        <b>Takeoff Studio</b> is a browser-based construction drawing measurement, markup and quantity takeoff workspace modelled on the Bluebeam Revu estimating workflow.
      </p>
      <p style={{ margin: 0 }} className="hint">
        Import drawings → label sheets → calibrate scales (per sheet and per viewport) → measure, count and mark up with Tool Chest tools → review the editable Markups List with custom
        and formula columns → filter, sort and group → summarize and export.
      </p>
      <p style={{ margin: 0 }} className="hint">
        All processing happens locally in your browser. Projects autosave to this browser; use File → Save Project to keep a portable copy. Not affiliated with Bluebeam, Inc.
      </p>
    </Modal>
  );
}
