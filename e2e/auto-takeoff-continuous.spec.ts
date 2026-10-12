import { expect, test } from '@playwright/test';
import { girderPlan } from '../tests/fixtures/girderPlan';

test('a girder drawn straight through its columns is taken off span by span', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('open-pdf').click()]);
  await chooser.setFiles({ name: 'Framing Detail.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await girderPlan()) });
  await expect(page.locator('.pane canvas').first()).toBeVisible({ timeout: 20000 });

  await page.getByTestId('tb-auto').click();
  await page.getByTestId('auto-find').click();
  await expect(page.getByTestId('auto-status')).toHaveText('3 members in 1 size');
  await expect(page.getByTestId('auto-ends-note')).toContainText('3 members end at a column');
  await expect(page.getByTestId('auto-scale-note')).toContainText(`1/8" = 1'-0"`);
  const group = page.getByTestId('auto-group');
  await group.locator('.auto-group-head button').first().click();
  // Top of the girder to the first column, then column to column.
  await expect(group.getByTestId('auto-member-length')).toHaveText([`20'-0"`, `25'-0"`, `25'-0"`]);
  await expect(group.locator('.auto-len')).toHaveText('70.00 LF');
  await expect(page.locator('[data-testid=auto-handle-p2][data-end=column]')).toHaveCount(3);
});

test('without column symbols the line is split halfway between the labels, marked as estimated', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('open-pdf').click()]);
  await chooser.setFiles({ name: 'No Columns.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await girderPlan({ columns: false })) });
  await expect(page.locator('.pane canvas').first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('tb-auto').click();
  await page.getByTestId('auto-find').click();
  await expect(page.getByTestId('auto-status')).toHaveText('3 members in 1 size');
  await expect(page.getByTestId('auto-ends-note')).toContainText('3 members have an estimated end');
  await expect(page.locator('[data-testid=auto-handle-p2][data-end=midpoint]')).toHaveCount(2);
  const group = page.getByTestId('auto-group');
  await group.locator('.auto-group-head button').first().click();
  await expect(group.getByTestId('auto-member-estimated')).toHaveCount(3);
});
