// Bringing documents (and the Tool Chest) from earlier versions up to date when they are opened.

import type { CustomColumn, DocState, ToolSet } from '../types';
import { normName } from './formula';
import { sizeText } from './steelShapes';
import { defaultColumns } from './defaults';

const isSizeColumn = (name: string) => ['membersize', 'size'].includes(normName(name));

/** Columns every document has since they were added to the template (Height, Finish). */
const ADDED_COLUMNS = ['height', 'finish'];

/** Add the template columns a document from before them is missing (matched by name). */
export function withAddedColumns(columns: CustomColumn[]): CustomColumn[] {
  const have = new Set(columns.map((c) => normName(c.name)));
  const ids = new Set(columns.map((c) => c.id));
  const add = defaultColumns().filter((c) => ADDED_COLUMNS.includes(c.id) && !have.has(normName(c.name)) && !ids.has(c.id));
  return add.length ? [...columns, ...add] : columns;
}

/** Sizes written the standard way (W24x55 → W24X55) in a document from before. Unchanged documents come back as they are. */
export function upgradeSizes(doc: DocState): DocState {
  const sizeCols = doc.columns.filter((c) => isSizeColumn(c.name)).map((c) => c.id);
  let changed = false;
  const fix = (v: string) => {
    const n = sizeText(v);
    if (n !== v) changed = true;
    return n;
  };
  const markups = doc.markups.map((m) => {
    let custom = m.custom;
    for (const id of sizeCols) {
      const v = custom[id];
      if (typeof v === 'string' && v) {
        const n = fix(v);
        if (n !== v) custom = { ...custom, [id]: n };
      }
    }
    const label = m.label ? fix(m.label) : m.label;
    // Subjects from before subjects were shapes can be sizes too (W24x55).
    const subject = m.subject ? fix(m.subject) : m.subject;
    return custom === m.custom && label === m.label && subject === m.subject ? m : { ...m, custom, label, subject };
  });
  const standardDetails = doc.standardDetails?.map((d) => ({
    ...d,
    conditions: d.conditions.map((c) => (sizeCols.some((id) => c.column === `c:${id}`) ? { ...c, value: fix(c.value) } : c)),
    items: d.items.map((it) => ({ ...it, size: fix(it.size) })),
  }));
  return changed ? { ...doc, markups, standardDetails } : doc;
}

/** A Tool Chest saved before sizes were written with a capital X. */
export function upgradeToolChest(sets: ToolSet[]): ToolSet[] {
  return sets.map((s) => ({
    ...s,
    tools: s.tools.map((t) => {
      const custom = { ...t.custom };
      for (const k of Object.keys(custom)) if (isSizeColumn(k) && typeof custom[k] === 'string') custom[k] = sizeText(custom[k] as string);
      return {
        ...t,
        name: sizeText(t.name),
        custom,
        sizeTool: t.sizeTool ? { ...t.sizeTool, value: sizeText(t.sizeTool.value) } : t.sizeTool,
      };
    }),
  }));
}
