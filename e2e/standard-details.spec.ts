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
  await expect(rows.locator('[data-col=subject]')).toHaveText(['W', '↳ Clip Angle', '↳ Shear Stud', 'W', '↳ Clip Angle', '↳ Shear Stud']);
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

test('details are added by hand to several selected markups', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  // Two W24x55 beams and a W18x35.
  await page.getByTestId('chest-tool').filter({ hasText: 'W24x55' }).first().click();
  for (let i = 0; i < 2; i++) {
    await clickAt(page, gx(i) + 9, gy(1));
    await clickAt(page, gx(i + 1) - 9, gy(1));
  }
  await page.getByTestId('chest-tool').filter({ hasText: 'W18x35' }).first().click();
  await clickAt(page, gx(0) + 9, gy(2));
  await clickAt(page, gx(1) - 9, gy(2));
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(3);
  const subjects = () => rows.locator('[data-col=subject]');

  // Select the first W24x55 and the W18x35, right-click → Standard Details → New Detail for These 2.
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Control'] });
  await rows.nth(2).click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Standard Details (2 selected)' }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'New Detail for These 2…' }).click();
  // A by-hand detail: the rule is filled in but not used.
  await expect(page.getByTestId('detail-auto')).not.toBeChecked();
  await expect(page.getByTestId('detail-matches')).toHaveText('Rule not used + 2 added by hand');
  await expect(page.getByTestId('detail-selected')).toHaveText('2 markups selected – all have this detail');
  await page.getByTestId('detail-name').fill('Bearing plates');
  await page.getByTestId('item-subject').fill('Bearing Plate');
  await page.getByTestId('item-size').fill('PL1/2x8');
  await page.getByTestId('item-length').fill(`0'-10"`);
  await page.getByTestId('item-rule').selectOption('each');
  await page.getByTestId('item-value').fill('2');
  await expect(page.getByTestId('detail-formula')).toHaveText(`BY HAND → ADD Bearing Plate PL1/2x8 × 0'-10" × 2 EA`);
  await expect(page.getByTestId('detail-preview').locator('tbody tr td').nth(1)).toHaveText('4');
  await page.getByTestId('details-save').click();
  await expect(subjects()).toHaveText(['W', '↳ Bearing Plate', 'W', 'W', '↳ Bearing Plate']);

  // Add it to the other W24x55 from its right-click menu.
  await rows.nth(2).click();
  await rows.nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Standard Details', exact: true }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'Bearing plates' }).click();
  await expect(subjects()).toHaveText(['W', '↳ Bearing Plate', 'W', '↳ Bearing Plate', 'W', '↳ Bearing Plate']);

  // Properties of all three: ticked; untick takes it off every one of them. One undo puts it back.
  await page.keyboard.press('Control+a');
  await page.getByTestId('tab-properties').click();
  const check = page.getByTestId('prop-detail-check');
  await expect(check).toBeChecked();
  await check.uncheck();
  await expect(rows).toHaveCount(3);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(rows).toHaveCount(6);

  // Switch the rule on (Member Size = W24x55, filled in from the markups), then take one beam off by hand.
  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-auto').check();
  await expect(page.getByTestId('detail-matches')).toHaveText('Matches 2 markups + 1 added by hand');
  await expect(page.getByTestId('detail-formula')).toHaveText(`IF [Member Size] = "W24x55" → ADD Bearing Plate PL1/2x8 × 0'-10" × 2 EA`);
  await page.getByTestId('details-save').click();
  await rows.nth(0).click();
  await rows.nth(0).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Standard Details', exact: true }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'Bearing plates' }).click();
  await expect(subjects()).toHaveText(['W', 'W', '↳ Bearing Plate', 'W', '↳ Bearing Plate']);
  await expect(page.getByTestId('prop-details')).toContainText('Bearing plates');
  await expect(check).not.toBeChecked();
  // Back to Rules Only drops the by-hand change.
  await rows.nth(0).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Standard Details', exact: true }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'Back to Rules Only' }).click();
  await expect(rows).toHaveCount(6);
});

test('right-click → Add Detail opens a window to add existing details to the selected markups', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  const rows = page.getByTestId('markup-row');
  await page.getByTestId('list-search').fill('HSS8x4x1/4');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Control'] });
  await rows.nth(1).click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Add Detail to 2 Markups…' }).click();
  await expect(page.getByTestId('add-detail-item')).toHaveCount(4);
  await expect(page.getByTestId('add-detail-preview').locator('tbody tr')).toHaveText(['No material from standard details on the selection.']);
  // Tick the column base detail for both tubes: the preview shows what it adds (plate and anchor rods).
  const item = page.getByTestId('add-detail-item').filter({ hasText: 'HSS column base' });
  await item.locator('input').check();
  await expect(item).toContainText('will add');
  await expect(page.getByTestId('add-detail-preview').locator('tbody tr')).toHaveCount(2);
  await page.getByTestId('add-detail-apply').click();
  await expect(rows).toHaveCount(6); // each tube now has its two material rows
  await expect(rows.nth(1).locator('[data-col=type]')).toHaveText(/Standard Detail/);
  // Opening it again shows the detail on both; "New Detail for These 2…" goes to the editor.
  await rows.nth(0).click();
  await rows.nth(3).click({ modifiers: ['Control'] });
  await rows.nth(3).click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Add Detail to 2 Markups…' }).click();
  await expect(page.getByTestId('add-detail-item').filter({ hasText: 'HSS column base' })).toContainText('on all');
  await page.getByTestId('add-detail-new').click();
  await expect(page.getByTestId('detail-selected')).toHaveText('2 markups selected – all have this detail');
});
