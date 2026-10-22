import { describe, expect, it } from 'vitest';
import { defaultColumns, defaultLayers } from '../src/core/defaults';
import { upgradeToolLibrary, upgradeTypes } from '../src/core/docUpgrade';
import { defaultStyle } from '../src/core/markupTypes';
import { currentCommandId, currentId, moveRenamedKeys, renameIds } from '../src/core/renamed';
import { DEFAULT_SETTINGS } from '../src/core/units';
import type { DocState, Markup, ToolSet } from '../src/types';

/** What versions before 1.22 called things (they are only read, to bring them over). */
const OLD = { libraryKey: 'ts.tool' + 'chest', panel: 'tool' + 'chest', pathType: 'poly' + 'length', pathName: 'Poly' + 'length Measurement' };

describe('settings and files from before 1.22 carry over under the new names', () => {
  it('this computer’s settings: the tool library, the layout, per-type defaults and key bindings', () => {
    const kept = new Map<string, string>([[OLD.libraryKey, '[{"id":"s","name":"Mine","tools":[]}]']]);
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
    moveRenamedKeys(store);
    expect(kept.get('ts.toollibrary')).toContain('Mine');
    expect(kept.has(OLD.libraryKey)).toBe(false);
    // Already moved: left alone.
    moveRenamedKeys(store);
    expect(kept.get('ts.toollibrary')).toContain('Mine');

    const layout = renameIds({ panels: { [OLD.panel]: { dock: 'right' } }, active: { right: [OLD.panel, 'measurements'] }, floatOrder: [OLD.panel] });
    expect(layout).toEqual({ panels: { toollibrary: { dock: 'right' } }, active: { right: ['toollibrary', 'measurements'] }, floatOrder: ['toollibrary'] });
    expect(renameIds({ [OLD.pathType]: { subject: 'L' }, length: { subject: 'W' } })).toEqual({ pathlength: { subject: 'L' }, length: { subject: 'W' } });
    expect(currentCommandId(`tool.${OLD.pathType}`)).toBe('tool.pathlength');
    expect(currentCommandId('view.fit')).toBe('view.fit');
    expect(currentId('length')).toBe('length');
  });

  it('documents: path lengths, and standard details that pick them by type', () => {
    const m = (type: string): Markup => ({ id: type, sheetId: 's', type: type as Markup['type'], points: [], subject: '', label: '', comments: '', author: '', created: 0, modified: 0, status: 'None', checked: false, layer: '', style: defaultStyle('length'), custom: {} });
    const doc: DocState = {
      files: [],
      sheets: [],
      markups: [m(OLD.pathType), m('length')],
      columns: defaultColumns(),
      layers: defaultLayers(),
      settings: DEFAULT_SETTINGS,
      standardDetails: [{ id: 'd', name: 'Rail posts', enabled: true, conditions: [{ column: 'type', op: 'eq', value: OLD.pathName }], items: [], category: '' }],
    };
    const up = upgradeTypes(doc);
    expect(up.markups.map((x) => x.type)).toEqual(['pathlength', 'length']);
    expect(up.standardDetails![0].conditions[0].value).toBe('Path Length Measurement');
    // Tool sets (saved or imported).
    const sets: ToolSet[] = [{ id: 's', name: 'S', tools: [{ id: 't', name: 'Handrail', type: OLD.pathType as Markup['type'], subject: '', style: defaultStyle('length'), custom: {} }] }];
    expect(upgradeToolLibrary(sets)[0].tools[0].type).toBe('pathlength');
  });
});
