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
  | { kind: 'markup'; type: MarkupType; chestToolId?: string }
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
  | { kind: 'settings' }
  | { kind: 'shortcuts' }
  | { kind: 'about' }
  | { kind: 'confirm'; title: string; message: string; onConfirm: () => void };

export type ViewRequest =
  | { kind: 'fit' | 'fitWidth' | 'actual'; nonce: number }
  | { kind: 'zoomBy'; factor: number; nonce: number }
  | { kind: 'zoomTo'; rect: Rect; nonce: number };

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
  leftPanel: 'sheets' | 'search' | null;
  rightPanel: 'toolchest' | 'properties' | 'measurements' | 'layers' | null;
  bottomPanel: 'markups' | 'summary' | null;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  theme: 'dark' | 'light';
}

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
  setPrefs: (patch: Partial<Prefs>) => void;

  // tool chest
  setToolChest: (sets: ToolSet[]) => void;
  addToolSet: (name: string) => string;
  updateToolSet: (id: string, patch: Partial<ToolSet>) => void;
  deleteToolSet: (id: string) => void;
  upsertTool: (setId: string, tool: ChestTool) => void;
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
  leftPanel: 'sheets',
  rightPanel: 'toolchest',
  bottomPanel: 'markups',
  leftWidth: 230,
  rightWidth: 300,
  bottomHeight: 250,
  theme: 'dark',
};

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
      if (id === get().currentSheetId) return;
      set({ currentSheetId: id, editingTextId: null });
    },
    gotoSheetOffset: (delta) => {
      const { doc, currentSheetId } = get();
      const i = doc.sheets.findIndex((s) => s.id === currentSheetId);
      const n = doc.sheets[Math.max(0, Math.min(doc.sheets.length - 1, i + delta))];
      if (n) get().setCurrentSheet(n.id);
    },
    requestView: (r) => set({ viewRequest: { ...(r as ViewRequest), nonce: Date.now() + Math.random() } }),
    setZoom: (zoom) => set({ zoom }),
    setCursor: (cursor) => set({ cursor }),

    setTool: (tool) => set({ tool, editingTextId: null }),
    setSelection: (selection) => set({ selection }),
    focusMarkup: (id, zoom = true) => {
      const m = get().doc.markups.find((x) => x.id === id);
      if (!m) return;
      set({ currentSheetId: m.sheetId, selection: [id], flash: { id, nonce: Date.now() } });
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
      const m: Markup = {
        id: uid('m'),
        sheetId,
        type,
        points,
        subject: chestTool?.subject ?? td?.subject ?? TYPE_INFO[type].listName,
        label: chestTool?.label ?? '',
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
