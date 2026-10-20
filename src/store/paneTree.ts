// How the panes of the main window are arranged: a tree of splits. Every pane can be split again – side
// by side (a row) or one above the other (a column) – as often as wanted; a pane goes when it is closed.
//
// Pure functions over PaneNode, used by the store.

/** A pane, or panes side by side (`row`) or one above the other (`col`) with their relative sizes. */
export type PaneNode = { pane: string } | { dir: 'row' | 'col'; children: PaneNode[]; sizes: number[] };

export const leaf = (id: string): PaneNode => ({ pane: id });

const isLeaf = (n: PaneNode): n is { pane: string } => 'pane' in n;

/** The panes in the tree, in reading order. */
export function paneIds(n: PaneNode): string[] {
  return isLeaf(n) ? [n.pane] : n.children.flatMap(paneIds);
}

/** Splits holding a single child become that child; a split inside one of the same direction joins it. */
export function normalize(n: PaneNode): PaneNode {
  if (isLeaf(n)) return n;
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c0, i) => {
    const c = normalize(c0);
    const w = n.sizes[i] > 0 ? n.sizes[i] : 1;
    if (!isLeaf(c) && c.dir === n.dir) {
      const total = c.sizes.reduce((a, b) => a + b, 0) || 1;
      c.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push((w * c.sizes[j]) / total);
      });
    } else {
      children.push(c);
      sizes.push(w);
    }
  });
  if (children.length === 1) return children[0];
  return { dir: n.dir, children, sizes };
}

/**
 * Split pane `target`, putting `newId` after it (beside it in a row, below it in a column). Next to panes
 * already split that way it joins them, and they share the space evenly.
 */
export function splitIn(tree: PaneNode, target: string, newId: string, dir: 'row' | 'col'): PaneNode {
  const go = (n: PaneNode): PaneNode => {
    if (isLeaf(n)) return n.pane === target ? { dir, children: [n, leaf(newId)], sizes: [1, 1] } : n;
    const i = n.children.findIndex((c) => isLeaf(c) && c.pane === target);
    if (i >= 0 && n.dir === dir) {
      const children = [...n.children.slice(0, i + 1), leaf(newId), ...n.children.slice(i + 1)];
      return { dir, children, sizes: children.map(() => 1) };
    }
    return { ...n, children: n.children.map(go) };
  };
  return normalize(go(tree));
}

/** The tree without a pane (null when it was the only one). */
export function removeFrom(tree: PaneNode, id: string): PaneNode | null {
  const go = (n: PaneNode): PaneNode | null => {
    if (isLeaf(n)) return n.pane === id ? null : n;
    const kept: { c: PaneNode; w: number }[] = [];
    n.children.forEach((c, i) => {
      const r = go(c);
      if (r) kept.push({ c: r, w: n.sizes[i] ?? 1 });
    });
    if (!kept.length) return null;
    return { dir: n.dir, children: kept.map((k) => k.c), sizes: kept.map((k) => k.w) };
  };
  const r = go(tree);
  return r ? normalize(r) : null;
}

/** A pane added at the end of the window (beside everything). */
export function appendTo(tree: PaneNode | null, id: string): PaneNode {
  if (!tree) return leaf(id);
  if (!isLeaf(tree) && tree.dir === 'row') return { ...tree, children: [...tree.children, leaf(id)], sizes: [...tree.sizes, tree.sizes.reduce((a, b) => a + b, 0) / tree.sizes.length] };
  return { dir: 'row', children: [tree, leaf(id)], sizes: [1, 1] };
}

/** The tree holding exactly these panes: others taken out, missing ones added at the end. */
export function syncTree(tree: PaneNode | null, ids: string[]): PaneNode | null {
  const want = new Set(ids);
  let t = tree;
  for (const id of t ? paneIds(t) : []) if (!want.has(id)) t = t ? removeFrom(t, id) : null;
  const have = new Set(t ? paneIds(t) : []);
  for (const id of ids) if (!have.has(id)) t = appendTo(t, id);
  return t;
}

/** New sizes for the split at `path` (child indices from the root). */
export function setSizesAt(tree: PaneNode, path: number[], sizes: number[]): PaneNode {
  if (isLeaf(tree)) return tree;
  if (!path.length) return sizes.length === tree.children.length ? { ...tree, sizes: sizes.map((s) => Math.max(0.02, s)) } : tree;
  const [i, ...rest] = path;
  return { ...tree, children: tree.children.map((c, j) => (j === i ? setSizesAt(c, rest, sizes) : c)) };
}

/** What the arrangement looks like, for the menus: one pane, a row, a column, two by two, or any other. */
export function treeShape(tree: PaneNode | null): 'single' | 'vertical' | 'horizontal' | 'grid' | 'custom' {
  if (!tree || isLeaf(tree)) return 'single';
  const leaves = tree.children.every(isLeaf);
  if (leaves) return tree.dir === 'row' ? 'vertical' : 'horizontal';
  const twoByTwo = tree.children.length === 2 && tree.children.every((c) => !isLeaf(c) && c.children.length === 2 && c.children.every(isLeaf));
  return twoByTwo ? 'grid' : 'custom';
}
