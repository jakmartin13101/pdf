// Combine report output: lengths as text, the order list, CSV and a printable page.

import type { CombineSettings, SizePlan } from './combine';
import { fmtNumber, formatLength } from './units';

/** A length for the report: ft-in (to 1/16"), or metres. */
export function lenText(inches: number, metric = false): string {
  return metric ? `${fmtNumber(inches * 0.0254, 3)} m` : formatLength(inches, 'ft-in', 16);
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
      p.noStock ? 'No stock lengths for this shape' : p.tooLong.length ? `${p.tooLong.length} piece(s) longer than the longest stock: spliced` : '',
    ]);
  }
  lines.push([]);
  lines.push(['Cutting plan']);
  lines.push(['Size', 'Bar', `Stock (${unit})`, 'Pieces', `Drop (${unit})`]);
  for (const p of plans)
    p.bars.forEach((b, i) => lines.push([p.size, i + 1, len(b.stock), b.pieces.map((x) => lenText(x.length, metric)).join(' + '), len(Math.max(0, b.drop))]));
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
            .map((x) => `<span class="pc" style="width:${pct(x.length)}" title="${L(x.length)}">${L(x.length)}</span>`)
            .join('');
          return `<div class="bar"><div class="bl">${L(b.stock)}</div><div class="bt">${segs}<span class="mc" style="width:${pct(settings.allowance)}"></span></div><div class="bd">drop ${L(Math.max(0, b.drop))}</div></div>`;
        })
        .join('');
      const warn = p.tooLong.length ? `<div class="w">${p.tooLong.length} piece${p.tooLong.length === 1 ? ' is' : 's are'} longer than the longest stock length and need a splice.</div>` : '';
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
