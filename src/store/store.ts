import { create } from 'zustand';
import type {
  AutoStyleRule,
  ChestTool,
  CustomColumn,
  CustomValue,
  DocState,
  Layer,
  ListStyle,
  Markup,
  MarkupListStyle,
  MarkupStyle,
  MarkupType,
  ProjectSettings,
  Pt,
  Rect,
  Scale,
  Sheet,
  SheetCompare,
  StandardDetail,
  ToolSet,
  Viewport,
} from '../types';
import { DEFAULT_SETTINGS, DEFAULT_USER_UNITS, setUserUnits, type UserUnits } from '../core/units';
import { applyDetailAssignments, type DetailAssignment } from '../core/details';
import { MEMBER_FAMILIES, type FoundMember, type MemberFamily } from '../core/autoTakeoff';
import { defaultAutoStyles } from '../core/autoStyles';
import { DEFAULT_VISIBLE_COLUMNS, defaultColumns, defaultLayers, defaultToolChest } from '../core/defaults';
import { defaultStyle } from '../core/markupTypes';
import { uid } from '../core/ids';
import { normName } from '../core/formula';
import { bbox, translate } from '../core/geometry';
import { lsGet, lsSet } from '../core/persistence';
import { DEFAULT_SUBJECTS, cleanSubjects, findSubject, subjectFor, subjectForSize } from '../core/subjects';
import { PANEL_IDS, dockPanelIn, isPanelOpen, normalizeLayout, setSectionSizesIn, showPanelIn, togglePanelIn, upgradeLayout, type DockTarget } from './dockLayout';
import { sizeText } from '../core/steelShapes';
import { upgradeToolChest } from '../core/docUpgrade';
import { defaultMaxLengths, splitMarkupAtMax, type MaxLengthPrefs } from '../core/maxLength';
import { defaultDetailMarkPrefs, defaultDetailStyles, type DetailMarkPrefs, type DetailShapeStyle } from '../core/detailMarks';
import { defaultCombineSettings, type CombineSettings } from '../core/combine';

export type ToolMode =
  | { kind: 'select' }
  | { kind: 'pan' }
  | { kind: 'zoomrect' }
  | { kind: 'markup'; type: MarkupType; chestToolId?: string; resumeId?: string }
  | { kind: 'calibrate' }
  | { kind: 'viewport' }
  | { kind: 'region'; purpose: 'number' | 'title' | 'label' }
  | { kind: 'cutout'; markupId: string }
  /** Overlay alignment: click `count` points on this sheet (A), then the same points on the overlaid sheet (B). */
  | { kind: 'alignPoints'; sheetId: string; count: 2 | 3; ptsA: Pt[]; ptsB: Pt[] }
  /** Drag the overlaid sheet into place. */
  | { kind: 'moveOverlay'; sheetId: string };

/** A difference found between a sheet and its overlay, in page points of the base sheet. */
export interface CompareChange extends Rect {
  id: string;
  kind: 'added' | 'removed' | 'changed';
}

export interface CompareChanges {
  changes: CompareChange[];
  /** The alignment the changes were found with (they go stale when it moves). */
  transformKey: string;
  visible: boolean;
}

export type DialogState =
  | { kind: 'calibrate'; sheetId: string; pts: [Pt, Pt] }
  | { kind: 'viewport'; sheetId: string; rect?: Rect; viewportId?: string }
  | { kind: 'scale'; sheetId: string }
  | { kind: 'pageLabels'; region?: { purpose: 'number' | 'title' | 'label'; rect: Rect } }
  | { kind: 'columns' }
  | { kind: 'details'; detailId?: string; newForMarkupId?: string; newForMarkupIds?: string[] }
  | { kind: 'addDetail'; markupIds: string[] }
  | { kind: 'flatten'; markupIds?: string[] }
  | { kind: 'compare'; sheetId?: string }
  | { kind: 'toolEdit'; setId: string; toolId?: string; fromMarkupId?: string }
  | { kind: 'shapeTool'; setId?: string; toolId?: string }
  | { kind: 'terms' }
  | { kind: 'settings'; tab?: SettingsTab }
  | { kind: 'shortcuts' }
  | { kind: 'about' }
  | { kind: 'confirm'; title: string; message: string; onConfirm: () => void }
  /** Documents about to close with unsaved changes: save them, close without saving, or cancel. */
  | { kind: 'unsaved'; docIds: string[]; then: () => void }
  | { kind: 'combine' };

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
  /** Show material added by standard details in the list, summary and exports. */
  showDetails: boolean;
}

export interface UIState {
  theme: 'dark' | 'light' | 'system';
  showHiddenTools: boolean;
}

export type PanelId = 'sheets' | 'toolchest' | 'properties' | 'measurements' | 'layers' | 'compare' | 'autotakeoff' | 'markups' | 'summary';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export { PANEL_IDS };
export const PANEL_TITLES: Record<PanelId, string> = {
  sheets: 'Sheets',
  toolchest: 'Tool Chest',
  properties: 'Properties',
  measurements: 'Measurements',
  layers: 'Layers',
  compare: 'Compare',
  autotakeoff: 'Auto Takeoff',
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
  /** Docked panels: the section of the dock it is in (0 = the first; see dockLayout.ts). */
  section?: number;
}

/** Workspace arrangement: where each panel and the toolbar live. Persisted per browser / install. */
export interface LayoutState {
  panels: Record<PanelId, PanelPlace>;
  /** Open panel in each section of each dock, or null where the section is collapsed. */
  active: Record<DockSide, (PanelId | null)[]>;
  /** Relative sizes of each dock's sections (heights down a side, widths across the top or bottom). */
  split: Record<DockSide, number[]>;
  size: Record<DockSide, number>;
  floatOrder: PanelId[];
  toolbar: { dock: 'top' | 'left' | 'right' | 'float'; x: number; y: number };
  locked: boolean;
  /** Properties has had a section of its own (so opening it on a selection leaves the Tool Chest showing). */
  propsOwn?: boolean;
  /** Measurements was given a section of its own (between the Tool Chest and Properties). */
  measOwn?: boolean;
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
  /** Dropping on a dock section: join it, or split a new section there. */
  target?: DockTarget;
  /** Where the panel would go, to highlight while dragging. */
  hint?: { left: number; top: number; width: number; height: number; label: string };
}

/** A split pane taken out of the main window: a floating window inside the app, or its own OS window. */
export interface PaneWindow {
  mode: 'float' | 'window';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A document tab in a pane: an open document, and the sheet of it last shown in that pane. */
export interface PaneTab {
  docId: string;
  sheetId: string;
}

export interface Pane {
  id: string;
  /** The document on show (its tab is the active one) and the sheet of it. */
  docId: string | null;
  sheetId: string | null;
  /** Open documents, in tab order. */
  tabs: PaneTab[];
  detached?: PaneWindow;
}

/** An open document: one PDF and the takeoff on it, with its own undo history and selection. */
export interface DocSlot {
  id: string;
  /** File name (shown on its tab, used when saving), e.g. "S-Set.pdf". */
  name: string;
  /** Desktop app: the file it was opened from or saved to, where Save writes. */
  path?: string;
  doc: DocState;
  past: DocState[];
  future: DocState[];
  /** The document as last opened or saved: when `doc` is anything else, it has unsaved changes. */
  saved: DocState | null;
  selection: string[];
  autoTakeoff: AutoTakeoffState | null;
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
  /** Line style rules for automatic takeoff measurements, by subject (first match wins). */
  autoStyles: AutoStyleRule[];
  /** Without a matching rule: use the Tool Chest tool's look for the size (else a colour per size). */
  autoUseToolStyle: boolean;
  /** Automatic takeoff options (also in the Auto Takeoff panel). */
  auto: AutoOptions;
  /** Arrow keys move selected markups by screen pixels, or by a drawing length (real inches). */
  nudge: { unit: 'px' | 'real'; px: number; real: number };
  /** Step for fine adjustment of measurement ends, in real inches. */
  adjustStep: number;
  /** Keyboard shortcuts changed in Settings → Keyboard: command id → its keys (overrides the defaults). */
  keys: Record<string, string[]>;
  /** Speed & graphics (Settings → Speed & Graphics). */
  perf: PerfPrefs;
  /** Markups List style that files opened from now on start with (null: the built-in one). */
  listStyle: MarkupListStyle | null;
  /** The subjects markups can have: shapes such as W, HSS, L, BP, C (Settings → Subjects). */
  subjects: string[];
  /** Combine report: machine allowance, saw kerf and the stock lengths per shape (Settings → Combine). */
  combine: CombineSettings;
  /** Standard detail material drawn next to its markups (Settings → Detail Marks). */
  detailMarks: DetailMarkPrefs;
  /** The look of each shape's detail material (Settings → Detail Marks). */
  detailStyles: DetailShapeStyle[];
  /** Maximum lengths by shape: longer measurements are taken off as pieces (Settings → Length Measurements). */
  maxLengths: MaxLengthPrefs;
  /** Fields left out of the Properties section of the Properties panel (their values stay in the markups). */
  propHidden: string[];
  /** Show the Properties panel when a markup is drawn or selected. */
  autoProperties: boolean;
  /** Width of sheet thumbnails in the Sheets panel (px; its slider). */
  thumbSize: number;
  /** How lengths are shown and typed: ft-in (1'-1"), inches, decimal feet or metric (Settings → Units & Totals). */
  units: UserUnits;
}

export interface PerfPrefs {
  /** pdf.js draws with canvases kept on the graphics card. */
  hwa: boolean;
  /** How many rendered pages are kept for instant redisplay. */
  cache: 'small' | 'normal' | 'large';
  /** Render the next and previous sheets ahead. */
  prefetch: boolean;
  /** Read sheet numbers from title blocks after the drawing is shown, instead of before. */
  backgroundLabels: boolean;
}

export interface AutoOptions {
  families: MemberFamily[];
  scope: 'sheet' | 'all';
  skipExisting: boolean;
  /** Added to each end, e.g. to reach the grid lines (a length like 0'-6"). */
  extend: string;
  /** Set a sheet's scale from the one printed on it when it has none. */
  useprinted: boolean;
}

export type SettingsTab = 'general' | 'units' | 'editing' | 'lengths' | 'keys' | 'subjects' | 'details' | 'combine' | 'list' | 'auto' | 'speed' | 'workspace';

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
  /**
   * Open documents. The active one (the document of the active pane) is worked on through `doc`,
   * `past`, `future`, `selection` and `autoTakeoff`; its entry here is brought up to date when another
   * document becomes active (use `liveSlots` to read every document as it is now).
   */
  docs: DocSlot[];
  activeDocId: string | null;
  doc: DocState;
  past: DocState[];
  future: DocState[];
  /** Name of the active document (its file name without the extension). */
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
  /** Bumped whenever the active pane changes; a count never continues across a pane change. */
  activeEpoch: number;
  /** Differences found between sheets and their overlays, by base sheet id (not saved). */
  compareChanges: Record<string, CompareChanges>;
  /** Members found by the automatic takeoff, waiting to be reviewed and created (not saved). */
  autoTakeoff: AutoTakeoffState | null;
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

  // documents
  /** Open a document in a tab of a pane (the active one by default) and make it active. */
  addDocument: (slot: { id: string; name: string; path?: string; doc: DocState; saved?: DocState | null }, opts?: { paneId?: string; sheetId?: string | null }) => void;
  /** Close a document everywhere (unsaved changes are lost: ask first). */
  closeDocument: (id: string) => void;
  /** Note that a document was saved as it is now (to `path` / under `name` when given). */
  markSaved: (id: string, patch?: { path?: string; name?: string }) => void;
  setBusy: (s: string | null) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;

  // navigation & view
  setCurrentSheet: (id: string) => void;
  gotoSheetOffset: (delta: number) => void;
  /**
   * Sheet labels read in the background after opening: applied to this and the undo history, but only
   * to sheets whose labels are still as they were (`before`), so nothing typed meanwhile is lost.
   */
  applyReadLabels: (docId: string, labels: Record<string, { number: string; title: string }>, before: Record<string, { number: string; title: string }>) => void;
  /** Switch to the next (1) or previous (-1) document tab of the active pane. */
  cycleTab: (dir: 1 | -1) => void;
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
  /**
   * A new measurement, taken off as pieces when it is longer than its shape's maximum length
   * (Settings → Length Measurements). Returns the pieces (one when it is not too long).
   */
  createMeasured: (type: MarkupType, sheetId: string, points: Pt[], extra?: Partial<Markup>) => Markup[];
  /** Break these markups into pieces of their shapes' maximum length. Returns how many were broken. */
  splitAtMaxLength: (ids: string[]) => number;
  /** Several new markups in one undo step. */
  addMarkups: (items: { type: MarkupType; sheetId: string; points: Pt[]; extra?: Partial<Markup> }[]) => Markup[];
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
  /** Change how the active document's Markups List shows its columns (not an undo step). */
  setListStyle: (patch: Partial<ListStyle>) => void;
  /** Use a Markups List style on the active document: its custom columns are added or updated by name. */
  applyListStyle: (style: MarkupListStyle) => void;

  // layers
  addLayer: (name: string) => string;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;

  // settings
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  /** Save the standard details, plus any by-hand assignments made in the editor, as one undo step. */
  setStandardDetails: (details: StandardDetail[], assignments?: DetailAssignment[]) => void;
  /** Add (on) or take off a standard detail by hand on markups. */
  setMarkupDetail: (detailId: string, markupIds: string[], on: boolean) => void;
  /** Drop by-hand detail changes on markups: back to what the rules pick. */
  resetMarkupDetails: (markupIds: string[]) => void;
  /** Overlay another sheet on a sheet (null removes it). */
  setCompare: (sheetId: string, compare: SheetCompare | null) => void;
  /** Change overlay settings; `live` skips undo history (wrap slider/drag sequences in beginChange/endChange). */
  updateCompare: (sheetId: string, patch: Partial<SheetCompare>, live?: boolean) => void;
  setCompareChanges: (sheetId: string, value: CompareChanges | null) => void;
  setAutoTakeoff: (value: AutoTakeoffState | null) => void;
  /** Add the auto takeoff's length markups and set missing sheet scales, as one undo step. */
  applyAutoTakeoff: (items: { sheetId: string; points: Pt[]; extra: Partial<Markup> }[], scales: Record<string, Scale>) => Markup[];
  setUI: (patch: Partial<UIState>) => void;

  // workspace layout
  showPanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  /** Move a panel to a dock – joining one of its sections or splitting off a new one – or float it. */
  dockPanel: (id: PanelId, dock: DockSide | 'float', float?: Partial<FloatRect>, target?: DockTarget) => void;
  setSectionSizes: (side: DockSide, sizes: number[]) => void;
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
  detachPane: (id: string, mode?: PaneWindow['mode']) => void;
  attachPane: (id: string) => void;
  setPaneWindow: (id: string, patch: Partial<PaneWindow>) => void;
  /** Show a document in a pane: its tab, opened there if it is not yet. */
  openTab: (paneId: string, docId: string) => void;
  /**
   * Close a document's tab in a pane. When no other pane shows it, the document closes (ask about
   * unsaved changes first). A pane left without tabs closes.
   */
  closeTab: (paneId: string, docId: string) => void;
  /**
   * Move a document tab to another pane (or to another place in the same pane). With `copy`, the
   * tab stays where it was too. The main window keeps at least one document.
   */
  moveTab: (docId: string, fromPaneId: string, toPaneId: string, opts?: { index?: number; copy?: boolean }) => void;
  /** Split the view and move a document tab into the new pane. */
  tabToNewPane: (paneId: string, docId: string) => void;

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
  standardDetails: [],
});

const HISTORY_LIMIT = 200;

/** A member found by the automatic takeoff on a sheet. */
export interface AutoMember extends FoundMember {
  sheetId: string;
  /** Where it was found, when its ends were adjusted by hand. */
  orig?: { p1: Pt; p2: Pt };
}

export interface AutoTakeoffState {
  members: AutoMember[];
  /** Members left out by hand (ids). */
  excluded: string[];
  /** Sizes left out. */
  sizesOff: string[];
  /** Sheets searched. */
  sheetIds: string[];
  /** Scales printed on searched sheets that have no scale set, most frequent first. */
  printed: Record<string, string[]>;
  /** Leave out members an existing length markup already covers. */
  skipExisting: boolean;
  /** The member picked for fine adjustment. */
  focusId?: string;
}

/** Whether a found member will be created. */
export const autoIncluded = (a: AutoTakeoffState, m: AutoMember) => !a.excluded.includes(m.id) && !a.sizesOff.includes(m.size) && !(a.skipExisting && m.existingId);

const defaultList: ListState = {
  sort: null,
  filters: {},
  groupBy: null,
  search: '',
  scope: 'all',
  columns: DEFAULT_VISIBLE_COLUMNS,
  widths: {},
  showDetails: true,
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
      // Measurements in its own section below the Tool Chest, then Properties (it opens when a markup is
      // drawn or selected): stacked, each resized by the splitter between them.
      properties: { ...place('right', 2), section: 2 },
      measurements: { ...place('right', 3), section: 1 },
      layers: place('right', 4),
      compare: place('right', 5),
      autotakeoff: place('right', 6),
      markups: { ...place('bottom', 7), float: { x: 160, y: 220, w: 760, h: 320 } },
      summary: { ...place('bottom', 8), float: { x: 190, y: 250, w: 760, h: 360 } },
    },
    // Small screens start with the drawing visible; side panels open as overlays on demand.
    active: { left: [narrow ? null : 'sheets'], right: [narrow ? null : 'toolchest', narrow ? null : 'measurements', null], top: [null], bottom: ['markups'] },
    split: { left: [1], right: [1.3, 1, 1.2], top: [1], bottom: [1] },
    propsOwn: true,
    measOwn: true,
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
  // Layouts from before docks had sections keep one open panel per dock: normalizeLayout makes them one section.
  const l = normalizeLayout({
    ...d,
    ...saved,
    panels,
    active: { ...d.active, ...saved.active },
    split: { ...d.split, ...saved.split },
    size: { ...d.size, ...saved.size },
    toolbar: { ...d.toolbar, ...saved.toolbar },
    floatOrder: (saved.floatOrder ?? []).filter((id) => PANEL_IDS.includes(id)),
  });
  return upgradeLayout(l);
}

/** A pane showing a sheet of a document, that document's tab active (opened at the end if needed). */
function showIn(p: Pane, docId: string | null, sheetId: string | null): Pane {
  if (!docId || !sheetId) return p.docId === docId && p.sheetId === sheetId ? p : { ...p, docId, sheetId };
  const at = p.tabs.findIndex((t) => t.docId === docId);
  if (p.docId === docId && p.sheetId === sheetId && at >= 0 && p.tabs[at].sheetId === sheetId) return p;
  const tabs = at >= 0 ? p.tabs.map((t, i) => (i === at ? { docId, sheetId } : t)) : [...p.tabs, { docId, sheetId }];
  return { ...p, docId, sheetId, tabs };
}

export const newPane = (id: string): Pane => ({ id, docId: null, sheetId: null, tabs: [] });

const EMPTY_DOC = emptyDocConst();
function emptyDocConst(): DocState {
  return { files: [], sheets: [], markups: [], columns: [], layers: [], settings: { ...DEFAULT_SETTINGS }, standardDetails: [] };
}

/** Every open document as it is now (the active one's live state included). */
export function liveSlots(s: Pick<AppState, 'docs' | 'activeDocId' | 'doc' | 'past' | 'future' | 'selection' | 'autoTakeoff'>): DocSlot[] {
  return s.docs.map((d) => (d.id === s.activeDocId ? { ...d, doc: s.doc, past: s.past, future: s.future, selection: s.selection, autoTakeoff: s.autoTakeoff } : d));
}

/** A document by id, as it is now. */
export const docById = (s: AppState, id: string | null | undefined): DocState | undefined =>
  !id ? undefined : id === s.activeDocId ? s.doc : s.docs.find((d) => d.id === id)?.doc;

/** The document a pane shows (an empty one when none). */
export const paneDoc = (s: AppState, paneId: string): DocState => docById(s, s.panes.find((p) => p.id === paneId)?.docId) ?? EMPTY_DOC;

/** A sheet of any open document, and the document it belongs to. */
export function findSheet(s: AppState, sheetId: string | null | undefined): { docId: string; sheet: Sheet } | undefined {
  if (!sheetId) return undefined;
  const own = s.doc.sheets.find((x) => x.id === sheetId);
  if (own && s.activeDocId) return { docId: s.activeDocId, sheet: own };
  for (const d of s.docs) {
    if (d.id === s.activeDocId) continue;
    const sheet = d.doc.sheets.find((x) => x.id === sheetId);
    if (sheet) return { docId: d.id, sheet };
  }
  return undefined;
}

/** Sheets that can be overlaid on the active document's: its own, then those of the other open documents. */
export function overlayCandidates(s: Pick<AppState, 'doc' | 'docs' | 'activeDocId'>): { sheet: Sheet; docId: string; docName: string | null }[] {
  const own = s.doc.sheets.map((sheet) => ({ sheet, docId: s.activeDocId ?? '', docName: null as string | null }));
  const others = s.docs.filter((d) => d.id !== s.activeDocId).flatMap((d) => d.doc.sheets.map((sheet) => ({ sheet, docId: d.id, docName: d.name })));
  return [...own, ...others];
}

/** Whether a document has changes that are not saved to its file. */
export function isDirty(s: AppState, id: string): boolean {
  const slot = s.docs.find((d) => d.id === id);
  if (!slot) return false;
  return (id === s.activeDocId ? s.doc : slot.doc) !== slot.saved;
}

/** The document name without the file extension. */
export const docTitle = (name: string) => name.replace(/\.(pdf|json)$/i, '').replace(/\.takeoff$/i, '');

/** The list style of the active document (older documents: the list's own columns). */
const NO_LABELS: Record<string, string> = {};
export function listStyleOf(s: Pick<AppState, 'doc' | 'list'>): ListStyle {
  return s.doc.listStyle ?? { columns: s.list.columns, widths: s.list.widths, labels: NO_LABELS };
}

/** The style files opened from now on start with: the saved default, else the list as it was set up. */
export function defaultListStyle(prefs: Prefs): MarkupListStyle {
  if (prefs.listStyle) return prefs.listStyle;
  const legacy = lsGet<Partial<ListState>>('ts.list', {});
  return { columns: defaultColumns(), visible: legacy.columns ?? [...DEFAULT_VISIBLE_COLUMNS], widths: legacy.widths ?? {}, labels: {} };
}

/** A new document's takeoff data: no markups yet, the default list style and its columns. */
export function newDocState(prefs: Prefs): DocState {
  const style = defaultListStyle(prefs);
  return {
    ...emptyDoc(),
    columns: structuredClone(style.columns),
    listStyle: { columns: [...style.visible], widths: { ...style.widths }, labels: { ...style.labels } },
  };
}

const PANE_COUNT: Record<PaneLayout, number> = { single: 1, vertical: 2, horizontal: 2, grid: 4 };
const attachedPanes = (panes: Pane[]) => panes.filter((p) => !p.detached);
/** Layout for the panes left in the main window (three attached panes use the grid: two over one). */
const layoutFor = (n: number, prev: PaneLayout): PaneLayout => (n <= 1 ? 'single' : n === 2 ? (prev === 'horizontal' ? 'horizontal' : 'vertical') : 'grid');

const defaultPrefs = (): Prefs => ({
  author: 'Estimator',
  reuse: true,
  snapContent: true,
  snapMarkup: true,
  ortho: false,
  wheelZoom: true,
  showLabels: true,
  autoStyles: defaultAutoStyles(),
  autoUseToolStyle: true,
  auto: { families: MEMBER_FAMILIES.filter((f) => f.on).map((f) => f.id), scope: 'sheet', skipExisting: true, extend: '', useprinted: true },
  nudge: { unit: 'px', px: 1, real: 1 },
  adjustStep: 1,
  keys: {},
  perf: { hwa: true, cache: 'normal', prefetch: true, backgroundLabels: true },
  listStyle: null,
  subjects: [...DEFAULT_SUBJECTS],
  combine: defaultCombineSettings(),
  detailMarks: defaultDetailMarkPrefs(),
  detailStyles: defaultDetailStyles(),
  maxLengths: defaultMaxLengths(),
  propHidden: [],
  autoProperties: true,
  thumbSize: 240,
  units: { ...DEFAULT_USER_UNITS },
});

/** Saved preferences over the defaults (nested settings merged, so new options get their defaults). */
function loadPrefs(): Prefs {
  const d = defaultPrefs();
  const saved = lsGet<Partial<Prefs>>('ts.prefs', {});
  // Auto takeoff options used to be stored on their own.
  const oldAuto = lsGet<Partial<AutoOptions>>('ts.autoTakeoff', {});
  return {
    ...d,
    ...saved,
    auto: { ...d.auto, ...oldAuto, ...saved.auto },
    nudge: { ...d.nudge, ...saved.nudge },
    keys: { ...saved.keys },
    perf: { ...d.perf, ...saved.perf },
    autoStyles: Array.isArray(saved.autoStyles) ? saved.autoStyles : d.autoStyles,
    subjects: Array.isArray(saved.subjects) ? cleanSubjects(saved.subjects.map(String)) : d.subjects,
    detailMarks: { ...d.detailMarks, ...saved.detailMarks },
    units: { ...d.units, ...saved.units },
    maxLengths: { ...d.maxLengths, ...saved.maxLengths, byShape: { ...saved.maxLengths?.byShape } },
    detailStyles: Array.isArray(saved.detailStyles) && saved.detailStyles.length ? saved.detailStyles : d.detailStyles,
    combine: { ...d.combine, ...saved.combine, stock: Array.isArray(saved.combine?.stock) ? saved.combine!.stock : d.combine.stock, other: Array.isArray(saved.combine?.other) ? saved.combine!.other : d.combine.other },
  };
}


let clipboard: Markup[] = [];
let clipColumns: CustomColumn[] = [];

/** A document with the list layout of another (undo and redo leave the layout as it is). */
const keepStyle = (d: DocState, cur: DocState): DocState => (d.listStyle === cur.listStyle ? d : { ...d, listStyle: cur.listStyle });

export const useStore = create<AppState>()((set, get, api) => {
  const savedChest = lsGet<ToolSet[] | null>('ts.toolchest', null);
  // Saved before sizes were written with a capital X.
  const toolChestFromStorage = savedChest ? upgradeToolChest(savedChest) : null;

  const commit = (fn: (d: DocState) => DocState) => {
    const { doc, past } = get();
    const next = fn(doc);
    if (next === doc) return;
    set({ doc: next, past: [...past.slice(-(HISTORY_LIMIT - 1)), doc], future: [] });
  };

  /**
   * A markup as the pieces it is taken off as: broken at its shape's maximum length (Settings → Length
   * Measurements) when it is longer, else itself. `sheet` overrides the markup's sheet (a scale being set).
   */
  const splitNew = (m: Markup, sheet?: Sheet): Markup[] => {
    const { prefs, doc } = get();
    if (!prefs.maxLengths.enabled) return [m];
    const sizeCol = doc.columns.find((c) => normName(c.name) === 'membersize')?.id;
    return splitMarkupAtMax(m, sheet ?? doc.sheets.find((x) => x.id === m.sheetId), prefs.maxLengths, prefs.subjects, () => uid('m'), sizeCol);
  };

  /** A new markup with the current tool's (or the type's default) properties; not yet added. */
  const buildMarkup = (type: MarkupType, sheetId: string, points: Pt[], extra: Partial<Markup> = {}): Markup => {
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
    // The subject is a shape from the user's list: a size tool's size's shape, else the tool's own
    // subject when it is one, else the shape of the tool's Member Size (W24X55 → W), else none.
    const toolSize = chestTool && Object.entries(chestTool.custom).find(([k]) => normName(k) === 'membersize')?.[1];
    const subject =
      (size ? subjectForSize(size, prefs.subjects) : undefined) ??
      (findSubject(chestTool?.subject ?? '', prefs.subjects) || undefined) ??
      (toolSize ? subjectForSize(String(toolSize), prefs.subjects) : undefined) ??
      (subjectFor(chestTool?.subject ?? td?.subject, prefs.subjects) || '');
    const m: Markup = {
      id: uid('m'),
      sheetId,
      type,
      points,
      subject,
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
      depth: type === 'volume' ? chestTool?.depth ?? 4 : chestTool?.depth,
      width: chestTool?.width,
      units: chestTool?.units ? { ...chestTool.units } : undefined,
      ...extra,
    };
    return m;
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

  /** State change for a new active pane: its sheet becomes the current sheet, and counts start over. */
  const activeChange = (id: string, panes: Pane[]) =>
    id === get().activePaneId
      ? { activePaneId: id }
      : { activePaneId: id, activeEpoch: get().activeEpoch + 1, currentSheetId: panes.find((p) => p.id === id)?.sheetId ?? get().currentSheetId };

  /** The document a sheet belongs to (the active one is looked in first). */
  const docOfSheet = (sheetId: string | null | undefined) => findSheet(get(), sheetId)?.docId ?? null;

  /**
   * Make another document the active one: the active document's state goes back to its slot and the
   * other's comes out. Tools tied to a sheet or markup of the old document end.
   */
  const activateDoc = (id: string | null) => {
    const s = get();
    if (id === s.activeDocId) return;
    const docs = liveSlots(s);
    const slot = docs.find((d) => d.id === id);
    const pane = s.panes.find((p) => p.id === s.activePaneId);
    const t = s.tool;
    const tied = t.kind === 'cutout' || t.kind === 'alignPoints' || t.kind === 'moveOverlay' || t.kind === 'region';
    set({
      docs,
      activeDocId: slot?.id ?? null,
      doc: slot?.doc ?? emptyDoc(),
      past: slot?.past ?? [],
      future: slot?.future ?? [],
      selection: slot?.selection ?? [],
      autoTakeoff: slot?.autoTakeoff ?? null,
      projectName: slot ? docTitle(slot.name) : '',
      currentSheetId: pane?.docId === slot?.id && pane?.sheetId ? pane!.sheetId : slot?.doc.sheets[0]?.id ?? null,
      editingTextId: null,
      ...(tied ? { tool: { kind: 'select' } as ToolMode } : {}),
    });
  };

  /**
   * Keep panes and their document tabs in step with the open documents: tabs of closed documents go,
   * every tab and pane shows a sheet its document has, a pane left without tabs closes (the main
   * window shows another open document instead), and the current sheet is the active pane's.
   */
  const syncPanes = () => {
    const s = get();
    if (!s.docs.length) return;
    const docs = new Map(liveSlots(s).map((d) => [d.id, d.doc]));
    const has = (docId: string, sheetId: string | null) => !!sheetId && !!docs.get(docId)?.sheets.some((x) => x.id === sheetId);
    const first = (docId: string) => docs.get(docId)?.sheets[0]?.id ?? null;
    let panes = s.panes.map((p) => {
      const tabs: PaneTab[] = [];
      for (const t of p.tabs) {
        if (!docs.has(t.docId) || tabs.some((x) => x.docId === t.docId)) continue;
        const sheetId = has(t.docId, t.sheetId) ? t.sheetId : first(t.docId);
        if (sheetId) tabs.push({ docId: t.docId, sheetId });
      }
      const docId = p.docId && tabs.some((t) => t.docId === p.docId) ? p.docId : tabs[0]?.docId ?? null;
      if (!docId) return { ...p, tabs, docId: null, sheetId: null };
      const want = p.id === s.activePaneId && docId === s.activeDocId ? s.currentSheetId : p.docId === docId ? p.sheetId : null;
      return showIn({ ...p, tabs }, docId, has(docId, want) ? want : tabs.find((t) => t.docId === docId)!.sheetId);
    });
    // Panes without documents: detached and split panes close; the main window keeps one pane.
    let layout = s.paneLayout;
    const empty = panes.filter((p) => !p.docId);
    if (empty.length) {
      let attachedLeft = attachedPanes(panes).filter((p) => p.docId).length;
      for (const p of empty) {
        if (p.detached || attachedLeft > 0) panes = panes.filter((x) => x !== p);
        else attachedLeft++; // the last pane of the main window stays
      }
      layout = layoutFor(attachedPanes(panes).length, layout);
      const fallback = s.docs[0].id;
      panes = panes.map((p) => (p.docId ? p : showIn(p, fallback, (p.tabs.find((t) => t.docId === fallback)?.sheetId ?? first(fallback)))));
    }
    const activePaneId = panes.some((p) => p.id === s.activePaneId) ? s.activePaneId : attachedPanes(panes)[0]?.id ?? panes[0].id;
    const same = panes.length === s.panes.length && panes.every((p, i) => p === s.panes[i] || JSON.stringify(p) === JSON.stringify(s.panes[i]));
    if (!same || layout !== s.paneLayout || activePaneId !== s.activePaneId) set({ panes, paneLayout: layout, ...activeChange(activePaneId, panes) });
    const act = get().panes.find((p) => p.id === get().activePaneId);
    if (act?.docId === get().activeDocId && act?.sheetId !== get().currentSheetId) set({ currentSheetId: act?.sheetId ?? null });
  };

  api.subscribe((s, prev) => {
    // The active pane's document is the active document.
    if (s.panes !== prev.panes || s.activePaneId !== prev.activePaneId) {
      const want = s.panes.find((p) => p.id === s.activePaneId)?.docId ?? null;
      if (want && want !== s.activeDocId && s.docs.some((d) => d.id === want)) activateDoc(want);
    }
    // Sheets change in many ways (undo and redo, deleting): panes follow.
    if (s.doc.sheets !== prev.doc.sheets || s.docs.length !== prev.docs.length) syncPanes();
  });

  const pruneSelection = (doc: DocState, sel: string[]) => {
    const ids = new Set(doc.markups.map((m) => m.id));
    return sel.filter((id) => ids.has(id));
  };

  return {
    docs: [],
    activeDocId: null,
    doc: emptyDoc(),
    past: [],
    future: [],
    projectName: '',
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
    panes: [newPane('pane-1')],
    paneLayout: 'single',
    activePaneId: 'pane-1',
    activeEpoch: 0,
    compareChanges: {},
    autoTakeoff: null,
    paneSplit: { x: 0.5, y: 0.5 },
    prefs: (() => {
      const p = loadPrefs();
      setUserUnits(p.units);
      return p;
    })(),
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
    // The list's column layout is not part of undo: it stays as it is.
    undo: () => {
      const { past, doc, future, selection } = get();
      if (!past.length) return;
      const prev = keepStyle(past[past.length - 1], doc);
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: pruneSelection(prev, selection) });
    },
    redo: () => {
      const { past, doc, future, selection } = get();
      if (!future.length) return;
      const next = keepStyle(future[0], doc);
      set({ doc: next, past: [...past, doc], future: future.slice(1), selection: pruneSelection(next, selection) });
    },

    addDocument: (slot, opts) => {
      const s = get();
      const docs = [...liveSlots(s), { selection: [], autoTakeoff: null, past: [], future: [], saved: slot.doc, ...slot }];
      const paneId = opts?.paneId && s.panes.some((p) => p.id === opts.paneId) ? opts.paneId : s.activePaneId;
      const sheetId = opts?.sheetId && slot.doc.sheets.some((x) => x.id === opts.sheetId) ? opts.sheetId : slot.doc.sheets[0]?.id ?? null;
      const panes = s.panes.map((p) => (p.id === paneId ? showIn(p, slot.id, sheetId) : p));
      set({ docs, panes, loaded: true, ...activeChange(paneId, panes) });
    },
    closeDocument: (id) => {
      const s = get();
      if (!s.docs.some((d) => d.id === id)) return;
      const docs = liveSlots(s).filter((d) => d.id !== id);
      if (!docs.length) {
        set({
          docs: [],
          activeDocId: null,
          doc: emptyDoc(),
          past: [],
          future: [],
          selection: [],
          autoTakeoff: null,
          loaded: false,
          currentSheetId: null,
          projectName: '',
          panes: [newPane('pane-1')],
          paneLayout: 'single',
          activePaneId: 'pane-1',
          tool: { kind: 'select' },
          editingTextId: null,
        });
        return;
      }
      const panes = s.panes.map((p) => ({ ...p, tabs: p.tabs.filter((t) => t.docId !== id), ...(p.docId === id ? { docId: null, sheetId: null } : {}) }));
      const wasActive = s.activeDocId === id;
      set({
        docs,
        panes,
        ...(wasActive ? { activeDocId: null, doc: emptyDoc(), past: [], future: [], selection: [], autoTakeoff: null, currentSheetId: null } : {}),
      });
      syncPanes();
    },
    markSaved: (id, patch) => {
      const s = get();
      set({
        docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch, saved: id === s.activeDocId ? s.doc : d.doc } : d)),
        ...(id === s.activeDocId && patch?.name ? { projectName: docTitle(patch.name) } : {}),
      });
    },
    setBusy: (busy) => set({ busy }),
    toast: (text, kind = 'info') => {
      const id = uid('t');
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    setCurrentSheet: (id) => {
      const { currentSheetId, panes, activePaneId } = get();
      if (id === currentSheetId && panes.find((p) => p.id === activePaneId)?.sheetId === id) return;
      const docId = docOfSheet(id);
      if (!docId) return;
      // A sheet of another document opens that document's tab (and makes it the active document).
      set({ currentSheetId: id, editingTextId: null, panes: panes.map((p) => (p.id === activePaneId ? showIn(p, docId, id) : p)) });
    },
    gotoSheetOffset: (delta) => {
      const { doc, currentSheetId } = get();
      const i = doc.sheets.findIndex((s) => s.id === currentSheetId);
      const n = doc.sheets[Math.max(0, Math.min(doc.sheets.length - 1, i + delta))];
      if (n) get().setCurrentSheet(n.id);
    },
    applyReadLabels: (docId, labels, before) => {
      const fix = (d: DocState): DocState => ({
        ...d,
        sheets: d.sheets.map((s) => {
          const l = labels[s.id];
          const b = before[s.id];
          return l && b && s.number === b.number && s.title === b.title ? { ...s, number: l.number, title: l.title } : s;
        }),
      });
      // Labels read after opening do not count as unsaved changes.
      const s = get();
      if (docId === s.activeDocId) {
        const doc = fix(s.doc);
        set({ doc, past: s.past.map(fix), future: s.future.map(fix), docs: s.docs.map((d) => (d.id === docId && d.saved === s.doc ? { ...d, saved: doc } : d)) });
      } else {
        set({
          docs: s.docs.map((d) => {
            if (d.id !== docId) return d;
            const doc = fix(d.doc);
            return { ...d, doc, past: d.past.map(fix), future: d.future.map(fix), saved: d.saved === d.doc ? doc : d.saved };
          }),
        });
      }
    },
    cycleTab: (dir) => {
      const { panes, activePaneId } = get();
      const pane = panes.find((p) => p.id === activePaneId);
      if (!pane || pane.tabs.length < 2) return;
      const i = pane.tabs.findIndex((t) => t.docId === pane.docId);
      get().openTab(pane.id, pane.tabs[(i + dir + pane.tabs.length) % pane.tabs.length].docId);
    },
    requestView: (r) => set({ viewRequest: { ...(r as ViewRequest), paneId: get().activePaneId, nonce: Date.now() + Math.random() } }),
    setZoom: (zoom) => set({ zoom }),
    setCursor: (cursor) => set({ cursor }),

    setTool: (tool) => set({ tool, editingTextId: null }),
    setSelection: (selection) => {
      set({ selection });
      // The Properties panel shows when markups are drawn or selected (Settings → General).
      const { prefs, layout } = get();
      if (selection.length && prefs.autoProperties && !isPanelOpen(layout, 'properties')) get().showPanel('properties');
    },
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
      if (idx < 0) return;
      if (doc.sheets.length === 1) {
        get().toast('A document keeps at least one page. Close the document instead.', 'error');
        return;
      }
      commit((d) => ({ ...d, sheets: d.sheets.filter((s) => s.id !== id), markups: d.markups.filter((m) => m.sheetId !== id) }));
      if (currentSheetId === id) {
        const sheets = get().doc.sheets;
        get().setCurrentSheet(sheets[Math.min(idx, sheets.length - 1)].id);
        set({ selection: [] });
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
      const m = buildMarkup(type, sheetId, points, extra);
      commit((d) => ({ ...d, markups: [...d.markups, m] }));
      return m;
    },
    createMeasured: (type, sheetId, points, extra = {}) => {
      const pieces = splitNew(buildMarkup(type, sheetId, points, extra));
      commit((d) => ({ ...d, markups: [...d.markups, ...pieces] }));
      return pieces;
    },
    splitAtMaxLength: (ids) => {
      const want = new Set(ids);
      let broken = 0;
      const next: Markup[] = [];
      for (const m of get().doc.markups) {
        const pieces = want.has(m.id) ? splitNew(m) : [m];
        if (pieces.length > 1) {
          broken++;
          next.push(...pieces.map((p) => ({ ...p, modified: Date.now() })));
        } else next.push(m);
      }
      if (broken) commit((d) => ({ ...d, markups: next }));
      return broken;
    },
    addMarkups: (items) => {
      const list = items.map((it) => buildMarkup(it.type, it.sheetId, it.points, it.extra ?? {}));
      if (list.length) commit((d) => ({ ...d, markups: [...d.markups, ...list] }));
      return list;
    },
    addPointsToMarkup: (id, pts) => mapMarkups(new Set([id]), (m) => ({ ...m, points: [...m.points, ...pts] })),
    updateMarkup: (id, patch) => mapMarkups(new Set([id]), (m) => ({ ...m, ...patch })),
    updateMarkups: (ids, fn) => mapMarkups(new Set(ids), fn),
    setCustomValue: (ids, colId, value) => {
      // Sizes are written the standard way: w8*10 → W8X10.
      const col = get().doc.columns.find((c) => c.id === colId);
      const v = typeof value === 'string' && col && ['membersize', 'size'].includes(normName(col.name)) ? sizeText(value) : value;
      mapMarkups(new Set(ids), (m) => ({ ...m, custom: { ...m.custom, [colId]: v } }));
    },
    deleteMarkups: (ids) => {
      const s = new Set(ids);
      commit((d) => ({ ...d, markups: d.markups.filter((m) => !s.has(m.id)) }));
      set((st) => ({ selection: st.selection.filter((id) => !s.has(id)) }));
    },
    copySelection: () => {
      const { doc, selection } = get();
      const s = new Set(selection);
      clipboard = doc.markups.filter((m) => s.has(m.id)).map((m) => structuredClone(m));
      clipColumns = doc.columns;
      if (clipboard.length) get().toast(`Copied ${clipboard.length} markup${clipboard.length > 1 ? 's' : ''}`);
    },
    paste: (at) => {
      const { currentSheetId, doc } = get();
      if (!clipboard.length || !currentSheetId) return;
      const b = bbox(clipboard.flatMap((m) => m.points));
      const dx = at ? at.x - b.x : 18;
      const dy = at ? at.y - b.y : 18;
      const now = Date.now();
      // Pasted into another document: column values go to its columns of the same name, layers by id.
      const byName = new Map(doc.columns.map((c) => [normName(c.name), c.id]));
      const colFor = (k: string) => {
        if (doc.columns.some((c) => c.id === k)) return k;
        const src = clipColumns.find((c) => c.id === k);
        return src ? byName.get(normName(src.name)) : undefined;
      };
      const mapCustom = (custom: Record<string, CustomValue>) => {
        const out: Record<string, CustomValue> = {};
        for (const [k, v] of Object.entries(custom)) {
          const id = colFor(k);
          if (id) out[id] = v;
        }
        return out;
      };
      const layers = new Set(doc.layers.map((l) => l.id));
      const copies = clipboard.map((m) => ({
        ...structuredClone(m),
        id: uid('m'),
        sheetId: currentSheetId,
        points: translate(m.points, dx, dy),
        cutouts: m.cutouts?.map((c) => translate(c, dx, dy)),
        custom: mapCustom(m.custom),
        layer: m.layer && !layers.has(m.layer) ? '' : m.layer,
        details: m.details?.filter((id) => doc.standardDetails?.some((d) => d.id === id)),
        detailsOff: m.detailsOff?.filter((id) => doc.standardDetails?.some((d) => d.id === id)),
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
      const style = listStyleOf(get());
      commit((d) => ({ ...d, columns: [...d.columns, { ...c, id }], listStyle: { ...style, columns: [...style.columns, `c:${id}`] } }));
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
      const style = listStyleOf(get());
      get().setListStyle({ columns: style.columns.filter((c) => c !== `c:${id}`) });
    },
    setList: (patch) => {
      const list = { ...get().list, ...patch };
      lsSet('ts.list', { ...list, search: '' });
      set({ list });
    },
    setListStyle: (patch) => {
      const s = get();
      if (!s.activeDocId) return;
      set({ doc: { ...s.doc, listStyle: { ...listStyleOf(s), ...patch } } });
    },
    applyListStyle: (style) => {
      const s = get();
      if (!s.activeDocId) return;
      // Custom columns of the style: the document's column of the same name is updated, others added.
      const byName = new Map(s.doc.columns.map((c) => [normName(c.name), c]));
      const idMap = new Map<string, string>();
      const columns = [...s.doc.columns];
      for (const c of style.columns) {
        const have = byName.get(normName(c.name));
        if (have) {
          idMap.set(c.id, have.id);
          columns[columns.indexOf(have)] = { ...c, id: have.id };
        } else {
          const id = columns.some((x) => x.id === c.id) ? uid('col') : c.id;
          idMap.set(c.id, id);
          columns.push({ ...c, id });
        }
      }
      const key = (k: string) => (k.startsWith('c:') ? `c:${idMap.get(k.slice(2)) ?? k.slice(2)}` : k);
      const remap = (r: Record<string, string | number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [key(k), v]));
      const listStyle: ListStyle = { columns: style.visible.map(key), widths: remap(style.widths) as Record<string, number>, labels: remap(style.labels) as Record<string, string> };
      commit((d) => ({ ...d, columns, listStyle }));
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
    setStandardDetails: (standardDetails, assignments = []) => commit((d) => applyDetailAssignments({ ...d, standardDetails }, assignments)),
    setMarkupDetail: (detailId, markupIds, on) => commit((d) => applyDetailAssignments(d, [{ detailId, markupIds, on }])),
    resetMarkupDetails: (markupIds) => {
      const ids = new Set(markupIds);
      commit((d) => ({
        ...d,
        markups: d.markups.map((m) => (ids.has(m.id) && (m.details || m.detailsOff) ? { ...m, details: undefined, detailsOff: undefined, modified: Date.now() } : m)),
      }));
    },
    setCompare: (sheetId, compare) => {
      commit((d) => ({ ...d, sheets: d.sheets.map((x) => (x.id === sheetId ? { ...x, compare: compare ?? undefined } : x)) }));
      if (!compare) get().setCompareChanges(sheetId, null);
    },
    updateCompare: (sheetId, patch, live) => {
      const fn = (d: DocState): DocState => ({
        ...d,
        sheets: d.sheets.map((x) => (x.id === sheetId && x.compare ? { ...x, compare: { ...x.compare, ...patch } } : x)),
      });
      if (live) set({ doc: fn(get().doc) });
      else commit(fn);
    },
    setAutoTakeoff: (autoTakeoff) => set({ autoTakeoff }),
    applyAutoTakeoff: (items, scales) => {
      const made = items.map((it) => buildMarkup('length', it.sheetId, it.points, it.extra));
      // Members longer than their shape's maximum length come in as pieces (at the scale being set).
      const list = get().prefs.maxLengths.autoTakeoff
        ? made.flatMap((m) => {
            const sh = get().doc.sheets.find((x) => x.id === m.sheetId);
            return splitNew(m, sh && !sh.scale && scales[sh.id] ? { ...sh, scale: scales[sh.id] } : sh);
          })
        : made;
      commit((d) => ({
        ...d,
        sheets: d.sheets.map((x) => (scales[x.id] && !x.scale ? { ...x, scale: scales[x.id] } : x)),
        markups: [...d.markups, ...list],
      }));
      return list;
    },
    setCompareChanges: (sheetId, value) => {
      const next = { ...get().compareChanges };
      if (value) next[sheetId] = value;
      else delete next[sheetId];
      set({ compareChanges: next });
    },
    setUI: (patch) => {
      const ui = { ...get().ui, ...patch };
      lsSet('ts.ui', ui);
      set({ ui });
    },
    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      if (patch.units) setUserUnits(prefs.units);
      lsSet('ts.prefs', prefs);
      set({ prefs });
    },

    showPanel: (id) => setLayout(showPanelIn(get().layout, id)),
    togglePanel: (id) => setLayout(togglePanelIn(get().layout, id)),
    dockPanel: (id, dock, float, target) => {
      const l = get().layout;
      if (l.locked) return;
      setLayout(dockPanelIn(l, id, dock, float, target));
    },
    setSectionSizes: (side, sizes) => setLayout(setSectionSizesIn(get().layout, side, sizes)),
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
      const { panes, activePaneId, currentSheetId, activeDocId } = get();
      // The layout arranges the panes in the main window; detached windows stay as they are.
      const attached = attachedPanes(panes);
      const n = PANE_COUNT[paneLayout];
      let keep = attached.slice(0, n);
      const act = attached.find((p) => p.id === activePaneId);
      if (act && !keep.includes(act)) keep = [...keep.slice(0, n - 1), act];
      while (keep.length < n) keep.push(showIn(newPane(uid('pane')), activeDocId, currentSheetId));
      const next = [...keep, ...panes.filter((p) => p.detached)];
      const active = next.some((p) => p.id === activePaneId) ? activePaneId : keep[0].id;
      set({ paneLayout, panes: next, editingTextId: null, ...activeChange(active, next) });
    },
    setActivePane: (id) => {
      if (!get().panes.some((x) => x.id === id) || id === get().activePaneId) return;
      set({ editingTextId: null, ...activeChange(id, get().panes) });
    },
    setPaneSheet: (paneId, sheetId) => {
      const docId = docOfSheet(sheetId);
      if (!docId) return;
      set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? showIn(p, docId, sheetId) : p)),
        ...(paneId === s.activePaneId ? { currentSheetId: sheetId, editingTextId: null } : {}),
      }));
    },
    setPaneSplit: (patch) => set((s) => ({ paneSplit: { ...s.paneSplit, ...patch } })),
    closePane: (id) => {
      const { panes, activePaneId, paneLayout } = get();
      const target = panes.find((p) => p.id === id);
      // The main window always keeps at least one pane.
      if (!target || (!target.detached && attachedPanes(panes).length <= 1)) return;
      const rest = panes.filter((p) => p.id !== id);
      const layout = target.detached ? paneLayout : layoutFor(attachedPanes(rest).length, paneLayout);
      const active = rest.some((p) => p.id === activePaneId) ? activePaneId : attachedPanes(rest)[0].id;
      set({ panes: rest, paneLayout: layout, editingTextId: null, ...activeChange(active, rest) });
      // Documents shown only in that pane stay open: they get a tab in the active pane.
      const shown = new Set(rest.flatMap((p) => p.tabs.map((t) => t.docId)));
      const orphans = target.tabs.filter((t) => !shown.has(t.docId));
      if (orphans.length) set((s) => ({ panes: s.panes.map((p) => (p.id === active ? { ...p, tabs: [...p.tabs, ...orphans] } : p)) }));
    },
    detachPane: (id, mode = 'window') => {
      const { panes, paneLayout } = get();
      const target = panes.find((p) => p.id === id);
      if (!target || target.detached) return;
      if (attachedPanes(panes).length <= 1) {
        get().toast('Split the view first, then detach one of the panes.');
        return;
      }
      const k = panes.filter((p) => p.detached).length;
      const w = Math.min(820, Math.round(window.innerWidth * 0.55));
      const h = Math.min(600, Math.round(window.innerHeight * 0.6));
      const geom: PaneWindow = { mode, x: Math.max(20, Math.round(window.innerWidth - w) / 2 + 30 * k), y: 90 + 30 * k, w, h };
      const next = panes.map((p) => (p.id === id ? { ...p, detached: geom } : p));
      set({ panes: next, paneLayout: layoutFor(attachedPanes(next).length, paneLayout) });
    },
    attachPane: (id) => {
      const { panes, paneLayout } = get();
      const target = panes.find((p) => p.id === id);
      if (!target?.detached) return;
      if (attachedPanes(panes).length >= 4) {
        get().toast('The main window already shows four panes. Close one first.', 'error');
        return;
      }
      const attached = [...attachedPanes(panes), { ...target, detached: undefined }];
      const next = [...attached, ...panes.filter((p) => p.detached && p.id !== id)];
      set({ panes: next, paneLayout: layoutFor(attached.length, paneLayout) });
    },
    setPaneWindow: (id, patch) =>
      set((s) => ({ panes: s.panes.map((p) => (p.id === id && p.detached ? { ...p, detached: { ...p.detached, ...patch } } : p)) })),

    openTab: (paneId, docId) => {
      const s = get();
      const pane = s.panes.find((p) => p.id === paneId);
      const doc = docById(s, docId);
      if (!pane || !doc) return;
      const tab = pane.tabs.find((t) => t.docId === docId);
      const sheetId = tab && doc.sheets.some((x) => x.id === tab.sheetId) ? tab.sheetId : doc.sheets[0]?.id;
      if (!sheetId) return;
      get().setActivePane(paneId);
      get().setPaneSheet(paneId, sheetId);
    },
    closeTab: (paneId, docId) => {
      const { panes } = get();
      const pane = panes.find((p) => p.id === paneId);
      const at = pane?.tabs.findIndex((t) => t.docId === docId) ?? -1;
      if (!pane || at < 0) return;
      // The document's last tab: close the document.
      if (!panes.some((p) => p.id !== paneId && p.tabs.some((t) => t.docId === docId))) {
        get().closeDocument(docId);
        return;
      }
      const tabs = pane.tabs.filter((t) => t.docId !== docId);
      const showing = pane.docId === docId;
      const next = tabs.length && showing ? tabs[Math.min(at, tabs.length - 1)] : null;
      set({ panes: panes.map((p) => (p.id === paneId ? { ...p, tabs, ...(next ? { docId: next.docId, sheetId: next.sheetId } : showing ? { docId: null, sheetId: null } : {}) } : p)) });
      syncPanes();
    },
    moveTab: (docId, fromPaneId, toPaneId, opts) => {
      const { panes } = get();
      const from = panes.find((p) => p.id === fromPaneId);
      const to = panes.find((p) => p.id === toPaneId);
      const tab = from?.tabs.find((t) => t.docId === docId);
      if (!from || !to || !tab) return;
      // Put the tab before the one at `index` (at the end without one; where it is if already there).
      const place = (tabs: PaneTab[], t: PaneTab) => {
        const j = tabs.findIndex((x) => x.docId === t.docId);
        const rest = tabs.filter((x) => x.docId !== t.docId);
        let i = opts?.index ?? (j >= 0 ? j : rest.length);
        if (opts?.index !== undefined && j >= 0 && j < i) i--;
        i = Math.max(0, Math.min(rest.length, i));
        return [...rest.slice(0, i), t, ...rest.slice(i)];
      };
      if (from.id === to.id) {
        set({ panes: panes.map((p) => (p.id === from.id ? { ...p, tabs: place(p.tabs, tab) } : p)) });
        return;
      }
      // Leaving the main window without a document is not allowed: the tab is copied instead.
      const keepSource = opts?.copy || (from.tabs.length === 1 && !from.detached && attachedPanes(panes).length === 1);
      const closeSource = !keepSource && from.tabs.length === 1;
      let next = panes.map((p) => (p.id === to.id ? showIn({ ...p, tabs: place(p.tabs, tab) }, docId, tab.sheetId) : p));
      if (!keepSource && !closeSource) {
        next = next.map((p) => {
          if (p.id !== from.id) return p;
          const at = p.tabs.findIndex((t) => t.docId === docId);
          const tabs = p.tabs.filter((t) => t.docId !== docId);
          if (p.docId !== docId) return { ...p, tabs };
          const show = tabs[Math.min(at, tabs.length - 1)];
          return { ...p, tabs, docId: show.docId, sheetId: show.sheetId };
        });
      }
      set({ panes: next, editingTextId: null });
      if (closeSource) get().closePane(from.id);
      get().setActivePane(to.id);
      // The target is active now; make sure the current sheet is the one it shows.
      const shown = get().panes.find((p) => p.id === to.id)?.sheetId ?? null;
      if (get().currentSheetId !== shown) set({ currentSheetId: shown });
    },
    tabToNewPane: (paneId, docId) => {
      const { panes, paneLayout } = get();
      const from = panes.find((p) => p.id === paneId);
      if (!from?.tabs.some((t) => t.docId === docId)) return;
      if (attachedPanes(panes).length >= 4) {
        get().toast('The main window already shows four panes. Drag the tab onto one of them instead.', 'error');
        return;
      }
      const pane = newPane(uid('pane'));
      const attached = [...attachedPanes(panes), pane];
      set({ panes: [...attached, ...panes.filter((p) => p.detached)], paneLayout: layoutFor(attached.length, paneLayout) });
      // Moving the only tab out of a pane would close it again: keep it there and open it in the new one too.
      get().moveTab(docId, paneId, pane.id, { copy: from.tabs.length === 1 });
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
        width: m.width,
        units: m.units ? { ...m.units } : undefined,
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
