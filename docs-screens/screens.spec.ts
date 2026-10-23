// The README screenshots: each test sets up one scene and writes docs/<name>.png.
// Run with `npm run docs:screenshots` (playwright.docs.config.ts); the normal e2e run leaves this folder out.
import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, toScreen } from '../e2e/helpers';

const FT = 9; // page points per foot at 1/8" = 1'-0"
const out = (name: string) => `docs/${name}.png`;

/** The Pro license of the e2e tests, plus the dark theme. */
function darkState() {
  const pro = JSON.parse(fs.readFileSync('e2e/fixtures/pro-license.state.json', 'utf8')) as {
    cookies: unknown[];
    origins: { origin: string; localStorage: { name: string; value: string }[] }[];
  };
  return {
    ...pro,
    origins: pro.origins.map((o) => ({ ...o, localStorage: [...o.localStorage, { name: 'ts.ui', value: JSON.stringify({ theme: 'dark' }) }] })),
  };
}

/** Wait for the drawing and the sheet thumbnails in view to finish rendering; no error messages. */
async function settle(page: Page, ms = 1200) {
  await expect(page.locator('.page-loading')).toHaveCount(0, { timeout: 30_000 });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid=sheet-thumb]')].every((t) => {
          let box = t.parentElement;
          while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
          const r = t.getBoundingClientRect();
          const c = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
          const inView = r.width > 0 && r.bottom > c.top + 4 && r.top < c.bottom - 4;
          return !inView || !!t.querySelector('img.thumb-img') || !t.querySelector('.thumb-img');
        }),
      null,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(ms);
  await expect(page.locator('.toast.error')).toHaveCount(0);
}

/** Let the information messages go away. */
async function noToasts(page: Page) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
}

/** Mouse out of the way (no hover tips). */
async function park(page: Page) {
  await page.mouse.move(1595, 500);
}

async function openExample(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page.getByTestId('markup-row').first()).toBeVisible();
  await expect(page.getByTestId('sheet-thumb').first()).toBeVisible();
}

/** Sample set, exact lengths (no snapping), scale set on every sheet, on S1.02 Roof Framing Plan. */
async function sampleRoof(page: Page) {
  await openSample(page);
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
}

/** Zoom the drawing by a factor (mouse wheel) about a point of the sheet. */
async function zoomAt(page: Page, x: number, y: number, factor: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  let left = Math.log(factor) / 0.0018; // wheel zoom: exp(-deltaY * 0.0018)
  while (Math.abs(left) > 1) {
    const d = Math.sign(left) * Math.min(Math.abs(left), 200);
    await page.mouse.wheel(0, -d);
    left -= d;
    await page.waitForTimeout(30);
  }
}

/** Drag the top edge of the bottom dock (positive dy: lower). */
async function resizeBottomDock(page: Page, dy: number) {
  const bar = (await page.locator('[data-testid=dock-bottom] > .splitter-h').boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

async function dragBy(page: Page, el: Locator, dx: number, dy: number, at?: { x: number; y: number }) {
  const b = (await el.boundingBox())!;
  const p = at ?? { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 10 });
  await page.mouse.up();
}

async function openSettings(page: Page, tab: string) {
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId(`set-tab-${tab}`).click();
  await expect(page.getByTestId(`set-page-${tab}`)).toBeVisible();
}

/** File → Open PDF…: a second document. */
async function openPdf(page: Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.menu-btn', { hasText: 'File' }).click().then(() => page.locator('.dropdown .menu-item', { hasText: 'Open PDF…' }).click()),
  ]);
  await chooser.setFiles(file);
}

/** Auto takeoff of the roof framing plan, members found (nothing created yet). */
async function autoFind(page: Page) {
  await openSample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('tb-auto').click();
  await page.getByTestId('auto-find').click();
  await expect(page.getByTestId('auto-status')).toHaveText('50 members in 5 sizes');
}

const group = (page: Page, size: string) =>
  page.getByTestId('auto-group').filter({ has: page.locator('.auto-size', { hasText: new RegExp(`^${size.replace(/[/]/g, '\\/')}$`) }) });

// ---------------------------------------------------------------------------------------------------
// Dark theme scenes

test.describe('dark theme', () => {
  test.use({ storageState: darkState() });

  test('screenshot-takeoff', async ({ page }) => {
    await openExample(page);
    await gotoSheet(page, 2);
    await page.getByTestId('tb-fit-page').click();
    // A W24X55 beam on grid line 2, D-E: picked on the drawing, its Properties showing.
    await clickAt(page, (gx(3) + gx(4)) / 2, gy(1));
    await expect(page.locator('[data-testid=markup-row].sel')).toHaveCount(1);
    await expect(page.locator('[data-testid=markup-row].sel [data-col="c:member_size"]')).toHaveText('W24X55');
    await expect(page.locator('[data-panel="properties"]')).toBeVisible();
    await park(page);
    await noToasts(page);
    await settle(page);
    await page.screenshot({ path: out('screenshot-takeoff') });
  });

  test('screenshot-summary', async ({ page }) => {
    await openExample(page);
    await gotoSheet(page, 2);
    await page.getByTestId('tab-summary').click();
    await expect(page.getByTestId('summary-row').first()).toBeVisible();
    await resizeBottomDock(page, -260);
    await park(page);
    await noToasts(page);
    await settle(page);
    await page.screenshot({ path: out('screenshot-summary') });
  });

  test('screenshot-detail-rows', async ({ page }) => {
    await openExample(page);
    await gotoSheet(page, 2);
    await page.getByTestId('tb-fit-page').click();
    await resizeBottomDock(page, -220);
    // A W24X55 beam with its clip angles (added by the W24 beam end connections detail).
    await clickAt(page, (gx(2) + gx(3)) / 2, gy(1));
    await expect(page.locator('[data-testid=markup-row].sel')).toHaveCount(1);
    await expect(page.getByTestId('markup-row').filter({ hasText: 'Clip Angle' }).first()).toBeVisible();
    await park(page);
    await noToasts(page);
    await settle(page);
    await page.screenshot({ path: out('screenshot-detail-rows') });
  });
});

// ---------------------------------------------------------------------------------------------------
// Full window

test('screenshot-split', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('split-vertical').click();
  await expect(page.getByTestId('pane')).toHaveCount(2);
  await page.getByTestId('pane-sheet').nth(1).selectOption({ label: 'S2.01 – Structural Sections and Details' });
  await expect(page.getByTestId('pane').nth(1).locator('canvas').first()).toBeVisible();
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-split') });
});

test('screenshot-detached-pane', async ({ page }) => {
  // Without pop-ups the detached pane floats inside the program window.
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await openExample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('split-vertical').click();
  await expect(page.getByTestId('pane')).toHaveCount(2);
  await page.getByTestId('pane-sheet').nth(1).selectOption({ label: 'S2.01 – Structural Sections and Details' });
  await page.getByTestId('pane-detach').nth(1).click();
  const float = page.getByTestId('pane-float');
  await expect(float).toBeVisible();
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-detached-pane') });
});

test('screenshot-properties', async ({ page }) => {
  await sampleRoof(page);
  // Three 23'-0" W24X55 beams.
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  for (let i = 0; i < 3; i++) {
    await clickAt(page, gx(i) + 9, gy(1));
    await clickAt(page, gx(i + 1) - 9, gy(1));
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-row')).toHaveCount(3);
  await zoomAt(page, gx(2), gy(1) + 90, 2.2);
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('selection-totals')).toContainText('3 selected');
  await expect(page.getByTestId('selection-totals')).toContainText(`Length 69'-0"`);
  await expect(page.getByTestId('prop-measurement')).toContainText('69.00 LF');
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-properties') });
});

test('screenshot-max-length-split', async ({ page }) => {
  await sampleRoof(page);
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Length Measurements…' }).click();
  const w = page.locator('[data-testid=max-row][data-shape="W"]').getByTestId('max-input');
  await w.fill('40');
  await w.press('Enter');
  await expect(w).toHaveValue(`40'-0"`);
  await page.getByTestId('settings-done').click();
  await noToasts(page);
  await zoomAt(page, gx(1) + 60, gy(1) + 60, 2.9);
  await settle(page, 600);

  // One 63'-0" W24X55 line: two markups, 40'-0" and 23'-0".
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0), gy(1));
  await clickAt(page, gx(0) + 63 * FT, gy(1));
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows.locator('[data-col=length]')).toHaveText([`40'-0"`, `23'-0"`]);
  // Hover the first piece.
  const p = await toScreen(page, gx(0) + 20 * FT, gy(1));
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: out('screenshot-max-length-split') });
});

test('screenshot-detail-marks', async ({ page }) => {
  await sampleRoof(page);
  // A W24X55 along grid line 2 (A-B) and one down grid line C (1-2).
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await clickAt(page, gx(2), gy(0) + 9);
  await clickAt(page, gx(2), gy(1) - 9);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-row')).toHaveCount(2);

  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('detail-name').fill('Beam material');
  await page.getByTestId('cond-column').selectOption({ label: 'Member Size' });
  await page.getByTestId('cond-value').selectOption('W24X55');
  await page.getByTestId('item-subject').fill('L');
  await page.getByTestId('item-size').fill('L4X4X3/8');
  await page.getByTestId('item-length').fill(`0'-11 1/2"`);
  await page.getByTestId('item-rule').selectOption('each');
  await page.getByTestId('item-value').fill('4');
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(1).fill('L');
  await page.getByTestId('item-size').nth(1).fill('L3X3X1/4');
  await page.getByTestId('item-rule').nth(1).selectOption('full');
  await page.getByTestId('item-value').nth(1).fill('1');
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(2).fill('Shear Stud');
  await page.getByTestId('item-size').nth(2).fill('3/4" stud');
  await page.getByTestId('item-rule').nth(2).selectOption('spacing');
  await page.getByTestId('item-value').nth(2).fill('24');
  await page.getByTestId('details-save').click();
  await expect(page.getByTestId('detail-mark')).toHaveCount(6);

  await noToasts(page);
  await zoomAt(page, gx(1) + 40, gy(1) + 40, 3.2);
  await settle(page, 600);
  // Hover the count mark of the first beam: what it is.
  const count = page.getByTestId('detail-mark').filter({ hasText: '4 × L4X4X3/8' }).first().locator('.mk-count');
  const box = (await count.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.hover-tip')).toContainText('Beam material');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('screenshot-detail-marks') });
});

test('screenshot-auto-takeoff', async ({ page }) => {
  await autoFind(page);
  await group(page, 'HSS8X4X1/4').locator('.auto-group-head button').first().click();
  await expect(group(page, 'HSS8X4X1/4').getByTestId('auto-member-row')).toHaveCount(2);
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-auto-takeoff') });
});

test('screenshot-auto-adjust', async ({ page }) => {
  await autoFind(page);
  const w24 = group(page, 'W24X55');
  await w24.locator('.auto-group-head button').first().click();
  await w24.getByTestId('auto-member-zoom').first().click();
  await expect(page.getByTestId('auto-adjust-start-minus')).toBeVisible();
  await settle(page, 800);
  // Drag its left end a little along the member; it snaps to the drawing.
  const handle = page.locator('[data-testid=auto-member][data-focused=yes] [data-testid=auto-handle-p1]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.move(hb.x + hb.width / 2 + 2, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-auto-adjust') });
});

test('screenshot-overlay', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('tb-compare').click();
  await page.getByTestId('compare-enabled').check();
  await expect(page.getByTestId('overlay-b')).toHaveCount(1);
  await expect(page.getByTestId('compare-status')).toContainText('text matches', { timeout: 30_000 });
  await page.getByTestId('compare-find').click();
  await expect(page.getByTestId('change-box').first()).toBeVisible({ timeout: 30_000 });
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-overlay') });
});

test('screenshot-doc-tabs', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  await openPdf(page, 'public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(page.getByTestId('doc-tab')).toHaveCount(2);
  // The addendum in a pane of its own.
  await page.getByTestId('doc-tab').nth(1).click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Move to New Pane' }).click();
  await expect(page.getByTestId('pane')).toHaveCount(2);
  await page.getByTestId('pane').nth(0).getByTestId('doc-tab').first().click();
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-doc-tabs'), clip: { x: 0, y: 0, width: 1600, height: 620 } });
});

test('screenshot-dock-sections', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  const left = page.locator('.side-panel.left');
  // The Tool Library tab dragged onto the lower part of the Sheets panel: a section of its own.
  const tab = page.getByTestId('tab-tool-library');
  const t = (await tab.boundingBox())!;
  const sheets = (await left.getByTestId('dock-section').first().boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(sheets.x + sheets.width / 2, sheets.y + sheets.height * 0.9, { steps: 12 });
  await expect(page.getByTestId('drop-section')).toHaveText('New section below');
  await page.mouse.up();
  await expect(left.getByTestId('dock-section')).toHaveCount(2);
  // The Takeoff Summary beside the Takeoff List.
  // (The first click after a drag only ends the drag.)
  await page.getByTestId('tab-summary').click();
  const shown = await page.getByTestId('dock-menu-summary').waitFor({ timeout: 1500 }).then(() => true, () => false);
  if (!shown) await page.getByTestId('tab-summary').click();
  await page.getByTestId('dock-menu-summary').click();
  await page.getByText('Split Right (New Section)', { exact: true }).click();
  await expect(page.getByTestId('dock-bottom').getByTestId('dock-section')).toHaveCount(2);
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-dock-sections') });
});

test('screenshot-movable-window', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('btn-details').click();
  const win = page.getByTestId('modal');
  await expect(win).toBeVisible();
  const head = win.locator('.modal-head');
  const hb = (await head.boundingBox())!;
  await dragBy(page, head, 330, 40, { x: hb.x + 200, y: hb.y + hb.height / 2 });
  await park(page);
  await noToasts(page);
  await settle(page);
  await page.screenshot({ path: out('screenshot-movable-window') });
});

test('screenshot-list-style', async ({ page }) => {
  await openExample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('tb-fit-page').click();
  const header = (id: string) => page.locator(`[data-testid=list-header][data-col=${id}]`);
  await header('length').locator('.th-name').dblclick();
  await page.getByTestId('list-header-rename').fill('LF');
  await page.getByTestId('list-header-rename').press('Enter');
  await expect(header('length')).toContainText('LF');
  await clickAt(page, (gx(3) + gx(4)) / 2, gy(1));
  await expect(page.locator('[data-testid=markup-row].sel')).toHaveCount(1);
  await noToasts(page);
  await settle(page, 600);
  await page.getByTestId('btn-list-style').click();
  await expect(page.locator('.context-menu').getByRole('menuitem', { name: 'Save as Default Style' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('screenshot-list-style'), clip: { x: 0, y: 660, width: 1600, height: 340 } });
});

// ---------------------------------------------------------------------------------------------------
// Panels and windows

test('screenshot-measurements', async ({ page }) => {
  await sampleRoof(page);
  const meas = page.locator('[data-panel="measurements"]');
  await meas.getByTestId('meas-tool-count').click();
  for (const i of [0, 1, 2]) await clickAt(page, gx(i) + 20, gy(2) + 20);
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  const props = meas.getByTestId('meas-props');
  await props.getByTestId('meas-label').fill('pl 1/2*7');
  await props.getByTestId('meas-label').press('Enter');
  await props.getByTestId('meas-height').fill('0-14');
  await props.getByTestId('meas-height').press('Enter');
  await props.getByTestId('meas-width').fill('7');
  await props.getByTestId('meas-width').press('Enter');
  await expect(props.getByTestId('meas-result-length')).toHaveText(`3'-6"`);
  // Page Scale folded away, so the count's properties and results show.
  const scale = meas.getByTestId('prop-sec-meas-scale');
  if (await scale.evaluate((el) => el.classList.contains('open'))) await meas.getByTestId('prop-sec-head-meas-scale').click();
  await park(page);
  await noToasts(page);
  await settle(page, 600);
  await page.locator('.side-panel.right').screenshot({ path: out('screenshot-measurements') });
});

test('screenshot-size-tool', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('btn-shape-tool').click();
  const win = page.getByTestId('modal');
  await expect(win).toBeVisible();
  await page.getByTestId('shape-size').fill('W21X44');
  await noToasts(page);
  await win.screenshot({ path: out('screenshot-size-tool') });
});

// ---------------------------------------------------------------------------------------------------
// Settings pages (the example takeoff open)

for (const [name, tab] of [
  ['screenshot-max-length', 'lengths'],
  ['screenshot-keyboard', 'keys'],
  ['screenshot-subjects', 'subjects'],
  ['screenshot-combine-stock', 'combine'],
  ['screenshot-detail-styles', 'details'],
  ['screenshot-list-default', 'list'],
] as const) {
  test(name, async ({ page }) => {
    await openExample(page);
    await noToasts(page);
    await openSettings(page, tab);
    await park(page);
    await page.waitForTimeout(300);
    await page.getByTestId('modal').screenshot({ path: out(name) });
  });
}

test('screenshot-settings', async ({ page }) => {
  // Auto takeoff line styles, after an automatic takeoff (the button applies them to its measurements).
  await autoFind(page);
  await page.getByTestId('auto-create').click();
  await expect(page.getByTestId('list-count')).toContainText('50 markups');
  await noToasts(page);
  await openSettings(page, 'auto');
  await park(page);
  await page.waitForTimeout(300);
  await page.getByTestId('modal').screenshot({ path: out('screenshot-settings') });
});
