import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

test('bent plate and plate weigh by the foot in the Weight column', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  // 23'-0" of BP3X3X1/4 at 5.10 lb/ft = 117 lb.
  await page.getByTestId('library-tool').filter({ hasText: 'BP3X3X1/4' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('[data-col=subject]')).toHaveText('BP');
  await expect(rows.first().locator('[data-col=length]')).toHaveText(`23'-0"`);
  await expect(rows.first().locator('[data-col="c:weight"]')).toHaveText('117 lbs');

  // Three plates counted, the size only in the label, each 1'-2" long: 3'-6" × 11.91 lb/ft = 42 lb.
  const meas = page.locator('[data-panel="measurements"]');
  await meas.getByTestId('meas-tool-count').click();
  for (const i of [0, 1, 2]) await clickAt(page, gx(i) + 20, gy(2) + 20);
  await page.keyboard.press('Escape');
  await rows.nth(1).click();
  await meas.getByTestId('meas-label').fill('pl 1/2*7');
  await meas.getByTestId('meas-label').press('Enter');
  await meas.getByTestId('meas-height').fill('0-14');
  await meas.getByTestId('meas-height').press('Enter');
  await expect(rows.nth(1).locator('[data-col=length]')).toHaveText(`3'-6"`);
  await expect(rows.nth(1).locator('[data-col="c:weight"]')).toHaveText('42 lbs');
  await page.screenshot({ path: 'test-results/plate-weights.png' });
});
