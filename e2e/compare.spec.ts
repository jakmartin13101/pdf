import { expect, test, type Page } from '@playwright/test';
import { clickAt, gotoSheet, gx, gy, openSample } from './helpers';

/** Sample set plus the Addendum 2 revision of S1.02 (re-plotted at 99 % and shifted). */
async function openWithRevision(page: Page) {
  await openSample(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.menu-btn', { hasText: 'File' }).click().then(() => page.getByText('Add PDF to Set…').first().click()),
  ]);
  await chooser.setFiles('public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(8);
  await gotoSheet(page, 2);
}

/** Where a point of the original S1.02 is on the revision's own page. */
const onRevision = (x: number, y: number) => ({ x: 0.99 * x + 30, y: 0.99 * y + (1728 - 0.99 * 1728 - 4) });

test('overlays a revision, aligns it automatically and finds the changes', async ({ page }) => {
  await openWithRevision(page);
  await page.getByTestId('tb-compare').click();
  await page.getByTestId('compare-start').click();
  // The revision of the same sheet number is suggested as the overlay.
  await expect(page.getByTestId('compare-b').locator('option:checked')).toHaveText('S1.02 – Roof Framing Plan · Sample-S1.02-Addendum-2');
  await page.getByTestId('compare-ok').click();

  await expect(page.getByTestId('compare-status')).toContainText('text matches', { timeout: 30000 });
  await expect(page.getByTestId('compare-status')).toContainText(/9\d% of line work matches/);
  await expect(page.getByTestId('compare-scale')).toHaveValue('101.010');
  await expect(page.getByTestId('compare-dx')).toHaveValue('-0.421');
  await expect(page.getByTestId('compare-dy')).toHaveValue('-0.186');
  await expect(page.getByTestId('overlay-b')).toHaveCount(1);
  await expect(page.getByTestId('badge-overlay').first()).toHaveClass(/on/);

  // Colours and intensity are per sheet; either sheet can be hidden.
  await page.getByTestId('compare-color-b').fill('#1aa34a');
  await expect(page.locator('filter[id$="-b"] feColorMatrix')).toHaveAttribute('values', /^0\.19773 0\.66523/);
  await page.getByTestId('compare-intensity-a').fill('40');
  await expect(page.locator('filter[id$="-a"] feColorMatrix')).toHaveAttribute('values', /^0\.00\d+ /);
  await page.getByTestId('compare-show-b').click();
  await expect(page.getByTestId('overlay-b')).toHaveCount(0);
  await page.getByTestId('compare-show-b').click();
  await expect(page.getByTestId('overlay-b')).toHaveCount(1);

  // Changes: both RTU openings, the new beam, the upsized girder label, the note, the revision block…
  await page.getByTestId('compare-find').click();
  const changes = page.getByTestId('compare-change');
  await expect(changes).toHaveCount(8, { timeout: 30000 });
  await expect(changes.filter({ hasText: 'Only on A' })).toHaveCount(1);
  await expect(page.getByTestId('change-box')).toHaveCount(8);

  await page.getByTestId('compare-clouds').click();
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(8);
  await expect(rows.first().locator('[data-col=subject]')).toHaveText('Revision Change');
  // One undo removes them all.
  await page.keyboard.press('Control+z');
  await expect(rows).toHaveCount(0);
});

test('aligns by picking the same points on both sheets, then fine-tunes by hand', async ({ page }) => {
  await openWithRevision(page);
  await page.getByTestId('tb-compare').click();
  await page.getByTestId('compare-start').click();
  await page.getByTestId('compare-autoalign').uncheck();
  await page.getByTestId('compare-ok').click();
  await expect(page.getByTestId('compare-status')).toHaveText('Not aligned yet');

  await page.getByTestId('compare-points').click();
  await expect(page.getByTestId('overlay-b')).toHaveCount(0); // only sheet A while picking its points
  await clickAt(page, gx(0), gy(0));
  await clickAt(page, gx(6), gy(5));
  await expect(page.getByTestId('compare-pick-hint')).toContainText('Sheet B');
  await expect(page.getByTestId('overlay-a')).toHaveCSS('opacity', '0');
  for (const [x, y] of [
    [gx(0), gy(0)],
    [gx(6), gy(5)],
  ]) {
    const p = onRevision(x, y);
    await clickAt(page, p.x, p.y);
  }
  await expect(page.getByTestId('compare-status')).toHaveText('Aligned by 2 points');
  await expect(page.getByTestId('compare-scale')).toHaveValue(/^101\.0[01]\d$/);
  expect(Math.abs(Number(await page.getByTestId('compare-dx').inputValue()) + 0.421)).toBeLessThan(0.01);
  expect(Math.abs(Number(await page.getByTestId('compare-dy').inputValue()) + 0.186)).toBeLessThan(0.01);

  // Nudge, type an exact value, drag by hand, reset.
  const dx = async () => Number(await page.getByTestId('compare-dx').inputValue());
  const before = await dx();
  await page.getByTestId('compare-nudge-right').click();
  expect(await dx()).toBeCloseTo(before + 0.1, 3);
  await page.getByTestId('compare-dx').fill('1.5');
  await page.getByTestId('compare-dx').press('Enter');
  await expect(page.getByTestId('compare-status')).toHaveText('Adjusted by hand');
  await page.getByTestId('compare-move').click();
  const box = (await page.locator('.page').boundingBox())!;
  const k = 2592 / box.width; // page points per screen pixel
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 200, { steps: 5 });
  await page.mouse.up();
  expect(await dx()).toBeCloseTo(1.5 + (40 * k) / 72, 1);
  await page.keyboard.press('Escape');
  await page.getByTestId('compare-reset').click();
  await expect(page.getByTestId('compare-dx')).toHaveValue('0.000');
  await expect(page.getByTestId('compare-scale')).toHaveValue('100.000');
});

test('the example takeoff has an overlay ready to switch on', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page.getByTestId('badge-overlay')).toHaveCount(1);
  await gotoSheet(page, 2);
  await page.getByTestId('tb-compare').click();
  await expect(page.getByTestId('overlay-b')).toHaveCount(0);
  await page.getByTestId('compare-enabled').check();
  await expect(page.getByTestId('overlay-b')).toHaveCount(1);
  await expect(page.getByTestId('compare-status')).toContainText('text matches');
});
