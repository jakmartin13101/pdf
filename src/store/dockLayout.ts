// Docks split into sections. Each side of the workspace (left, right, top, bottom) holds up to
// MAX_SECTIONS sections: tab groups with their own open panel, stacked down a side dock or side by side
// in a top/bottom dock, each sized by dragging the splitter between them. A panel lives in one section
// of one dock, or floats.
//
// Pure functions over LayoutState, used by the store.

import type { DockSide, FloatRect, LayoutState, PanelId, PanelPlace } from './store';

/** A dock can be split three times: four sections. */
export const MAX_SECTIONS = 4;
export const DOCK_SIDES: DockSide[] = ['left', 'right', 'top', 'bottom'];

/** Where a panel goes in a dock: join a section (its tab group), or split – a new section at that index. */
export interface DockTarget {
  section?: number;
  split?: boolean;
}

/** Every panel, in the order of their tabs. */
export const PANEL_IDS: PanelId[] = ['sheets', 'toolchest', 'properties', 'measurements', 'layers', 'compare', 'autotakeoff', 'markups', 'summary'];
const ORDER = PANEL_IDS;

export const sectionCount = (l: LayoutState, side: DockSide) => Math.max(1, l.split[side]?.length ?? 1);

export function sectionOf(l: LayoutState, id: PanelId): number {
  const p = l.panels[id];
  if (p.dock === 'float') return 0;
  return Math.min(Math.max(0, p.section ?? 0), sectionCount(l, p.dock) - 1);
}

export const dockPanels = (l: LayoutState, side: DockSide) => ORDER.filter((id) => l.panels[id].dock === side);

export const sectionPanels = (l: LayoutState, side: DockSide, section: number) => dockPanels(l, side).filter((id) => sectionOf(l, id) === section);

/** Whether a panel is showing: open in its section, or a floating window that is open. */
export function isPanelOpen(l: LayoutState, id: PanelId): boolean {
  const p = l.panels[id];
  return p.dock === 'float' ? p.open : l.active[p.dock]?.[sectionOf(l, id)] === id;
}

/**
 * Tidy a layout: sections numbered 0.. with no empty ones in between, one size and one open panel (or
 * null) per section, open panels that really are in their section. Older layouts (one open panel per
 * dock) come in as one section.
 */
export function normalizeLayout(l: LayoutState): LayoutState {
  const panels = { ...l.panels };
  const active = {} as LayoutState['active'];
  const split = {} as LayoutState['split'];
  for (const side of DOCK_SIDES) {
    const raw = l.active?.[side] as unknown;
    const oldActive: (PanelId | null)[] = Array.isArray(raw) ? raw : [(raw as PanelId | null) ?? null];
    const oldSplit = Array.isArray(l.split?.[side]) ? l.split[side] : [1];
    const ids = ORDER.filter((id) => panels[id].dock === side);
    const used = [...new Set(ids.map((id) => Math.max(0, panels[id].section ?? 0)))].sort((a, b) => a - b).slice(0, MAX_SECTIONS);
    const map = new Map(used.map((s, i) => [s, i]));
    for (const id of ids) {
      const s = Math.max(0, panels[id].section ?? 0);
      // More sections than allowed (an edited file): the extra ones join the last.
      const to = map.get(s) ?? used.length - 1;
      if (panels[id].section !== to) panels[id] = { ...panels[id], section: to };
    }
    const n = Math.max(1, used.length);
    split[side] = Array.from({ length: n }, (_, i) => {
      const w = used.length ? oldSplit[used[i]] : oldSplit[0];
      return typeof w === 'number' && w > 0 ? w : 1;
    });
    active[side] = Array.from({ length: n }, (_, i) => {
      const a = used.length ? oldActive[used[i]] : oldActive[0];
      return a && panels[a]?.dock === side && panels[a].section === i ? a : null;
    });
  }
  return { ...l, panels, active, split };
}

/** Open a panel in its section (floating: show its window). */
export function showPanelIn(l: LayoutState, id: PanelId): LayoutState {
  const p = l.panels[id];
  if (p.dock === 'float') return { ...l, panels: { ...l.panels, [id]: { ...p, open: true } }, floatOrder: [...l.floatOrder.filter((x) => x !== id), id] };
  const s = sectionOf(l, id);
  const list = [...l.active[p.dock]];
  list[s] = id;
  return { ...l, active: { ...l.active, [p.dock]: list } };
}

/** Show a panel, or collapse it when it is already showing. */
export function togglePanelIn(l: LayoutState, id: PanelId): LayoutState {
  const p = l.panels[id];
  if (p.dock === 'float') return p.open ? { ...l, panels: { ...l.panels, [id]: { ...p, open: false } } } : showPanelIn(l, id);
  const s = sectionOf(l, id);
  if (l.active[p.dock][s] !== id) return showPanelIn(l, id);
  const list = [...l.active[p.dock]];
  list[s] = null;
  return { ...l, active: { ...l.active, [p.dock]: list } };
}

/**
 * Move a panel: into a dock (joining a section, or splitting off a new one) or out to float. The section
 * it leaves shows its next panel; an emptied section goes away.
 */
export function dockPanelIn(l: LayoutState, id: PanelId, dock: DockSide | 'float', float?: Partial<FloatRect>, target: DockTarget = {}): LayoutState {
  const prev = l.panels[id];
  const prevSection = prev.dock === 'float' ? -1 : sectionOf(l, id);
  // Take it out of where it was.
  let next: LayoutState = { ...l, panels: { ...l.panels, [id]: { ...prev, dock: 'float', open: false } as PanelPlace } };
  if (prev.dock !== 'float') {
    const list = [...l.active[prev.dock]];
    if (list[prevSection] === id) list[prevSection] = sectionPanels(next, prev.dock, prevSection)[0] ?? null;
    next = { ...next, active: { ...next.active, [prev.dock]: list } };
  }
  const emptied = prev.dock !== 'float' && sectionPanels(next, prev.dock, prevSection).length === 0;
  next = normalizeLayout(next);

  if (dock === 'float') {
    const place: PanelPlace = { ...prev, dock: 'float', open: true, section: undefined, float: { ...prev.float, ...float } };
    return { ...next, panels: { ...next.panels, [id]: place }, floatOrder: [...next.floatOrder.filter((x) => x !== id), id] };
  }

  const floatOrder = next.floatOrder.filter((x) => x !== id);
  const has = dockPanels(next, dock).length > 0;
  const n = has ? sectionCount(next, dock) : 0;
  let section = target.section ?? 0;
  // Sections after the one that went away moved up by one.
  if (emptied && prev.dock === dock && section > prevSection) section--;
  const place = (s: number): PanelPlace => ({ ...prev, dock, open: false, section: s, float: { ...prev.float, ...float } });

  if (!has) {
    return normalizeLayout({
      ...next,
      floatOrder,
      panels: { ...next.panels, [id]: place(0) },
      active: { ...next.active, [dock]: [id] },
      split: { ...next.split, [dock]: [1] },
    });
  }
  if (target.split && n < MAX_SECTIONS) {
    const at = Math.min(Math.max(0, section), n);
    const panels = { ...next.panels };
    for (const x of dockPanels(next, dock)) {
      const s = sectionOf(next, x);
      if (s >= at) panels[x] = { ...panels[x], section: s + 1 };
    }
    panels[id] = place(at);
    const sizes = [...next.split[dock]];
    const share = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    sizes.splice(at, 0, share);
    const act = [...next.active[dock]];
    act.splice(at, 0, id);
    return normalizeLayout({ ...next, floatOrder, panels, split: { ...next.split, [dock]: sizes }, active: { ...next.active, [dock]: act } });
  }
  const s = Math.min(Math.max(0, section), n - 1);
  const act = [...next.active[dock]];
  act[s] = id;
  return normalizeLayout({ ...next, floatOrder, panels: { ...next.panels, [id]: place(s) }, active: { ...next.active, [dock]: act } });
}

/** New sizes for a dock's sections (relative weights). */
export function setSectionSizesIn(l: LayoutState, side: DockSide, sizes: number[]): LayoutState {
  if (sizes.length !== sectionCount(l, side)) return l;
  return { ...l, split: { ...l.split, [side]: sizes.map((w) => Math.max(0.05, w)) } };
}
