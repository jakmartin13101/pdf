// Builds public/samples/Example-Takeoff.takeoff.json by performing a takeoff on the sample set in a
// real browser. Run `npm run dev` first, then: node scripts/generate-example.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/samples/Example-Takeoff.takeoff.json');
const SW = 2592;
const FT8 = 9;
const gx = (i) => 260 + i * 225;
const gy = (j) => 300 + j * 180;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
await page.goto(base);
await page.getByTestId('open-sample').click();
await page.getByTestId('sheet-thumb').first().waitFor();
await page.waitForTimeout(800);

async function pt(x, y) {
  const b = await page.locator('.page').boundingBox();
  const k = b.width / SW;
  return { x: b.x + x * k, y: b.y + y * k };
}
async function click(x, y) {
  const p = await pt(x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}
async function drag(x1, y1, x2, y2) {
  const a = await pt(x1, y1);
  const b = await pt(x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
const sheet = async (i) => {
  await page.getByTestId('sheet-thumb').nth(i).click();
  await page.waitForTimeout(400);
};
const tool = (name) => page.getByTestId('chest-tool').filter({ hasText: name }).first().click();
const done = () => page.keyboard.press('Escape');
const poly = async (pts) => {
  for (const [x, y] of pts) await click(x, y);
  await page.keyboard.press('Enter');
};

// S1.01 foundation: calibrate from the 20'-0" dimension and apply to every sheet
await sheet(1);
await page.getByTestId('tb-calibrate').click();
await click(125, 300);
await click(125, 480);
await page.getByTestId('calibrate-input').fill(`20'-0"`);
await page.getByTestId('apply-to').selectOption('all');
await page.getByTestId('calibrate-ok').click();
await tool('Spread Footing');
for (let i = 0; i <= 6; i++) for (let j = 0; j <= 5; j++) await click(gx(i), gy(j));
await done();
await tool('Slab on Grade');
await poly([[gx(0), gy(0)], [gx(6), gy(0)], [gx(6), gy(5)], [gx(0), gy(5)]]);
await tool('Continuous Footing');
await poly([[gx(0), gy(0)], [gx(6), gy(0)], [gx(6), gy(5)], [gx(0), gy(5)], [gx(0), gy(0)]]);
await tool('Anchor Bolts');
for (let i = 0; i <= 6; i++) for (let j = 0; j <= 5; j++) await click(gx(i) + 1, gy(j) + 1);
await done();

// S1.02 roof framing
await sheet(2);
await tool('W24x55');
for (let j = 1; j < 5; j++) for (let i = 0; i < 6; i++) { await click(gx(i) + 9, gy(j)); await click(gx(i + 1) - 9, gy(j)); }
await tool('W18x35');
for (const j of [0, 5]) for (let i = 0; i < 6; i++) { if (j === 0 && i === 1) continue; await click(gx(i) + 9, gy(j)); await click(gx(i + 1) - 9, gy(j)); }
for (const i of [0, 6]) for (let j = 0; j < 5; j++) { await click(gx(i), gy(j) + 9); await click(gx(i), gy(j + 1) - 9); }
await tool('W30x90');
await click(gx(1) + 9, gy(0));
await click(gx(2) - 9, gy(0));
await tool('HSS6x6x3/8 Column');
for (let i = 0; i <= 6; i++) for (let j = 0; j <= 5; j++) await click(gx(i), gy(j));
await done();
await tool('L4x4x3/8');
await poly([[gx(3) + 40, gy(2) + 40], [gx(3) + 130, gy(2) + 40], [gx(3) + 130, gy(2) + 112], [gx(3) + 40, gy(2) + 112], [gx(3) + 40, gy(2) + 40]]);
await tool('Joist 24K6');
for (let k = 1; k < 5; k++) { await click(gx(0) + k * 5 * FT8, gy(0) + 6); await click(gx(0) + k * 5 * FT8, gy(1) - 6); }
await tool('Metal Deck');
await poly([[gx(0), gy(0)], [gx(6), gy(0)], [gx(6), gy(5)], [gx(0), gy(5)]]);
await tool('Revision Cloud');
await poly([[gx(1) - 30, gy(0) - 40], [gx(2) + 30, gy(0) - 40], [gx(2) + 30, gy(0) + 45], [gx(1) - 30, gy(0) + 45]]);
await tool('Callout');
await click(gx(2) + 20, gy(0) - 30);
await click(gx(2) + 120, gy(0) - 120);
await page.locator('.text-editor').waitFor();
await page.waitForTimeout(150);
await page.keyboard.type('Confirm W30x90 moment connection with EOR');
await page.mouse.click(5, 500);
await page.waitForTimeout(200);

// S2.01 details at mixed scales
await sheet(3);
await page.getByTestId('scale-chip').click();
await page.getByTestId('scale-preset').selectOption(`1/4" = 1'-0"`);
await page.getByTestId('scale-ok').click();
await page.getByTestId('tb-viewport').click();
await drag(1180, 290, 1700, 760);
await page.getByTestId('viewport-name').fill('2/S2.01 Base Plate');
await page.getByTestId('scale-preset').selectOption(`1 1/2" = 1'-0"`);
await page.getByTestId('viewport-ok').click();
await page.getByTestId('tb-viewport').click();
await drag(1180, 880, 1760, 1220);
await page.getByTestId('viewport-name').fill('1/S2.01 Beam Connection');
await page.getByTestId('scale-preset').selectOption(`1" = 1'-0"`);
await page.getByTestId('viewport-ok').click();
await page.getByTestId('tb-length').click();
await click(140 + 50 * 18 + 70, 760 - 24 * 18);
await click(140 + 50 * 18 + 70, 760);
const pl = (14 / 12) * 108;
await click(1400 - pl / 2, 480 - pl / 2 - 40);
await click(1400 + pl / 2, 480 - pl / 2 - 40);
await done();

// A1.01 doors and windows
await sheet(4);
await tool('Doors');
for (const [x, y] of [[gx(0) + 60, gy(0)], [gx(1) + 60, gy(0)], [gx(1) - 10, gy(1) + 60], [gx(2) - 10, gy(0) + 60], [gx(2) - 10, gy(1) + 60], [gx(1) + 120, gy(2)], [gx(0) + 120, gy(2)]]) await click(x, y);
for (const i of [2, 3, 4, 5]) await click(gx(i) + 50 + 54, gy(5));
await done();
await tool('Windows');
for (let i = 0; i < 2; i++) for (const t of [0.25, 0.6]) await click(gx(i) + t * 225 + 20, gy(0) - 4);
for (let j = 0; j < 2; j++) for (const t of [0.3, 0.65]) await click(gx(0) - 4, gy(j) + t * 180 + 18);
await done();

// M1.01 floor drains
await sheet(5);
await tool('Floor Drains');
for (const [i, j] of [[1, 1], [2, 1], [3, 3], [4, 3], [5, 3], [2, 4], [4, 4], [1, 3]]) await click(gx(i) + 112, gy(j) + 90);
await done();
await tool('Ductwork');
await poly([[gx(0) + 40, gy(2) + 60], [gx(5) + 60, gy(2) + 60]]);

// E1.01 light fixtures
await sheet(6);
await tool('Light Fixtures');
for (let i = 0; i < 6; i++)
  for (let j = 0; j < 5; j++) {
    const office = i < 2 && j < 2;
    const pts = office ? [[0.3, 0.35], [0.7, 0.35], [0.3, 0.7], [0.7, 0.7]] : [[0.33, 0.5], [0.67, 0.5]];
    for (const [u, v] of pts) await click(gx(i) + u * 25 * FT8, gy(j) + v * 20 * FT8);
  }
await done();

await sheet(2);
await page.getByTestId('tb-select').click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-save').click()]);
await download.saveAs(out);
await browser.close();

// Fill in the takeoff data an estimator would enter: levels and grid references.
const pf = JSON.parse(readFileSync(out, 'utf8'));
pf.name = 'Example Takeoff – Riverside Warehouse';
const levelBySheet = { 'S1.01': 'Foundation', 'S1.02': 'Roof', 'S2.01': 'Roof', 'A1.01': 'Level 1', 'M1.01': 'Level 1', 'E1.01': 'Level 1' };
const sheetNo = Object.fromEntries(pf.doc.sheets.map((s) => [s.id, s.number]));
const letters = 'ABCDEFG';
for (const m of pf.doc.markups) {
  const lvl = levelBySheet[sheetNo[m.sheetId]];
  if (lvl) m.custom.level = lvl;
  if (sheetNo[m.sheetId] === 'S1.02' && m.type === 'length' && m.points.length === 2) {
    const [a, b] = m.points;
    const col = (x) => letters[Math.round((x - 260) / 225)];
    const row = (y) => Math.round((y - 300) / 180) + 1;
    m.custom.grid = Math.abs(a.y - b.y) < 1 ? `${row(a.y)} / ${col(a.x)}-${col(b.x)}` : `${col(a.x)} / ${row(a.y)}-${row(b.y)}`;
  }
}
writeFileSync(out, JSON.stringify(pf));
console.log('Wrote', out, `${pf.doc.markups.length} markups`);
