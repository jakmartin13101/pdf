import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FileWarning, Info, Keyboard } from 'lucide-react';
import { getState, isDirty, useStore } from '../../store/store';
import { saveDocument } from '../../store/project';
import { COMMANDS, chordLabel, resolveBindings } from '../../core/keymap';
import { Modal } from './Modal';
import { APP_VERSION, FULL_NAME, SUITE_NAME, isDesktop } from '../../brand';

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

/** Documents about to close have unsaved changes: save them first, close without saving, or cancel. */
export function UnsavedDialog({ docIds, then }: { docIds: string[]; then: () => void }) {
  const st = getState();
  const names = useStore(useShallow((s) => docIds.map((id) => s.docs.find((d) => d.id === id)?.name ?? '').filter(Boolean)));
  const [busy, setBusy] = useState(false);
  const close = () => st.setDialog(null);
  const save = async () => {
    setBusy(true);
    for (const id of docIds) {
      if (!isDirty(getState(), id)) continue;
      if (!(await saveDocument(id))) {
        setBusy(false);
        return; // cancelled or failed: nothing closes
      }
    }
    close();
    then();
  };
  return (
    <Modal
      title="Unsaved Changes"
      icon={<FileWarning size={16} />}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              close();
              then();
            }}
            disabled={busy}
            data-testid="unsaved-discard"
          >
            Don't Save
          </button>
          <button className="btn primary" autoFocus onClick={() => void save()} disabled={busy} data-testid="unsaved-save">
            Save
          </button>
        </>
      }
    >
      <div data-testid="unsaved-message">
        {names.length === 1 ? (
          <>
            Save the changes to <b>{names[0]}</b> before closing it? The takeoff is saved inside the PDF.
          </>
        ) : (
          <>
            Save the changes to these documents before closing them? Each takeoff is saved inside its PDF.
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Keys that are not commands (Settings → Keyboard lists the rest). */
const FIXED_KEYS: [string, string][] = [
  ['Space (hold) / middle mouse', 'Pan'],
  ['Mouse wheel', 'Zoom at cursor (Settings → General)'],
  ['Enter / double-click / right-click', 'Finish polyline, area, perimeter…'],
  ['Backspace', 'Remove last vertex while drawing'],
  ['Shift while drawing', 'Constrain to 45°'],
  ['Esc', 'Cancel drawing / deselect / back to Select'],
  ['Arrow keys (Shift)', 'Nudge selected markups (step in Settings → Drawing & Editing)'],
];

export function ShortcutsDialog() {
  const st = getState();
  const keys = useStore((s) => s.prefs.keys);
  const bindings = resolveBindings(keys);
  const rows = COMMANDS.filter((c) => bindings.get(c.id)?.length);
  return (
    <Modal
      title="Keyboard Shortcuts"
      icon={<Keyboard size={16} />}
      size="mid"
      onClose={() => st.setDialog(null)}
      footer={
        <button className="btn" onClick={() => st.setDialog({ kind: 'settings', tab: 'keys' })} data-testid="shortcuts-customize">
          Customize…
        </button>
      }
    >
      <table className="shortcuts">
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                {bindings.get(c.id)!.map((k) => (
                  <kbd key={k} style={{ marginRight: 4 }}>
                    {chordLabel(k)}
                  </kbd>
                ))}
              </td>
              <td>
                {c.label} <small className="hint">· {c.group}</small>
              </td>
            </tr>
          ))}
          {FIXED_KEYS.map(([k, d]) => (
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
    <Modal title={`About ${FULL_NAME}`} icon={<Info size={16} />} onClose={() => st.setDialog(null)}>
      <p style={{ margin: 0 }}>
        <b>{FULL_NAME}</b> is a construction drawing measurement, markup and quantity takeoff workspace, part of the {SUITE_NAME} suite of construction programs.
      </p>
      <p style={{ margin: 0 }} className="hint">
        Import drawings → label sheets → calibrate scales (per sheet and per viewport) → measure, count and mark up with Tool Library tools → review the editable Takeoff List with custom
        and formula columns → filter, sort and group → summarize and export.
      </p>
      <p style={{ margin: 0 }} className="hint">
        {isDesktop
          ? 'All processing happens locally on this computer. Projects autosave between sessions; use File → Save Project to keep a portable copy.'
          : 'All processing happens locally in your browser. Projects autosave to this browser; use File → Save Project to keep a portable copy.'}
      </p>
      <p style={{ margin: 0 }} className="hint">
        Version {APP_VERSION} ·{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), st.setDialog({ kind: 'terms' }))}>
          Terms of Service
        </a>
      </p>
    </Modal>
  );
}
