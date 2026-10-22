import { expect, test } from '@playwright/test';
import { clickAt, gotoSheet, gx, gy, openSample, showProperties } from './helpers';

const rows = (page: import('@playwright/test').Page) => page.getByTestId('markup-row');

test('subjects are shapes from a list each user keeps', async ({ page }) => {
  await openSample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('library-tool').filter({ hasText: 'W18X35' }).first().click();
  await clickAt(page, gx(0) + 9, gy(0));
  await clickAt(page, gx(1) - 9, gy(0));
  await page.keyboard.press('Escape');
  // The subject is the shape; the size is the Member Size and the label.
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('W');
  await expect(rows(page).first().locator('[data-col="c:member_size"]')).toHaveText('W18X35');

  // Settings → Subjects: take BO off the list, add RB.
  await page.keyboard.press('Control+Comma');
  await page.getByTestId('set-tab-subjects').click();
  await expect(page.getByTestId('subject-item').filter({ hasText: /^W/ }).first()).toContainText('1 used');
  await page.getByTestId('subject-item').filter({ hasText: 'BO' }).getByTestId('subject-remove').click();
  await page.getByTestId('subject-add-input').fill('RB');
  await page.getByTestId('subject-add').click();
  await page.getByTestId('subject-add-input').fill('w');
  await expect(page.getByTestId('subject-add')).toBeDisabled(); // already there
  await page.getByTestId('settings-done').click();

  // The subject cell offers the list, and only the list.
  await rows(page).first().locator('[data-col=subject]').dblclick();
  const pick = page.getByTestId('cell-subject');
  const options = await pick.locator('option').allTextContents();
  expect(options).toContain('RB');
  expect(options).not.toContain('BO');
  await pick.selectOption('HSS');
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('HSS');

  // Properties: the same list.
  await rows(page).first().click();
  await showProperties(page);
  await expect(page.getByTestId('prop-subject')).toHaveValue('HSS');
  await page.getByTestId('prop-subject').selectOption('RB');
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('RB');
});

test('subjects from before (sizes) change to shapes in one step', async ({ page }) => {
  // A takeoff made with version 1.6 (subjects such as W24X55, HSS Column, Metal Deck).
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open Takeoff Project/ }).click()]);
  await chooser.setFiles('e2e/fixtures/Older-Takeoff.takeoff.json');
  await expect(page.getByTestId('doc-tab')).toHaveCount(2);
  await page.getByTestId('list-search').fill('W24X55');
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('W24X55');
  await expect(rows(page).first().locator('[data-col=subject] .subject-other')).toHaveCount(1); // not in the list
  await page.keyboard.press('Control+Comma');
  await page.getByTestId('set-tab-subjects').click();
  await expect(page.getByTestId('subject-others')).toContainText('have subjects that are not in the list');
  await page.getByTestId('subject-convert').click();
  await page.getByTestId('settings-done').click();
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('W');
  await expect(rows(page).first().locator('[data-col="c:member_size"]')).toHaveText('W24X55');
  // Shapes the list has no subject for (Metal Deck) stay until cleared; one undo puts all back.
  await page.getByTestId('list-search').fill('Metal Deck');
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('Metal Deck');
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await page.getByTestId('list-search').fill('W24X55');
  await expect(rows(page).first().locator('[data-col=subject]')).toHaveText('W24X55');
});

test('labels and text can have their own colour', async ({ page }) => {
  await openSample(page);
  await gotoSheet(page, 2);
  await page.getByTestId('library-tool').filter({ hasText: 'W18X35' }).first().click();
  await clickAt(page, gx(0) + 9, gy(0));
  await clickAt(page, gx(1) - 9, gy(0));
  await page.keyboard.press('Escape');
  await rows(page).first().click();
  await showProperties(page, 'style');
  const label = page.locator('.mk-label').first();
  const line = page.locator('[data-mid] path:not(.mk-hit)').first();
  const lineColor = await line.evaluate((el) => getComputedStyle(el).stroke);
  await expect(page.getByTestId('prop-font-same')).toBeChecked();
  await page.getByTestId('prop-font-color').fill('#1f6feb');
  await expect(label).toHaveAttribute('fill', '#1f6feb');
  expect(await line.evaluate((el) => getComputedStyle(el).stroke)).toBe(lineColor); // the line keeps its colour
  await page.getByTestId('prop-font-same').check();
  await expect(label).not.toHaveAttribute('fill', '#1f6feb');

  // Auto takeoff line styles: a text colour per rule.
  await page.keyboard.press('Control+Comma');
  await page.getByTestId('set-tab-auto').click();
  const rule = page.getByTestId('style-rule').first();
  await rule.getByTestId('rule-font-color').fill('#000000');
  await expect(rule.locator('.line-sample text')).toHaveAttribute('fill', '#000000');
  await rule.getByTestId('rule-font-same').click();
  await expect(rule.getByTestId('rule-font-same')).toHaveCount(0);
});
