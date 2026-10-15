import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, showProperties } from './helpers';

test('sizes, the selection totals, detail piece lengths with Galv, and the Properties panel', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'CONTENT', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  // Three 23'-0" W24X55 beams.
  await page.getByTestId('chest-tool').filter({ hasText: 'W24X55' }).first().click();
  for (let i = 0; i < 3; i++) {
    await clickAt(page, gx(i) + 9, gy(1));
    await clickAt(page, gx(i + 1) - 9, gy(1));
  }
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('[data-col="c:member_size"]')).toHaveText(['W24X55', 'W24X55', 'W24X55']);

  // Drawing a markup shows the Properties panel: the main fields only, the rest folded away.
  await expect(page.locator('[data-panel="properties"]')).toBeVisible();
  const main = page.getByTestId('prop-main');
  await expect(main.locator('.field > label')).toHaveText(['Subject', 'Label', 'Length', 'Height', 'Finish']);
  await expect(page.getByTestId('prop-measurement')).toHaveText(`23'-0"`);
  await expect(page.getByTestId('prop-sec-style')).not.toHaveClass(/open/);
  await expect(page.getByTestId('prop-sec-properties')).not.toHaveClass(/open/);

  // Sizes: "*" is an X (a capital one), and a space after the shape stays.
  await rows.first().locator('[data-col="c:member_size"]').dblclick();
  await page.locator('.cell-edit').fill('w 8*10');
  await page.keyboard.press('Enter');
  await expect(rows.first().locator('[data-col="c:member_size"]')).toHaveText('W 8X10');
  await rows.nth(1).click();
  await page.getByTestId('prop-label').fill('hss6*6*3/8');
  await page.getByTestId('prop-label').press('Enter');
  await expect(page.getByTestId('prop-label')).toHaveValue('HSS6X6X3/8');

  // Properties: every other column; fields can be left out of the list and keep their values.
  await showProperties(page, 'properties');
  const field = (key: string) => page.locator(`[data-testid=prop-field][data-key="${key}"]`);
  await expect(field('c:grade')).toBeVisible();
  await page.getByTestId('prop-fields').click();
  await page.getByTestId('prop-field-pick').filter({ hasText: 'Grade' }).locator('input').uncheck();
  await page.getByTestId('prop-fields-done').click();
  await expect(field('c:grade')).toHaveCount(0);
  await expect(field('c:piece_mark')).toBeVisible();
  // Shown again, it still has its value.
  await page.getByTestId('prop-fields').click();
  await page.getByTestId('prop-field-pick').filter({ hasText: 'Grade' }).locator('input').check();
  await page.getByTestId('prop-fields-done').click();
  await expect(field('c:grade').locator('input')).toHaveValue('A992');

  // Select all three: the totals by the selection.
  await page.keyboard.press('Control+a');
  const totals = page.getByTestId('selection-totals');
  await expect(totals).toContainText('3 selected');
  await expect(totals).toContainText(`Length 69'-0"`);
  await expect(page.getByTestId('prop-measurement')).toContainText('69.00 LF');

  // A detail: clip angles × 4 (galvanized), studs @ 2'-0" OC, a top angle full length.
  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('detail-name').fill('Beam material');
  await page.getByTestId('cond-column').selectOption({ label: 'Subject' });
  await page.getByTestId('cond-value').selectOption('W');
  await page.getByTestId('item-subject').fill('L');
  await page.getByTestId('item-size').fill('l4*4*3/8');
  await page.getByTestId('item-size').blur();
  await expect(page.getByTestId('item-size')).toHaveValue('L4X4X3/8');
  await page.getByTestId('item-length').fill(`0'-11 1/2"`);
  await page.getByTestId('item-rule').selectOption('each');
  await page.getByTestId('item-value').fill('4');
  await page.getByTestId('item-galv').check();
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(1).fill('L');
  await page.getByTestId('item-size').nth(1).fill('L3X3X1/4');
  await page.getByTestId('item-rule').nth(1).selectOption('full');
  await page.getByTestId('item-value').nth(1).fill('1');
  await expect(page.getByTestId('detail-formula')).toContainText('L4X4X3/8 × 0\'-11 1/2" × 4 EA GALV');
  await page.getByTestId('details-save').click();

  // Material rows: the length of each piece for counted material, the run for full length; Galvanize.
  const first = rows.filter({ has: page.locator('[data-col="c:member_size"]', { hasText: 'L4X4X3/8' }) }).first();
  await expect(first.locator('[data-col=count]')).toHaveText('4');
  await expect(first.locator('[data-col=length]')).toHaveText(`0'-11 1/2"`);
  await expect(first.locator('[data-col="c:finish"]')).toHaveText('Galvanize');
  const run = rows.filter({ has: page.locator('[data-col="c:member_size"]', { hasText: 'L3X3X1/4' }) }).first();
  await expect(run.locator('[data-col=length]')).toHaveText(`23'-0"`);
  await expect(run.locator('[data-col="c:finish"]')).not.toHaveText('Galvanize');
});
