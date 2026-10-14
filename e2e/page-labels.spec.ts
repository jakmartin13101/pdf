import { expect, test } from '@playwright/test';
import { clickAt, dragFrom, openSample } from './helpers';

const menu = async (page: import('@playwright/test').Page, top: string, item: string) => {
  await page.locator('.menu-btn', { hasText: new RegExp(`^${top}$`) }).click();
  await page.locator('.dropdown .menu-item', { hasText: item }).first().click();
};

test('page labels are read from a box drawn on one page, on all or the ticked pages', async ({ page }) => {
  await openSample(page);
  // Start from plain numbers.
  await menu(page, 'Document', 'Page Labels…');
  await page.locator('input[title=Prefix]').fill('X-');
  await page.getByTestId('labels-number').click();
  await page.getByTestId('labels-apply').click();
  await expect(page.locator('.thumb-num').first()).toHaveText('X-1');

  // Right-click the page → Page Labels from a Box, then box the title and number in the title block.
  await clickAt(page, 1200, 900, { button: 'right' });
  await page.locator('.menu-item', { hasText: 'Page Labels from a Box…' }).click();
  await dragFrom(page, [2330, 1290], [2552, 1632]);
  await expect(page.getByTestId('labels-role')).toHaveValue('both');
  await expect(page.getByTestId('labels-msg')).toContainText('Read the box on 7 of 7 pages');
  const numbers = page.getByTestId('label-number');
  const values = () => numbers.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await expect.poll(values).toEqual(['G0.01', 'S1.01', 'S1.02', 'S2.01', 'A1.01', 'M1.01', 'E1.01']);
  await expect(page.getByTestId('label-title').nth(2)).toHaveValue('Roof Framing Plan');
  await expect(page.getByTestId('label-box-text').nth(2)).toContainText('S1.02');

  // Only the ticked pages: back to X- numbers, tick two pages, read just the number.
  await page.getByTestId('labels-pick-none').click();
  await page.locator('input[title=Prefix]').fill('X-');
  await page.getByTestId('labels-pick-all').click();
  await page.getByTestId('labels-number').click();
  await page.getByTestId('labels-pick-none').click();
  await page.getByTestId('label-pick').nth(1).check();
  await page.getByTestId('label-pick').nth(4).check();
  await expect(page.getByTestId('labels-picked')).toHaveText('2 of 7 ticked');
  await page.getByTestId('labels-role').selectOption('number');
  await page.getByTestId('labels-read').click();
  await expect.poll(values).toEqual(['X-1', 'S1.01', 'X-3', 'X-4', 'A1.01', 'X-6', 'X-7']);
  await page.getByTestId('labels-apply').click();
  await expect(page.locator('.thumb-num')).toHaveText(['X-1', 'S1.01', 'X-3', 'X-4', 'A1.01', 'X-6', 'X-7']);
});

test('flattening draws markups into the drawing; undo brings them back', async ({ page }) => {
  await openSample(page);
  // A text box with a note on the cover sheet.
  await page.keyboard.press('t');
  await dragFrom(page, [1500, 1000], [1900, 1060]);
  await page.locator('.text-editor').waitFor();
  await page.keyboard.type('FLATTENED NOTE');
  await page.mouse.click(5, 500);
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);

  await rows.first().click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Flatten…' }).click();
  await expect(page.getByTestId('flatten-ok')).toHaveText('Flatten 1 Markup');
  await page.getByTestId('flatten-ok').click();
  await expect(rows).toHaveCount(0);
  // The flattened file is a new version of the same document: it keeps its tab.
  await expect(page.getByTestId('doc-tab')).toHaveText(['Sample-Structural-Set']);

  // The note is now text in the PDF itself: the page-label box reads it.
  await clickAt(page, 1200, 300, { button: 'right' });
  await page.locator('.menu-item', { hasText: 'Page Labels from a Box…' }).click();
  await dragFrom(page, [1490, 990], [1910, 1070]);
  await expect(page.getByTestId('label-box-text').first()).toContainText('FLATTENED NOTE');
  await page.keyboard.press('Escape');

  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('doc-tab')).toHaveText(['Sample-Structural-Set']);
  // Keep them as takeoff data instead: moved to a hidden "Flattened" layer.
  await rows.first().click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Flatten…' }).click();
  await page.getByTestId('flatten-keep').check();
  await page.getByTestId('flatten-ok').click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('.mk-text')).toHaveCount(0); // not drawn twice
});
