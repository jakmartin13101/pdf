import { expect, test, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

async function units(page: Page, unit: string, shot?: string) {
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Units & Totals…' }).click();
  if (shot) await page.getByTestId('modal').screenshot({ path: shot });
  await page.getByTestId('set-user-unit').selectOption(unit);
  await page.getByTestId('settings-done').click();
}

test('lengths in your units: Height is a length, typed lengths are rewritten (0-28 → 2\'-4")', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'CONTENT', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  // A 23'-0" W24X55.
  await page.getByTestId('chest-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await page.keyboard.press('Escape');
  const row = page.getByTestId('markup-row').first();
  await expect(row.locator('[data-col=length]')).toHaveText(`23'-0"`);

  // Height: 0-28 is 2'-4", in the Properties panel and the list.
  const height = page.getByTestId('prop-col-height');
  await height.fill('0-28');
  await height.press('Enter');
  await expect(height).toHaveValue(`2'-4"`);
  await expect(row.locator('[data-col="c:height"]')).toHaveText(`2'-4"`);
  await page.screenshot({ path: 'test-results/units-height.png' });
  // In the list too: 1-1 is 1'-1".
  await row.locator('[data-col="c:height"]').dblclick();
  await page.locator('.cell-edit').fill('1-1');
  await page.keyboard.press('Enter');
  await expect(row.locator('[data-col="c:height"]')).toHaveText(`1'-1"`);
  // Not a length: refused, the height stays.
  await height.fill('tall');
  await height.press('Enter');
  await expect(page.locator('.toast').last()).toContainText('not a length');
  await expect(row.locator('[data-col="c:height"]')).toHaveText(`1'-1"`);

  // Settings → Units & Totals: measure in inches. Measurements and heights follow.
  await units(page, 'in', 'test-results/units-settings.png');
  await expect(row.locator('[data-col=length]')).toHaveText(`276.00"`);
  await expect(row.locator('[data-col="c:height"]')).toHaveText(`13.00"`);
  await expect(height).toHaveValue(`13.00"`);
  // Bare numbers are inches now.
  await height.fill('28');
  await height.press('Enter');
  await expect(height).toHaveValue(`28.00"`);
  await expect(page.locator('.markups g.mk-length .mk-label').first()).toContainText(`276.00"`);

  // Metric.
  await units(page, 'mm');
  await expect(row.locator('[data-col=length]')).toHaveText('7,010 mm');
  await expect(row.locator('[data-col="c:height"]')).toHaveText('711 mm');

  // Back to feet-inches: 28" is 2'-4".
  await units(page, 'ft-in');
  await expect(row.locator('[data-col=length]')).toHaveText(`23'-0"`);
  await expect(row.locator('[data-col="c:height"]')).toHaveText(`2'-4"`);

  // Standard detail lengths are rewritten as they're typed: 0-11.5 → 0'-11 1/2", spacing 24 → 2'-0".
  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('item-subject').fill('L');
  await page.getByTestId('item-size').fill('L4X4X3/8');
  await page.getByTestId('item-length').fill('0-11.5');
  await page.getByTestId('item-length').blur();
  await expect(page.getByTestId('item-length')).toHaveValue(`0'-11 1/2"`);
  await page.getByTestId('item-rule').selectOption('spacing');
  await page.getByTestId('item-value').fill('24');
  await page.getByTestId('item-value').blur();
  await expect(page.getByTestId('item-value')).toHaveValue(`2'-0"`);
  await page.screenshot({ path: 'test-results/units.png' });
});
