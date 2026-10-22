// Takeoff List styles: which columns a document's list shows, in what order, how wide and under what
// header names, plus the custom columns themselves. A style can be saved as the default for files
// opened from now on, and exported to a file (a backup, or to share) and imported again.

import type { CustomColumn, DocState, ListStyle, MarkupListStyle } from '../types';
import { DEFAULT_VISIBLE_COLUMNS, defaultColumns } from './defaults';

export interface ListStyleFile {
  app: 'takeoff-studio';
  kind: 'markup-list-style';
  version: 1;
  style: MarkupListStyle;
}

/** A document's list as a style: its custom columns and how its list shows them. */
export function styleOfDoc(doc: Pick<DocState, 'columns'>, list: ListStyle): MarkupListStyle {
  return {
    columns: structuredClone(doc.columns),
    visible: [...list.columns],
    widths: { ...list.widths },
    labels: { ...list.labels },
  };
}

/** The style the program comes with. */
export function builtInListStyle(): MarkupListStyle {
  return { columns: defaultColumns(), visible: [...DEFAULT_VISIBLE_COLUMNS], widths: {}, labels: {} };
}

export function listStyleFile(style: MarkupListStyle): ListStyleFile {
  return { app: 'takeoff-studio', kind: 'markup-list-style', version: 1, style };
}

const isColumn = (c: unknown): c is CustomColumn =>
  !!c && typeof c === 'object' && typeof (c as CustomColumn).id === 'string' && typeof (c as CustomColumn).name === 'string' && typeof (c as CustomColumn).kind === 'string';

/** A style read from a style file (throws when it is not one). */
export function parseListStyle(text: string): MarkupListStyle {
  const data = JSON.parse(text) as Partial<ListStyleFile>;
  const s = data?.style;
  if (data?.kind !== 'markup-list-style' || !s || !Array.isArray(s.visible) || !Array.isArray(s.columns)) throw new Error('Not a Takeoff List style file');
  const strings = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const numbers = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>;
  return {
    columns: s.columns.filter(isColumn),
    visible: s.visible.filter((v): v is string => typeof v === 'string'),
    widths: numbers(s.widths),
    labels: strings(s.labels),
  };
}
