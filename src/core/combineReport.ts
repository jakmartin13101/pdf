// Combine report output: lengths as text, the order list, CSV and a printable page.

import type { CombineSettings, SizePlan } from './combine';
import { fmtLen, fmtNumber } from './units';

/** A length for the report: in your units, or metres. */
export function lenText(inches: number, metric = false): string {
  return metric ? `${fmtNumber(inches * 0.0254, 3)} m` : fmtLen(inches);
}

/** "2 × 40'-0" + 1 × 20'-0"" */
export function orderText(p: SizePlan, metric = false): string {
  return p.order.map((o) => `${o.count} × ${lenText(o.stock, metric)}`).join(' + ');
}

/** The pieces of a size, same lengths together: "3 × 5'-0", 1 × 15'-0"". */
export function piecesText(p: SizePlan, metric = false): string {
  const groups = new Map<string, number>();
  for (const x of p.pieces) {
    const k = lenText(x.length, metric);
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  return [...groups].map(([k, n]) => `${n} × ${k}`).join(', ');
}

export interface CombineTotals {
  pieces: number;
  bars: number;
  pieceLength: number;
  stockLength: number;
  dropLength: number;
  weight: number;
}

export function combineTotals(plans: SizePlan[]): CombineTotals {
  return plans.reduce<CombineTotals>(
    (t, p) => ({
      pieces: t.pieces + p.pieces.length,
      bars: t.bars + p.bars.length,
      pieceLength: t.pieceLength + p.pieceLength,
      stockLength: t.stockLength + p.stockLength,
      dropLength: t.dropLength + p.dropLength,
      weight: t.weight + (p.stockLength / 12) * p.plf,
    }),
    { pieces: 0, bars: 0, pieceLength: 0, stockLength: 0, dropLength: 0, weight: 0 },
  );
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The order list and the cutting plan as CSV (lengths in feet, or metres). */
export function combineCsv(plans: SizePlan[], metric = false): string {
  const unit = metric ? 'm' : 'ft';
  const len = (inches: number) => fmtNumber(metric ? inches * 0.0254 : inches / 12, 3).replace(/,/g, '');
  const lines: (string | number)[][] = [
    ['Shape', 'Size', 'Pieces', `Cut length (${unit})`, 'Order', `Ordered length (${unit})`, `Drop (${unit})`, 'Bars', 'lb/ft', 'Ordered weight (lb)', 'Note'],
  ];
  for (const p of plans) {
    lines.push([
      p.shape,
      p.size,
      p.pieces.length,
      len(p.pieceLength),
      orderText(p, metric),
      len(p.stockLength),
      len(p.dropLength),
      p.bars.length,
      p.plf ? fmtNumber(p.plf, 2) : '',
      p.plf ? Math.round((p.stockLength / 12) * p.plf) : '',
      [
        p.noStock ? 'No stock lengths for this shape' : '',
        p.full ? `${p.full} full length – no cut` : '',
        p.tooLong.length ? `${p.tooLong.length} piece(s) longer than the longest stock: spliced` : '',
      ]
        .filter(Boolean)
        .join('; '),
    ]);
  }
  lines.push([]);
  lines.push(['Cutting plan']);
  lines.push(['Size', 'Bar', `Stock (${unit})`, 'Pieces', `Drop (${unit})`, 'Note']);
  for (const p of plans)
    p.bars.forEach((b, i) =>
      lines.push([
        p.size,
        i + 1,
        len(b.stock),
        b.pieces.map((x) => lenText(x.length, metric) + (x.splice ? ` (splice of ${lenText(x.splice, metric)})` : '')).join(' + '),
        len(Math.max(0, b.drop)),
        b.kind === 'full' ? 'Full length – no cut' : b.kind === 'trim' ? 'Trim' : '',
      ]),
    );
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A printable page: what to order for each size, and how to cut every bar. */
export function combineReportHtml(title: string, plans: SizePlan[], settings: CombineSettings, metric = false): string {
  const t = combineTotals(plans);
  const L = (n: number) => esc(lenText(n, metric));
  const rows = plans
    .map(
      (p) =>
        `<tr><td><b>${esc(p.size)}</b>${p.shape ? ` <span class="s">${esc(p.shape)}</span>` : ''}</td><td>${p.pieces.length}</td><td>${L(p.pieceLength)}</td><td class="o">${
          p.noStock ? '<i>no stock lengths</i>' : esc(orderText(p, metric))
        }</td><td>${L(p.stockLength)}</td><td>${L(p.dropLength)}</td><td>${p.plf ? fmtNumber((p.stockLength / 12) * p.plf, 0) : ''}</td></tr>`,
    )
    .join('');
  const plansHtml = plans
    .filter((p) => p.bars.length)
    .map((p) => {
      const bars = p.bars
        .map((b) => {
          const pct = (n: number) => `${Math.max(0.5, (n / b.stock) * 100).toFixed(2)}%`;
          const segs = b.pieces
            .map((x) => `<span class="pc" style="width:${b.kind === 'full' ? '100%' : pct(x.length)}" title="${L(x.length)}">${L(x.length)}${x.splice ? ' ⧉' : ''}</span>`)
            .join('');
          const mc = b.kind ? '' : `<span class="mc" style="width:${pct(settings.allowance)}"></span>`;
          const note = b.kind === 'full' ? 'full length – no cut' : `${b.kind === 'trim' ? 'trim · ' : ''}drop ${L(Math.max(0, b.drop))}`;
          return `<div class="bar"><div class="bl">${L(b.stock)}</div><div class="bt">${segs}${mc}</div><div class="bd">${note}</div></div>`;
        })
        .join('');
      const warn = p.tooLong.length
        ? `<div class="w">${p.tooLong.length} piece${p.tooLong.length === 1 ? ' is' : 's are'} longer than the longest stock length: spliced from whole bars and a cut piece (⧉).</div>`
        : '';
      return `<h3>${esc(p.size)} <span class="s">${esc(orderText(p, metric))}</span></h3>${warn}${bars}`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} – Combine Report</title>
<style>
body{font:12px/1.4 'Segoe UI',Arial,sans-serif;color:#111;margin:32px}
h1{font-size:20px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.8px;color:#0d4fa8}
h3{font-size:13px;margin:16px 0 4px}.meta{color:#555;margin:4px 0 16px}.s{color:#666;font-weight:400}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:5px 7px;text-align:right}
th:first-child,td:first-child,td.o{text-align:left}th{background:#f1f4f8;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#333}
tr.total td{font-weight:800;border-top:2px solid #111;background:#f1f4f8}
.bar{display:flex;align-items:center;gap:8px;margin:3px 0;break-inside:avoid}.bl{width:70px;font-weight:700}.bd{width:110px;color:#666}
.bt{flex:1;display:flex;height:18px;border:1px solid #999;background:repeating-linear-gradient(45deg,#fff,#fff 4px,#eee 4px,#eee 8px)}
.pc{background:#cfe0f7;border-right:1px solid #fff;font-size:10px;line-height:18px;text-align:center;overflow:hidden;white-space:nowrap}
.mc{background:#f6c97b}.w{color:#b45309;margin:2px 0 4px}
@media print{body{margin:12mm}button{display:none}}
</style></head><body>
<button onclick="print()" style="float:right;padding:6px 14px">Print / Save as PDF</button>
<h1>${esc(title)}</h1>
<div class="meta">Combine report · ${t.pieces} pieces on ${t.bars} bars · machine allowance ${L(settings.allowance)} per bar, kerf ${L(settings.kerf)} per cut · ${new Date().toLocaleString()}</div>
<h2>Material to order</h2>
<table><thead><tr><th>Size</th><th>Pieces</th><th>Cut length</th><th>Order</th><th>Ordered</th><th>Drop</th><th>Weight (lb)</th></tr></thead><tbody>${rows}
<tr class="total"><td>TOTAL</td><td>${t.pieces}</td><td>${L(t.pieceLength)}</td><td class="o">${t.bars} bars</td><td>${L(t.stockLength)}</td><td>${L(t.dropLength)}</td><td>${t.weight ? fmtNumber(t.weight, 0) : ''}</td></tr></tbody></table>
<h2>Cutting plan</h2>${plansHtml}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Reports made from the plan (Combine Report → Create Report): a cut list and an order list.

/** One line of the order list: a size, a stock length and how many to order. */
export interface OrderLine {
  size: string;
  /** Inches. */
  length: number;
  qty: number;
  /** No stock lengths for the shape: the pieces as cut (not planned on stock). */
  unplanned?: boolean;
}

/** Every size's stock lengths to order, one line each (longest first); sizes without stock lengths list their pieces. */
export function orderLines(plans: SizePlan[]): OrderLine[] {
  const out: OrderLine[] = [];
  for (const p of plans) {
    if (!p.noStock) {
      for (const o of p.order) out.push({ size: p.size, length: o.stock, qty: o.count });
      continue;
    }
    const byLen = new Map<number, number>();
    for (const x of p.pieces) {
      const k = Math.round(x.length * 64) / 64;
      byLen.set(k, (byLen.get(k) ?? 0) + 1);
    }
    for (const [length, qty] of [...byLen].sort((a, b) => b[0] - a[0])) out.push({ size: p.size, length, qty, unplanned: true });
  }
  return out;
}

/** Bars cut the same way, together: how many, the stock, what is cut from each (same lengths together) and the drop. */
export interface CutLine {
  size: string;
  count: number;
  stock: number;
  cuts: { length: number; n: number; splice?: boolean }[];
  /** Left over on each bar: inches. */
  drop: number;
  kind?: 'full' | 'trim';
  /** No stock lengths for the shape: the pieces only. */
  unplanned?: boolean;
}

const q = (n: number) => Math.round(n * 64) / 64;

export function cutLines(plans: SizePlan[]): CutLine[] {
  const out: CutLine[] = [];
  for (const p of plans) {
    if (p.noStock) {
      const byLen = new Map<number, number>();
      for (const x of p.pieces) byLen.set(q(x.length), (byLen.get(q(x.length)) ?? 0) + 1);
      out.push({ size: p.size, count: 0, stock: 0, cuts: [...byLen].sort((a, b) => b[0] - a[0]).map(([length, n]) => ({ length, n })), drop: 0, unplanned: true });
      continue;
    }
    const groups = new Map<string, CutLine>();
    for (const b of p.bars) {
      const cuts: CutLine['cuts'] = [];
      for (const x of b.pieces) {
        const c = cuts.find((y) => y.length === q(x.length) && !!y.splice === !!x.splice);
        if (c) c.n++;
        else cuts.push({ length: q(x.length), n: 1, splice: x.splice ? true : undefined });
      }
      const key = `${b.stock}|${b.kind ?? ''}|${q(b.drop)}|${cuts.map((c) => `${c.n}x${c.length}${c.splice ? 's' : ''}`).join(',')}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { size: p.size, count: 1, stock: b.stock, cuts, drop: Math.max(0, b.drop), kind: b.kind });
    }
    out.push(...groups.values());
  }
  return out;
}

/** "2 × 11'-6", 15'-0" ⧉" */
export function cutsText(l: CutLine, metric = false): string {
  return l.cuts.map((c) => `${c.n > 1 ? `${c.n} × ` : ''}${lenText(c.length, metric)}${c.splice ? ' ⧉' : ''}`).join(', ');
}

/** What is left of each bar: "drop 1'-5 3/4"", or "full length – no cut". */
export function dropText(l: CutLine, metric = false): string {
  if (l.unplanned) return 'no stock lengths set';
  if (l.kind === 'full') return `full length – no cut${l.cuts.some((c) => c.splice) ? ' (spliced ⧉)' : ''}`;
  return `${l.kind === 'trim' ? 'trim · ' : ''}drop ${lenText(l.drop, metric)}`;
}

/** Columns of text lined up with spaces (no dashes): for copying into an e-mail or a purchase order. */
function columns(rows: string[][], right: boolean[]): string {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return rows.map((r) => r.map((c, i) => (right[i] ? c.padStart(w[i]) : c.padEnd(w[i]))).join('    ').trimEnd()).join('\n');
}

export function orderListText(plans: SizePlan[], metric = false): string {
  const lines = orderLines(plans);
  return columns(
    [['SIZE', 'LENGTH', 'QTY'], ...lines.map((l) => [l.size + (l.unplanned ? ' *' : ''), lenText(l.length, metric), String(l.qty)])],
    [false, true, true],
  ) + (lines.some((l) => l.unplanned) ? '\n\n* no stock lengths set for the shape: the lengths as cut' : '');
}

export function cutListText(plans: SizePlan[], metric = false): string {
  const out: string[] = [];
  let size = '';
  const rows: string[][] = [];
  for (const l of cutLines(plans)) {
    if (l.size !== size) {
      if (rows.length) out.push(columns(rows, [true, true, false, false]));
      rows.length = 0;
      out.push(`${out.length ? '\n' : ''}${l.size}`);
      size = l.size;
    }
    rows.push(l.unplanned ? ['', '', cutsText(l, metric), dropText(l, metric)] : [`${l.count} ×`, lenText(l.stock, metric), l.kind === 'full' ? '' : `cut ${cutsText(l, metric)}`, dropText(l, metric)]);
  }
  if (rows.length) out.push(columns(rows, [true, true, false, false]));
  return out.join('\n');
}

export function orderListCsv(plans: SizePlan[], metric = false): string {
  return [['Size', 'Length', 'Qty', 'Note'], ...orderLines(plans).map((l) => [l.size, lenText(l.length, metric), l.qty, l.unplanned ? 'No stock lengths: length as cut' : ''])]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
}

export function cutListCsv(plans: SizePlan[], metric = false): string {
  return [
    ['Size', 'Bars', 'Stock', 'Cuts', 'Drop'],
    ...cutLines(plans).map((l) => [l.size, l.unplanned ? '' : l.count, l.unplanned ? '' : lenText(l.stock, metric), cutsText(l, metric), dropText(l, metric)]),
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
}

/** A printable page of the cut list or the order list. */
export function simpleReportHtml(title: string, kind: 'cut' | 'order', plans: SizePlan[], metric = false): string {
  const L = (n: number) => esc(lenText(n, metric));
  let body: string;
  if (kind === 'order') {
    const lines = orderLines(plans);
    body = `<table><thead><tr><th>Size</th><th class="r">Length</th><th class="r">Qty</th></tr></thead><tbody>${lines
      .map((l) => `<tr><td>${esc(l.size)}${l.unplanned ? ' *' : ''}</td><td class="r">${L(l.length)}</td><td class="r"><b>${l.qty}</b></td></tr>`)
      .join('')}</tbody></table>${lines.some((l) => l.unplanned) ? '<p class="n">* no stock lengths set for the shape: the lengths as cut.</p>' : ''}`;
  } else {
    let size = '';
    const rows = cutLines(plans)
      .map((l) => {
        const head = l.size !== size ? `<tr class="h"><td colspan="4">${esc(l.size)}</td></tr>` : '';
        size = l.size;
        const row = l.unplanned
          ? `<tr><td></td><td></td><td>${esc(cutsText(l, metric))}</td><td>${esc(dropText(l, metric))}</td></tr>`
          : `<tr><td class="r">${l.count} ×</td><td class="r">${L(l.stock)}</td><td>${l.kind === 'full' ? '' : esc(cutsText(l, metric))}</td><td>${esc(dropText(l, metric))}</td></tr>`;
        return head + row;
      })
      .join('');
    body = `<table><thead><tr><th class="r">Bars</th><th class="r">Stock</th><th>Cut from each</th><th>Drop</th></tr></thead><tbody>${rows}</tbody></table>${
      plans.some((p) => p.tooLong.length) ? '<p class="n">⧉ part of a spliced piece.</p>' : ''
    }`;
  }
  const name = kind === 'order' ? 'Order List' : 'Cut List';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} – ${name}</title>
<style>
body{font:13px/1.45 'Segoe UI',Arial,sans-serif;color:#111;margin:32px}
h1{font-size:20px;margin:0}.meta{color:#555;margin:4px 0 16px}
table{border-collapse:collapse;min-width:420px}th,td{border-bottom:1px solid #ddd;padding:5px 12px;text-align:left}
th{background:#f1f4f8;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#333}.r{text-align:right}
tr.h td{font-weight:800;padding-top:12px;border-bottom:2px solid #111}.n{color:#555;font-size:12px}
@media print{body{margin:12mm}button{display:none}}
</style></head><body>
<button onclick="print()" style="float:right;padding:6px 14px">Print / Save as PDF</button>
<h1>${esc(title)} – ${name}</h1>
<div class="meta">${new Date().toLocaleString()}</div>
${body}
</body></html>`;
}
