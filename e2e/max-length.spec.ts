import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

const FT = 9; // page points per foot at 1/8" = 1'-0"

test('a measurement longer than its shape\'s maximum is taken off as pieces along the same line', async ({ page }) => {
  await openSample(page);
  // Exact lengths: no snapping to the drawing or to other markups.
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  // Settings → Length Measurements: W at most 40'-0".
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Length Measurements…' }).click();
  const w = page.locator('[data-testid=max-row][data-shape="W"]').getByTestId('max-input');
  await w.fill('40');
  await w.press('Enter');
  await expect(w).toHaveValue(`40'-0"`);
  await page.getByTestId('settings-done').click();

  // One 63'-0" W24X55 line.
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0), gy(1));
  await clickAt(page, gx(0) + 63 * FT, gy(1));
  await page.keyboard.press('Escape');

  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('[data-col=length]')).toHaveText([`40'-0"`, `23'-0"`]);
  await expect(rows.locator('[data-col=subject]')).toHaveText(['W', 'W']);
  await expect(rows.locator('[data-col="c:member_size"]')).toHaveText(['W24X55', 'W24X55']);
  // Two markups on the drawing, end to end on the line that was drawn.
  const lines = page.locator('.markups g.mk-length');
  await expect(lines).toHaveCount(2);
  const ends = await lines.evaluateAll((gs) =>
    gs.map((g) => {
      const d = g.querySelectorAll('path')[1].getAttribute('d')!;
      return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    }),
  );
  expect(ends[0][1][0]).toBeCloseTo(ends[1][0][0], 3);
  expect(ends[0][1][1]).toBeCloseTo(ends[1][0][1], 3);
  expect(ends[0][0][1]).toBeCloseTo(ends[1][1][1], 3);

  // Shapes without a maximum are left alone: a 63'-0" C10X15.3 stays one markup.
  await page.getByTestId('library-tool').filter({ hasText: 'C10X15.3' }).first().click();
  await clickAt(page, gx(0), gy(3));
  await clickAt(page, gx(0) + 63 * FT, gy(3));
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(3);

  // Give C a maximum of 25'-0" and break the one already drawn: 25 + 25 + 13.
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Length Measurements…' }).click();
  const c = page.locator('[data-testid=max-row][data-shape="C"]').getByTestId('max-input');
  await c.fill(`25'`);
  await c.press('Enter');
  await page.getByTestId('settings-done').click();
  await rows.nth(2).click({ button: 'right' });
  await page.locator('.context-menu .menu-item', { hasText: 'Split at Maximum Length' }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('[data-col=length]')).toHaveText([`40'-0"`, `23'-0"`, `25'-0"`, `25'-0"`, `13'-0"`]);
  // One undo puts it back together.
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect(rows).toHaveCount(3);

  // Switched off: nothing is broken.
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Length Measurements…' }).click();
  await page.getByTestId('set-max-enabled').uncheck();
  await page.getByTestId('settings-done').click();
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0), gy(4));
  await clickAt(page, gx(0) + 63 * FT, gy(4));
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3).locator('[data-col=length]')).toHaveText(`63'-0"`);
});
