import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Markup, MarkupType, Pt, Rect, Sheet } from '../../types';
import { getState, useStore, type ToolMode, type ViewRequest } from '../../store/store';
import { MarkupShape } from './MarkupShape';
import { PageCanvas } from './PageCanvas';
import { defaultStyle as defaultStyleFor, TYPE_INFO } from '../../core/markupTypes';
import { computeMeasure, drawingLabelLines, measurementText, scaleAt, scaleForMarkup } from '../../core/measure';
import { bbox, constrainAngle, dist, expandRect, rectFromPoints, rectsIntersect, rectContains, simplify, translate } from '../../core/geometry';
import { calloutBox, markupRect, RECT_TYPES } from '../../core/shapes';
import { querySnap, snapIndex, type SnapIndex } from '../../core/pdf';
import { formatLength } from '../../core/units';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { useShallow } from 'zustand/react/shallow';

interface View {
  zoom: number;
  x: number;
  y: number;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | { kind: 'move'; start: Pt; orig: Map<string, Markup>; began: boolean }
  | { kind: 'handle'; id: string; index: number; orig: Markup; began: boolean }
  | { kind: 'marquee'; start: Pt; additive: boolean }
  | { kind: 'rect'; start: Pt; purpose: 'create' | 'zoom' | 'viewport' | 'region' }
  | { kind: 'freehand' }
  | { kind: 'twopoint'; downScreen: Pt };

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 24;
const PX_PER_PT_ACTUAL = 96 / 72;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Corner handles for rect-like markups / callout box. */
function rectHandles(r: Rect): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

function handlesFor(m: Markup): Pt[] {
  if (RECT_TYPES.has(m.type)) return rectHandles(markupRect(m));
  if (m.type === 'callout') return [m.points[0], ...(m.points.length >= 3 ? rectHandles(calloutBox(m)) : [])];
  if (m.type === 'pen') return [];
  return m.points;
}

/** Apply a handle drag to a markup's geometry. */
function applyHandle(orig: Markup, index: number, p: Pt): Pt[] {
  const resizeRect = (r: Rect, i: number): [Pt, Pt] => {
    const corners = rectHandles(r);
    const opposite = corners[(i + 2) % 4];
    return [opposite, p];
  };
  if (RECT_TYPES.has(orig.type)) return resizeRect(markupRect(orig), index);
  if (orig.type === 'callout') {
    if (index === 0) return [p, orig.points[1], orig.points[2]];
    const [a, b] = resizeRect(calloutBox(orig), index - 1);
    return [orig.points[0], a, b];
  }
  return orig.points.map((q, i) => (i === index ? p : q));
}

function normalizeRectPoints(type: MarkupType, pts: Pt[]): Pt[] {
  if (RECT_TYPES.has(type) && pts.length >= 2) {
    const r = rectFromPoints(pts[0], pts[1]);
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
    ];
  }
  if (type === 'callout' && pts.length >= 3) {
    const r = rectFromPoints(pts[1], pts[2]);
    return [pts[0], { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }];
  }
  return pts;
}

// ---------------------------------------------------------------------------

const MarkupsLayer = memo(function MarkupsLayer({ markups, labels, showLabels }: { markups: Markup[]; labels: Map<string, string>; showLabels: boolean }) {
  return (
    <g className="markups">
      {markups.map((m) => (
        <MarkupShape key={m.id} m={m} label={labels.get(m.id) ?? ''} showLabels={showLabels} />
      ))}
    </g>
  );
});

function ViewportsLayer({ sheet, zoom }: { sheet: Sheet; zoom: number }) {
  if (!sheet.viewports.length) return null;
  return (
    <g className="viewports">
      {sheet.viewports.map((v) => (
        <g key={v.id}>
          <rect x={v.rect.x} y={v.rect.y} width={v.rect.w} height={v.rect.h} className="vp-rect" />
          <text x={v.rect.x + 4 / zoom} y={v.rect.y - 5 / zoom} fontSize={11 / zoom} className="vp-label">
            {v.name} · {v.scale.label}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------

export function Viewer({ paneId }: { paneId: string }) {
  const paneSheetId = useStore((s) => s.panes.find((p) => p.id === paneId)?.sheetId ?? null);
  const sheet = useStore((s) => s.doc.sheets.find((x) => x.id === paneSheetId));
  const isActive = useStore((s) => s.activePaneId === paneId);
  const multiPane = useStore((s) => s.panes.length > 1);
  const allMarkups = useStore((s) => s.doc.markups);
  const layers = useStore((s) => s.doc.layers);
  const settings = useStore((s) => s.doc.settings);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const prefs = useStore(useShallow((s) => s.prefs));
  const viewRequest = useStore((s) => s.viewRequest);
  const flash = useStore((s) => s.flash);
  const editingTextId = useStore((s) => s.editingTextId);
  const loaded = useStore((s) => s.loaded);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>({ zoom: 0.4, x: 0, y: 0 });
  const viewRef = useRef(view);
  // When the view was produced by "fit", keep re-fitting as the viewer resizes until the user zooms/pans.
  const autoFit = useRef<'fit' | 'fitWidth' | null>(null);
  const setView = useCallback((v: View, fit: 'fit' | 'fitWidth' | null = null) => {
    viewRef.current = v;
    autoFit.current = fit;
    setViewState(v);
  }, []);
  const viewsBySheet = useRef(new Map<string, View>());
  const lastSheetId = useRef<string | null>(null);
  const handledNonce = useRef<number>(0);

  const [draft, setDraft] = useState<Pt[] | null>(null);
  const draftRef = useRef<Pt[] | null>(null);
  draftRef.current = draft;
  const [hover, setHover] = useState<{ pt: Pt; snap: string | null } | null>(null);
  const [rectPreview, setRectPreview] = useState<Rect | null>(null);
  const [marquee, setMarquee] = useState<{ r: Rect; crossing: boolean } | null>(null);
  const [freehand, setFreehand] = useState<Pt[] | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const countRef = useRef<string | null>(null);
  const spaceDown = useRef(false);
  const snapIdx = useRef<SnapIndex | null>(null);

  const hiddenLayers = useMemo(() => new Set(layers.filter((l) => !l.visible).map((l) => l.id)), [layers]);
  const pageMarkups = useMemo(
    () => (sheet ? allMarkups.filter((m) => m.sheetId === sheet.id && !hiddenLayers.has(m.layer)) : []),
    [allMarkups, sheet, hiddenLayers],
  );
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    if (!sheet) return map;
    for (const m of pageMarkups) {
      if (!TYPE_INFO[m.type].measure) continue;
      const sc = scaleForMarkup(m, sheet);
      map.set(m.id, drawingLabelLines(m, computeMeasure(m, sc), sc, settings).join('\n'));
    }
    return map;
  }, [pageMarkups, sheet, settings]);

  // ---- sizing
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(
    (s: Sheet, mode: 'fit' | 'fitWidth' = 'fit'): View => {
      const pad = 24;
      const zw = (size.w - pad * 2) / s.width;
      const zh = (size.h - pad * 2) / s.height;
      const zoom = clampZoom(mode === 'fit' ? Math.min(zw, zh) : zw);
      return { zoom, x: (size.w - s.width * zoom) / 2, y: mode === 'fit' ? (size.h - s.height * zoom) / 2 : pad };
    },
    [size.w, size.h],
  );

  const applyRequest = useCallback(
    (r: ViewRequest, s: Sheet) => {
      const v = viewRef.current;
      switch (r.kind) {
        case 'fit':
        case 'fitWidth':
          setView(fitView(s, r.kind), r.kind);
          break;
        case 'actual': {
          const zoom = PX_PER_PT_ACTUAL;
          const cx = (size.w / 2 - v.x) / v.zoom;
          const cy = (size.h / 2 - v.y) / v.zoom;
          setView({ zoom, x: size.w / 2 - cx * zoom, y: size.h / 2 - cy * zoom });
          break;
        }
        case 'zoomBy': {
          const zoom = clampZoom(v.zoom * r.factor);
          const sx = size.w / 2;
          const sy = size.h / 2;
          setView({ zoom, x: sx - ((sx - v.x) * zoom) / v.zoom, y: sy - ((sy - v.y) * zoom) / v.zoom });
          break;
        }
        case 'zoomTo': {
          const minW = 260;
          const minH = 180;
          const rect = { ...r.rect };
          if (rect.w < minW) {
            rect.x -= (minW - rect.w) / 2;
            rect.w = minW;
          }
          if (rect.h < minH) {
            rect.y -= (minH - rect.h) / 2;
            rect.h = minH;
          }
          const padded = expandRect(rect, Math.max(rect.w, rect.h) * 0.25);
          const zoom = clampZoom(Math.min(size.w / padded.w, size.h / padded.h, 6));
          const cx = padded.x + padded.w / 2;
          const cy = padded.y + padded.h / 2;
          setView({ zoom, x: size.w / 2 - cx * zoom, y: size.h / 2 - cy * zoom });
          break;
        }
      }
    },
    [fitView, setView, size.w, size.h],
  );

  const restoreOrFit = (s: Sheet) => {
    const saved = viewsBySheet.current.get(s.id);
    if (saved) setView(saved);
    else setView(fitView(s), 'fit');
  };

  // ---- sheet change & view requests
  useLayoutEffect(() => {
    if (!sheet || !size.w || !size.h) return;
    if (lastSheetId.current && lastSheetId.current !== sheet.id) viewsBySheet.current.set(lastSheetId.current, viewRef.current);
    const sheetChanged = lastSheetId.current !== sheet.id;
    lastSheetId.current = sheet.id;
    // Each pane handles only the view requests addressed to it (requests target the active pane).
    if (viewRequest && viewRequest.nonce !== handledNonce.current && (!viewRequest.paneId || viewRequest.paneId === paneId)) {
      handledNonce.current = viewRequest.nonce;
      if (sheetChanged) restoreOrFit(sheet);
      applyRequest(viewRequest, sheet);
      return;
    }
    if (sheetChanged) restoreOrFit(sheet);
    else if (autoFit.current) setView(fitView(sheet, autoFit.current), autoFit.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, viewRequest, size.w, size.h, applyRequest, fitView, setView]);

  useEffect(() => {
    if (isActive) getState().setZoom(view.zoom / PX_PER_PT_ACTUAL);
  }, [view.zoom, isActive]);

  // ---- reset transient state on sheet/tool change
  useEffect(() => {
    setDraft(null);
    setRectPreview(null);
    setFreehand(null);
    // "Resume Count" continues an existing count markup; otherwise the next click starts a new one.
    countRef.current = tool.kind === 'markup' && tool.resumeId ? tool.resumeId : null;
  }, [sheet?.id, tool]);

  // ---- content snap index
  useEffect(() => {
    snapIdx.current = null;
    if (!sheet || !prefs.snapContent) return;
    let alive = true;
    snapIndex(sheet.fileId, sheet.pageIndex)
      .then((idx) => {
        if (alive) snapIdx.current = idx;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sheet?.fileId, sheet?.pageIndex, prefs.snapContent, sheet]);

  // ---- coordinate helpers
  const toPage = (clientX: number, clientY: number): Pt => {
    const rect = containerRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom };
  };

  const snapPoint = (raw: Pt, shift: boolean, anchor?: Pt, excludeId?: string): { pt: Pt; snap: string | null } => {
    const z = viewRef.current.zoom;
    const { prefs: pr } = getState();
    if (anchor && (shift || pr.ortho)) return { pt: constrainAngle(anchor, raw, shift ? 45 : 90), snap: null };
    const r = 8 / z;
    let best: { pt: Pt; snap: string; score: number } | null = null;
    if (pr.snapMarkup) {
      for (const m of pageMarkups) {
        if (m.id === excludeId) continue;
        for (const q of m.points) {
          const d = dist(q, raw);
          if (d < r && (!best || d < best.score)) best = { pt: { ...q }, snap: 'markup', score: d };
        }
      }
    }
    if (pr.snapContent && snapIdx.current) {
      const s = querySnap(snapIdx.current, raw, r);
      if (s) {
        const score = dist(s.pt, raw) + (s.kind === 'line' ? r * 0.45 : 0);
        if (!best || score < best.score) best = { pt: s.pt, snap: s.kind, score };
      }
    }
    if (best) return { pt: best.pt, snap: best.snap };
    return { pt: raw, snap: null };
  };

  // ---- creation
  const finishCreate = (type: MarkupType, pts: Pt[]) => {
    if (!sheet) return;
    const st = getState();
    const info = TYPE_INFO[type];
    if (pts.length < info.minPoints) {
      setDraft(null);
      return;
    }
    const m = st.createMarkup(type, sheet.id, normalizeRectPoints(type, pts));
    setDraft(null);
    setRectPreview(null);
    if (type === 'text' || type === 'callout') {
      st.setSelection([m.id]);
      st.setTool({ kind: 'select' });
      st.setEditingText(m.id);
      return;
    }
    st.setSelection([m.id]);
    if (!st.prefs.reuse) st.setTool({ kind: 'select' });
  };

  const finishDraft = (pts: Pt[] | null = draftRef.current) => {
    if (!pts || !sheet) return;
    // Double-click adds a duplicate final point; drop it.
    const z = viewRef.current.zoom;
    const clean = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 2 / z);
    const t = getState().tool;
    if (t.kind === 'markup') finishCreate(t.type, clean);
    else if (t.kind === 'cutout') {
      if (clean.length >= 3) {
        getState().addCutout(t.markupId, clean);
        getState().setSelection([t.markupId]);
      }
      getState().setTool({ kind: 'select' });
    }
    setDraft(null);
  };

  const closesNearFirst = (pts: Pt[], p: Pt) => pts.length >= 3 && dist(pts[0], p) * viewRef.current.zoom < 9;

  // ---- pointer handling
  const onPointerDown = (e: React.PointerEvent) => {
    if (!sheet) return;
    setMenu(null);
    if (getState().activePaneId !== paneId) getState().setActivePane(paneId);
    const el = containerRef.current!;
    if (e.button === 1 || (e.button === 0 && (spaceDown.current || tool.kind === 'pan'))) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: viewRef.current };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    const st = getState();
    if (st.editingTextId) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    const raw = toPage(e.clientX, e.clientY);
    const target = e.target as Element;

    if (tool.kind === 'select') {
      const handle = target.closest('[data-handle]');
      if (handle) {
        const id = handle.getAttribute('data-hid')!;
        const index = Number(handle.getAttribute('data-handle'));
        const orig = st.doc.markups.find((m) => m.id === id);
        if (orig && !orig.locked) {
          el.setPointerCapture(e.pointerId);
          dragRef.current = { kind: 'handle', id, index, orig, began: false };
        }
        return;
      }
      const id = pickMarkupAt(e.clientX, e.clientY, st.selection);
      if (id) {
        let sel = st.selection;
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        } else if (!sel.includes(id)) sel = [id];
        st.setSelection(sel);
        const orig = new Map(st.doc.markups.filter((m) => sel.includes(m.id) && !m.locked).map((m) => [m.id, m]));
        if (orig.size) {
          el.setPointerCapture(e.pointerId);
          dragRef.current = { kind: 'move', start: raw, orig, began: false };
        }
        return;
      }
      if (!(e.shiftKey || e.ctrlKey)) st.setSelection([]);
      el.setPointerCapture(e.pointerId);
      dragRef.current = { kind: 'marquee', start: raw, additive: e.shiftKey || e.ctrlKey };
      return;
    }

    if (tool.kind === 'zoomrect' || tool.kind === 'viewport' || tool.kind === 'region') {
      el.setPointerCapture(e.pointerId);
      const purpose = tool.kind === 'zoomrect' ? 'zoom' : tool.kind;
      dragRef.current = { kind: 'rect', start: raw, purpose };
      return;
    }

    const anchor = draft?.[draft.length - 1];
    const { pt } = snapPoint(raw, e.shiftKey, anchor);

    if (tool.kind === 'calibrate') {
      if (!draft) {
        setDraft([pt]);
        el.setPointerCapture(e.pointerId);
        dragRef.current = { kind: 'twopoint', downScreen: { x: e.clientX, y: e.clientY } };
      } else {
        st.setDialog({ kind: 'calibrate', sheetId: sheet.id, pts: [draft[0], pt] });
        setDraft(null);
        st.setTool({ kind: 'select' });
      }
      return;
    }

    if (tool.kind === 'cutout') {
      if (!draft) setDraft([pt]);
      else if (closesNearFirst(draft, pt)) finishDraft(draft);
      else setDraft([...draft, pt]);
      return;
    }

    if (tool.kind !== 'markup') return;
    const info = TYPE_INFO[tool.type];
    switch (info.input) {
      case 'click': {
        const existing = countRef.current ? st.doc.markups.find((m) => m.id === countRef.current && m.sheetId === sheet.id) : undefined;
        if (existing) st.addPointsToMarkup(existing.id, [pt]);
        else {
          const m = st.createMarkup(tool.type, sheet.id, [pt]);
          countRef.current = m.id;
          st.setSelection([m.id]);
        }
        return;
      }
      case 'two-point':
        if (!draft) {
          setDraft([pt]);
          el.setPointerCapture(e.pointerId);
          dragRef.current = { kind: 'twopoint', downScreen: { x: e.clientX, y: e.clientY } };
        } else finishCreate(tool.type, [draft[0], pt]);
        return;
      case 'multi':
        if (!draft) setDraft([pt]);
        else if (info.closed && closesNearFirst(draft, pt)) finishDraft(draft);
        else {
          const next = [...draft, pt];
          if (tool.type === 'angle' && next.length >= 3) finishCreate('angle', next.slice(0, 3));
          else setDraft(next);
        }
        return;
      case 'callout':
        if (!draft) setDraft([pt]);
        else {
          const w = 190;
          const h = 46;
          const left = pt.x < draft[0].x;
          finishCreate('callout', [draft[0], { x: left ? pt.x - w : pt.x, y: pt.y - h / 2 }, { x: left ? pt.x : pt.x + w, y: pt.y + h / 2 }]);
        }
        return;
      case 'drag-rect':
        el.setPointerCapture(e.pointerId);
        dragRef.current = { kind: 'rect', start: pt, purpose: 'create' };
        return;
      case 'freehand':
        el.setPointerCapture(e.pointerId);
        dragRef.current = { kind: 'freehand' };
        setFreehand([raw]);
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!sheet) return;
    const rectEl = containerRef.current!.getBoundingClientRect();
    setMouse({ x: e.clientX - rectEl.left, y: e.clientY - rectEl.top });
    const raw = toPage(e.clientX, e.clientY);
    const st = getState();
    st.setCursor(raw);
    const d = dragRef.current;

    if (d?.kind === 'pan') {
      setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy });
      return;
    }
    if (d?.kind === 'move') {
      let dx = raw.x - d.start.x;
      let dy = raw.y - d.start.y;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (!d.began) {
        if (Math.hypot(dx, dy) * viewRef.current.zoom < 3) return;
        st.beginChange();
        d.began = true;
      }
      st.mutate((doc) => ({
        ...doc,
        markups: doc.markups.map((m) => {
          const o = d.orig.get(m.id);
          if (!o) return m;
          return { ...m, points: translate(o.points, dx, dy), cutouts: o.cutouts?.map((c) => translate(c, dx, dy)), modified: Date.now() };
        }),
      }));
      return;
    }
    if (d?.kind === 'handle') {
      const pts = d.orig.points;
      const anchor = d.orig.type === 'length' || d.orig.type === 'line' || d.orig.type === 'arrow' ? pts[1 - d.index] : pts[d.index - 1] ?? pts[d.index + 1];
      const { pt, snap } = snapPoint(raw, e.shiftKey, RECT_TYPES.has(d.orig.type) ? undefined : anchor, d.id);
      setHover({ pt, snap });
      if (!d.began) {
        st.beginChange();
        d.began = true;
      }
      const newPts = applyHandle(d.orig, d.index, pt);
      st.mutate((doc) => ({ ...doc, markups: doc.markups.map((m) => (m.id === d.id ? { ...m, points: newPts, modified: Date.now() } : m)) }));
      return;
    }
    if (d?.kind === 'marquee') {
      const r = rectFromPoints(d.start, raw);
      setMarquee({ r, crossing: raw.x < d.start.x });
      return;
    }
    if (d?.kind === 'rect') {
      const { pt } = d.purpose === 'create' ? snapPoint(raw, false) : { pt: raw };
      let end = pt;
      if (e.shiftKey && d.purpose === 'create') {
        const s = Math.max(Math.abs(pt.x - d.start.x), Math.abs(pt.y - d.start.y));
        end = { x: d.start.x + Math.sign(pt.x - d.start.x) * s, y: d.start.y + Math.sign(pt.y - d.start.y) * s };
      }
      setRectPreview(rectFromPoints(d.start, end));
      return;
    }
    if (d?.kind === 'freehand') {
      setFreehand((f) => (f ? [...f, raw] : [raw]));
      return;
    }

    if (tool.kind === 'select') {
      const id = (e.target as Element).closest?.('[data-mid]')?.getAttribute('data-mid') ?? null;
      if (id !== hoverId) setHoverId(id);
      if (hover) setHover(null);
      return;
    }
    if (tool.kind === 'pan') return;
    const anchor = draft?.[draft.length - 1];
    setHover(snapPoint(raw, e.shiftKey, anchor));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    if (!d || !sheet) return;
    const st = getState();
    const raw = toPage(e.clientX, e.clientY);
    if (d.kind === 'marquee') {
      setMarquee(null);
      const r = rectFromPoints(d.start, raw);
      if (r.w * viewRef.current.zoom < 3 && r.h * viewRef.current.zoom < 3) return;
      const crossing = raw.x < d.start.x;
      const hit = pageMarkups.filter((m) => {
        const b = bbox(m.points);
        return crossing ? rectsIntersect(r, b) : rectContains(r, b);
      });
      const ids = hit.map((m) => m.id);
      st.setSelection(d.additive ? [...new Set([...st.selection, ...ids])] : ids);
      return;
    }
    if (d.kind === 'move' || d.kind === 'handle') {
      setHover(null);
      return;
    }
    if (d.kind === 'twopoint') {
      // Press-drag-release creates the two-point markup immediately.
      if (Math.hypot(e.clientX - d.downScreen.x, e.clientY - d.downScreen.y) > 6 && draftRef.current) {
        const start = draftRef.current[0];
        const { pt } = snapPoint(raw, e.shiftKey, start);
        if (tool.kind === 'calibrate') {
          st.setDialog({ kind: 'calibrate', sheetId: sheet.id, pts: [start, pt] });
          setDraft(null);
          st.setTool({ kind: 'select' });
        } else if (tool.kind === 'markup') finishCreate(tool.type, [start, pt]);
      }
      return;
    }
    if (d.kind === 'freehand') {
      const pts = freehand ?? [];
      setFreehand(null);
      if (tool.kind === 'markup' && pts.length > 1) finishCreate(tool.type, simplify(pts, 0.6 / viewRef.current.zoom));
      return;
    }
    if (d.kind === 'rect') {
      const r = rectPreview;
      setRectPreview(null);
      const z = viewRef.current.zoom;
      const tiny = !r || r.w * z < 5 || r.h * z < 5;
      if (d.purpose === 'zoom') {
        if (!tiny) applyRequest({ kind: 'zoomTo', rect: r!, nonce: 0 }, sheet);
        else applyRequest({ kind: 'zoomBy', factor: 1.6, nonce: 0 }, sheet);
        return;
      }
      if (d.purpose === 'viewport') {
        if (!tiny) st.setDialog({ kind: 'viewport', sheetId: sheet.id, rect: r! });
        st.setTool({ kind: 'select' });
        return;
      }
      if (d.purpose === 'region') {
        if (!tiny) {
          const purpose = tool.kind === 'region' ? tool.purpose : 'number';
          st.setDialog({ kind: 'pageLabels', region: { purpose, rect: { x: r!.x / sheet.width, y: r!.y / sheet.height, w: r!.w / sheet.width, h: r!.h / sheet.height } } });
        }
        st.setTool({ kind: 'select' });
        return;
      }
      if (tool.kind !== 'markup') return;
      if (tiny) {
        if (tool.type === 'text' || tool.type === 'stamp') {
          const w = tool.type === 'text' ? 200 : 240;
          const h = tool.type === 'text' ? 48 : 72;
          finishCreate(tool.type, [d.start, { x: d.start.x + w, y: d.start.y + h }]);
        }
        return;
      }
      finishCreate(tool.type, [
        { x: r!.x, y: r!.y },
        { x: r!.x + r!.w, y: r!.y + r!.h },
      ]);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!sheet) return;
    if (draftRef.current && (tool.kind === 'markup' || tool.kind === 'cutout')) {
      const info = tool.kind === 'markup' ? TYPE_INFO[tool.type] : null;
      if (!info || info.input === 'multi') finishDraft();
      return;
    }
    if (tool.kind === 'select') {
      const id = pickMarkupAt(e.clientX, e.clientY, getState().selection);
      const m = id ? getState().doc.markups.find((x) => x.id === id) : undefined;
      if (m && (m.type === 'text' || m.type === 'callout' || m.type === 'stamp')) getState().setEditingText(m.id);
    }
  };

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const { prefs: pr } = getState();
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const zoomGesture = e.ctrlKey || (pr.wheelZoom && !e.shiftKey);
      if (zoomGesture) {
        const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        const factor = Math.exp(-delta * (e.ctrlKey && !pr.wheelZoom ? 0.01 : 0.0018));
        const zoom = clampZoom(v.zoom * factor);
        setView({ zoom, x: sx - ((sx - v.x) * zoom) / v.zoom, y: sy - ((sy - v.y) * zoom) / v.zoom });
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setView({ ...v, x: v.x - dx, y: v.y - dy });
      }
    },
    [setView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ---- context menu
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!sheet) return;
    if (draftRef.current) {
      finishDraft();
      return;
    }
    const st = getState();
    const id = pickMarkupAt(e.clientX, e.clientY, st.selection);
    const at = toPage(e.clientX, e.clientY);
    const items: MenuItem[] = [];
    if (id) {
      if (!st.selection.includes(id)) st.setSelection([id]);
      const m = st.doc.markups.find((x) => x.id === id)!;
      const sel = st.selection.includes(id) ? st.selection : [id];
      if (m.type === 'text' || m.type === 'callout' || m.type === 'stamp') items.push({ label: 'Edit Text', onClick: () => st.setEditingText(id) });
      if (m.type === 'area' || m.type === 'volume') items.push({ label: 'Add Cutout', onClick: () => st.setTool({ kind: 'cutout', markupId: id }) });
      if (m.cutouts?.length) items.push({ label: 'Remove Cutouts', onClick: () => st.updateMarkup(id, { cutouts: [] }) });
      if (m.type === 'count') {
        // The symbol nearest the click is the one "this item" refers to.
        let near = 0;
        m.points.forEach((p, i) => {
          if (dist(p, at) < dist(m.points[near], at)) near = i;
        });
        const n = m.points.length;
        items.push({
          label: 'Count',
          children: [
            { label: 'Resume Count', onClick: () => st.resumeCount(id) },
            { label: 'Split This Item', disabled: n < 2, onClick: () => st.splitCount(id, near) },
            { label: `Split All (${n})`, disabled: n < 2, onClick: () => st.splitCount(id, 'all') },
            { label: 'Remove This Item', danger: true, onClick: () => st.removeCountPoint(id, near) },
            { sep: true },
            {
              label: m.countOverride != null ? `Clear Manual Quantity (${m.countOverride})` : 'Set Quantity…',
              onClick: () => {
                if (m.countOverride != null) st.updateMarkup(id, { countOverride: undefined });
                else st.showPanel('properties');
              },
            },
          ],
        });
      }
      items.push({ label: 'Properties', onClick: () => st.showPanel('properties') });
      items.push({ label: 'Add to Tool Chest…', onClick: () => st.setDialog({ kind: 'toolEdit', setId: st.toolChest[0]?.id ?? '', fromMarkupId: id }) });
      items.push({ label: 'Set as Default for Tool', onClick: () => st.setTypeDefault(m.type, { style: m.style, subject: m.subject }) });
      items.push({ sep: true });
      items.push({
        label: 'Status',
        children: (['None', 'Accepted', 'Rejected', 'Cancelled', 'Completed'] as const).map((s) => ({
          label: s,
          checked: m.status === s,
          onClick: () => st.updateMarkups(sel, (x) => ({ ...x, status: s })),
        })),
      });
      items.push({ label: m.locked ? 'Unlock' : 'Lock', onClick: () => st.updateMarkups(sel, (x) => ({ ...x, locked: !m.locked })) });
      items.push({ label: 'Bring to Front', onClick: () => bringTo(sel, 'front') });
      items.push({ label: 'Send to Back', onClick: () => bringTo(sel, 'back') });
      items.push({ sep: true });
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', onClick: () => st.copySelection() });
      items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => st.duplicateSelection() });
      items.push({ label: 'Delete', shortcut: 'Del', danger: true, onClick: () => st.deleteMarkups(sel) });
    } else {
      items.push({ label: 'Paste', shortcut: 'Ctrl+V', onClick: () => st.paste(at) });
      items.push({ label: 'Select All on Sheet', shortcut: 'Ctrl+A', onClick: () => st.setSelection(pageMarkups.map((m) => m.id)) });
      items.push({ sep: true });
      items.push({ label: 'Calibrate Scale…', onClick: () => st.setTool({ kind: 'calibrate' }) });
      items.push({ label: 'Set Scale…', onClick: () => st.setDialog({ kind: 'scale', sheetId: sheet.id }) });
      items.push({ label: 'Add Viewport', onClick: () => st.setTool({ kind: 'viewport' }) });
      items.push({ sep: true });
      items.push({ label: 'Fit Page', shortcut: 'Ctrl+0', onClick: () => st.requestView({ kind: 'fit' } as ViewRequest) });
      items.push({ label: 'Fit Width', onClick: () => st.requestView({ kind: 'fitWidth' } as ViewRequest) });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const bringTo = (ids: string[], where: 'front' | 'back') => {
    const s = new Set(ids);
    getState().commit((d) => {
      const sel = d.markups.filter((m) => s.has(m.id));
      const rest = d.markups.filter((m) => !s.has(m.id));
      return { ...d, markups: where === 'front' ? [...rest, ...sel] : [...sel, ...rest] };
    });
  };

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = getState();
      // With split panes only the active pane reacts to the keyboard.
      if (st.dialog || st.editingTextId || st.activePaneId !== paneId) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k === ' ' && !e.repeat) {
        spaceDown.current = true;
        containerRef.current?.classList.add('space-pan');
        e.preventDefault();
        return;
      }
      if (k === 'Escape') {
        if (draftRef.current) setDraft(null);
        else if (st.tool.kind !== 'select') st.setTool({ kind: 'select' });
        else st.setSelection([]);
        setMenu(null);
        return;
      }
      if (k === 'Enter' && draftRef.current) {
        finishDraft();
        return;
      }
      if ((k === 'Backspace' || k === 'Delete') && draftRef.current) {
        const d = draftRef.current;
        setDraft(d.length > 1 ? d.slice(0, -1) : null);
        e.preventDefault();
        return;
      }
      if ((k === 'Delete' || k === 'Backspace') && st.selection.length) {
        st.deleteMarkups(st.selection);
        e.preventDefault();
        return;
      }
      if (ctrl && (k === 'z' || k === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (ctrl && (k === 'y' || k === 'Y')) {
        e.preventDefault();
        st.redo();
        return;
      }
      if (ctrl && k === 'c') {
        st.copySelection();
        return;
      }
      if (ctrl && k === 'v') {
        e.preventDefault();
        st.paste();
        return;
      }
      if (ctrl && k === 'd') {
        e.preventDefault();
        st.duplicateSelection();
        return;
      }
      if (ctrl && k === 'a') {
        e.preventDefault();
        st.setSelection(pageMarkups.map((m) => m.id));
        return;
      }
      if (ctrl && (k === '0' || k === '9')) {
        e.preventDefault();
        st.requestView({ kind: k === '0' ? 'fit' : 'fitWidth' } as ViewRequest);
        return;
      }
      if (ctrl && (k === '=' || k === '+')) {
        e.preventDefault();
        st.requestView({ kind: 'zoomBy', factor: 1.25 } as ViewRequest);
        return;
      }
      if (ctrl && k === '-') {
        e.preventDefault();
        st.requestView({ kind: 'zoomBy', factor: 0.8 } as ViewRequest);
        return;
      }
      if (k === 'PageDown' || (ctrl && k === 'ArrowRight')) {
        e.preventDefault();
        st.gotoSheetOffset(1);
        return;
      }
      if (k === 'PageUp' || (ctrl && k === 'ArrowLeft')) {
        e.preventDefault();
        st.gotoSheetOffset(-1);
        return;
      }
      if (!ctrl && st.selection.length && k.startsWith('Arrow')) {
        const step = (e.shiftKey ? 10 : 1) / viewRef.current.zoom;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        st.updateMarkups(st.selection, (m) => (m.locked ? m : { ...m, points: translate(m.points, dx, dy), cutouts: m.cutouts?.map((c) => translate(c, dx, dy)) }));
        e.preventDefault();
        return;
      }
      if (ctrl) return;
      const toolKey = keyToTool(e);
      if (toolKey) {
        e.preventDefault();
        st.setTool(toolKey);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceDown.current = false;
        containerRef.current?.classList.remove('space-pan');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMarkups, sheet]);

  // ---- derived overlay data
  const z = view.zoom;
  const visible: Rect = sheet
    ? (() => {
        const x0 = Math.max(0, -view.x / z);
        const y0 = Math.max(0, -view.y / z);
        const x1 = Math.min(sheet.width, (size.w - view.x) / z);
        const y1 = Math.min(sheet.height, (size.h - view.y) / z);
        return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
      })()
    : { x: 0, y: 0, w: 0, h: 0 };

  const selectedOnPage = useMemo(() => {
    const s = new Set(selection);
    return pageMarkups.filter((m) => s.has(m.id));
  }, [selection, pageMarkups]);

  const draftMarkup = useMemo((): Markup | null => {
    if (!sheet) return null;
    const st = getState();
    const pts = draft ? [...draft, ...(hover ? [hover.pt] : [])] : freehand;
    let type: MarkupType | null = null;
    if (tool.kind === 'markup') type = tool.type;
    if (tool.kind === 'cutout') type = 'polygon';
    if (tool.kind === 'calibrate') type = 'length';
    if (!type || !pts || pts.length < 1) return null;
    const chest = tool.kind === 'markup' && tool.chestToolId ? st.toolChest.flatMap((t) => t.tools).find((t) => t.id === tool.chestToolId) : undefined;
    const style =
      tool.kind === 'calibrate'
        ? { ...defaultDraftStyle(), color: '#00a2ff', lineStart: 'tick' as const, lineEnd: 'tick' as const }
        : tool.kind === 'cutout'
          ? { ...defaultDraftStyle(), color: '#ff00aa', lineStyle: 'dashed' as const }
          : chest?.style ?? st.typeDefaults[type]?.style ?? defaultDraftStyle(type);
    const points = pts;
    return {
      id: '__draft',
      sheetId: sheet.id,
      type: type === 'count' ? 'polyline' : type,
      points,
      subject: '',
      label: '',
      comments: '',
      author: '',
      created: 0,
      modified: 0,
      status: 'None',
      checked: false,
      layer: '',
      style,
      custom: {},
      depth: chest?.depth ?? 4,
    };
  }, [draft, hover, freehand, tool, sheet]);

  const draftLabel = useMemo(() => {
    if (!draftMarkup || !sheet) return '';
    const t = tool.kind === 'markup' ? tool.type : tool.kind === 'calibrate' ? 'length' : null;
    if (!t || !TYPE_INFO[t].measure || t === 'count') return '';
    const pseudo = { ...draftMarkup, type: t };
    const sc = scaleForMarkup(pseudo, sheet);
    const v = computeMeasure(pseudo, sc);
    if (t === 'area' || t === 'volume') return `${measurementText(pseudo, v, sc, settings)}  ·  P ${formatLength(v.perimeter ?? 0, sc.unit, sc.precision)}`;
    if (tool.kind === 'calibrate') return `${formatLength(v.length ?? 0, 'in', 3)} on paper (uncalibrated)`;
    return measurementText(pseudo, v, sc, settings);
  }, [draftMarkup, sheet, tool, settings]);

  const hoverTip = useMemo(() => {
    if (!hoverId || tool.kind !== 'select' || dragRef.current) return null;
    const m = pageMarkups.find((x) => x.id === hoverId);
    if (!m) return null;
    const lab = labels.get(m.id);
    return { title: m.subject, sub: lab ? lab.split('\n').filter((l) => l !== m.label).join('  ·  ') : m.text?.slice(0, 60) ?? '' };
  }, [hoverId, pageMarkups, labels, tool.kind]);

  const flashMarkup = flash && sheet ? pageMarkups.find((m) => m.id === flash.id) : undefined;
  const editing = editingTextId ? pageMarkups.find((m) => m.id === editingTextId) : undefined;

  const cursorClass =
    panning ? 'cur-grabbing' : tool.kind === 'pan' ? 'cur-grab' : tool.kind === 'select' ? 'cur-default' : tool.kind === 'zoomrect' ? 'cur-zoom' : 'cur-cross';

  const svgStyle = { '--px': `${1 / z}px`, '--hit': `${12 / z}px` } as CSSProperties;

  if (!loaded || !sheet) {
    return <div ref={containerRef} className="viewer empty" />;
  }

  const scaleAtCursor = hover ? scaleAt(sheet, hover.pt) : null;

  return (
    <div
      ref={containerRef}
      className={`viewer ${cursorClass}${multiPane ? (isActive ? ' pane-active' : ' pane-inactive') : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        getState().setCursor(null);
        setMouse(null);
        if (!dragRef.current) setHover(null);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      data-testid="viewer"
    >
      <div className="page" style={{ transform: `translate(${view.x}px, ${view.y}px)`, width: sheet.width * z, height: sheet.height * z }}>
        <PageCanvas sheet={sheet} zoom={z} visible={visible} />
        <svg
          className={`overlay ${tool.kind === 'select' ? '' : 'drawing'}`}
          viewBox={`0 0 ${sheet.width} ${sheet.height}`}
          width={sheet.width * z}
          height={sheet.height * z}
          style={svgStyle}
          data-testid="overlay"
        >
          <ViewportsLayer sheet={sheet} zoom={z} />
          <MarkupsLayer markups={pageMarkups} labels={labels} showLabels={prefs.showLabels} />
          {draftMarkup && (
            <g className="draft">
              <MarkupShape m={draftMarkup} label="" showLabels={false} draft />
              {draft?.map((p, i) => (
                <rect key={i} x={p.x - 3 / z} y={p.y - 3 / z} width={6 / z} height={6 / z} className="draft-vertex" />
              ))}
            </g>
          )}
          {rectPreview && (tool.kind === 'markup' ? (
            <MarkupShape
              m={{ ...(draftMarkupFor(tool, sheet.id) as Markup), points: [{ x: rectPreview.x, y: rectPreview.y }, { x: rectPreview.x + rectPreview.w, y: rectPreview.y + rectPreview.h }] }}
              label=""
              showLabels={false}
              draft
            />
          ) : (
            <rect x={rectPreview.x} y={rectPreview.y} width={rectPreview.w} height={rectPreview.h} className={`rubber ${tool.kind}`} />
          ))}
          {marquee && <rect x={marquee.r.x} y={marquee.r.y} width={marquee.r.w} height={marquee.r.h} className={`marquee ${marquee.crossing ? 'crossing' : ''}`} />}
          {tool.kind === 'select' &&
            selectedOnPage.map((m) => {
              const b = bbox(m.type === 'callout' && m.points.length >= 3 ? m.points : m.points);
              const pad = 4 / z;
              const hs = 7 / z;
              const handles = selectedOnPage.length === 1 && !m.locked ? handlesFor(m) : [];
              return (
                <g key={m.id} className="sel">
                  <rect x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} className="sel-box" />
                  {handles.map((h, i) => (
                    <rect
                      key={i}
                      data-handle={i}
                      data-hid={m.id}
                      x={h.x - hs / 2}
                      y={h.y - hs / 2}
                      width={hs}
                      height={hs}
                      className="sel-handle"
                    />
                  ))}
                </g>
              );
            })}
          {flashMarkup && <FlashBox key={flash!.nonce} m={flashMarkup} zoom={z} />}
          {hover?.snap && tool.kind !== 'select' && (
            <g className="snap-ind">
              {hover.snap === 'intersection' ? (
                <path d={`M${hover.pt.x - 6 / z},${hover.pt.y - 6 / z}l${12 / z},${12 / z}m0,${-12 / z}l${-12 / z},${12 / z}`} />
              ) : hover.snap === 'line' ? (
                <circle cx={hover.pt.x} cy={hover.pt.y} r={5 / z} />
              ) : (
                <rect x={hover.pt.x - 5 / z} y={hover.pt.y - 5 / z} width={10 / z} height={10 / z} className={hover.snap === 'markup' ? 'snap-markup' : ''} />
              )}
            </g>
          )}
        </svg>
        {editing && isActive && <TextEditor m={editing} zoom={z} />}
      </div>
      {mouse && draftLabel && (
        <div className="live-measure" style={{ left: mouse.x + 18, top: mouse.y + 14 }}>
          {draftLabel}
          {scaleAtCursor && tool.kind !== 'calibrate' && <span className="live-scale">{scaleAtCursor.label}</span>}
        </div>
      )}
      {mouse && hoverTip && (
        <div className="hover-tip" style={{ left: mouse.x + 16, top: mouse.y + 16 }}>
          <b>{hoverTip.title}</b>
          {hoverTip.sub && <span>{hoverTip.sub}</span>}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function defaultDraftStyle(type: MarkupType = 'line') {
  return defaultStyleFor(type);
}

function draftMarkupFor(tool: ToolMode, sheetId: string): Partial<Markup> {
  const st = getState();
  if (tool.kind !== 'markup') return {};
  const chest = tool.chestToolId ? st.toolChest.flatMap((t) => t.tools).find((t) => t.id === tool.chestToolId) : undefined;
  return {
    id: '__rect',
    sheetId,
    type: tool.type,
    subject: '',
    label: '',
    comments: '',
    author: '',
    created: 0,
    modified: 0,
    status: 'None',
    checked: false,
    layer: '',
    custom: {},
    text: tool.type === 'stamp' ? chest?.text ?? 'APPROVED' : '',
    style: chest?.style ?? st.typeDefaults[tool.type]?.style ?? defaultStyleFor(tool.type),
  };
}

function FlashBox({ m, zoom }: { m: Markup; zoom: number }) {
  const b = expandRect(bbox(m.points), 14 / zoom);
  return <rect className="flash" x={b.x} y={b.y} width={b.w} height={b.h} rx={6 / zoom} style={{ strokeWidth: 4 / zoom }} />;
}

function TextEditor({ m, zoom }: { m: Markup; zoom: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(m.text ?? '');
  const r = m.type === 'callout' ? calloutBox(m) : markupRect(m);
  const mountedAt = useRef(Date.now());
  const focus = () => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
    }
  };
  useEffect(() => {
    // Wait for the creating click's mousedown to finish moving focus, then take it.
    const t1 = setTimeout(focus, 0);
    const t2 = setTimeout(focus, 40);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const commit = () => {
    const st = getState();
    st.setEditingText(null);
    if (m.type !== 'stamp' && !value.trim() && !m.text) {
      st.deleteMarkups([m.id]);
      return;
    }
    if (value !== (m.text ?? '')) st.updateMarkup(m.id, { text: value });
  };
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        // A blur right after creation comes from the creating click itself, not the user leaving.
        if (Date.now() - mountedAt.current < 250) setTimeout(focus, 0);
        else commit();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        e.stopPropagation();
      }}
      style={{
        left: r.x * zoom,
        top: r.y * zoom,
        width: Math.max(60, r.w * zoom),
        height: Math.max(24, r.h * zoom),
        fontSize: m.style.fontSize * zoom,
        color: m.style.color,
        padding: Math.max(2, m.style.fontSize * 0.25) * zoom,
      }}
    />
  );
}

const FILL_TYPES = new Set<MarkupType>(['area', 'volume', 'polygon', 'rectangle', 'ellipse', 'highlight', 'cloud']);

/**
 * Markup under the pointer. Large filled markups (e.g. a deck area) often sit on top of beams and
 * counts, so lines/symbols/text win over filled shapes; within each group a selected markup wins.
 */
function pickMarkupAt(clientX: number, clientY: number, selection: string[]): string | null {
  const ids: string[] = [];
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.closest('[data-mid]')?.getAttribute('data-mid');
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return null;
  const markups = getState().doc.markups;
  const lines = ids.filter((id) => {
    const m = markups.find((x) => x.id === id);
    return m && !FILL_TYPES.has(m.type);
  });
  const pool = lines.length ? lines : ids;
  return pool.find((id) => selection.includes(id)) ?? pool[0];
}

function keyToTool(e: KeyboardEvent): ToolMode | null {
  const k = e.key.toLowerCase();
  if (e.shiftKey && e.altKey) {
    const code = e.code.replace('Key', '').toLowerCase();
    const map: Record<string, MarkupType> = { l: 'length', m: 'polylength', a: 'area', p: 'perimeter', v: 'volume', c: 'count', g: 'angle' };
    if (map[code]) return { kind: 'markup', type: map[code] };
    if (code === 'k') return { kind: 'calibrate' };
    return null;
  }
  if (e.altKey || e.shiftKey) return null;
  const map: Record<string, MarkupType> = {
    t: 'text',
    q: 'callout',
    c: 'cloud',
    r: 'rectangle',
    e: 'ellipse',
    l: 'line',
    a: 'arrow',
    n: 'polyline',
    g: 'polygon',
    p: 'pen',
    h: 'highlight',
  };
  if (k === 'v') return { kind: 'select' };
  if (k === 'z') return { kind: 'zoomrect' };
  if (map[k]) return { kind: 'markup', type: map[k] };
  return null;
}
