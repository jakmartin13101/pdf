import { BlendMode, LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { DocState, FontFamily, Markup, Pt } from '../types';
import { allColumns, columnUnit, sheetDisplayName, type Row } from './columns';
import { buildSummary, columnName, primaryQuantity, summableCustomColumns } from './summary';
import { centroid, dist, labelPoint } from './geometry';
import { computeMeasure, drawingLabelLines, scaleForMarkup } from './measure';
import { TYPE_INFO } from './markupTypes';
import { calloutAnchor, calloutBox, dashArray, markupRect, polylineLabelAnchor, stampFontSize, uprightAngle, wrapText } from './shapes';
import { AREA_SUFFIX, LENGTH_SUFFIX, VOLUME_SUFFIX, fmtNumber } from './units';
import { getPage } from './pdf';
import { customColId } from './columns';
import { desktop } from '../brand';

// ---------------------------------------------------------------------------
// CSV

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(table: string[][]): string {
  return table.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Markups list export: visible columns, raw numeric values for measurement columns. */
export function markupsCsv(rows: Row[], columnIds: string[], doc: DocState): string {
  const cols = allColumns(doc.columns);
  const specs = columnIds.map((id) => cols.find((c) => c.id === id)).filter(Boolean) as ReturnType<typeof allColumns>;
  const header = specs.map((c) => {
    const u = c.numeric ? columnUnit(c.id, doc) : '';
    return u ? `${c.name} (${u})` : c.name;
  });
  const body = rows.map((r) =>
    specs.map((c) => {
      const v = r.values[c.id];
      if (c.numeric && typeof v === 'number') return String(Math.round(v * 10000) / 10000);
      return r.display[c.id] ?? String(v ?? '');
    }),
  );
  return toCsv([header, ...body]);
}

export function summaryCsv(rows: Row[], doc: DocState, groupBy: string | null): string {
  const { groups, total } = buildSummary(rows, doc, groupBy);
  const s = doc.settings;
  const extras = summableCustomColumns(doc);
  const header = [
    ...(groupBy ? [columnName(doc, groupBy)] : []),
    'Subject',
    'Quantity',
    'Markups',
    'Count (EA)',
    `Length (${LENGTH_SUFFIX[s.lengthUnit]})`,
    `Area (${AREA_SUFFIX[s.areaUnit]})`,
    `Volume (${VOLUME_SUFFIX[s.volumeUnit]})`,
    ...extras.map((c) => (c.suffix ? `${c.name} (${c.suffix})` : c.name)),
  ];
  const r4 = (n: number) => String(Math.round(n * 10000) / 10000);
  const out: string[][] = [header];
  for (const g of groups) {
    for (const l of g.lines) {
      out.push([
        ...(groupBy ? [g.name] : []),
        l.subject,
        primaryQuantity(l, doc),
        String(l.markups),
        r4(l.count),
        r4(l.length),
        r4(l.area),
        r4(l.volume),
        ...extras.map((c) => r4(l.extras[customColId(c)] ?? 0)),
      ]);
    }
  }
  out.push([
    ...(groupBy ? ['TOTAL'] : []),
    groupBy ? '' : 'TOTAL',
    '',
    String(total.markups),
    r4(total.count),
    r4(total.length),
    r4(total.area),
    r4(total.volume),
    ...extras.map((c) => r4(total.extras[customColId(c)] ?? 0)),
  ]);
  return toCsv(out);
}

export function csvBlob(text: string) {
  // Byte-order mark so Excel opens UTF-8 (², ³, ·) correctly.
  return new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
}

// ---------------------------------------------------------------------------
// Printable HTML summary report

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function summaryReportHtml(projectName: string, rows: Row[], doc: DocState, groupBy: string | null): string {
  const { groups, total } = buildSummary(rows, doc, groupBy);
  const s = doc.settings;
  const extras = summableCustomColumns(doc);
  const n = (v: number, d = s.decimals) => (v ? fmtNumber(v, d) : '');
  const head = `<tr><th>Subject</th><th>Quantity</th><th>Count (EA)</th><th>Length (${LENGTH_SUFFIX[s.lengthUnit]})</th><th>Area (${AREA_SUFFIX[s.areaUnit]})</th><th>Volume (${VOLUME_SUFFIX[s.volumeUnit]})</th>${extras
    .map((c) => `<th>${esc(c.name)}${c.suffix ? ` (${esc(c.suffix)})` : ''}</th>`)
    .join('')}</tr>`;
  const line = (l: (typeof groups)[0]['lines'][0], cls = '') =>
    `<tr class="${cls}"><td>${l.color && !cls ? `<i style="background:${l.color}"></i>` : ''}${esc(l.subject)}</td><td>${cls ? '' : esc(primaryQuantity(l, doc))}</td><td>${n(l.count, 0)}</td><td>${n(l.length)}</td><td>${n(l.area)}</td><td>${n(
      l.volume,
    )}</td>${extras.map((c) => `<td>${n(l.extras[customColId(c)] ?? 0, c.decimals ?? s.decimals)}</td>`).join('')}</tr>`;
  const body = groups
    .map((g) => (groupBy ? `<tr class="cat"><td colspan="${6 + extras.length}">${esc(g.name)}</td></tr>` : '') + g.lines.map((l) => line(l)).join('') + (groupBy ? line({ ...g.total, subject: `${g.name} subtotal` }, 'sub') : ''))
    .join('');
  const sheets = doc.sheets
    .map((sh) => {
      const c = rows.filter((r) => r.markup.sheetId === sh.id).length;
      return c ? `<li><b>${esc(sheetDisplayName(sh))}</b> — ${c} markup${c === 1 ? '' : 's'}${sh.scale ? ` · ${esc(sh.scale.label)}` : ' · not calibrated'}</li>` : '';
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(projectName)} – Takeoff Summary</title>
<style>
body{font:12px/1.4 'Segoe UI',Arial,sans-serif;color:#111;margin:32px}
h1{font-size:20px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.8px;color:#0d4fa8}
.meta{color:#555;margin:4px 0 16px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:5px 7px;text-align:right}
th:first-child,td:first-child{text-align:left}th{background:#f1f4f8;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#333}
tr.cat td{background:#e8f0fb;font-weight:700;text-align:left;color:#0d4fa8;text-transform:uppercase;letter-spacing:.6px}
tr.sub td{font-weight:700;background:#fafafa}tr.total td{font-weight:800;border-top:2px solid #111;background:#f1f4f8}
i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
ul{padding-left:18px;margin:4px 0}@media print{body{margin:12mm}button{display:none}}
</style></head><body>
<button onclick="print()" style="float:right;padding:6px 14px">Print / Save as PDF</button>
<h1>${esc(projectName)}</h1>
<div class="meta">Quantity takeoff summary · ${rows.length} markups · ${new Date().toLocaleString()}</div>
<table><thead>${head}</thead><tbody>${body}${line({ ...total, subject: 'TOTAL' }, 'total')}</tbody></table>
<h2>Sheets</h2><ul>${sheets}</ul>
</body></html>`;
}

/** Opens the report in a new window; returns false when pop-ups are not allowed. */
export function openReport(html: string): boolean {
  if (desktop) {
    void desktop.openReport(html);
    return true;
  }
  let w: Window | null = null;
  try {
    w = window.open('', '_blank');
  } catch {
    w = null;
  }
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

// ---------------------------------------------------------------------------
// Flattened PDF export (markups burned into page content)

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(v.slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
function sanitize(s: string) {
  return [...s].map((c) => (c.charCodeAt(0) < 256 || WINANSI_EXTRA.has(c) ? c : '?')).join('').replace(/[\u0000-\u001f]/g, ' ');
}

function arcPoints(c: Pt, r: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

function cloudPoints(pts: Pt[], arc: number): Pt[] {
  const ring = [...pts, pts[0]];
  const ctr = centroid(pts);
  const out: Pt[] = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const len = dist(a, b);
    const n = Math.max(1, Math.round(len / arc));
    for (let k = 0; k < n; k++) {
      const p0 = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const p1 = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
      const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const r = dist(p0, p1) / 2;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      // choose the bulge direction pointing away from the centroid
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const outward = (mid.x - ctr.x) * nx + (mid.y - ctr.y) * ny > 0;
      const start = ang + Math.PI;
      const sweep = outward ? Math.PI : -Math.PI;
      out.push(...arcPoints(mid, r, start, start - sweep, 8));
    }
  }
  return out;
}

function ellipsePoints(r: { x: number; y: number; w: number; h: number }, n = 48): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: r.x + r.w / 2 + (Math.cos(a) * r.w) / 2, y: r.y + r.h / 2 + (Math.sin(a) * r.h) / 2 });
  }
  return out;
}

function symbolPolys(sym: Markup['style']['symbol'], p: Pt, r: number): { pts: Pt[]; closed: boolean }[] {
  const { x, y } = p;
  switch (sym) {
    case 'circle':
      return [{ pts: ellipsePoints({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }, 20), closed: true }];
    case 'square':
      return [{ pts: [{ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r }], closed: true }];
    case 'diamond':
      return [{ pts: [{ x, y: y - r * 1.25 }, { x: x + r * 1.25, y }, { x, y: y + r * 1.25 }, { x: x - r * 1.25, y }], closed: true }];
    case 'triangle':
      return [{ pts: [{ x, y: y - r * 1.2 }, { x: x + r * 1.1, y: y + r * 0.8 }, { x: x - r * 1.1, y: y + r * 0.8 }], closed: true }];
    case 'check':
      return [{ pts: [{ x: x - r, y }, { x: x - r * 0.25, y: y + r * 0.8 }, { x: x + r, y: y - r * 0.8 }], closed: false }];
    case 'cross':
      return [
        { pts: [{ x: x - r, y: y - r }, { x: x + r, y: y + r }], closed: false },
        { pts: [{ x: x + r, y: y - r }, { x: x - r, y: y + r }], closed: false },
      ];
    case 'star': {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.48 : r * 1.25;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
      }
      return [{ pts, closed: true }];
    }
  }
}

interface Painter {
  path(pts: Pt[], o: { closed?: boolean; stroke?: string; width?: number; dash?: number[]; fill?: string; fillOpacity?: number; opacity?: number; multiply?: boolean; holes?: Pt[][] }): void;
  text(s: string, at: Pt, o: { size: number; color: string; angle?: number; bold?: boolean; family?: FontFamily; align?: 'left' | 'center'; halo?: boolean; opacity?: number }): void;
  fontFor(family: FontFamily | undefined, bold: boolean): PDFFont;
}

type FontSet = Record<FontFamily, [PDFFont, PDFFont]>;

function makePainter(page: PDFPage, toPdf: (p: Pt) => Pt, fonts: FontSet): Painter {
  const fontFor = (family: FontFamily | undefined, bold: boolean) => fonts[family ?? 'Helvetica'][bold ? 1 : 0];
  const pathD = (pts: Pt[], closed: boolean) => {
    let d = '';
    pts.forEach((p, i) => {
      const q = toPdf(p);
      d += `${i ? 'L' : 'M'}${q.x.toFixed(3)},${(-q.y).toFixed(3)}`;
    });
    return closed ? d + 'Z' : d;
  };
  return {
    fontFor,
    path(pts, o) {
      if (pts.length < 2) return;
      let d = pathD(pts, !!o.closed);
      for (const h of o.holes ?? []) d += pathD(h, true);
      const opacity = o.opacity ?? 1;
      if (o.fill) {
        page.drawSvgPath(d, {
          x: 0,
          y: 0,
          color: hexToRgb(o.fill),
          opacity: (o.fillOpacity ?? 1) * opacity,
          blendMode: o.multiply ? BlendMode.Multiply : undefined,
        });
      }
      if (o.stroke && (o.width ?? 0) > 0) {
        page.drawSvgPath(d, {
          x: 0,
          y: 0,
          borderColor: hexToRgb(o.stroke),
          borderWidth: o.width,
          borderOpacity: opacity,
          borderDashArray: o.dash,
          borderLineCap: LineCapStyle.Round,
        });
      }
    },
    text(s, at, o) {
      const f = fontFor(o.family, !!o.bold);
      const str = sanitize(s);
      const w = f.widthOfTextAtSize(str, o.size);
      const ang = o.angle ?? 0;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      // `at` is the baseline anchor in page coords; shift for centring along the text direction.
      const startX = o.align === 'center' ? at.x - (w / 2) * cos : at.x;
      const startY = o.align === 'center' ? at.y - (w / 2) * sin : at.y;
      if (o.halo) {
        const pad = o.size * 0.15;
        const asc = o.size * 0.82;
        const corners: Pt[] = [
          { x: -pad, y: pad + o.size * 0.18 },
          { x: w + pad, y: pad + o.size * 0.18 },
          { x: w + pad, y: -asc - pad },
          { x: -pad, y: -asc - pad },
        ].map((c) => ({ x: startX + c.x * cos - c.y * sin, y: startY + c.x * sin + c.y * cos }));
        this.path(corners, { closed: true, fill: '#ffffff', fillOpacity: 0.85 });
      }
      const p0 = toPdf({ x: startX, y: startY });
      const p1 = toPdf({ x: startX + cos, y: startY + sin });
      const rot = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
      page.drawText(str, { x: p0.x, y: p0.y, size: o.size, font: f, color: hexToRgb(o.color), rotate: degrees(rot), opacity: o.opacity ?? 1 });
    },
  };
}

function lineEnd(p: Painter, tip: Pt, from: Pt, kind: string, lw: number, color: string, opacity: number) {
  if (kind === 'none') return;
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  if (kind === 'arrow') {
    const size = Math.max(8, lw * 5);
    const a1 = ang + Math.PI - 0.42;
    const a2 = ang + Math.PI + 0.42;
    p.path([tip, { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size }, { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size }], {
      closed: true,
      fill: color,
      opacity,
    });
  } else if (kind === 'tick') {
    const size = Math.max(6, lw * 3.5);
    const a = ang + Math.PI / 4;
    p.path([{ x: tip.x - Math.cos(a) * size, y: tip.y - Math.sin(a) * size }, { x: tip.x + Math.cos(a) * size, y: tip.y + Math.sin(a) * size }], { stroke: color, width: lw, opacity });
  } else if (kind === 'dot') {
    const r = Math.max(2.5, lw * 1.6);
    p.path(ellipsePoints({ x: tip.x - r, y: tip.y - r, w: 2 * r, h: 2 * r }, 16), { closed: true, fill: color, opacity });
  }
}

function paintMarkup(p: Painter, m: Markup, labelLines: string[]) {
  const s = m.style;
  const o = s.opacity;
  const stroke = { stroke: s.color, width: s.lineWidth, dash: dashArray(s), opacity: o };
  const fs = s.fontSize;
  const pts = m.points;
  const labelBlock = (at: Pt, lines: string[], size = fs) => {
    const lh = size * 1.18;
    lines.forEach((l, i) => p.text(l, { x: at.x, y: at.y - ((lines.length - 1) * lh) / 2 + i * lh + size * 0.35 }, { size, color: s.color, align: 'center', bold: s.fontBold !== false, family: s.fontFamily, halo: true }));
  };
  switch (m.type) {
    case 'length':
    case 'line':
    case 'arrow':
    case 'polylength':
    case 'polyline':
    case 'pen': {
      p.path(pts, stroke);
      if (m.type !== 'pen' && pts.length >= 2) {
        lineEnd(p, pts[0], pts[1], s.lineStart, s.lineWidth, s.color, o);
        lineEnd(p, pts[pts.length - 1], pts[pts.length - 2], s.lineEnd, s.lineWidth, s.color, o);
      }
      if (labelLines.length && pts.length >= 2) {
        const anc = m.type === 'length' ? { p: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, angle: uprightAngle(Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)) } : polylineLabelAnchor(pts);
        const off = fs * 0.55 + s.lineWidth;
        labelLines.forEach((l, i) => {
          const k = off + (labelLines.length - 1 - i) * fs * 1.18;
          p.text(l, { x: anc.p.x + Math.sin(anc.angle) * k, y: anc.p.y - Math.cos(anc.angle) * k }, { size: fs, color: s.color, angle: anc.angle, align: 'center', bold: s.fontBold !== false, family: s.fontFamily, halo: true });
        });
      }
      break;
    }
    case 'area':
    case 'volume':
    case 'perimeter':
    case 'polygon':
      p.path(pts, { ...stroke, closed: true, fill: m.type === 'perimeter' ? undefined : s.fillColor ?? undefined, fillOpacity: s.fillOpacity, holes: m.cutouts });
      if (labelLines.length) labelBlock(labelPoint(pts), labelLines);
      break;
    case 'angle':
      p.path(pts, stroke);
      if (labelLines.length && pts[1]) labelBlock({ x: pts[1].x + fs * 2, y: pts[1].y - fs }, labelLines);
      break;
    case 'count': {
      const r = s.symbolSize;
      for (const q of pts) {
        for (const poly of symbolPolys(s.symbol, q, r)) {
          p.path(poly.pts, {
            closed: poly.closed,
            stroke: s.color,
            width: poly.closed ? Math.max(1, r * 0.16) : Math.max(1.5, r * 0.3),
            fill: poly.closed ? s.fillColor ?? s.color : undefined,
            fillOpacity: s.fillOpacity,
            opacity: o,
          });
        }
      }
      const last = pts[pts.length - 1];
      if (last && labelLines.length) {
        const size = Math.max(8, r * 1.2);
        labelLines.forEach((l, i) =>
          p.text(l, { x: last.x + r * 1.5, y: last.y - r * 0.8 - (labelLines.length - 1 - i) * size * 1.18 }, { size, color: s.color, bold: s.fontBold !== false, family: s.fontFamily, halo: true }),
        );
      }
      break;
    }
    case 'cloud':
      p.path(cloudPoints(pts, Math.max(14, s.lineWidth * 9)), { stroke: s.color, width: s.lineWidth, closed: true, fill: s.fillColor ?? undefined, fillOpacity: s.fillOpacity, opacity: o });
      break;
    case 'rectangle':
    case 'highlight': {
      const r = markupRect(m);
      const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
      p.path(corners, {
        ...(s.lineWidth > 0 && m.type !== 'highlight' ? stroke : {}),
        closed: true,
        fill: s.fillColor ?? undefined,
        fillOpacity: s.fillOpacity,
        multiply: m.type === 'highlight',
        opacity: o,
      });
      break;
    }
    case 'ellipse':
      p.path(ellipsePoints(markupRect(m)), { ...stroke, closed: true, fill: s.fillColor ?? undefined, fillOpacity: s.fillOpacity });
      break;
    case 'text':
    case 'callout': {
      if (m.type === 'callout' && pts.length < 3) break;
      const r = m.type === 'text' ? markupRect(m) : calloutBox(m);
      if (m.type === 'callout') {
        const anc = calloutAnchor(pts[0], r);
        p.path([pts[0], anc], { stroke: s.color, width: s.lineWidth, opacity: o });
        lineEnd(p, pts[0], anc, s.lineStart, s.lineWidth, s.color, o);
      }
      const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
      p.path(corners, { closed: true, fill: s.fillColor ?? undefined, fillOpacity: s.fillOpacity, ...(s.lineWidth > 0 ? stroke : {}), dash: undefined });
      const pad = Math.max(2, fs * 0.25);
      const tf = p.fontFor(s.fontFamily, !!s.fontBold);
      const lines = wrapText(m.text ?? '', r.w - pad * 2, (t) => tf.widthOfTextAtSize(sanitize(t), fs));
      lines.forEach((l, i) => {
        const y = r.y + pad + fs * 0.9 + i * fs * 1.2;
        if (y < r.y + r.h + fs * 0.2) p.text(l, { x: r.x + pad, y }, { size: fs, color: s.color, opacity: o, bold: !!s.fontBold, family: s.fontFamily });
      });
      break;
    }
    case 'stamp': {
      const r = markupRect(m);
      const lw = s.lineWidth;
      const rectPts = (rr: typeof r) => [{ x: rr.x, y: rr.y }, { x: rr.x + rr.w, y: rr.y }, { x: rr.x + rr.w, y: rr.y + rr.h }, { x: rr.x, y: rr.y + rr.h }];
      p.path(rectPts(r), { closed: true, stroke: s.color, width: lw, opacity: o });
      p.path(rectPts({ x: r.x + lw * 1.8, y: r.y + lw * 1.8, w: r.w - lw * 3.6, h: r.h - lw * 3.6 }), { closed: true, stroke: s.color, width: lw * 0.45, opacity: o });
      const text = m.text || 'STAMP';
      const sf = p.fontFor(s.fontFamily, true);
      const size = Math.min(stampFontSize(text, r), (r.w * 0.86) / Math.max(1, sf.widthOfTextAtSize(sanitize(text), 1) * 1.12));
      p.text(text, { x: r.x + r.w / 2, y: r.y + r.h / 2 + size * 0.35 }, { size, color: s.color, align: 'center', bold: true, family: s.fontFamily, opacity: o });
      break;
    }
  }
}

export async function exportFlattenedPdf(doc: DocState, fileBytes: Map<string, Uint8Array>, opts: { includeHidden?: boolean } = {}): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const fonts: FontSet = {
    Helvetica: [await out.embedFont(StandardFonts.Helvetica), await out.embedFont(StandardFonts.HelveticaBold)],
    Times: [await out.embedFont(StandardFonts.TimesRoman), await out.embedFont(StandardFonts.TimesRomanBold)],
    Courier: [await out.embedFont(StandardFonts.Courier), await out.embedFont(StandardFonts.CourierBold)],
  };
  const sources = new Map<string, PDFDocument>();
  const hidden = new Set(doc.layers.filter((l) => !l.visible).map((l) => l.id));
  for (const sheet of doc.sheets) {
    let src = sources.get(sheet.fileId);
    if (!src) {
      const bytes = fileBytes.get(sheet.fileId);
      if (!bytes) throw new Error('Missing source PDF data');
      src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      sources.set(sheet.fileId, src);
    }
    const [page] = await out.copyPages(src, [sheet.pageIndex]);
    out.addPage(page);
    const vp = (await getPage(sheet.fileId, sheet.pageIndex)).getViewport({ scale: 1 });
    const toPdf = (q: Pt): Pt => {
      const [x, y] = vp.convertToPdfPoint(q.x, q.y);
      return { x, y };
    };
    const painter = makePainter(page, toPdf, fonts);
    for (const m of doc.markups) {
      if (m.sheetId !== sheet.id) continue;
      if (!opts.includeHidden && hidden.has(m.layer)) continue;
      const lines = TYPE_INFO[m.type].measure
        ? (() => {
            const sc = scaleForMarkup(m, sheet);
            return drawingLabelLines(m, computeMeasure(m, sc), sc, doc.settings);
          })()
        : [];
      paintMarkup(painter, m, lines);
    }
  }
  out.setTitle('Takeoff markups');
  out.setCreator('BuildSuite Takeoff Studio');
  return out.save();
}
