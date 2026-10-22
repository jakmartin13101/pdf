import { describe, expect, it } from 'vitest';
import { PANEL_IDS, MAX_SECTIONS, dockPanelIn, isPanelOpen, normalizeLayout, sectionCount, sectionPanels, setSectionSizesIn, togglePanelIn } from '../src/store/dockLayout';
import type { LayoutState, PanelId, PanelPlace } from '../src/store/store';

const docks: Record<PanelId, PanelPlace['dock']> = {
  sheets: 'left',
  toollibrary: 'right',
  properties: 'right',
  measurements: 'right',
  layers: 'right',
  compare: 'right',
  autotakeoff: 'right',
  markups: 'bottom',
  summary: 'bottom',
};

function layout(): LayoutState {
  const panels = {} as LayoutState['panels'];
  for (const id of PANEL_IDS) panels[id] = { dock: docks[id], float: { x: 0, y: 0, w: 300, h: 400 }, open: false };
  return normalizeLayout({
    panels,
    active: { left: ['sheets'], right: ['toollibrary'], top: [null], bottom: ['markups'] },
    split: { left: [1], right: [1], top: [1], bottom: [1] },
    size: { left: 250, right: 310, top: 220, bottom: 250 },
    floatOrder: [],
    toolbar: { dock: 'top', x: 0, y: 0 },
    locked: false,
  });
}

describe('dock sections', () => {
  it('reads layouts from before sections: one open panel per dock', () => {
    const old = { ...layout(), active: { left: 'sheets', right: 'toollibrary', top: null, bottom: 'markups' } } as unknown as LayoutState;
    const l = normalizeLayout(old);
    expect(l.active.left).toEqual(['sheets']);
    expect(l.active.top).toEqual([null]);
    expect(l.split.right).toEqual([1]);
    expect(isPanelOpen(l, 'toollibrary')).toBe(true);
    expect(isPanelOpen(l, 'properties')).toBe(false);
  });

  it('shows the sheets and the tool library on the left at the same time', () => {
    let l = layout();
    // The tool library docks left below the sheets: a second section, both open.
    l = dockPanelIn(l, 'toollibrary', 'left', undefined, { section: 1, split: true });
    expect(sectionCount(l, 'left')).toBe(2);
    expect(sectionPanels(l, 'left', 0)).toEqual(['sheets']);
    expect(sectionPanels(l, 'left', 1)).toEqual(['toollibrary']);
    expect(l.active.left).toEqual(['sheets', 'toollibrary']);
    expect(isPanelOpen(l, 'sheets') && isPanelOpen(l, 'toollibrary')).toBe(true);
    // The right dock shows its next panel.
    expect(l.active.right).toEqual(['properties']);
  });

  it('splits a dock up to three times', () => {
    let l = layout();
    l = dockPanelIn(l, 'properties', 'right', undefined, { section: 1, split: true });
    l = dockPanelIn(l, 'layers', 'right', undefined, { section: 2, split: true });
    l = dockPanelIn(l, 'compare', 'right', undefined, { section: 3, split: true });
    expect(sectionCount(l, 'right')).toBe(MAX_SECTIONS);
    // A fourth split joins instead.
    l = dockPanelIn(l, 'measurements', 'right', undefined, { section: 4, split: true });
    expect(sectionCount(l, 'right')).toBe(MAX_SECTIONS);
    expect(sectionPanels(l, 'right', 3)).toEqual(['measurements', 'compare']);
    for (const id of ['properties', 'layers', 'measurements'] as const) expect(isPanelOpen(l, id)).toBe(true);
  });

  it('splits in front of a section, and joins a section as a tab', () => {
    let l = layout();
    l = dockPanelIn(l, 'markups', 'bottom', undefined, { section: 0 });
    l = dockPanelIn(l, 'summary', 'bottom', undefined, { section: 0, split: true });
    expect(sectionPanels(l, 'bottom', 0)).toEqual(['summary']);
    expect(sectionPanels(l, 'bottom', 1)).toEqual(['markups']);
    l = dockPanelIn(l, 'layers', 'bottom', undefined, { section: 1 });
    expect(sectionPanels(l, 'bottom', 1)).toEqual(['layers', 'markups']);
    expect(l.active.bottom).toEqual(['summary', 'layers']);
  });

  it('closes up a section that is left empty', () => {
    let l = layout();
    l = dockPanelIn(l, 'toollibrary', 'left', undefined, { section: 1, split: true });
    l = dockPanelIn(l, 'properties', 'left', undefined, { section: 2, split: true });
    l = setSectionSizesIn(l, 'left', [1, 2, 3]);
    // The tool library floats: its section goes, the sizes of the others stay.
    l = dockPanelIn(l, 'toollibrary', 'float', { x: 50, y: 60 });
    expect(sectionCount(l, 'left')).toBe(2);
    expect(sectionPanels(l, 'left', 1)).toEqual(['properties']);
    expect(l.split.left).toEqual([1, 3]);
    expect(l.panels.toollibrary.dock).toBe('float');
    expect(l.panels.toollibrary.open).toBe(true);
    expect(l.floatOrder).toEqual(['toollibrary']);
  });

  it('moves a panel within its dock past the section it leaves', () => {
    let l = layout();
    l = dockPanelIn(l, 'toollibrary', 'left', undefined, { section: 1, split: true });
    l = dockPanelIn(l, 'properties', 'left', undefined, { section: 2, split: true });
    // Sheets (alone in section 0) to below properties: insert at 3, which becomes 2.
    l = dockPanelIn(l, 'sheets', 'left', undefined, { section: 3, split: true });
    expect([0, 1, 2].map((s) => sectionPanels(l, 'left', s))).toEqual([['toollibrary'], ['properties'], ['sheets']]);
  });

  it('collapses and opens each section on its own', () => {
    let l = dockPanelIn(layout(), 'toollibrary', 'left', undefined, { section: 1, split: true });
    l = togglePanelIn(l, 'sheets');
    expect(l.active.left).toEqual([null, 'toollibrary']);
    l = togglePanelIn(l, 'sheets');
    expect(l.active.left).toEqual(['sheets', 'toollibrary']);
  });
});
