import { describe, expect, it } from 'vitest';
import { appendTo, leaf, paneIds, removeFrom, setSizesAt, splitIn, syncTree, treeShape, type PaneNode } from '../src/store/paneTree';

describe('split view: panes split as often as wanted', () => {
  it('splits a pane again and again', () => {
    let t: PaneNode = leaf('a');
    t = splitIn(t, 'a', 'b', 'row');
    expect(treeShape(t)).toBe('vertical');
    // Splitting beside panes already side by side joins them, sharing the space evenly.
    t = splitIn(t, 'b', 'c', 'row');
    t = splitIn(t, 'c', 'd', 'row');
    t = splitIn(t, 'd', 'e', 'row');
    expect(t).toEqual({ dir: 'row', children: ['a', 'b', 'c', 'd', 'e'].map(leaf), sizes: [1, 1, 1, 1, 1] });
    // Split one of them the other way: it becomes a column inside the row.
    t = splitIn(t, 'c', 'f', 'col');
    t = splitIn(t, 'f', 'g', 'col');
    expect(paneIds(t)).toEqual(['a', 'b', 'c', 'f', 'g', 'd', 'e']);
    expect((t as { children: PaneNode[] }).children[2]).toEqual({ dir: 'col', children: ['c', 'f', 'g'].map(leaf), sizes: [1, 1, 1] });
    expect(treeShape(t)).toBe('custom');
    // And again inside that.
    t = splitIn(t, 'g', 'h', 'row');
    expect(paneIds(t)).toEqual(['a', 'b', 'c', 'f', 'g', 'h', 'd', 'e']);
  });

  it('a pane goes when it is closed; splits left with one pane close up', () => {
    let t: PaneNode = leaf('a');
    t = splitIn(t, 'a', 'b', 'row');
    t = splitIn(t, 'b', 'c', 'col');
    expect(t).toEqual({ dir: 'row', children: [leaf('a'), { dir: 'col', children: [leaf('b'), leaf('c')], sizes: [1, 1] }], sizes: [1, 1] });
    t = removeFrom(t, 'c')!;
    expect(t).toEqual({ dir: 'row', children: [leaf('a'), leaf('b')], sizes: [1, 1] });
    t = removeFrom(t, 'a')!;
    expect(t).toEqual(leaf('b'));
    expect(removeFrom(t, 'b')).toBeNull();
  });

  it('a split inside one of the same direction joins it', () => {
    // row[a, col[row[b, c]]] → closing d left a column of one row: it joins the outer row.
    let t: PaneNode = { dir: 'row', children: [leaf('a'), { dir: 'col', children: [{ dir: 'row', children: [leaf('b'), leaf('c')], sizes: [1, 3] }, leaf('d')], sizes: [1, 1] }], sizes: [1, 1] };
    t = removeFrom(t, 'd')!;
    expect(t).toEqual({ dir: 'row', children: ['a', 'b', 'c'].map(leaf), sizes: [1, 0.25, 0.75] });
  });

  it('keeps sizes, and follows the panes it should hold', () => {
    let t = splitIn(leaf('a'), 'a', 'b', 'col');
    t = setSizesAt(t, [], [3, 1]);
    expect((t as { sizes: number[] }).sizes).toEqual([3, 1]);
    // A pane detached and back: out of the tree, then at the end.
    expect(syncTree(t, ['a'])).toEqual(leaf('a'));
    expect(syncTree(t, ['a', 'b', 'x'])).toEqual({ dir: 'row', children: [t, leaf('x')], sizes: [1, 1] });
    expect(appendTo(null, 'z')).toEqual(leaf('z'));
  });
});
