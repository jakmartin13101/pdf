import { expect, test } from '@playwright/test';
import { openSample } from './helpers';
import { BASIC_LICENSE, EXPIRED_PRO_LICENSE, OTHER_COMPUTER_LICENSE, PRO_LICENSE, TWO_COMPUTER_LICENSE } from './licenses';

// Start without a license (the other tests run with Pro).
test.use({ storageState: { cookies: [], origins: [] } });

test('Basic and Pro: the Combine Report and the Automatic Takeoff need Pro', async ({ page }) => {
  await openSample(page);
  // A new install: a week's trial of Basic.
  const badge = page.getByTestId('license-badge');
  await expect(badge).toHaveText('Trial · 7d');

  // Pro features are marked, and asking for one shows the license window instead.
  await page.locator('.menu-btn', { hasText: 'Tools' }).click();
  await expect(page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' })).toContainText('(Pro)');
  await page.locator('.dropdown .menu-item', { hasText: 'Combine Report…' }).click();
  const win = page.getByTestId('modal');
  await expect(win).toHaveAttribute('aria-label', 'License');
  await expect(page.getByTestId('license-upsell')).toContainText('Combine Report is part of');
  await expect(page.getByTestId('license-tier')).toHaveText('Trial');
  await expect(page.getByTestId('license-trial')).toHaveText('Basic trial – 7 days left');
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

  // Removed: back to the trial (while it lasts).
  await page.getByTestId('license-remove').click();
  await expect(badge).toHaveText('Trial · 7d');
  await expect(page.getByTestId('license-tier')).toHaveText('Trial');
});

test.describe('after the trial', () => {
  // Installed ten days ago, never licensed.
  const started = new Date(Date.now() - 10 * 864e5).toISOString();
  test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'ts.trial', value: JSON.stringify(started) }] }] } });

  test('the program needs a license key to go on', async ({ page }) => {
    await page.goto('/');
    const lock = page.getByTestId('license-lock');
    await expect(lock).toBeVisible();
    await expect(page.getByTestId('license-locked')).toContainText('7-day trial');
    await expect(page.getByTestId('license-tier')).toHaveText('None');
    await expect(page.getByTestId('license-badge')).toHaveText('Unlicensed');
    await page.screenshot({ path: 'test-results/license-locked.png' });
    // It can't be closed or got round.
    await page.keyboard.press('Escape');
    await expect(lock).toBeVisible();
    await expect(lock.getByTitle('Close')).toBeHidden();
    expect(await page.getByTestId('open-sample').click({ timeout: 1500 }).then(() => true).catch(() => false)).toBe(false);
    await page.keyboard.press('Control+,');
    await expect(page.locator('.modal[aria-label="Settings & Preferences"]')).toHaveCount(0);
    // An expired license doesn't do; a Basic one does.
    await page.getByTestId('license-key').fill(EXPIRED_PRO_LICENSE);
    await page.getByTestId('license-activate').click();
    await expect(page.getByTestId('license-error')).toContainText('expired');
    await page.getByTestId('license-key').fill(BASIC_LICENSE);
    await page.getByTestId('license-activate').click();
    await expect(lock).toHaveCount(0);
    await expect(page.getByTestId('license-badge')).toHaveText('Basic');
    await openSample(page);
    await expect(page.getByTestId('sheet-thumb')).toHaveCount(7);
  });
});

test.describe('a license tied to computers', () => {
  // This browser is computer TEST-0000-0000-0001.
  test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'ts.computerId', value: JSON.stringify('TEST-0000-0000-0001') }] }] } });

  test('works on the computers it lists and no others', async ({ page }) => {
    await openSample(page);
    await page.getByTestId('license-badge').click();
    await expect(page.getByTestId('license-computer-id')).toHaveText('TEST-0000-0000-0001');
    await page.getByTestId('license-key').fill(OTHER_COMPUTER_LICENSE);
    await page.getByTestId('license-activate').click();
    await expect(page.getByTestId('license-error')).toContainText('This license is for another computer. This computer’s ID is TEST-0000-0000-0001');
    await expect(page.getByTestId('license-badge')).toHaveText('Trial · 7d');
    await page.getByTestId('license-key').fill(TWO_COMPUTER_LICENSE);
    await page.getByTestId('license-activate').click();
    await expect(page.getByTestId('license-name')).toHaveText('Licensed to Two Seat Estimator, Test Steel Co.');
    await expect(page.getByTestId('license-status')).toContainText('For 2 computers');
    await expect(page.getByTestId('license-badge')).toHaveText('Pro');
    await page.screenshot({ path: 'test-results/license-computers.png' });
    // Checked again on every start, on this computer.
    await page.reload();
    await expect(page.getByTestId('license-badge')).toHaveText('Pro');
  });
});
