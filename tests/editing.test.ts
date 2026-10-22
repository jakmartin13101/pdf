import { describe, expect, it } from 'vitest';
import { bentPlateTool, defaultToolChest } from '../src/core/defaults';
import { addNewTools } from '../src/core/docUpgrade';
import { outlinePoints, pasteAnchor } from '../src/core/shapes';
import { plf } from '../src/core/steelShapes';
import type { Markup, ToolSet } from '../src/types';

const at = (type: Markup['type'], pts: [number, number][]) => ({ type, points: pts.map(([x, y]) => ({ x, y })) });

describe('pasting: the copied markups are picked up by their farthest-left point', () => {
  it('a line by its left end, wherever it points', () => {
    expect(pasteAnchor([at('length', [[100, 50], [300, 80]])])).toEqual({ x: 100, y: 50 });
    expect(pasteAnchor([at('length', [[300, 10], [40, 200]])])).toEqual({ x: 40, y: 200 });
  });

  it('a box (or several points as far left) by its bottom-left corner', () => {
    // Page y runs down: the bottom has the greater y.
    expect(outlinePoints(at('rectangle', [[10, 20], [60, 90]]))).toHaveLength(4);
    expect(pasteAnchor([at('rectangle', [[10, 20], [60, 90]])])).toEqual({ x: 10, y: 90 });
    expect(pasteAnchor([at('polylength', [[50, 10], [50, 120], [200, 120]])])).toEqual({ x: 50, y: 120 });
  });

  it('several markups by the farthest-left point of them all', () => {
    const pts = pasteAnchor([at('length', [[100, 100], [400, 100]]), at('count', [[80, 300], [500, 20]]), at('area', [[90, 10], [200, 10], [200, 90]])]);
    expect(pts).toEqual({ x: 80, y: 300 });
    expect(pasteAnchor([])).toBeNull();
  });
});

describe('bent plate measured as a length', () => {
  it('a size tool in the Tool Chest: type BP sizes, each weighs by the foot', () => {
    const t = bentPlateTool();
    expect(t.type).toBe('length');
    expect(t.subject).toBe('BP');
    expect(t.sizeTool).toMatchObject({ family: 'BP', value: 'BP3X3X1/4', setMemberSize: true });
    expect(plf(t.sizeTool!.value)).toBe(5.1);
    const misc = defaultToolChest().find((s) => s.name === 'Misc Metals')!;
    expect(misc.tools.some((x) => x.sizeTool?.family === 'BP')).toBe(true);
  });

  it('added once to a saved Tool Chest; deleting it afterwards keeps it deleted', () => {
    const saved: ToolSet[] = [
      { id: 'a', name: 'Structural Steel', tools: [] },
      { id: 'b', name: 'Misc Metals', tools: [] },
    ];
    const first = addNewTools(saved, []);
    expect(first.sets[1].tools.map((t) => t.name)).toEqual(['Bent Plate']);
    expect(first.sets[0].tools).toHaveLength(0);
    expect(first.done).toEqual(['bent-plate']);
    // Deleted by the user: not brought back.
    expect(addNewTools(saved, first.done).sets).toBe(saved);
    // A chest that already has a bent plate size tool gets no second one.
    expect(addNewTools(first.sets, []).sets).toBe(first.sets);
  });
});
