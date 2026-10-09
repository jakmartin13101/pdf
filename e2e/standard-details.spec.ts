import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

test('a standard detail adds material to every markup whose column matches the chosen value', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  // Two W24x55 beams, 23'-0" each.
  await page.getByTestId('chest-tool').filter({ hasText: 'W24x55' }).first().click();
  for (let i = 0; i < 2; i++) {
    await clickAt(page, gx(i) + 9, gy(1));
    await clickAt(page, gx(i + 1) - 9, gy(1));
  }
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(2);

  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('detail-name').fill('Beam end clips');
  // IF [Member Size] = W24x55 — both picked from drop-downs.
  await page.getByTestId('cond-column').selectOption({ label: 'Member Size' });
  await page.getByTestId('cond-value').selectOption('W24x55');
  await expect(page.getByTestId('detail-matches')).toHaveText('Matches 2 markups');
  // ADD Clip Angle L4x4x3/8 × 0'-11 1/2", 4 per beam
  await page.getByTestId('item-subject').fill('Clip Angle');
  await page.getByTestId('item-size').fill('L4x4x3/8');
  await page.getByTestId('item-length').fill(`0'-11 1/2"`);
  await page.getByTestId('item-rule').selectOption('each');
  await page.getByTestId('item-value').fill('4');
  // + shear studs @ 12" OC along the beam (with an end stud)
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(1).fill('Shear Stud');
  await page.getByTestId('item-size').nth(1).fill('3/4" x 5" stud');
  await page.getByTestId('item-rule').nth(1).selectOption('spacing');
  await page.getByTestId('item-value').nth(1).fill('12');
  await expect(page.getByTestId('detail-formula')).toHaveText(
    `IF [Member Size] = "W24x55" → ADD Clip Angle L4x4x3/8 × 0'-11 1/2" × 4 EA + Shear Stud 3/4" x 5" stud @ 1'-0" OC (+1)`,
  );
  const preview = page.getByTestId('detail-preview').locator('tbody tr');
  await expect(preview.nth(0).locator('td').nth(1)).toHaveText('8');
  await expect(preview.nth(1).locator('td').nth(1)).toHaveText('48'); // (23 + 1) × 2 beams
  await page.getByTestId('details-save').click();

  // Material rows follow each beam in the Markups List.
  await expect(rows).toHaveCount(6);
  await expect(rows.locator('[data-col=subject]')).toHaveText(['W24x55', '↳ Clip Angle', '↳ Shear Stud', 'W24x55', '↳ Clip Angle', '↳ Shear Stud']);
  await expect(rows.nth(1).locator('[data-col=count]')).toHaveText('4');
  await expect(rows.nth(1).locator('[data-col="c:member_size"]')).toHaveText('L4x4x3/8');
  await expect(page.getByTestId('list-count')).toContainText('2 markups + 4 detail items');

  // The summary totals the added material on its own line.
  await page.getByTestId('tab-summary').click();
  const clip = page.getByTestId('summary-row').filter({ hasText: 'Clip Angle – L4x4x3/8' });
  await expect(clip.locator('td').nth(1)).toHaveText('8 EA · 7.67 LF');

  // Material can be hidden from the list, summary and exports.
  await page.getByTestId('summary-toggle-details').uncheck();
  await expect(page.getByTestId('summary-row').filter({ hasText: 'Clip Angle' })).toHaveCount(0);
  await page.getByTestId('tab-markups').click();
  await expect(rows).toHaveCount(2);
});

test('the example takeoff ships with standard details', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page.getByTestId('markup-row').filter({ hasText: 'Dowel' })).toHaveCount(1);
  await page.getByTestId('btn-details').click();
  await expect(page.getByTestId('detail-entry')).toHaveCount(4);
  await page.getByTestId('detail-entry').filter({ hasText: 'Footing dowels' }).click();
  await expect(page.getByTestId('detail-preview')).toContainText('251');
});
