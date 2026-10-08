import { expect, test, type Page } from '@playwright/test';

const SHEET_W = 2592; // sample sheets are ARCH D (36" x 24") = 2592 x 1728 pt
const gx = (i: number) => 260 + i * 225; // grid lines in page points (25'-0" bays at 1/8")
const gy = (j: number) => 300 + j * 180; // 20'-0" bays

async function toScreen(page: Page, x: number, y: number) {
  const b = (await page.locator('.page').boundingBox())!;
  const k = b.width / SHEET_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function clickAt(page: Page, x: number, y: number, opts: { button?: 'left' | 'right' } = {}) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, opts);
}

async function dragFrom(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

async function openSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-sample').click();
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(7);
}

async function gotoSheet(page: Page, index: number) {
  await page.getByTestId('sheet-thumb').nth(index).click();
  await page.waitForTimeout(300);
}

async function calibrateFoundationPlan(page: Page, applyTo = 'all') {
  await gotoSheet(page, 1);
  await page.getByTestId('tb-calibrate').click();
  // the 20'-0" dimension string left of grid line 1-2
  await clickAt(page, 125, 300);
  await clickAt(page, 125, 480);
  await page.getByTestId('calibrate-input').fill(`20'-0"`);
  await page.getByTestId('apply-to').selectOption(applyTo);
  await expect(page.getByTestId('calibrate-result')).toContainText(`1/8" = 1'-0"`);
  await page.getByTestId('calibrate-ok').click();
}

test('reads sheet numbers and titles from title blocks', async ({ page }) => {
  await openSample(page);
  const thumbs = page.getByTestId('sheet-thumb');
  await expect(thumbs.nth(0)).toContainText('G0.01');
  await expect(thumbs.nth(1)).toContainText('S1.01');
  await expect(thumbs.nth(1)).toContainText('Foundation Plan');
  await expect(thumbs.nth(3)).toContainText('Structural Sections and Details');
});

test('calibrates from a known dimension and measures length and area', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page, 'sheet');
  await expect(page.getByTestId('scale-chip')).toContainText(`1/8" = 1'-0"`);

  await page.getByTestId('tb-length').click();
  await clickAt(page, gx(0), gy(0));
  await clickAt(page, gx(1), gy(0));

  await page.getByTestId('tb-area').click();
  for (const [i, j] of [[0, 0], [6, 0], [6, 5], [0, 5]]) await clickAt(page, gx(i), gy(j));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('[data-col=measurement]')).toHaveText(`25'-0"`);
  await expect(rows.nth(1).locator('[data-col=measurement]')).toHaveText('15,000.00 sf');
  await expect(page.getByTestId('total-area')).toHaveText('15,000.00 SF');
});

test('tool chest tools carry subject and data; formula column computes weight', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await page.getByTestId('chest-tool').filter({ hasText: 'W18x35' }).first().click();
  for (let i = 0; i < 2; i++) {
    await clickAt(page, gx(i) + 9, gy(0));
    await clickAt(page, gx(i + 1) - 9, gy(0));
  }
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('[data-col=subject]')).toHaveText('W18x35');
  await expect(rows.first().locator('[data-col="c:member_size"]')).toHaveText('W18x35');
  // 23'-0" x 35 plf = 805 lbs each
  await expect(rows.first().locator('[data-col="c:weight"]')).toHaveText('805 lbs');
  await expect(page.getByTestId('total-c:weight')).toHaveText('1,610 lbs');
});

test('count tool accumulates clicks into one count markup', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await page.getByTestId('chest-tool').filter({ hasText: 'HSS6x6x3/8 Column' }).click();
  for (let i = 0; i < 4; i++) await clickAt(page, gx(i), gy(2));
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('[data-col=count]')).toHaveText('4');
});

test('viewport scale overrides the sheet scale inside a detail', async ({ page }) => {
  await openSample(page);
  await gotoSheet(page, 3);
  await page.getByTestId('scale-chip').click();
  await page.getByTestId('scale-preset').selectOption(`1/4" = 1'-0"`);
  await page.getByTestId('scale-ok').click();
  await page.getByTestId('tb-viewport').click();
  await dragFrom(page, [1180, 290], [1700, 760]);
  await page.getByTestId('viewport-name').fill('Base Plate');
  await page.getByTestId('scale-preset').selectOption(`1 1/2" = 1'-0"`);
  await page.getByTestId('viewport-ok').click();

  await page.getByTestId('tb-length').click();
  await clickAt(page, 140 + 50 * 18 + 70, 760 - 24 * 18);
  await clickAt(page, 140 + 50 * 18 + 70, 760);
  const pl = (14 / 12) * 108;
  await clickAt(page, 1400 - pl / 2, 480 - pl / 2 - 40);
  await clickAt(page, 1400 + pl / 2, 480 - pl / 2 - 40);
  await page.keyboard.press('Escape');
  const m = page.getByTestId('markup-row').locator('[data-col=measurement]');
  await expect(m).toHaveText([`24'-0"`, `1'-2"`]);
});

test('markups list and drawing stay in sync; cells are editable', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await page.getByTestId('tb-length').click();
  await clickAt(page, gx(0), gy(0));
  await clickAt(page, gx(1), gy(0));
  await clickAt(page, gx(0), gy(1));
  await clickAt(page, gx(1), gy(1));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sel-box')).toHaveCount(0);

  // list -> drawing
  const rows = page.getByTestId('markup-row');
  await rows.nth(0).click();
  await expect(page.locator('.sel-box')).toHaveCount(1);
  await expect(rows.nth(0)).toHaveClass(/sel/);

  // drawing -> list
  await page.getByTestId('tb-select').click();
  await page.keyboard.press('Control+0');
  await clickAt(page, gx(0) + 100, gy(1));
  await expect(rows.nth(1)).toHaveClass(/sel/);

  // edit a custom column inline
  const notes = rows.nth(1).locator('[data-col="c:notes"]');
  await notes.dblclick();
  await page.keyboard.type('Grid A-B');
  await page.keyboard.press('Enter');
  await expect(notes).toHaveText('Grid A-B');

  // undo restores
  await page.keyboard.press('Control+z');
  await expect(notes).toHaveText('');
});

test('project survives a reload (autosave) and exports a flattened PDF', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await page.getByTestId('tb-length').click();
  await clickAt(page, gx(0), gy(0));
  await clickAt(page, gx(2), gy(0));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-row')).toHaveCount(1);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByTestId('markup-row')).toHaveCount(1);
  await expect(page.getByTestId('markup-row').locator('[data-col=measurement]')).toHaveText(`50'-0"`);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-export').click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});
