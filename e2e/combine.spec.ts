import { expect, test, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

const FT = 9; // page points per foot at 1/8" = 1'-0"

/** A size tool for this size, then a length measurement of each given length (feet). */
async function takeOff(page: Page, size: string, lengths: number[], row: number) {
  const tool = page.getByTestId('chest-tool').filter({ hasText: 'Combine Test' });
  await tool.getByTestId('size-box').fill(size);
  await tool.getByTestId('size-box').press('Enter');
  for (const [i, l] of lengths.entries()) {
    const y = gy(row) + i * 30;
    await clickAt(page, gx(0), y);
    await clickAt(page, gx(0) + l * FT, y);
  }
  await page.keyboard.press('Escape');
}

test('the combine report nests pieces on the stock lengths to order', async ({ page }, info) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  // Exact lengths: no snapping to the drawing or to other markups.
  await page.getByRole('button', { name: 'CONTENT', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP', exact: true }).click();
  await page.getByTestId('btn-shape-tool').click();
  await page.getByTestId('shape-size').fill('8x10');
  await page.getByTestId('shape-name').fill('Combine Test');
  await page.getByTestId('shape-tool-save').click();

  // Three W8X10 at 5'-0": all on one 20' bar.
  await takeOff(page, '8x10', [5, 5, 5], 0);
  // A W8X13 at 15'-0" and two at 18'-0": one 40' bar and one 20' bar.
  await takeOff(page, '8x13', [15, 18, 18], 2);
  await expect(page.getByTestId('markup-row')).toHaveCount(6);

  const openReport = async () => {
    await page.locator('.menu-btn', { hasText: 'Tools' }).click();
    await page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' }).click();
  };
  await openReport();
  const row = (size: string) => page.locator(`[data-testid=combine-row][data-size="${size}"]`);
  await expect(row('W8X10').getByTestId('combine-order')).toHaveText(`1 × 20'-0"`);
  await expect(row('W8X10')).toContainText(`3 · 3 × 5'-0"`);
  // W comes in 5' steps up to 60': 15' + 18' + 18' + 1' fit one 55' bar.
  await expect(row('W8X13').getByTestId('combine-order')).toHaveText(`1 × 55'-0"`);

  // Only 20' and 40' W (Settings → Combine): one 40' bar (18' + 18') and one 20' bar (15').
  await page.getByTestId('combine-stock').click();
  const w = page.locator('[data-testid=stock-shape][data-shape=W]');
  for (const l of [`25'-0"`, `30'-0"`, `35'-0"`, `45'-0"`, `50'-0"`, `55'-0"`, `60'-0"`])
    await w.getByTestId('stock-length').filter({ hasText: l }).getByTestId('stock-length-remove').click();
  await expect(w.getByTestId('stock-length')).toHaveText([`20'-0"`, `40'-0"`]);
  await page.getByTestId('stock-shape-input').fill('RB');
  await page.getByTestId('stock-shape-add').click();
  await expect(page.locator('[data-testid=stock-shape][data-shape=RB]')).toHaveCount(1);
  await page.getByTestId('settings-done').click();
  await openReport();
  await expect(row('W8X13').getByTestId('combine-order')).toHaveText(`1 × 40'-0" + 1 × 20'-0"`);
  await expect(row('W8X10').getByTestId('combine-order')).toHaveText(`1 × 20'-0"`);

  // The cutting plan of a size: each bar to scale.
  await row('W8X13').click();
  const bars = page.getByTestId('combine-bar');
  await expect(bars).toHaveCount(2);
  await expect(bars.first()).toContainText(`40'-0"`);
  await expect(bars.nth(1)).toContainText(`20'-0"`);
  const pieces = await page.getByTestId('combine-plan').locator('.cmb-piece').allTextContents();
  expect(pieces.sort()).toEqual([`15'-0"`, `18'-0"`, `18'-0"`]);

  // A bigger machine allowance: three 5' pieces + 6' no longer fit 20'.
  await page.getByTestId('combine-allowance').fill(`6'`);
  await page.getByTestId('combine-allowance').press('Enter');
  await expect(row('W8X10').getByTestId('combine-order')).toHaveText(`1 × 40'-0"`);
  await page.getByTestId('combine-allowance').fill(`1'-0"`);
  await page.getByTestId('combine-allowance').press('Enter');
  await expect(row('W8X10').getByTestId('combine-order')).toHaveText(`1 × 20'-0"`);

  // CSV export.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('combine-csv').click()]);
  const file = info.outputPath('combine.csv');
  await download.saveAs(file);
  const csv = (await import('node:fs')).readFileSync(file, 'utf8');
  expect(csv).toContain(`W,W8X13,3`);
  expect(csv).toContain('Cutting plan');
});
