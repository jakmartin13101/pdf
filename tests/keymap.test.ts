import { describe, expect, it } from 'vitest';
import { chordFromEvent, chordLabel, commandForChord, conflicts, normalizeChord, resolveBindings } from '../src/core/keymap';

const ev = (code: string, key: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({ code, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

describe('keyboard shortcuts', () => {
  it('reads chords by physical key, with modifiers in a fixed order', () => {
    expect(chordFromEvent(ev('KeyZ', 'z', { ctrlKey: true }))).toBe('Ctrl+Z');
    expect(chordFromEvent(ev('KeyZ', 'Z', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    expect(chordFromEvent(ev('KeyL', '¬', { shiftKey: true, altKey: true }))).toBe('Shift+Alt+L'); // Alt changes the character on some layouts
    expect(chordFromEvent(ev('KeyD', 'd', { metaKey: true }))).toBe('Ctrl+D'); // Cmd counts as Ctrl
    expect(chordFromEvent(ev('Equal', '+', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+=');
    expect(chordFromEvent(ev('PageDown', 'PageDown'))).toBe('PageDown');
    expect(chordFromEvent(ev('ShiftLeft', 'Shift', { shiftKey: true }))).toBeNull();
    expect(normalizeChord('shift+ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeChord('Ctrl++')).toBe('Ctrl++');
    expect(chordLabel('Delete')).toBe('Del');
  });

  it('user bindings replace the defaults per command', () => {
    const defaults = resolveBindings();
    expect(commandForChord('Ctrl+Z', defaults)).toBe('edit.undo');
    expect(commandForChord('Shift+Alt+L', defaults)).toBe('tool.length');
    expect(commandForChord('L', defaults)).toBe('tool.line');
    const mine = resolveBindings({ 'tool.length': ['L'], 'tool.line': [] });
    expect(commandForChord('L', mine)).toBe('tool.length');
    expect(commandForChord('Shift+Alt+L', mine)).toBeUndefined();
    expect(conflicts('Ctrl+D', defaults, 'takeoff.addDetail')).toEqual(['edit.duplicate']);
  });

  it('no two commands share a default shortcut', () => {
    const seen = new Map<string, string>();
    for (const [id, keys] of resolveBindings())
      for (const k of keys) {
        expect(seen.get(k), `${k} on ${id}`).toBeUndefined();
        seen.set(k, id);
      }
  });
});

import { guessLabelRole, labelFromBox, splitLabel } from '../src/core/text';

describe('page labels from a box', () => {
  it('splits a title block box into number and title, dropping captions', () => {
    expect(splitLabel(['SHEET TITLE', 'ROOF FRAMING', 'PLAN', 'SHEET NUMBER', 'S1.02'])).toEqual({ number: 'S1.02', title: 'Roof Framing Plan' });
    expect(splitLabel(['A-101 FIRST FLOOR PLAN'])).toEqual({ number: 'A-101', title: 'First Floor Plan' });
    expect(guessLabelRole(['S1.02'])).toBe('number');
    expect(guessLabelRole(['ROOF FRAMING PLAN'])).toBe('title');
    expect(guessLabelRole(['ROOF FRAMING PLAN', 'S1.02'])).toBe('both');
    expect(labelFromBox(['SHEET NO.', 'M 1.01'], 'number')).toEqual({ number: 'M1.01' });
    expect(labelFromBox(['STRUCTURAL SECTIONS', 'AND DETAILS'], 'title')).toEqual({ title: 'Structural Sections and Details' });
    expect(labelFromBox([], 'both')).toEqual({});
  });

  it('keeps "sheet" when it is part of the title', () => {
    expect(splitLabel(['SHEET TITLE', 'COVER SHEET', 'SHEET NO.', 'G0.01'])).toEqual({ number: 'G0.01', title: 'Cover Sheet' });
    expect(splitLabel(['SHEET METAL DETAILS', 'SHEET: M5.01'])).toEqual({ number: 'M5.01', title: 'Sheet Metal Details' });
    expect(splitLabel(['TITLE:', 'ROOF PLAN', 'SHEET', 'S1.02'])).toEqual({ number: 'S1.02', title: 'Roof Plan' });
    expect(labelFromBox(['DRAWING TITLE: COVER SHEET'], 'title')).toEqual({ title: 'Cover Sheet' });
  });
});
