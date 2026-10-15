import { expect, test } from '@playwright/test';
import { clickAt, gotoSheet, gx, gy, openSample } from './helpers';

test('finds the labelled beams and tubing on a plan and measures them at the drawing scale', async ({ page }) => {
  await openSample(page);
  await gotoSheet(page, 2); // S1.02 Roof Framing Plan – no scale set yet
  await page.getByTestId('tb-auto').click();
  await page.getByTestId('auto-find').click();

  await expect(page.getByTestId('auto-status')).toHaveText('50 members in 5 sizes');
  // The sheet has no scale: the one printed under the drawing title is used.
  await expect(page.getByTestId('auto-scale-note')).toContainText(`1/8" = 1'-0"`);
  const group = (size: string) => page.getByTestId('auto-group').filter({ has: page.locator(`.auto-size`, { hasText: new RegExp(`^${size}$`) }) });
  await expect(page.getByTestId('auto-group').locator('.auto-size')).toHaveText(['W24X55', 'W18X35', 'HSS8X4X1/4', 'HSS6X6X1/4', 'W30X90']);
  await expect(group('W24X55').getByTestId('auto-size-count')).toHaveText('24');
  await expect(group('W24X55').locator('.auto-len')).toHaveText('552.00 LF');
  await expect(group('W18X35').locator('.auto-len')).toHaveText('456.00 LF');
  await expect(group('HSS8X4X1/4').locator('.auto-len')).toHaveText('14.00 LF');
  // Every member is previewed on the drawing.
  await expect(page.getByTestId('auto-member')).toHaveCount(50);

  // Leave out a size, and one girder by clicking it on the drawing.
  await group('W30X90').getByTestId('auto-size-check').uncheck();
  await page.getByTestId('tb-fit-page').click();
  await clickAt(page, (gx(0) + gx(1)) / 2, gy(1));
  await expect(group('W24X55').getByTestId('auto-size-count')).toHaveText('23/24');
  await expect(page.locator('[data-testid=auto-member][data-included=no]')).toHaveCount(2);
  await expect(page.getByTestId('auto-total-count')).toHaveText('48');

  // Members list: lengths at the drawing scale, click to zoom.
  await group('HSS8X4X1/4').locator('.auto-group-head button').first().click();
  await expect(group('HSS8X4X1/4').getByTestId('auto-member-row')).toHaveText([`7'-0"`, `7'-0"`]);

  await page.getByTestId('auto-create').click();
  const rows = page.getByTestId('markup-row');
  const count = page.getByTestId('list-count');
  await expect(count).toHaveText('48 markups · 48 selected'); // the new measurements are selected
  await expect(page.getByTestId('auto-member')).toHaveCount(0);
  // Sizes go in as label and Member Size, the subject is their shape (W), using the Tool Chest tool for the size when there is one.
  await page.getByTestId('list-search').fill('W24X55');
  await expect(count).toContainText('Showing 23 of 48');
  await expect(rows.first().locator('[data-col=subject]')).toHaveText('W');
  await expect(rows.first().locator('[data-col=measurement]')).toHaveText(`23'-0"`);
  await expect(rows.first().locator('[data-col="c:member_size"]')).toHaveText('W24X55');
  await page.getByTestId('list-search').fill('HSS6X6X1/4');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('[data-col=measurement]')).toHaveText(`21'-0"`);
  await expect(rows.locator('[data-col="c:member_size"]')).toHaveText('HSS6X6X1/4');
  await page.getByTestId('list-search').fill('');

  // Running it again skips what is already taken off.
  await page.getByTestId('auto-find').click();
  await expect(page.getByTestId('auto-status')).toHaveText('50 members in 5 sizes · 48 already taken off');
  await expect(page.getByTestId('auto-total-count')).toHaveText('2');
  await page.getByTestId('auto-create').click();
  await expect(count).toContainText('50 markups');
  // One undo removes a run.
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(count).toContainText('48 markups');
});
