import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns2, Grid2x2, Minus, Plus, Rows2, Square } from 'lucide-react';
import { currentSheet, getState, useStore, type Prefs } from '../store/store';
import { TYPE_INFO } from '../core/markupTypes';
import { scaleAt } from '../core/measure';
import { formatLength } from '../core/units';
import { sheetDisplayName } from '../core/columns';
import { view } from '../store/commands';

function prompt(tool: ReturnType<typeof getState>['tool']): string {
  switch (tool.kind) {
    case 'select':
      return 'Select markups: click, Shift+click to add, drag to box-select (left→right inside, right→left crossing). Double-click text to edit.';
    case 'pan':
      return 'Drag to pan. Mouse wheel zooms.';
    case 'zoomrect':
      return 'Drag a rectangle to zoom in, click to zoom in a step.';
    case 'calibrate':
      return 'Calibrate: click two points of a known dimension (e.g. a 20\'-0" dimension string). Shift constrains angle.';
    case 'viewport':
      return 'Viewport: drag a rectangle around a detail or drawing area that uses a different scale.';
    case 'region':
      return `Page labels: drag a rectangle around the sheet ${tool.purpose === 'number' ? 'number' : 'title'} in the title block.`;
    case 'cutout':
      return 'Cutout: click points of the hole, double-click or Enter to finish. Esc cancels.';
    case 'markup': {
      const info = TYPE_INFO[tool.type];
      const base = info.label;
      switch (info.input) {
        case 'two-point':
          return `${base}: click start and end points (or drag). Shift = 45°, snapping to content and markups is on.`;
        case 'multi':
          return `${base}: click each vertex; double-click, Enter or right-click to finish. Backspace removes the last point.`;
        case 'click':
          return `${base}: click each item to count. Every click adds to the same count. Esc to finish.`;
        case 'drag-rect':
          return `${base}: drag to draw. ${tool.type === 'text' || tool.type === 'stamp' ? 'Click to place at default size.' : 'Shift for square.'}`;
        case 'freehand':
          return `${base}: press and drag to draw freehand.`;
        case 'callout':
          return `${base}: click the arrow point, then click where the text box goes.`;
      }
    }
  }
  return '';
}

function Toggle({ k, label, title }: { k: keyof Prefs; label: string; title: string }) {
  const on = useStore((s) => s.prefs[k]);
  return (
    <button className={`sb-toggle sb-wide${on ? ' on' : ''}`} title={title} onClick={() => getState().setPrefs({ [k]: !on } as Partial<Prefs>)}>
      {label}
    </button>
  );
}

export function StatusBar() {
  const tool = useStore((s) => s.tool);
  const sheet = useStore(currentSheet);
  const sheets = useStore((s) => s.doc.sheets);
  const zoom = useStore((s) => s.zoom);
  const cursor = useStore((s) => s.cursor);
  const loaded = useStore((s) => s.loaded);
  const idx = sheet ? sheets.findIndex((s) => s.id === sheet.id) : -1;
  const [pageInput, setPageInput] = useState('');
  useEffect(() => setPageInput(idx >= 0 ? String(idx + 1) : ''), [idx]);

  const scale = sheet && cursor ? scaleAt(sheet, cursor) : sheet?.scale;
  const go = (i: number) => {
    const s = sheets[Math.max(0, Math.min(sheets.length - 1, i))];
    if (s) getState().setCurrentSheet(s.id);
  };

  return (
    <div className="statusbar">
      <div className="prompt">{loaded ? prompt(tool) : 'Open a PDF drawing set or the sample set to begin.'}</div>
      {loaded && sheet && (
        <>
          <span className="sb-wide" title="Cursor position (real-world, from sheet origin)">
            {cursor && scale
              ? `X ${formatLength(cursor.x * scale.realPerPt, scale.unit === 'ft-in' ? 'ft' : scale.unit, 1)}  Y ${formatLength(cursor.y * scale.realPerPt, scale.unit === 'ft-in' ? 'ft' : scale.unit, 1)}`
              : `${(sheet.width / 72).toFixed(1)}" × ${(sheet.height / 72).toFixed(1)}"`}
          </span>
          <div className="sb-sep sb-wide" />
          <span className="sb-wide" title="Scale at cursor">{scale ? scale.label : 'Scale not set'}</span>
          <div className="sb-sep sb-wide" />
          <Toggle k="snapContent" label="CONTENT" title="Snap to PDF line work (endpoints, midpoints, lines)" />
          <Toggle k="snapMarkup" label="MARKUP" title="Snap to existing markup vertices" />
          <Toggle k="ortho" label="ORTHO" title="Constrain drawing to horizontal/vertical (Shift for 45°)" />
          <Toggle k="reuse" label="REUSE" title="Keep the current tool active after placing a markup" />
          <Toggle k="showLabels" label="LABELS" title="Show measurement labels on the drawing" />
          <div className="sb-sep" />
          <div className="sb-nav">
            <button className="icon-btn" onClick={() => go(0)} disabled={idx <= 0} title="First sheet">
              <ChevronsLeft size={14} />
            </button>
            <button className="icon-btn" onClick={() => go(idx - 1)} disabled={idx <= 0} title="Previous sheet (PgUp)">
              <ChevronLeft size={14} />
            </button>
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt(pageInput, 10);
                  if (n) go(n - 1);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              title={sheetDisplayName(sheet)}
            />
            <span>/ {sheets.length}</span>
            <button className="icon-btn" onClick={() => go(idx + 1)} disabled={idx >= sheets.length - 1} title="Next sheet (PgDn)">
              <ChevronRight size={14} />
            </button>
            <button className="icon-btn" onClick={() => go(sheets.length - 1)} disabled={idx >= sheets.length - 1} title="Last sheet">
              <ChevronsRight size={14} />
            </button>
          </div>
          <div className="sb-sep" />
          <SplitButtons />
          <div className="sb-sep" />
          <button className="icon-btn" onClick={() => view('zoomBy', 0.8)} title="Zoom out">
            <Minus size={13} />
          </button>
          <span className="sb-zoom" data-testid="zoom">
            {Math.round(zoom * 100)}%
          </span>
          <button className="icon-btn" onClick={() => view('zoomBy', 1.25)} title="Zoom in">
            <Plus size={13} />
          </button>
        </>
      )}
    </div>
  );
}

function SplitButtons() {
  const layout = useStore((s) => s.paneLayout);
  const st = getState();
  const btn = (id: typeof layout, Icon: typeof Square, title: string) => (
    <button className={`icon-btn${layout === id ? ' active' : ''}`} title={title} onClick={() => st.setPaneLayout(id)} data-testid={`split-${id}`}>
      <Icon size={13} />
    </button>
  );
  return (
    <div className="sb-nav" title="Split the view to work on several sheets at once">
      {btn('single', Square, 'Single view')}
      {btn('vertical', Columns2, 'Split vertical (side by side)')}
      {btn('horizontal', Rows2, 'Split horizontal (stacked)')}
      {btn('grid', Grid2x2, 'Split four ways')}
    </div>
  );
}
