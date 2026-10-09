import { create } from 'zustand';
import type {
  ChestTool,
  CustomColumn,
  CustomValue,
  DocState,
  Layer,
  Markup,
  MarkupStyle,
  MarkupType,
  ProjectSettings,
  Pt,
  Rect,
  Scale,
  Sheet,
  ToolSet,
  Viewport,
} from '../types';
import { DEFAULT_SETTINGS } from '../core/units';
import { DEFAULT_VISIBLE_COLUMNS, defaultColumns, defaultLayers, defaultToolChest } from '../core/defaults';
import { defaultStyle, TYPE_INFO } from '../core/markupTypes';
import { uid } from '../core/ids';
import { normName } from '../core/formula';
import { bbox, translate } from '../core/geometry';
import { lsGet, lsSet } from '../core/persistence';

export type ToolMode =
  | { kind: 'select' }
  | { kind: 'pan' }
  | { kind: 'zoomrect' }
  | { kind: 'markup'; type: MarkupType; chestToolId?: string; resumeId?: string }
  | { kind: 'calibrate' }
  | { kind: 'viewport' }
  | { kind: 'region'; purpose: 'number' | 'title' }
  | { kind: 'cutout'; markupId: string };

export type DialogState =
  | { kind: 'calibrate'; sheetId: string; pts: [Pt, Pt] }
  | { kind: 'viewport'; sheetId: string; rect?: Rect; viewportId?: string }
  | { kind: 'scale'; sheetId: string }
  | { kind: 'pageLabels'; region?: { purpose: 'number' | 'title'; rect: Rect } }
  | { kind: 'columns' }
  | { kind: 'toolEdit'; setId: string; toolId?: string; fromMarkupId?: string }
  | { kind: 'shapeTool'; setId?: string; toolId?: string }
  | { kind: 'terms' }
  | { kind: 'settings' }
  | { kind: 'shortcuts' }
  | { kind: 'about' }
  | { kind: 'confirm'; title: string; message: string; onConfirm: () => void };

export type ViewRequest = (
  | { kind: 'fit' | 'fitWidth' | 'actual'; nonce: number }
  | { kind: 'zoomBy'; factor: number; nonce: number }
  | { kind: 'zoomTo'; rect: Rect; nonce: number }
) & { paneId?: string };

export interface ListState {
  sort: { col: string; dir: 1 | -1 } | null;
  filters: Record<string, string[]>;
  groupBy: string | null;
  search: string;
  scope: 'all' | 'page';
  columns: string[];
  widths: Record<string, number>;
}

export interface UIState {
  theme: 'dark' | 'light' | 'system';
  showHiddenTools: boolean;
}

export type PanelId = 'sheets' | 'toolchest' | 'properties' | 'measurements' | 'layers' | 'markups' | 'summary';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export const PANEL_IDS: PanelId[] = ['sheets', 'toolchest', 'properties', 'measurements', 'layers', 'markups', 'summary'];
export const PANEL_TITLES: Record<PanelId, string> = {
  sheets: 'Sheets',
  toolchest: 'Tool Chest',
  properties: 'Properties',
  measurements: 'Measurements',
  layers: 'Layers',
  markups: 'Markups List',
  summary: 'Takeoff Summary',
};

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelPlace {
  dock: DockSide | 'float';
  float: FloatRect;
  /** Floating panels only: whether the window is showing. */
  open: boolean;
}

/** Workspace arrangement: where each panel and the toolbar live. Persisted per browser / install. */
export interface LayoutState {
  panels: Record<PanelId, PanelPlace>;
  /** Open (expanded) panel in each dock, or null when the dock is collapsed. */
  active: Record<DockSide, PanelId | null>;
  size: Record<DockSide, number>;
  floatOrder: PanelId[];
  toolbar: { dock: 'top' | 'left' | 'right' | 'float'; x: number; y: number };
  locked: boolean;
}

export interface PanelDrag {
  id: PanelId | 'toolbar';
  x: number;
  y: number;
  /** Pointer offset inside the dragged window, so it doesn't jump. */
  dx: number;
  dy: number;
  w: number;
  h: number;
  zone: DockSide | 'float' | null;
}

export interface Pane {
  id: string;
  sheetId: string | null;
}

export type PaneLayout = 'single' | 'vertical' | 'horizontal' | 'grid';

export interface Prefs {
  author: string;
  reuse: boolean;
  snapContent: boolean;
  snapMarkup: boolean;
  ortho: boolean;
  wheelZoom: boolean;
  showLabels: boolean;
}

interface TypeDefault {
  style: MarkupStyle;
  subject?: string;
}

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface AppState {
  doc: DocState;
  past: DocState[];
  future: DocState[];
  projectName: string;
  loaded: boolean;
  busy: string | null;
  currentSheetId: string | null;
  selection: string[];
  tool: ToolMode;
  dialog: DialogState | null;
  viewRequest: ViewRequest | null;
  flash: { id: string; nonce: number } | null;
  zoom: number;
  cursor: Pt | null;
  editingTextId: string | null;
  list: ListState;
  ui: UIState;
  layout: LayoutState;
  /** Panel or toolbar being dragged to a new dock position. */
  panelDrag: PanelDrag | null;
  panes: Pane[];
  paneLayout: PaneLayout;
  activePaneId: string;
  paneSplit: { x: number; y: number };
  prefs: Prefs;
  toolChest: ToolSet[];
  typeDefaults: Partial<Record<MarkupType, TypeDefault>>;
  toasts: Toast[];
  lastSaved: number | null;

  // history
  commit: (fn: (d: DocState) => DocState) => void;
  beginChange: () => void;
  mutate: (fn: (d: DocState) => DocState) => void;
  endChange: () => void;
  undo: () => void;
  redo: () => void;

  // project
  loadDoc: (doc: DocState, name: string, opts?: { keepHistory?: boolean }) => void;
  setBusy: (s: string | null) => void;
  setProjectName: (n: string) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;

  // navigation & view
  setCurrentSheet: (id: string) => void;
  gotoSheetOffset: (delta: number) => void;
  requestView: (r: Omit<ViewRequest, 'nonce'> & { kind: ViewRequest['kind'] }) => void;
  setZoom: (z: number) => void;
  setCursor: (p: Pt | null) => void;

  // tools & selection
  setTool: (t: ToolMode) => void;
  setSelection: (ids: string[]) => void;
  focusMarkup: (id: string, zoom?: boolean) => void;
  setEditingText: (id: string | null) => void;
  setDialog: (d: DialogState | null) => void;

  // sheets
  updateSheet: (id: string, patch: Partial<Sheet>) => void;
  setSheetLabels: (labels: Record<string, { number?: string; title?: string }>) => void;
  moveSheet: (id: string, toIndex: number) => void;
  deleteSheet: (id: string) => void;
  setScale: (sheetIds: string[], scale: Scale | null) => void;
  addViewport: (sheetId: string, vp: Omit<Viewport, 'id'>) => void;
  updateViewport: (sheetId: string, vpId: string, patch: Partial<Viewport>) => void;
  deleteViewport: (sheetId: string, vpId: string) => void;

  // markups
  createMarkup: (type: MarkupType, sheetId: string, points: Pt[], extra?: Partial<Markup>) => Markup;
  addPointsToMarkup: (id: string, pts: Pt[]) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  updateMarkups: (ids: string[], fn: (m: Markup) => Markup) => void;
  setCustomValue: (ids: string[], colId: string, value: CustomValue) => void;
  deleteMarkups: (ids: string[]) => void;
  copySelection: () => void;
  paste: (at?: Pt) => void;
  duplicateSelection: () => void;
  addCutout: (id: string, pts: Pt[]) => void;
  setTypeDefault: (type: MarkupType, d: TypeDefault) => void;

  // columns / list
  addColumn: (c: Omit<CustomColumn, 'id'>) => string;
  updateColumn: (id: string, patch: Partial<CustomColumn>) => void;
  deleteColumn: (id: string) => void;
  setList: (patch: Partial<ListState>) => void;

  // layers
  addLayer: (name: string) => string;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;

  // settings
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  setUI: (patch: Partial<UIState>) => void;

  // workspace layout
  showPanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  dockPanel: (id: PanelId, dock: DockSide | 'float', float?: Partial<FloatRect>) => void;
  closeFloat: (id: PanelId) => void;
  setFloatRect: (id: PanelId, rect: Partial<FloatRect>) => void;
  setDockSize: (side: DockSide, px: number) => void;
  setToolbarDock: (dock: LayoutState['toolbar']['dock'], pos?: { x: number; y: number }) => void;
  setLayoutLocked: (locked: boolean) => void;
  setPanelDrag: (d: PanelDrag | null) => void;
  resetLayout: () => void;

  // split view
  setPaneLayout: (layout: PaneLayout) => void;
  setActivePane: (id: string) => void;
  setPaneSheet: (paneId: string, sheetId: string) => void;
  setPaneSplit: (patch: Partial<{ x: number; y: number }>) => void;
  closePane: (id: string) => void;

  // counts
  splitCount: (id: string, pointIndex: number | 'all') => void;
  removeCountPoint: (id: string, pointIndex: number) => void;
  resumeCount: (id: string) => void;
  setPrefs: (patch: Partial<Prefs>) => void;

  // tool chest
  setToolChest: (sets: ToolSet[]) => void;
  addToolSet: (name: string) => string;
  updateToolSet: (id: string, patch: Partial<ToolSet>) => void;
  deleteToolSet: (id: string) => void;
  upsertTool: (setId: string, tool: ChestTool) => void;
  patchTool: (toolId: string, patch: Partial<ChestTool>) => void;
  deleteTool: (setId: string, toolId: string) => void;
  toolFromMarkup: (markupId: string, name?: string) => ChestTool | null;
}

export const emptyDoc = (): DocState => ({
  files: [],
  sheets: [],
  markups: [],
  columns: defaultColumns(),
  layers: defaultLayers(),
  settings: { ...DEFAULT_SETTINGS },
});

const HISTORY_LIMIT = 200;

const defaultList: ListState = {
  sort: null,
  filters: {},
  groupBy: null,
  search: '',
  scope: 'all',
  columns: DEFAULT_VISIBLE_COLUMNS,
  widths: {},
};

const defaultUI: UIState = {
  theme: 'system',
  showHiddenTools: false,
};

const floatAt = (i: number): FloatRect => ({ x: 120 + i * 28, y: 140 + i * 28, w: 340, h: 460 });

export function defaultLayout(): LayoutState {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  const place = (dock: PanelPlace['dock'], i: number): PanelPlace => ({ dock, float: floatAt(i), open: false });
  return {
    panels: {
      sheets: place('left', 0),
      toolchest: place('right', 1),
      properties: place('right', 2),
      measurements: place('right', 3),
      layers: place('right', 4),
      markups: { ...place('bottom', 5), float: { x: 160, y: 220, w: 760, h: 320 } },
      summary: { ...place('bottom', 6), float: { x: 190, y: 250, w: 760, h: 360 } },
    },
    // Small screens start with the drawing visible; side panels open as overlays on demand.
    active: { left: narrow ? null : 'sheets', right: narrow ? null : 'toolchest', top: null, bottom: 'markups' },
    size: { left: 250, right: 310, top: 220, bottom: narrow ? 200 : 250 },
    floatOrder: [],
    toolbar: { dock: 'top', x: 200, y: 120 },
    locked: false,
  };
}

function loadLayout(): LayoutState {
  const d = defaultLayout();
  const saved = lsGet<Partial<LayoutState> | null>('ts.layout', null);
  if (!saved) return d;
  const panels = { ...d.panels };
  for (const id of PANEL_IDS) if (saved.panels?.[id]) panels[id] = { ...d.panels[id], ...saved.panels[id] };
  return {
    ...d,
    ...saved,
    panels,
    active: { ...d.active, ...saved.active },
    size: { ...d.size, ...saved.size },
    toolbar: { ...d.toolbar, ...saved.toolbar },
    floatOrder: (saved.floatOrder ?? []).filter((id) => PANEL_IDS.includes(id)),
  };
}

const PANE_COUNT: Record<PaneLayout, number> = { single: 1, vertical: 2, horizontal: 2, grid: 4 };

const defaultPrefs: Prefs = {
  author: 'Estimator',
  reuse: true,
  snapContent: true,
  snapMarkup: true,
  ortho: false,
  wheelZoom: true,
  showLabels: true,
};

let clipboard: Markup[] = [];

export const useStore = create<AppState>()((set, get) => {
  const toolChestFromStorage = lsGet<ToolSet[] | null>('ts.toolchest', null);

  const commit = (fn: (d: DocState) => DocState) => {
    const { doc, past } = get();
    const next = fn(doc);
    if (next === doc) return;
    set({ doc: next, past: [...past.slice(-(HISTORY_LIMIT - 1)), doc], future: [] });
  };

  const mapMarkups = (ids: Set<string>, fn: (m: Markup) => Markup) =>
    commit((d) => ({ ...d, markups: d.markups.map((m) => (ids.has(m.id) ? { ...fn(m), modified: Date.now() } : m)) }));

  const saveChest = (sets: ToolSet[]) => {
    lsSet('ts.toolchest', sets);
    set({ toolChest: sets });
  };

  const setLayout = (patch: Partial<LayoutState>) => {
    const layout = { ...get().layout, ...patch };
    lsSet('ts.layout', layout);
    set({ layout });
  };

  /** Keep every split pane pointing at an existing sheet. */
  const syncPanes = () => {
    const { panes, doc, currentSheetId, activePaneId } = get();
    const ids = new Set(doc.sheets.map((s) => s.id));
    const fallback = currentSheetId && ids.has(currentSheetId) ? currentSheetId : doc.sheets[0]?.id ?? null;
    const next = panes.map((p) => (p.id === activePaneId ? { ...p, sheetId: fallback } : p.sheetId && ids.has(p.sheetId) ? p : { ...p, sheetId: fallback }));
    set({ panes: next, currentSheetId: next.find((p) => p.id === activePaneId)?.sheetId ?? fallback });
  };

  const pruneSelection = (doc: DocState, sel: string[]) => {
    const ids = new Set(doc.markups.map((m) => m.id));
    return sel.filter((id) => ids.has(id));
  };

  return {
    doc: emptyDoc(),
    past: [],
    future: [],
    projectName: 'Untitled Project',
    loaded: false,
    busy: null,
    currentSheetId: null,
    selection: [],
    tool: { kind: 'select' },
    dialog: null,
    viewRequest: null,
    flash: null,
    zoom: 1,
    cursor: null,
    editingTextId: null,
    list: { ...defaultList, ...lsGet<Partial<ListState>>('ts.list', {}) },
    ui: { ...defaultUI, ...lsGet<Partial<UIState>>('ts.ui', {}) },
    layout: loadLayout(),
    panelDrag: null,
    panes: [{ id: 'pane-1', sheetId: null }],
    paneLayout: 'single',
    activePaneId: 'pane-1',
    paneSplit: { x: 0.5, y: 0.5 },
    prefs: { ...defaultPrefs, ...lsGet<Partial<Prefs>>('ts.prefs', {}) },
    toolChest: toolChestFromStorage ?? defaultToolChest(),
    typeDefaults: lsGet('ts.typeDefaults', {}),
    toasts: [],
    lastSaved: null,

    commit,
    beginChange: () => {
      const { doc, past } = get();
      set({ past: [...past.slice(-(HISTORY_LIMIT - 1)), doc], future: [] });
    },
    mutate: (fn) => set({ doc: fn(get().doc) }),
    endChange: () => {
      const { doc, past } = get();
      if (past.length && past[past.length - 1] === doc) set({ past: past.slice(0, -1) });
    },
    undo: () => {
      const { past, doc, future, selection } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: pruneSelection(prev, selection) });
    },
    redo: () => {
      const { past, doc, future, selection } = get();
      if (!future.length) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), selection: pruneSelection(next, selection) });
    },

    loadDoc: (doc, name, opts) => {
      set((s) => ({
        doc,
        projectName: name,
        loaded: true,
        past: opts?.keepHistory ? [...s.past, s.doc] : [],
        future: [],
        selection: [],
        currentSheetId: doc.sheets.find((x) => x.id === s.currentSheetId)?.id ?? doc.sheets[0]?.id ?? null,
        tool: { kind: 'select' },
      }));
      syncPanes();
    },
    setBusy: (busy) => set({ busy }),
    setProjectName: (projectName) => set({ projectName }),
    toast: (text, kind = 'info') => {
      const id = uid('t');
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    setCurrentSheet: (id) => {
      const { currentSheetId, panes, activePaneId } = get();
      if (id === currentSheetId && panes.find((p) => p.id === activePaneId)?.sheetId === id) return;
      set({ currentSheetId: id, editingTextId: null, panes: panes.map((p) => (p.id === activePaneId ? { ...p, sheetId: id } : p)) });
    },
    gotoSheetOffset: (delta) => {
      const { doc, currentSheetId } = get();
      const i = doc.sheets.findIndex((s) => s.id === currentSheetId);
      const n = doc.sheets[Math.max(0, Math.min(doc.sheets.length - 1, i + delta))];
      if (n) get().setCurrentSheet(n.id);
    },
    requestView: (r) => set({ viewRequest: { ...(r as ViewRequest), paneId: get().activePaneId, nonce: Date.now() + Math.random() } }),
    setZoom: (zoom) => set({ zoom }),
    setCursor: (cursor) => set({ cursor }),

    setTool: (tool) => set({ tool, editingTextId: null }),
    setSelection: (selection) => set({ selection }),
    focusMarkup: (id, zoom = true) => {
      const m = get().doc.markups.find((x) => x.id === id);
      if (!m) return;
      get().setCurrentSheet(m.sheetId);
      set({ selection: [id], flash: { id, nonce: Date.now() } });
      if (zoom) {
        const b = bbox(m.points);
        get().requestView({ kind: 'zoomTo', rect: b } as ViewRequest);
      }
    },
    setEditingText: (editingTextId) => set({ editingTextId }),
    setDialog: (dialog) => set({ dialog }),

    updateSheet: (id, patch) => commit((d) => ({ ...d, sheets: d.sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    setSheetLabels: (labels) =>
      commit((d) => ({
        ...d,
        sheets: d.sheets.map((s) => (labels[s.id] ? { ...s, ...labels[s.id] } : s)),
      })),
    moveSheet: (id, toIndex) =>
      commit((d) => {
        const from = d.sheets.findIndex((s) => s.id === id);
        if (from < 0) return d;
        const sheets = [...d.sheets];
        const [s] = sheets.splice(from, 1);
        sheets.splice(Math.max(0, Math.min(sheets.length, toIndex)), 0, s);
        return { ...d, sheets };
      }),
    deleteSheet: (id) => {
      const { doc, currentSheetId } = get();
      const idx = doc.sheets.findIndex((s) => s.id === id);
      commit((d) => ({ ...d, sheets: d.sheets.filter((s) => s.id !== id), markups: d.markups.filter((m) => m.sheetId !== id) }));
      if (currentSheetId === id) {
        const sheets = get().doc.sheets;
        set({ currentSheetId: sheets[Math.min(idx, sheets.length - 1)]?.id ?? null, selection: [] });
      }
      syncPanes();
    },
    setScale: (sheetIds, scale) => {
      const ids = new Set(sheetIds);
      commit((d) => ({ ...d, sheets: d.sheets.map((s) => (ids.has(s.id) ? { ...s, scale } : s)) }));
    },
    addViewport: (sheetId, vp) =>
      commit((d) => ({
        ...d,
        sheets: d.sheets.map((s) => (s.id === sheetId ? { ...s, viewports: [...s.viewports, { ...vp, id: uid('vp') }] } : s)),
      })),
    updateViewport: (sheetId, vpId, patch) =>
      commit((d) => ({
        ...d,
        sheets: d.sheets.map((s) =>
          s.id === sheetId ? { ...s, viewports: s.viewports.map((v) => (v.id === vpId ? { ...v, ...patch } : v)) } : s,
        ),
      })),
    deleteViewport: (sheetId, vpId) =>
      commit((d) => ({
        ...d,
        sheets: d.sheets.map((s) => (s.id === sheetId ? { ...s, viewports: s.viewports.filter((v) => v.id !== vpId) } : s)),
      })),

    createMarkup: (type, sheetId, points, extra = {}) => {
      const { tool, toolChest, prefs, typeDefaults, doc } = get();
      const chestTool =
        tool.kind === 'markup' && tool.chestToolId ? toolChest.flatMap((s) => s.tools).find((t) => t.id === tool.chestToolId) : undefined;
      const td = typeDefaults[type];
      const custom: Record<string, CustomValue> = {};
      if (chestTool) {
        const byName = new Map(doc.columns.map((c) => [normName(c.name), c.id]));
        for (const [k, v] of Object.entries(chestTool.custom)) {
          const id = byName.get(normName(k));
          if (id) custom[id] = v;
        }
      }
      const layerIds = new Set(doc.layers.map((l) => l.id));
      const layer = chestTool?.layer && layerIds.has(chestTool.layer) ? chestTool.layer : '';
      const now = Date.now();
      // Size tools stamp their current size on the markup (label, optionally subject and Member Size).
      const size = chestTool?.sizeTool?.value.trim() ?? '';
      if (size && chestTool?.sizeTool?.setMemberSize) {
        const col = doc.columns.find((c) => normName(c.name) === 'membersize');
        if (col) custom[col.id] = size;
      }
      const m: Markup = {
        id: uid('m'),
        sheetId,
        type,
        points,
        subject: (size && chestTool?.sizeTool?.setSubject ? size : chestTool?.subject) ?? td?.subject ?? TYPE_INFO[type].listName,
        label: size || chestTool?.label || '',
        comments: '',
        author: prefs.author,
        created: now,
        modified: now,
        status: 'None',
        checked: false,
        layer,
        style: { ...(chestTool?.style ?? td?.style ?? defaultStyle(type)) },
        custom,
        toolId: chestTool?.id,
        text: chestTool?.text ?? (type === 'stamp' ? 'APPROVED' : undefined),
        depth: type === 'volume' ? chestTool?.depth ?? 4 : undefined,
        ...extra,
      };
      commit((d) => ({ ...d, markups: [...d.markups, m] }));
      return m;
    },
    addPointsToMarkup: (id, pts) => mapMarkups(new Set([id]), (m) => ({ ...m, points: [...m.points, ...pts] })),
    updateMarkup: (id, patch) => mapMarkups(new Set([id]), (m) => ({ ...m, ...patch })),
    updateMarkups: (ids, fn) => mapMarkups(new Set(ids), fn),
    setCustomValue: (ids, colId, value) => mapMarkups(new Set(ids), (m) => ({ ...m, custom: { ...m.custom, [colId]: value } })),
    deleteMarkups: (ids) => {
      const s = new Set(ids);
      commit((d) => ({ ...d, markups: d.markups.filter((m) => !s.has(m.id)) }));
      set((st) => ({ selection: st.selection.filter((id) => !s.has(id)) }));
    },
    copySelection: () => {
      const { doc, selection } = get();
      const s = new Set(selection);
      clipboard = doc.markups.filter((m) => s.has(m.id)).map((m) => structuredClone(m));
      if (clipboard.length) get().toast(`Copied ${clipboard.length} markup${clipboard.length > 1 ? 's' : ''}`);
    },
    paste: (at) => {
      const { currentSheetId } = get();
      if (!clipboard.length || !currentSheetId) return;
      const b = bbox(clipboard.flatMap((m) => m.points));
      const dx = at ? at.x - b.x : 18;
      const dy = at ? at.y - b.y : 18;
      const now = Date.now();
      const copies = clipboard.map((m) => ({
        ...structuredClone(m),
        id: uid('m'),
        sheetId: currentSheetId,
        points: translate(m.points, dx, dy),
        cutouts: m.cutouts?.map((c) => translate(c, dx, dy)),
        created: now,
        modified: now,
      }));
      commit((d) => ({ ...d, markups: [...d.markups, ...copies] }));
      set({ selection: copies.map((c) => c.id) });
      if (!at) clipboard = copies.map((m) => structuredClone(m));
    },
    duplicateSelection: () => {
      get().copySelection();
      get().paste();
    },
    addCutout: (id, pts) => mapMarkups(new Set([id]), (m) => ({ ...m, cutouts: [...(m.cutouts ?? []), pts] })),
    setTypeDefault: (type, d) => {
      const typeDefaults = { ...get().typeDefaults, [type]: d };
      lsSet('ts.typeDefaults', typeDefaults);
      set({ typeDefaults });
    },

    addColumn: (c) => {
      const id = uid('col');
      commit((d) => ({ ...d, columns: [...d.columns, { ...c, id }] }));
      set((s) => {
        const list = { ...s.list, columns: [...s.list.columns, `c:${id}`] };
        lsSet('ts.list', list);
        return { list };
      });
      return id;
    },
    updateColumn: (id, patch) => commit((d) => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
    deleteColumn: (id) => {
      commit((d) => ({
        ...d,
        columns: d.columns.filter((c) => c.id !== id),
        markups: d.markups.map((m) => {
          if (!(id in m.custom)) return m;
          const custom = { ...m.custom };
          delete custom[id];
          return { ...m, custom };
        }),
      }));
      get().setList({ columns: get().list.columns.filter((c) => c !== `c:${id}`) });
    },
    setList: (patch) => {
      const list = { ...get().list, ...patch };
      lsSet('ts.list', { ...list, search: '' });
      set({ list });
    },

    addLayer: (name) => {
      const id = uid('layer');
      commit((d) => ({ ...d, layers: [...d.layers, { id, name, visible: true }] }));
      return id;
    },
    updateLayer: (id, patch) => commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    deleteLayer: (id) =>
      commit((d) => ({
        ...d,
        layers: d.layers.filter((l) => l.id !== id),
        markups: d.markups.map((m) => (m.layer === id ? { ...m, layer: '' } : m)),
      })),

    updateSettings: (patch) => commit((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    setUI: (patch) => {
      const ui = { ...get().ui, ...patch };
      lsSet('ts.ui', ui);
      set({ ui });
    },
    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      lsSet('ts.prefs', prefs);
      set({ prefs });
    },

    showPanel: (id) => {
      const l = get().layout;
      const p = l.panels[id];
      if (p.dock === 'float') setLayout({ panels: { ...l.panels, [id]: { ...p, open: true } }, floatOrder: [...l.floatOrder.filter((x) => x !== id), id] });
      else setLayout({ active: { ...l.active, [p.dock]: id } });
    },
    togglePanel: (id) => {
      const l = get().layout;
      const p = l.panels[id];
      if (p.dock === 'float') {
        if (p.open) get().closeFloat(id);
        else get().showPanel(id);
      } else if (l.active[p.dock] === id) setLayout({ active: { ...l.active, [p.dock]: null } });
      else get().showPanel(id);
    },
    dockPanel: (id, dock, float) => {
      const l = get().layout;
      if (l.locked) return;
      const prev = l.panels[id];
      const active = { ...l.active };
      if (prev.dock !== 'float' && active[prev.dock] === id) {
        active[prev.dock] = PANEL_IDS.find((x) => x !== id && l.panels[x].dock === prev.dock) ?? null;
      }
      const next: PanelPlace = { ...prev, dock, open: dock === 'float', float: { ...prev.float, ...float } };
      if (dock !== 'float') active[dock] = id;
      setLayout({
        panels: { ...l.panels, [id]: next },
        active,
        floatOrder: dock === 'float' ? [...l.floatOrder.filter((x) => x !== id), id] : l.floatOrder.filter((x) => x !== id),
      });
    },
    closeFloat: (id) => {
      const l = get().layout;
      setLayout({ panels: { ...l.panels, [id]: { ...l.panels[id], open: false } } });
    },
    setFloatRect: (id, rect) => {
      const l = get().layout;
      const p = l.panels[id];
      setLayout({ panels: { ...l.panels, [id]: { ...p, float: { ...p.float, ...rect } } }, floatOrder: [...l.floatOrder.filter((x) => x !== id), id] });
    },
    setDockSize: (side, px) => setLayout({ size: { ...get().layout.size, [side]: px } }),
    setToolbarDock: (dock, pos) => {
      const l = get().layout;
      if (l.locked && !pos) return;
      setLayout({ toolbar: { ...l.toolbar, dock, ...(pos ?? {}) } });
    },
    setLayoutLocked: (locked) => setLayout({ locked }),
    setPanelDrag: (panelDrag) => set({ panelDrag }),
    resetLayout: () => {
      const d = defaultLayout();
      lsSet('ts.layout', d);
      set({ layout: d });
    },

    setPaneLayout: (paneLayout) => {
      const { panes, activePaneId, currentSheetId } = get();
      const n = PANE_COUNT[paneLayout];
      let next = panes.slice(0, n);
      if (!next.some((p) => p.id === activePaneId) && n === 1) next = [panes.find((p) => p.id === activePaneId) ?? panes[0]];
      while (next.length < n) next.push({ id: uid('pane'), sheetId: currentSheetId });
      const active = next.some((p) => p.id === activePaneId) ? activePaneId : next[0].id;
      set({ paneLayout, panes: next, activePaneId: active, currentSheetId: next.find((p) => p.id === active)?.sheetId ?? currentSheetId, editingTextId: null });
    },
    setActivePane: (id) => {
      const p = get().panes.find((x) => x.id === id);
      if (!p || id === get().activePaneId) return;
      set({ activePaneId: id, currentSheetId: p.sheetId, editingTextId: null });
    },
    setPaneSheet: (paneId, sheetId) => {
      set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? { ...p, sheetId } : p)),
        ...(paneId === s.activePaneId ? { currentSheetId: sheetId, editingTextId: null } : {}),
      }));
    },
    setPaneSplit: (patch) => set((s) => ({ paneSplit: { ...s.paneSplit, ...patch } })),
    closePane: (id) => {
      const { panes, activePaneId, paneLayout } = get();
      if (panes.length <= 1) return;
      const rest = panes.filter((p) => p.id !== id);
      // Closing one of four panes leaves a side-by-side pair; closing one of two leaves a single view.
      const next = rest.length >= 2 ? rest.slice(0, 2) : rest;
      const layout: PaneLayout = next.length === 1 ? 'single' : paneLayout === 'horizontal' ? 'horizontal' : 'vertical';
      const active = next.some((p) => p.id === activePaneId) ? activePaneId : next[0].id;
      set({ panes: next, paneLayout: layout, activePaneId: active, currentSheetId: next.find((p) => p.id === active)?.sheetId ?? null, editingTextId: null });
    },

    splitCount: (id, pointIndex) => {
      const m = get().doc.markups.find((x) => x.id === id);
      if (!m || m.type !== 'count' || m.points.length < 2) return;
      const now = Date.now();
      const piece = (pts: Pt[]): Markup => ({ ...structuredClone(m), id: uid('m'), points: pts, countOverride: undefined, created: now, modified: now });
      let created: Markup[];
      let keep: Markup | null;
      if (pointIndex === 'all') {
        created = m.points.map((p) => piece([p]));
        keep = null;
      } else {
        created = [piece([m.points[pointIndex]])];
        keep = { ...m, points: m.points.filter((_, i) => i !== pointIndex), countOverride: undefined, modified: now };
      }
      commit((d) => ({
        ...d,
        markups: d.markups.flatMap((x) => (x.id === id ? [...(keep ? [keep] : []), ...created] : [x])),
      }));
      set({ selection: created.map((c) => c.id) });
    },
    removeCountPoint: (id, pointIndex) => {
      const m = get().doc.markups.find((x) => x.id === id);
      if (!m) return;
      if (m.points.length <= 1) return get().deleteMarkups([id]);
      mapMarkups(new Set([id]), (x) => ({ ...x, points: x.points.filter((_, i) => i !== pointIndex) }));
    },
    resumeCount: (id) => {
      const st = get();
      const m = st.doc.markups.find((x) => x.id === id);
      if (!m || m.type !== 'count') return;
      if (m.sheetId !== st.currentSheetId) st.setCurrentSheet(m.sheetId);
      const chestToolId = m.toolId && st.toolChest.some((s) => s.tools.some((t) => t.id === m.toolId)) ? m.toolId : undefined;
      set({ tool: { kind: 'markup', type: 'count', chestToolId, resumeId: id }, selection: [id], editingTextId: null });
      st.toast(`Resumed “${m.subject}” – click to add more. Esc to finish.`);
    },

    setToolChest: (sets) => saveChest(sets),
    addToolSet: (name) => {
      const id = uid('set');
      saveChest([...get().toolChest, { id, name, tools: [] }]);
      return id;
    },
    updateToolSet: (id, patch) => saveChest(get().toolChest.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    deleteToolSet: (id) => saveChest(get().toolChest.filter((s) => s.id !== id)),
    upsertTool: (setId, tool) =>
      saveChest(
        get().toolChest.map((s) => {
          if (s.id !== setId) return { ...s, tools: s.tools.filter((t) => t.id !== tool.id) };
          const exists = s.tools.some((t) => t.id === tool.id);
          return { ...s, tools: exists ? s.tools.map((t) => (t.id === tool.id ? tool : t)) : [...s.tools, tool] };
        }),
      ),
    patchTool: (toolId, patch) =>
      saveChest(get().toolChest.map((s) => (s.tools.some((t) => t.id === toolId) ? { ...s, tools: s.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)) } : s))),
    deleteTool: (setId, toolId) =>
      saveChest(get().toolChest.map((s) => (s.id === setId ? { ...s, tools: s.tools.filter((t) => t.id !== toolId) } : s))),
    toolFromMarkup: (markupId, name) => {
      const { doc } = get();
      const m = doc.markups.find((x) => x.id === markupId);
      if (!m) return null;
      const custom: Record<string, CustomValue> = {};
      for (const c of doc.columns) {
        if (c.kind !== 'formula' && m.custom[c.id] !== undefined && m.custom[c.id] !== '') custom[c.name] = m.custom[c.id];
      }
      return {
        id: uid('tool'),
        name: name ?? m.subject,
        type: m.type,
        subject: m.subject,
        label: m.label || undefined,
        text: m.type === 'stamp' ? m.text : undefined,
        style: { ...m.style },
        depth: m.depth,
        layer: m.layer || undefined,
        custom,
      };
    },
  };
});

export const getState = () => useStore.getState();

export function currentSheet(s: AppState): Sheet | undefined {
  return s.doc.sheets.find((x) => x.id === s.currentSheetId);
}
