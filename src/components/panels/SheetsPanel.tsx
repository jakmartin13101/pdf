import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, LayoutGrid, List, Search, Tags } from 'lucide-react';
import type { Sheet } from '../../types';
import { getState, useStore } from '../../store/store';
import { renderPage } from '../../core/pdf';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { cmdAddPdf } from '../../store/commands';
import { sheetLabel } from '../../core/columns';

const thumbCache = new Map<string, string>();

function useThumb(sheet: Sheet, visible: boolean) {
  const key = `${sheet.fileId}#${sheet.pageIndex}`;
  const [url, setUrl] = useState(() => thumbCache.get(key) ?? '');
  useEffect(() => {
    if (!visible || thumbCache.has(key)) {
      if (thumbCache.has(key)) setUrl(thumbCache.get(key)!);
      return;
    }
    let alive = true;
    const canvas = document.createElement('canvas');
    const scale = 360 / Math.max(sheet.width, sheet.height);
    renderPage(sheet.fileId, sheet.pageIndex, canvas, scale)
      .then(() => {
        const u = canvas.toDataURL('image/png');
        thumbCache.set(key, u);
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key, visible, sheet.fileId, sheet.pageIndex, sheet.width, sheet.height]);
  return url;
}

const Thumb = memo(function Thumb({
  sheet,
  index,
  active,
  markupCount,
  listView,
  dropBefore,
  onContext,
  onDragStartSheet,
  onDragOverSheet,
  onDropSheet,
}: {
  sheet: Sheet;
  index: number;
  active: boolean;
  markupCount: number;
  listView: boolean;
  dropBefore: boolean;
  onContext: (e: React.MouseEvent, s: Sheet) => void;
  onDragStartSheet: (id: string) => void;
  onDragOverSheet: (index: number) => void;
  onDropSheet: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(sheet.number);
  const [title, setTitle] = useState(sheet.title);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const url = useThumb(sheet, visible && !listView);
  const save = () => {
    setEditing(false);
    if (num !== sheet.number || title !== sheet.title) getState().updateSheet(sheet.id, { number: num.trim(), title: title.trim() });
  };
  const scaleCount = sheet.viewports.length;
  return (
    <div
      ref={ref}
      className={`thumb${active ? ' active' : ''}${dropBefore ? ' drop-before' : ''}`}
      onClick={() => getState().setCurrentSheet(sheet.id)}
      onDoubleClick={() => {
        setNum(sheet.number);
        setTitle(sheet.title);
        setEditing(true);
      }}
      onContextMenu={(e) => onContext(e, sheet)}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/sheet', sheet.id);
        onDragStartSheet(sheet.id);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/sheet')) return;
        e.preventDefault();
        onDragOverSheet(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropSheet(index);
      }}
      data-testid="sheet-thumb"
      title={`${sheetLabel(sheet)} – ${sheet.title}`}
    >
      {!listView && (url ? <img className="thumb-img" src={url} alt="" style={{ ['--ar' as string]: `${sheet.width / sheet.height}` }} draggable={false} /> : <div className="thumb-img" style={{ ['--ar' as string]: `${sheet.width / sheet.height}` }} />)}
      {editing ? (
        <div className="thumb-edit" onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={num} onChange={(e) => setNum(e.target.value)} placeholder="Sheet number" onKeyDown={(e) => e.key === 'Enter' && save()} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sheet title" onKeyDown={(e) => e.key === 'Enter' && save()} onBlur={save} />
        </div>
      ) : (
        <div className="thumb-meta">
          <span className="thumb-num">{sheetLabel(sheet)}</span>
          <span className="thumb-title">{sheet.title}</span>
        </div>
      )}
      <div className="thumb-badges">
        {markupCount > 0 && <span className="badge" title="Markups on this sheet">{markupCount}</span>}
        {sheet.scale || scaleCount ? (
          <span className="badge scale" title={sheet.scale ? `Scale ${sheet.scale.label}${scaleCount ? ` + ${scaleCount} viewport(s)` : ''}` : `${scaleCount} viewport(s)`}>
            {sheet.scale ? sheet.scale.label.replace(` = `, '=') : `${scaleCount} VP`}
          </span>
        ) : (
          <span className="badge noscale" title="Scale not set – calibrate before measuring">
            No scale
          </span>
        )}
      </div>
    </div>
  );
});

export function SheetsPanel() {
  const sheets = useStore((s) => s.doc.sheets);
  const markups = useStore((s) => s.doc.markups);
  const currentId = useStore((s) => s.currentSheetId);
  const [q, setQ] = useState('');
  const [listView, setListView] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of markups) c.set(m.sheetId, (c.get(m.sheetId) ?? 0) + 1);
    return c;
  }, [markups]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sheets;
    return sheets.filter((s) => `${s.number} ${s.title}`.toLowerCase().includes(t));
  }, [sheets, q]);

  const onContext = (e: React.MouseEvent, s: Sheet) => {
    e.preventDefault();
    const st = getState();
    const i = sheets.findIndex((x) => x.id === s.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Go to Sheet', onClick: () => st.setCurrentSheet(s.id) },
        { label: 'Set Scale…', onClick: () => st.setDialog({ kind: 'scale', sheetId: s.id }) },
        {
          label: 'Calibrate…',
          onClick: () => {
            st.setCurrentSheet(s.id);
            st.setTool({ kind: 'calibrate' });
          },
        },
        { label: 'Page Labels…', onClick: () => st.setDialog({ kind: 'pageLabels' }) },
        { sep: true },
        { label: 'Move Up', disabled: i <= 0, onClick: () => st.moveSheet(s.id, i - 1) },
        { label: 'Move Down', disabled: i >= sheets.length - 1, onClick: () => st.moveSheet(s.id, i + 1) },
        { sep: true },
        {
          label: 'Remove Sheet from Set',
          danger: true,
          disabled: sheets.length <= 1,
          onClick: () =>
            st.setDialog({
              kind: 'confirm',
              title: 'Remove Sheet',
              message: `Remove ${sheetLabel(s)} and its ${counts.get(s.id) ?? 0} markup(s) from the set? This can be undone.`,
              onConfirm: () => st.deleteSheet(s.id),
            }),
        },
      ],
    });
  };

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="title">Sheets ({sheets.length})</span>
        <button className={`icon-btn${listView ? '' : ' active'}`} title="Thumbnails" onClick={() => setListView(false)}>
          <LayoutGrid size={14} />
        </button>
        <button className={`icon-btn${listView ? ' active' : ''}`} title="List" onClick={() => setListView(true)}>
          <List size={14} />
        </button>
        <button className="icon-btn" title="Page Labels (sheet numbers & titles)" onClick={() => getState().setDialog({ kind: 'pageLabels' })}>
          <Tags size={14} />
        </button>
        <button className="icon-btn" title="Add PDF to set" onClick={cmdAddPdf}>
          <FilePlus2 size={14} />
        </button>
      </div>
      <div className="sheet-search">
        <Search size={14} style={{ color: 'var(--text-faint)' }} />
        <input placeholder="Find sheet (e.g. S1.02, framing)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel-body">
        <div className={`thumbs${listView ? ' list-view' : ''}`} onDragEnd={() => setDropIndex(null)}>
          {filtered.map((s) => {
            const i = sheets.indexOf(s);
            return (
              <Thumb
                key={s.id}
                sheet={s}
                index={i}
                active={s.id === currentId}
                markupCount={counts.get(s.id) ?? 0}
                listView={listView}
                dropBefore={dropIndex === i && dragId !== s.id}
                onContext={onContext}
                onDragStartSheet={setDragId}
                onDragOverSheet={setDropIndex}
                onDropSheet={(to) => {
                  if (dragId) {
                    const from = sheets.findIndex((x) => x.id === dragId);
                    getState().moveSheet(dragId, from < to ? to - 1 : to);
                  }
                  setDragId(null);
                  setDropIndex(null);
                }}
              />
            );
          })}
          {!filtered.length && <div className="empty-note">No sheets match “{q}”.</div>}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
