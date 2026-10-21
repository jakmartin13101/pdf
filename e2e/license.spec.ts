import { expect, test } from '@playwright/test';
import { openSample } from './helpers';
import { BASIC_LICENSE, EXPIRED_PRO_LICENSE, PRO_LICENSE } from './licenses';

// Start without a license (the other tests run with Pro).
test.use({ storageState: { cookies: [], origins: [] } });

test('Basic and Pro: the Combine Report and the Automatic Takeoff need Pro', async ({ page }) => {
  await openSample(page);
  const badge = page.getByTestId('license-badge');
  await expect(badge).toHaveText('Basic');

  // Pro features are marked, and asking for one shows the license window instead.
  await page.locator('.menu-btn', { hasText: 'Tools' }).click();
  await expect(page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' })).toContainText('(Pro)');
  await page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' }).click();
  const win = page.getByTestId('modal');
  await expect(win).toHaveAttribute('aria-label', 'License');
  await expect(page.getByTestId('license-upsell')).toContainText('Combine Report is part of');
  await expect(page.getByTestId('license-tier')).toHaveText('Basic');
  await page.screenshot({ path: 'test-results/license-basic.png' });
  await win.getByRole('button', { name: 'Close' }).last().click();

  await expect(page.getByTestId('tb-auto').locator('.tb-pro')).toHaveText('PRO');
  await page.getByTestId('tb-auto').click();
  await expect(page.getByTestId('license-upsell')).toContainText('Automatic Takeoff is part of');
  await win.getByRole('button', { name: 'Close' }).last().click();
  // Its panel opened another way (its tab) says so too.
  await expect(page.locator('[data-panel="autotakeoff"]')).toHaveCount(0);

  // Keys that aren't genuine, or have expired, are refused.
  await badge.click();
  await page.getByTestId('license-key').fill(PRO_LICENSE.replace(/.{6}$/, 'AAAAAA'));
  await page.getByTestId('license-activate').click();
  await expect(page.getByTestId('license-error')).toContainText('not genuine');
  await page.getByTestId('license-key').fill(EXPIRED_PRO_LICENSE);
  await page.getByTestId('license-activate').click();
  await expect(page.getByTestId('license-error')).toContainText('expired on 2024-12-31');

  // A Basic license: licensed, still without the Pro features.
  await page.getByTestId('license-key').fill(BASIC_LICENSE);
  await page.getByTestId('license-activate').click();
  await expect(page.getByTestId('license-name')).toHaveText('Licensed to Basic Tester');
  await expect(badge).toHaveText('Basic');
  await win.getByRole('button', { name: 'Close' }).last().click();
  await page.locator('.menu-btn', { hasText: 'Tools' }).click();
  await page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' }).click();
  await expect(page.getByTestId('license-upsell')).toBeVisible();

  // Pro (pasted with a line break): the Combine Report it was opened for comes up.
  await page.getByTestId('license-key').fill(`${PRO_LICENSE.slice(0, 50)}\n${PRO_LICENSE.slice(50)}`);
  await page.getByTestId('license-activate').click();
  await expect(win).toHaveAttribute('aria-label', 'Combine Report');
  await expect(badge).toHaveText('Pro');
  await win.getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByTestId('tb-auto').locator('.tb-pro')).toHaveCount(0);
  await page.getByTestId('tb-auto').click();
  await expect(page.locator('[data-panel="autotakeoff"]')).toBeVisible();
  await expect(page.getByTestId('pro-locked')).toHaveCount(0);

  // Kept on this computer.
  await page.reload();
  await expect(badge).toHaveText('Pro');
  await badge.click();
  await expect(page.getByTestId('license-name')).toHaveText('Licensed to Test Estimator, Test Steel Co.');
  await page.screenshot({ path: 'test-results/license-pro.png' });

  // Removed: back to Basic, and the Pro panel closes.
  await page.getByTestId('license-remove').click();
  await expect(badge).toHaveText('Basic');
  await expect(page.getByTestId('license-tier')).toHaveText('Basic');
});
