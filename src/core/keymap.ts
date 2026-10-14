// Keyboard shortcuts: every bindable command with its default keys. Settings → Keyboard changes them;
// the user's choices override the defaults per command.

import type { MarkupType } from '../types';

export interface CommandDef {
  id: string;
  label: string;
  group: string;
  /** Default key chords, e.g. "Ctrl+Z", "Shift+Alt+L", "V". */
  keys: string[];
  /** Runs while typing in a text box too (only chords with Ctrl). */
  anywhere?: boolean;
}

const MEASURE_KEYS: [MarkupType, string, string][] = [
  ['length', 'Length', 'Shift+Alt+L'],
  ['polylength', 'Polylength', 'Shift+Alt+M'],
  ['area', 'Area', 'Shift+Alt+A'],
  ['perimeter', 'Perimeter', 'Shift+Alt+P'],
  ['volume', 'Volume', 'Shift+Alt+V'],
  ['count', 'Count', 'Shift+Alt+C'],
  ['angle', 'Angle', 'Shift+Alt+G'],
];
const MARKUP_KEYS: [MarkupType, string, string][] = [
  ['text', 'Text Box', 'T'],
  ['callout', 'Callout', 'Q'],
  ['cloud', 'Cloud', 'C'],
  ['rectangle', 'Rectangle', 'R'],
  ['ellipse', 'Ellipse', 'E'],
  ['line', 'Line', 'L'],
  ['arrow', 'Arrow', 'A'],
  ['polyline', 'Polyline', 'N'],
  ['polygon', 'Polygon', 'G'],
  ['pen', 'Pen', 'P'],
  ['highlight', 'Highlight', 'H'],
  ['stamp', 'Stamp', ''],
];

export const COMMANDS: CommandDef[] = [
  { id: 'file.openPdf', label: 'Open PDF (in a New Tab)…', group: 'File', keys: ['Ctrl+O'], anywhere: true },
  { id: 'file.newProject', label: 'New Project from PDF…', group: 'File', keys: [] },
  { id: 'file.addPdf', label: 'Add PDF to Set…', group: 'File', keys: [] },
  { id: 'file.save', label: 'Save Project', group: 'File', keys: ['Ctrl+S'], anywhere: true },
  { id: 'file.exportPdf', label: 'Export Flattened PDF…', group: 'File', keys: [] },
  { id: 'app.settings', label: 'Settings & Preferences', group: 'File', keys: ['Ctrl+,'], anywhere: true },

  { id: 'edit.undo', label: 'Undo', group: 'Edit', keys: ['Ctrl+Z'] },
  { id: 'edit.redo', label: 'Redo', group: 'Edit', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'] },
  { id: 'edit.copy', label: 'Copy', group: 'Edit', keys: ['Ctrl+C'] },
  { id: 'edit.paste', label: 'Paste', group: 'Edit', keys: ['Ctrl+V'] },
  { id: 'edit.duplicate', label: 'Duplicate', group: 'Edit', keys: ['Ctrl+D'] },
  { id: 'edit.delete', label: 'Delete Selected Markups', group: 'Edit', keys: ['Delete', 'Backspace'] },
  { id: 'edit.selectAll', label: 'Select All on Sheet', group: 'Edit', keys: ['Ctrl+A'] },
  { id: 'edit.flatten', label: 'Flatten Markups…', group: 'Edit', keys: [] },

  { id: 'view.fit', label: 'Fit Page', group: 'View', keys: ['Ctrl+0'] },
  { id: 'view.fitWidth', label: 'Fit Width', group: 'View', keys: ['Ctrl+9'] },
  { id: 'view.zoomIn', label: 'Zoom In', group: 'View', keys: ['Ctrl+='] },
  { id: 'view.zoomOut', label: 'Zoom Out', group: 'View', keys: ['Ctrl+-'] },
  { id: 'view.labels', label: 'Measurement Labels on Drawing', group: 'View', keys: [] },
  { id: 'sheet.next', label: 'Next Sheet', group: 'View', keys: ['PageDown', 'Ctrl+ArrowRight'] },
  { id: 'sheet.prev', label: 'Previous Sheet', group: 'View', keys: ['PageUp', 'Ctrl+ArrowLeft'] },
  { id: 'tab.next', label: 'Next Document Tab', group: 'View', keys: ['Ctrl+Tab', 'Ctrl+Shift+]'] },
  { id: 'tab.prev', label: 'Previous Document Tab', group: 'View', keys: ['Ctrl+Shift+Tab', 'Ctrl+Shift+['] },
  { id: 'tab.close', label: 'Close Document Tab', group: 'View', keys: ['Ctrl+F4'] },
  { id: 'tab.newPane', label: 'Move Document Tab to a New Pane', group: 'View', keys: [] },

  { id: 'tool.select', label: 'Select', group: 'Tools', keys: ['V'] },
  { id: 'tool.zoomrect', label: 'Zoom Rectangle', group: 'Tools', keys: ['Z'] },
  { id: 'tool.calibrate', label: 'Calibrate', group: 'Tools', keys: ['Shift+Alt+K'] },
  ...MEASURE_KEYS.map(([t, label, k]) => ({ id: `tool.${t}`, label, group: 'Measure', keys: k ? [k] : [] })),
  ...MARKUP_KEYS.map(([t, label, k]) => ({ id: `tool.${t}`, label, group: 'Markup', keys: k ? [k] : [] })),

  { id: 'snap.content', label: 'Snap to Drawing (on/off)', group: 'Drawing', keys: [] },
  { id: 'snap.markup', label: 'Snap to Markups (on/off)', group: 'Drawing', keys: [] },
  { id: 'snap.ortho', label: 'Ortho (on/off)', group: 'Drawing', keys: [] },

  { id: 'takeoff.addDetail', label: 'Add Detail to Selection…', group: 'Takeoff', keys: [] },
  { id: 'takeoff.details', label: 'Standard Details…', group: 'Takeoff', keys: [] },
  { id: 'takeoff.auto', label: 'Automatic Takeoff Panel', group: 'Takeoff', keys: [] },
  { id: 'takeoff.markups', label: 'Markups List', group: 'Takeoff', keys: [] },
  { id: 'takeoff.summary', label: 'Takeoff Summary', group: 'Takeoff', keys: [] },

  { id: 'doc.pageLabels', label: 'Page Labels…', group: 'Document', keys: [] },
  { id: 'doc.labelsFromBox', label: 'Page Labels from a Box', group: 'Document', keys: [] },
  { id: 'doc.compare', label: 'Compare / Overlay Sheets…', group: 'Document', keys: [] },
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

const CODE_KEYS: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
};

/** The key part of a chord for a key event (by physical key, so Shift and Alt don't change it). */
export function keyName(e: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
  const { key, code } = e;
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'CapsLock', 'Dead', 'Unidentified'].includes(key)) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Numpad')) return code;
  if (CODE_KEYS[code]) return CODE_KEYS[code];
  if (key === ' ') return 'Space';
  if (key.length > 1) return key; // PageDown, Delete, F2, ArrowLeft…
  return key.toUpperCase();
}

/** "Ctrl+Shift+Alt+Key" for a key event (Cmd counts as Ctrl), or null for a bare modifier. */
export function chordFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): string | null {
  const k = keyName(e);
  if (!k) return null;
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : '', k].filter(Boolean).join('+');
}

/** A chord in its canonical form: modifiers in Ctrl, Shift, Alt order; letters upper case. */
export function normalizeChord(s: string): string {
  const parts = s.split('+').map((p) => p.trim());
  // "Ctrl++" splits into ["Ctrl", "", ""]: the key is "+".
  let key = parts[parts.length - 1];
  if (key === '' && parts.length > 1) key = '+';
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  const named: Record<string, string> = { del: 'Delete', esc: 'Escape', pgup: 'PageUp', pgdn: 'PageDown', space: 'Space' };
  key = named[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [mods.has('ctrl') || mods.has('cmd') || mods.has('meta') ? 'Ctrl' : '', mods.has('shift') ? 'Shift' : '', mods.has('alt') ? 'Alt' : '', key].filter(Boolean).join('+');
}

/** Keys for every command: the user's overrides, else the defaults. */
export function resolveBindings(overrides: Record<string, string[]> = {}): Map<string, string[]> {
  return new Map(COMMANDS.map((c) => [c.id, (overrides[c.id] ?? c.keys).map(normalizeChord)]));
}

/** The command a chord runs. */
export function commandForChord(chord: string, bindings: Map<string, string[]>): string | undefined {
  const n = normalizeChord(chord);
  for (const [id, keys] of bindings) if (keys.includes(n)) return id;
  return undefined;
}

/** Other commands already using a chord. */
export function conflicts(chord: string, bindings: Map<string, string[]>, except?: string): string[] {
  const n = normalizeChord(chord);
  return [...bindings].filter(([id, keys]) => id !== except && keys.includes(n)).map(([id]) => id);
}

/** How a chord is shown: "Ctrl+Shift+Z", "PgDn", "Del". */
export function chordLabel(chord: string): string {
  return chord.replace(/PageDown$/, 'PgDn').replace(/PageUp$/, 'PgUp').replace(/Delete$/, 'Del').replace(/Arrow(Left|Right|Up|Down)$/, (_, d) => ({ Left: '←', Right: '→', Up: '↑', Down: '↓' })[d as 'Left']);
}

/** The first shortcut of a command, for menus and tooltips. */
export function shortcutFor(id: string, bindings: Map<string, string[]>): string | undefined {
  const k = bindings.get(id)?.[0];
  return k ? chordLabel(k) : undefined;
}
