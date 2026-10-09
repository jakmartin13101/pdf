import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanelContext, PanelHeader } from '../dock/PanelHeader';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Download, Filter, Search, Table2, Trash2, X } from 'lucide-react';
import type { Markup, MarkupStatus } from '../../types';
import { STATUSES } from '../../types';
import { getState, useStore } from '../../store/store';
import { allColumns, buildRows, formatTotal, isSummable, type ColumnSpec, type Row } from '../../core/columns';
import { TYPE_ICON } from '../icons';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { exportMarkupsCsv } from '../MenuBar';
import { formatLength, parseLength } from '../../core/units';
import { applyToolToSelection } from '../panels/ToolChestPanel';

const ROW_H = 25;

type Item = { kind: 'group'; key: string; label: string; rows: Row[] } | { kind: 'row'; row: Row };

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function useFilteredRows() {
  const doc = useStore((s) => s.doc);
  const list = useStore((s) => s.list);
  const currentSheetId = useStore((s) => s.currentSheetId);
  const rows = useMemo(() => buildRows(doc), [doc]);
  const filtered = useMemo(() => {
    const q = list.search.trim().toLowerCase();
    const filters = Object.entries(list.filters).filter(([, v]) => v && v.length >= 0);
    let out = rows.filter((r) => {
      if (list.scope === 'page' && r.markup.sheetId !== currentSheetId) return false;
      for (const [col, allowed] of filters) {
        if (!allowed.includes(r.display[col] ?? '')) return false;
      }
      if (q) {
        const hay = `${r.markup.subject} ${r.markup.label} ${r.markup.comments} ${r.markup.text ?? ''} ${r.display.page} ${r.display.type} ${Object.values(r.markup.custom).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (list.sort) {
      const { col, dir } = list.sort;
      out = [...out].sort((a, b) => cmp(a.values[col], b.values[col]) * dir);
    }
    return out;
  }, [rows, list.search, list.filters, list.scope, list.sort, currentSheetId]);
  return { rows, filtered };
}

function FilterPopover({ col, rows, x, y, onClose }: { col: ColumnSpec; rows: Row[]; x: number; y: number; onClose: () => void }) {
  const list = useStore((s) => s.list);
  const values = useMemo(() => [...new Set(rows.map((r) => r.display[col.id] ?? ''))].sort((a, b) => cmp(a, b)), [rows, col.id]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(list.filters[col.id] ?? values));
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [onClose]);
  const shown = values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const apply = () => {
    const filters = { ...getState().list.filters };
    if (sel.size === values.length) delete filters[col.id];
    else filters[col.id] = [...sel];
    getState().setList({ filters });
    onClose();
  };
  return (
    <div className="filter-pop" ref={ref} style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 370) }} data-testid="filter-pop">
      <div className="fp-head">
        <b>Filter: {col.name}</b>
        <input autoFocus placeholder="Search values" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="field-row">
          <button className="btn sm" onClick={() => setSel(new Set(values))}>
            All
          </button>
          <button className="btn sm" onClick={() => setSel(new Set())}>
            None
          </button>
        </div>
      </div>
      <div className="fp-list">
        {shown.map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={sel.has(v)}
              onChange={(e) => {
                const n = new Set(sel);
                if (e.target.checked) n.add(v);
                else n.delete(v);
                setSel(n);
              }}
            />
            {v === '' ? <i style={{ color: 'var(--text-faint)' }}>(blank)</i> : v}
          </label>
        ))}
      </div>
      <div className="fp-foot">
        <button
          className="btn sm"
          onClick={() => {
            const filters = { ...getState().list.filters };
            delete filters[col.id];
            getState().setList({ filters });
            onClose();
          }}
        >
          Clear
        </button>
        <button className="btn sm primary" onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}

function CellEditor({ col, row, onDone }: { col: ColumnSpec; row: Row; onDone: () => void }) {
  const m = row.markup;
  const st = getState();
  const ids = st.selection.includes(m.id) ? st.selection : [m.id];
  const initial =
    col.editor === 'length'
      ? formatLength(m.depth ?? 0, row.scale.unit === 'ft' ? 'ft-in' : row.scale.unit, 8)
      : col.editor === 'count'
        ? String(m.countOverride ?? m.points.length)
        : col.custom
        ? String(m.custom[col.custom.id] ?? '')
        : String((m as unknown as Record<string, unknown>)[col.id] ?? '');
  const [v, setV] = useState(initial);
  const commit = (val = v) => {
    onDone();
    if (val === initial) return;
    if (col.custom) {
      if (col.custom.kind === 'number') {
        if (val.trim() === '') st.setCustomValue(ids, col.custom.id, '');
        else if (isFinite(Number(val))) st.setCustomValue(ids, col.custom.id, Number(val));
        else st.toast(`${col.name} must be a number`, 'error');
      } else st.setCustomValue(ids, col.custom.id, val);
      return;
    }
    if (col.editor === 'count') {
      const t = val.trim();
      // Blank or the counted number clears the manual quantity.
      if (!t || Number(t) === m.points.length) st.updateMarkup(m.id, { countOverride: undefined });
      else if (Number.isFinite(Number(t)) && Number(t) >= 0) st.updateMarkup(m.id, { countOverride: Math.round(Number(t)) });
      else st.toast('Count must be a whole number', 'error');
      return;
    }
    if (col.editor === 'length') {
      const d = parseLength(val, row.scale.unit === 'ft-in' || row.scale.unit === 'ft' ? 'in' : row.scale.unit);
      if (d != null) st.updateMarkups(ids.filter((id) => st.doc.markups.find((x) => x.id === id)?.type === 'volume'), (x) => ({ ...x, depth: d }));
      return;
    }
    st.updateMarkups(ids, (x) => ({ ...x, [col.id]: val }) as Markup);
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') onDone();
  };
  if (col.editor === 'status') {
    return (
      <select
        className="cell-edit"
        autoFocus
        value={m.status}
        onChange={(e) => {
          onDone();
          st.updateMarkups(ids, (x) => ({ ...x, status: e.target.value as MarkupStatus }));
        }}
        onBlur={onDone}
        onKeyDown={keys}
      >
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    );
  }
  if (col.editor === 'layer') {
    return (
      <select
        className="cell-edit"
        autoFocus
        value={m.layer}
        onChange={(e) => {
          onDone();
          st.updateMarkups(ids, (x) => ({ ...x, layer: e.target.value }));
        }}
        onBlur={onDone}
        onKeyDown={keys}
      >
        <option value="">(none)</option>
        {st.doc.layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    );
  }
  if (col.editor === 'color') {
    return (
      <input
        type="color"
        className="cell-edit"
        autoFocus
        defaultValue={m.style.color}
        onChange={(e) => st.updateMarkups(ids, (x) => ({ ...x, style: { ...x.style, color: e.target.value } }))}
        onBlur={onDone}
      />
    );
  }
  if (col.editor === 'choice' && col.custom) {
    return (
      <select
        className="cell-edit"
        autoFocus
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => commit()}
        onKeyDown={keys}
      >
        <option value="">(blank)</option>
        {!col.custom.options?.includes(v) && v && <option>{v}</option>}
        {(col.custom.options ?? []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  }
  return <input className="cell-edit" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit()} onKeyDown={keys} onFocus={(e) => e.target.select()} />;
}

function Cell({ col, row, editing }: { col: ColumnSpec; row: Row; editing: boolean }) {
  const m = row.markup;
  if (editing) return null;
  switch (col.id) {
    case 'type': {
      const Icon = TYPE_ICON[m.type];
      return (
        <span className="type-cell">
          <Icon size={13} color={m.style.color} />
          {row.display.type}
        </span>
      );
    }
    case 'color':
      return <span className="color-dot" style={{ background: m.style.color }} />;
    case 'status':
      return m.status === 'None' ? <span style={{ color: 'var(--text-faint)' }}>None</span> : <span className={`status-pill ${m.status}`}>{m.status}</span>;
    case 'checkmark':
      return <input type="checkbox" checked={m.checked} readOnly style={{ pointerEvents: 'none' }} />;
    default:
      return <>{row.display[col.id] ?? ''}</>;
  }
}

export function MarkupsList() {
  // Inside the top/bottom tab bars the tab names the panel; elsewhere it needs its own header.
  const ctx = useContext(PanelContext);
  const showHeader = !!ctx && (ctx.dock === 'left' || ctx.dock === 'right' || ctx.dock === 'float');
  const doc = useStore((s) => s.doc);
  const list = useStore((s) => s.list);
  const selection = useStore((s) => s.selection);
  const { rows, filtered } = useFilteredRows();
  const cols = useMemo(() => allColumns(doc.columns), [doc.columns]);
  const visibleCols = useMemo(() => list.columns.map((id) => cols.find((c) => c.id === id)).filter(Boolean) as ColumnSpec[], [list.columns, cols]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; col: string } | null>(null);
  const [filterFor, setFilterFor] = useState<{ col: ColumnSpec; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, h: 300 });
  const anchorRef = useRef<string | null>(null);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const st = getState;

  const items = useMemo<Item[]>(() => {
    if (!list.groupBy) return filtered.map((row) => ({ kind: 'row', row }));
    const groups = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = r.display[list.groupBy] ?? '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const keys = [...groups.keys()].sort((a, b) => cmp(a, b));
    const out: Item[] = [];
    for (const k of keys) {
      const g = groups.get(k)!;
      out.push({ kind: 'group', key: k, label: k || '(blank)', rows: g });
      if (!collapsed.has(k)) for (const row of g) out.push({ kind: 'row', row });
    }
    return out;
  }, [filtered, list.groupBy, collapsed]);

  const rowOrder = useMemo(() => items.filter((i) => i.kind === 'row').map((i) => (i as { row: Row }).row.markup.id), [items]);

  // Keep the selected markup visible when it was selected on the drawing.
  useEffect(() => {
    if (!selection.length || !wrapRef.current) return;
    const idx = items.findIndex((i) => i.kind === 'row' && i.row.markup.id === selection[selection.length - 1]);
    if (idx < 0) return;
    const el = wrapRef.current;
    const top = idx * ROW_H;
    const header = 27;
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight - header - ROW_H) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScroll({ top: el.scrollTop, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scroll.top / ROW_H) - 10);
  const end = Math.min(items.length, Math.ceil((scroll.top + scroll.h) / ROW_H) + 10);
  const slice = items.slice(start, end);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of visibleCols) if (isSummable(c)) t[c.id] = filtered.reduce((s, r) => s + (Number(r.values[c.id]) || 0), 0);
    return t;
  }, [filtered, visibleCols]);

  const onRowClick = (e: React.MouseEvent, r: Row) => {
    const id = r.markup.id;
    const s = st();
    if (e.shiftKey && anchorRef.current) {
      const a = rowOrder.indexOf(anchorRef.current);
      const b = rowOrder.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        s.setSelection(rowOrder.slice(lo, hi + 1));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      s.setSelection(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);
      anchorRef.current = id;
      return;
    }
    anchorRef.current = id;
    s.focusMarkup(id);
  };

  const onRowContext = (e: React.MouseEvent, r: Row) => {
    e.preventDefault();
    const s = st();
    const ids = selection.includes(r.markup.id) ? selection : [r.markup.id];
    if (!selection.includes(r.markup.id)) s.setSelection(ids);
    const chestTools = s.toolChest.flatMap((t) => t.tools);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Zoom To', onClick: () => s.focusMarkup(r.markup.id) },
        { label: 'Properties', onClick: () => s.showPanel('properties') },
        ...(r.markup.type === 'count'
          ? [
              { label: 'Resume Count', onClick: () => s.resumeCount(r.markup.id) },
              { label: `Split All (${r.markup.points.length})`, disabled: r.markup.points.length < 2, onClick: () => s.splitCount(r.markup.id, 'all') },
              {
                label: r.markup.countOverride != null ? 'Clear Manual Quantity' : 'Set Quantity…',
                onClick: () =>
                  r.markup.countOverride != null ? s.updateMarkup(r.markup.id, { countOverride: undefined }) : setEditing({ id: r.markup.id, col: 'count' }),
              },
            ]
          : []),
        {
          label: `Select All “${r.markup.subject}”`,
          onClick: () => s.setSelection(s.doc.markups.filter((m) => m.subject === r.markup.subject).map((m) => m.id)),
        },
        {
          label: 'Status',
          children: STATUSES.map((x) => ({ label: x, checked: r.markup.status === x, onClick: () => s.updateMarkups(ids, (m) => ({ ...m, status: x })) })),
        },
        { label: r.markup.checked ? 'Uncheck' : 'Check', onClick: () => s.updateMarkups(ids, (m) => ({ ...m, checked: !r.markup.checked })) },
        {
          label: 'Apply Tool Properties',
          children: chestTools.length
            ? chestTools.slice(0, 40).map((t) => ({
                label: t.name,
                onClick: () => applyToolToSelection(t),
              }))
            : [{ label: '(no tools)', disabled: true }],
        },
        { label: 'Add to Tool Chest…', onClick: () => s.setDialog({ kind: 'toolEdit', setId: s.toolChest[0]?.id ?? '', fromMarkupId: r.markup.id }) },
        { sep: true },
        { label: 'Copy', onClick: () => s.copySelection() },
        { label: `Delete ${ids.length > 1 ? `${ids.length} Markups` : ''}`, danger: true, onClick: () => s.deleteMarkups(ids) },
      ],
    });
  };

  const toggleSort = (c: ColumnSpec) => {
    const s = list.sort;
    if (!s || s.col !== c.id) st().setList({ sort: { col: c.id, dir: 1 } });
    else if (s.dir === 1) st().setList({ sort: { col: c.id, dir: -1 } });
    else st().setList({ sort: null });
  };

  const startResize = (e: React.PointerEvent, c: ColumnSpec) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const w0 = list.widths[c.id] ?? c.width;
    const move = (ev: PointerEvent) => st().setList({ widths: { ...st().list.widths, [c.id]: Math.max(36, w0 + ev.clientX - startX) } });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const groupOptions = useMemo(
    () => cols.filter((c) => !c.numeric && !['color', 'date', 'comments', 'checkmark', 'measurement', 'label'].includes(c.id)),
    [cols],
  );
  const activeFilters = Object.keys(list.filters);
  const width = (c: ColumnSpec) => list.widths[c.id] ?? c.width;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {showHeader && <PanelHeader title="Markups List" icon={<Table2 size={14} />} />}
      <div className="list-toolbar">
        <div className="search">
          <Search size={13} style={{ color: 'var(--text-faint)' }} />
          <input placeholder="Search markups" value={list.search} onChange={(e) => st().setList({ search: e.target.value })} data-testid="list-search" />
          {list.search && (
            <button className="icon-btn" onClick={() => st().setList({ search: '' })}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="seg">
          <button className={list.scope === 'all' ? 'on' : ''} onClick={() => st().setList({ scope: 'all' })}>
            All Sheets
          </button>
          <button className={list.scope === 'page' ? 'on' : ''} onClick={() => st().setList({ scope: 'page' })}>
            Current Sheet
          </button>
        </div>
        <label className="inline">
          Group by
          <select value={list.groupBy ?? ''} onChange={(e) => st().setList({ groupBy: e.target.value || null })} data-testid="group-by">
            <option value="">None</option>
            {groupOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {activeFilters.map((f) => (
          <span className="filter-chip" key={f}>
            {cols.find((c) => c.id === f)?.name}: {list.filters[f].length} value{list.filters[f].length === 1 ? '' : 's'}
            <button
              className="icon-btn"
              style={{ minWidth: 16, height: 16 }}
              onClick={() => {
                const filters = { ...list.filters };
                delete filters[f];
                st().setList({ filters });
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {(activeFilters.length > 0 || list.search) && (
          <button className="btn sm" onClick={() => st().setList({ filters: {}, search: '' })}>
            Clear Filters
          </button>
        )}
        <div className="grow" />
        <span className="list-count" data-testid="list-count">
          {filtered.length === rows.length ? `${rows.length} markups` : `Showing ${filtered.length} of ${rows.length}`}
          {selection.length ? ` · ${selection.length} selected` : ''}
        </span>
        <button className="icon-btn" title="Delete selected markups" disabled={!selection.length} onClick={() => st().deleteMarkups(selection)}>
          <Trash2 size={14} />
        </button>
        <button className="icon-btn" title="Columns…" onClick={() => st().setDialog({ kind: 'columns' })} data-testid="btn-columns">
          <Columns3 size={14} />
        </button>
        <button className="icon-btn" title="Export markups list to CSV" onClick={exportMarkupsCsv}>
          <Download size={14} />
        </button>
      </div>
      <div className="grid-wrap" ref={wrapRef} onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, h: e.currentTarget.clientHeight })}>
        <table className="grid" style={{ width: visibleCols.reduce((s, c) => s + width(c), 0) }} data-testid="markups-table">
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.id} style={{ width: width(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.id} title={c.custom?.kind === 'formula' ? `${c.name} = ${c.custom.formula}` : c.name}>
                  <div className="th-inner" onClick={() => toggleSort(c)}>
                    <span className="th-name">{c.name}</span>
                    {list.sort?.col === c.id && (list.sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    <button
                      className={`icon-btn th-filter${list.filters[c.id] ? ' on' : ''}`}
                      style={{ minWidth: 18, height: 18 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setFilterFor({ col: c, x: r.left, y: r.bottom + 2 });
                      }}
                      title="Filter"
                      data-testid={`filter-${c.id}`}
                    >
                      <Filter size={11} />
                    </button>
                    <span className="resizer" onPointerDown={(e) => startResize(e, c)} onClick={(e) => e.stopPropagation()} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr style={{ height: start * ROW_H }}>
                <td colSpan={visibleCols.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {slice.map((it) => {
              if (it.kind === 'group') {
                const isCollapsed = collapsed.has(it.key);
                return (
                  <tr
                    key={`g:${it.key}`}
                    className="group"
                    onClick={() => {
                      const n = new Set(collapsed);
                      if (isCollapsed) n.delete(it.key);
                      else n.add(it.key);
                      setCollapsed(n);
                    }}
                    onDoubleClick={() => st().setSelection(it.rows.map((r) => r.markup.id))}
                    title="Click to expand/collapse, double-click to select the group"
                  >
                    {visibleCols.map((c, ci) => {
                      if (ci === 0)
                        return (
                          <td key={c.id}>
                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} {it.label} <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({it.rows.length})</span>
                          </td>
                        );
                      if (isSummable(c)) {
                        const sum = it.rows.reduce((s, r) => s + (Number(r.values[c.id]) || 0), 0);
                        return (
                          <td key={c.id} className="num">
                            {sum ? formatTotal(c.id, sum, doc) : ''}
                          </td>
                        );
                      }
                      return <td key={c.id} />;
                    })}
                  </tr>
                );
              }
              const r = it.row;
              const sel = selSet.has(r.markup.id);
              return (
                <tr
                  key={r.markup.id}
                  className={`row${sel ? ' sel' : ''}`}
                  onClick={(e) => onRowClick(e, r)}
                  onContextMenu={(e) => onRowContext(e, r)}
                  data-testid="markup-row"
                  data-mid={r.markup.id}
                >
                  {visibleCols.map((c) => {
                    const isEditing = editing?.id === r.markup.id && editing.col === c.id;
                    const editable = c.editor !== 'none' && !(c.editor === 'length' && r.markup.type !== 'volume') && !(c.editor === 'count' && r.markup.type !== 'count');
                    return (
                      <td
                        key={c.id}
                        className={`${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}${editable ? ' editable' : ''}`}
                        title={r.display[c.id]}
                        onDoubleClick={(e) => {
                          if (!editable) return;
                          e.stopPropagation();
                          if (c.editor === 'check') return;
                          setEditing({ id: r.markup.id, col: c.id });
                        }}
                        onClick={(e) => {
                          if (c.editor === 'check') {
                            e.stopPropagation();
                            st().updateMarkup(r.markup.id, { checked: !r.markup.checked });
                          }
                        }}
                        data-col={c.id}
                      >
                        {isEditing ? <CellEditor col={c} row={r} onDone={() => setEditing(null)} /> : <Cell col={c} row={r} editing={false} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {end < items.length && (
              <tr style={{ height: (items.length - end) * ROW_H }}>
                <td colSpan={visibleCols.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {!items.length && (
              <tr>
                <td colSpan={visibleCols.length} className="empty-note" style={{ height: 60 }}>
                  {rows.length ? 'No markups match the current filters.' : 'No markups yet. Pick a measurement tool or a Tool Chest tool and start your takeoff.'}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                {visibleCols.map((c, i) => (
                  <td key={c.id} className={isSummable(c) ? 'num' : ''} data-testid={`total-${c.id}`}>
                    {i === 0 ? `Total (${filtered.length})` : isSummable(c) && totals[c.id] ? formatTotal(c.id, totals[c.id], doc) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filterFor && <FilterPopover col={filterFor.col} rows={rows} x={filterFor.x} y={filterFor.y} onClose={() => setFilterFor(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
