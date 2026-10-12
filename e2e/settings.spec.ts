import { expect, test, type Page } from '@playwright/test';
import { clickAt, gotoSheet, gx, gy, openSample, toScreen } from './helpers';

const menu = async (page: Page, top: string, item: string) => {
  await page.locator('.menu-btn', { hasText: new RegExp(`^${top}$`) }).click();
  await page.locator('.dropdown .menu-item', { hasText: item }).first().click();
};

test('the Settings menu opens settings and preferences; toggles apply at once', async ({ page }) => {
  await openSample(page);
  await menu(page, 'Settings', 'Settings & Preferences…');
  await expect(page.getByTestId('set-page-general')).toBeVisible();
  await page.getByTestId('set-author').fill('J. Martin');
  await page.getByTestId('set-tab-units').click();
  await page.getByTestId('set-length-unit').selectOption('in');
  await page.getByTestId('set-tab-editing').click();
  await page.getByTestId('set-nudge-unit').selectOption('real');
  await expect(page.getByTestId('set-nudge-real')).toHaveValue(`0'-1"`);
  await page.getByTestId('settings-done').click();
  await expect(page.getByTestId('settings')).toHaveCount(0);

  // Quick toggles in the menu.
  const snap = page.locator('.sb-toggle', { hasText: 'CONTENT' });
  await expect(snap).toHaveClass(/on/);
  await menu(page, 'Settings', 'Snap to Drawing');
  await expect(snap).not.toHaveClass(/on/);

  // Ctrl+, opens the dialog; preferences survive a reload.
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('set-author')).toHaveValue('J. Martin');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('set-author')).toHaveValue('J. Martin');
});

test('auto takeoff lines follow the style rules, and can be fine-adjusted before and after creating them', async ({ page }) => {
  await openSample(page);
  // Settings → Auto Takeoff Line Styles: W subjects as a dashed teal line, 4 pt.
  await menu(page, 'Settings', 'Auto Takeoff Line Styles…');
  const w = page.getByTestId('style-rule').filter({ has: page.locator('[data-testid=rule-text][value="W"]') });
  await expect(page.getByTestId('style-rule')).toHaveCount(6);
  await w.getByTestId('rule-color').fill('#0a8f6e');
  await w.getByTestId('rule-style').selectOption('dashed');
  await w.getByTestId('rule-width').fill('4');
  await page.getByTestId('rule-try').fill('W30x90');
  await expect(page.getByTestId('rule-try-result')).toContainText('starts with “W”');
  await page.getByTestId('settings-done').click();

  await gotoSheet(page, 2);
  await page.getByTestId('tb-auto').click();
  await page.getByTestId('auto-find').click();
  await expect(page.getByTestId('auto-status')).toHaveText('50 members in 5 sizes');
  // The preview draws each member with its rule's line.
  const line = (size: string) => page.locator(`[data-testid=auto-member][data-size="${size}"] [data-testid=auto-member-line]`).first();
  await expect(line('W24x55')).toHaveAttribute('stroke', '#0a8f6e');
  await expect(line('W24x55')).toHaveAttribute('stroke-dasharray', /\d/);
  await expect(line('HSS6x6x1/4')).toHaveAttribute('stroke', '#1f6feb'); // default rule: HSS blue

  // Pick the first W24x55 (grid 2, A-B) in the list: it is zoomed to and gets − / + buttons.
  const group = page.getByTestId('auto-group').filter({ has: page.locator('.auto-size', { hasText: /^W24x55$/ }) });
  await group.locator('.auto-group-head button').first().click();
  const row = group.getByTestId('auto-member-row').first();
  const len = row.getByTestId('auto-member-length');
  await expect(len).toHaveText(`23'-0"`);
  await row.getByTestId('auto-member-zoom').click();
  await expect(page.locator('[data-testid=auto-member][data-focused=yes]')).toHaveCount(1);
  await page.waitForTimeout(400);

  // Drag its left end square to the grid line: it slides along the beam and snaps there.
  const from = await toScreen(page, gx(0) + 9, gy(1));
  const to = await toScreen(page, gx(0), gy(1) + 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(len).toHaveText(`24'-0"`);
  await expect(row).toContainText('adjusted');

  // Step by step: right end + 1", then both ends − 6".
  await page.getByTestId('auto-adjust-end-plus').click();
  await expect(len).toHaveText(`24'-1"`);
  await page.getByTestId('auto-adjust-step').selectOption({ label: '6"' });
  await page.getByTestId('auto-adjust-both-minus').click();
  await expect(len).toHaveText(`23'-1"`);
  await row.getByTestId('auto-member-reset').click();
  await expect(len).toHaveText(`23'-0"`);
  await page.getByTestId('auto-adjust-end-plus').click();
  await expect(len).toHaveText(`23'-6"`);

  await page.getByTestId('auto-create').click();
  await expect(page.getByTestId('list-count')).toContainText('50 markups');
  await expect(page.locator('.mk-label', { hasText: `23'-6"` })).toHaveCount(1);
  const made = page.locator('.mk-length').first();
  await expect(made.locator('path:not(.mk-hit)').first()).toHaveCSS('stroke', 'rgb(10, 143, 110)');

  // After creating: Properties → Adjust Ends.
  await page.getByTestId('tb-fit-page').click();
  await page.keyboard.press('Escape');
  await clickAt(page, (gx(0) + gx(1)) / 2, gy(1));
  await page.getByTestId('tab-properties').click();
  await expect(page.getByTestId('prop-measurement')).toHaveText(`23'-6"`);
  await page.getByTestId('prop-adjust-start-plus').click(); // step is still 6"
  await expect(page.getByTestId('prop-measurement')).toHaveText(`24'-0"`);
  await page.getByTestId('prop-adjust-length').fill(`25'-0"`);
  await page.getByTestId('prop-adjust-length').press('Enter');
  await expect(page.getByTestId('prop-measurement')).toHaveText(`25'-0"`);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(page.getByTestId('prop-measurement')).toHaveText(`24'-0"`);

  // Change the rule and apply it to the existing auto measurements in one go.
  await menu(page, 'Settings', 'Auto Takeoff Line Styles…');
  await w.getByTestId('rule-color').fill('#d1199a');
  await page.getByTestId('rule-restyle').click();
  await expect(page.locator('.toast', { hasText: 'Restyled 50 auto measurements' })).toBeVisible();
  await page.getByTestId('settings-done').click();
  await expect(page.locator('.mk-length').first().locator('path:not(.mk-hit)').first()).toHaveCSS('stroke', 'rgb(209, 25, 154)');
});
