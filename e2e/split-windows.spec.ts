import { expect, test, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

async function splitAndDetach(page: Page) {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await page.getByTestId('split-vertical').click();
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('pane-detach').nth(1).click()]);
  await popup.waitForSelector('.pane canvas');
  await expect(page.getByTestId('pane')).toHaveCount(1);
  return popup;
}

test('a split pane detaches into its own window and uses the main window tools', async ({ page }) => {
  const popup = await splitAndDetach(page);
  await expect(popup.locator('.pane-head.active')).toHaveCount(1);
  await expect(popup.getByTestId('pane-sheet').locator('option:checked')).toHaveText('S1.02 – Roof Framing Plan');

  // Pick the tool in the main window, measure in the detached window…
  await page.getByTestId('tb-length').click();
  await clickAt(popup, gx(0), gy(0));
  await clickAt(popup, gx(1), gy(0));
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('[data-col=measurement]')).toHaveText(`25'-0"`);

  // …then carry on in the main window with the same tool: clicking it makes it the active pane.
  await clickAt(page, gx(0), gy(1));
  await clickAt(page, gx(1), gy(1));
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.pane-head.active')).toHaveCount(1);
  await expect(popup.locator('.pane-head.active')).toHaveCount(0);
  await expect(page.getByTestId('tb-length')).toHaveClass(/active/);

  // Each window keeps its own sheet.
  await popup.getByTestId('pane-sheet').selectOption({ label: 'S2.01 – Structural Sections and Details' });
  await expect(page.getByTestId('pane-sheet').locator('option:checked')).toHaveText('S1.02 – Roof Framing Plan');
});

test('count starts a new count whenever the active pane or window changes', async ({ page }) => {
  const popup = await splitAndDetach(page);
  await page.getByTestId('tb-count').click();
  await clickAt(page, gx(0), gy(2));
  await clickAt(page, gx(1), gy(2));
  await clickAt(popup, gx(2), gy(2));
  await clickAt(popup, gx(3), gy(2));
  await clickAt(popup, gx(4), gy(2));
  await clickAt(page, gx(5), gy(2));
  await page.keyboard.press('Escape');
  const counts = page.getByTestId('markup-row').locator('[data-col=count]');
  await expect(counts).toHaveText(['2', '3', '1']);
});

test('a detached pane can go back to the main window, and closing its window closes it', async ({ page }) => {
  const popup = await splitAndDetach(page);
  await Promise.all([popup.waitForEvent('close'), popup.getByTestId('pane-attach').click()]);
  await expect(page.getByTestId('pane')).toHaveCount(2);

  const [again] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('pane-detach').nth(1).click()]);
  await again.waitForSelector('.pane canvas');
  await again.close();
  await expect(page.getByTestId('pane')).toHaveCount(1);
  await expect(page.getByTestId('pane-head')).toHaveCount(0);
});

test('without pop-ups a detached pane floats inside the window and can be moved and resized', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await page.getByTestId('split-horizontal').click();
  await page.getByTestId('pane-detach').nth(1).click();
  const float = page.getByTestId('pane-float');
  await expect(float).toBeVisible();
  await expect(page.locator('.pane-area [data-testid=pane]')).toHaveCount(1);

  const before = (await float.boundingBox())!;
  const head = float.getByTestId('pane-head');
  const hb = (await head.locator('.pane-num').boundingBox())!;
  await page.mouse.move(hb.x + hb.width + 200, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width + 120, hb.y + hb.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const moved = (await float.boundingBox())!;
  expect(moved.x).toBeCloseTo(before.x - 80, 0);
  expect(moved.y).toBeCloseTo(before.y + 60, 0);

  const grip = (await float.locator('.float-resize').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 100, grip.y + 50, { steps: 6 });
  await page.mouse.up();
  const resized = (await float.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width + 80);
  expect(resized.height).toBeGreaterThan(moved.height + 40);

  // Tools work in the floating pane too.
  await page.getByTestId('tb-length').click();
  const page2 = float.locator('.page');
  const pb = (await page2.boundingBox())!;
  const k = pb.width / 2592;
  await page.mouse.click(pb.x + gx(0) * k, pb.y + gy(0) * k);
  await page.mouse.click(pb.x + gx(1) * k, pb.y + gy(0) * k);
  await expect(page.getByTestId('markup-row')).toHaveCount(1);
  await expect(float.locator('.pane-head.active')).toHaveCount(1);
});
