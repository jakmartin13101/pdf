import { describe, expect, it } from 'vitest';
import { COMMANDS, conflicts, resolveBindings } from '../src/core/keymap';
import { MAX_UI_SCALE, MIN_UI_SCALE, UI_SCALES, clampUiScale, stepUiScale } from '../src/store/uiScale';

describe('text and icon size', () => {
  it('steps through the sizes, from one between two to the nearer step that way', () => {
    expect(UI_SCALES).toContain(1);
    expect(stepUiScale(1, 1)).toBe(1.1);
    expect(stepUiScale(1.1, 1)).toBe(1.25);
    expect(stepUiScale(1, -1)).toBe(0.9);
    expect(stepUiScale(1.2, 1)).toBe(1.25);
    expect(stepUiScale(1.2, -1)).toBe(1.1);
    expect(stepUiScale(MAX_UI_SCALE, 1)).toBe(MAX_UI_SCALE);
    expect(stepUiScale(MIN_UI_SCALE, -1)).toBe(MIN_UI_SCALE);
  });

  it('stays within its range', () => {
    expect(clampUiScale(5)).toBe(MAX_UI_SCALE);
    expect(clampUiScale(0.1)).toBe(MIN_UI_SCALE);
    expect(clampUiScale(NaN)).toBe(1);
    expect(clampUiScale(1.254)).toBe(1.25);
  });

  it('has keys of its own that clash with no other command', () => {
    const keys = resolveBindings();
    expect(keys.get('view.uiLarger')).toEqual(['Ctrl+Shift+=']);
    expect(keys.get('view.uiSmaller')).toEqual(['Ctrl+Shift+-']);
    expect(COMMANDS.some((c) => c.id === 'view.uiNormal')).toBe(true);
    for (const id of ['view.uiLarger', 'view.uiSmaller']) expect(conflicts(keys.get(id)![0], keys, id)).toEqual([]);
  });
});
