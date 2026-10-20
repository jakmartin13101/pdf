import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

test('the Measurements panel: tools, page scale, and a count with a Height taking off a length', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'CONTENT', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  // Tool Chest and Measurements stacked down the right dock (Properties below them once something is picked).
  const meas = page.locator('[data-panel="measurements"]');
  await expect(page.locator('[data-panel="toolchest"]')).toBeVisible();
  await expect(meas).toBeVisible();
  await expect(meas.getByTestId('prop-sec-meas-scale')).toHaveClass(/open/);
  await expect(meas.getByTestId('sheet-scale')).toHaveText(`1/8" = 1'-0"`);

  // The measuring tools in a row: Count.
  await meas.getByTestId('meas-tool-count').click();
  await expect(meas.getByTestId('meas-tool-count')).toHaveClass(/active/);
  for (const i of [0, 1, 2]) await clickAt(page, gx(i) + 20, gy(2) + 20);
  await page.keyboard.press('Escape');
  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await rows.first().click();

  // Count Measurement Properties: Subject, Label, Depth (with its unit), Width, Height, Length and Area units.
  await expect(meas.getByTestId('prop-sec-meas-props')).toContainText('Count Measurement Properties');
  const props = meas.getByTestId('meas-props');
  await expect(props.locator('.field > label')).toHaveText(['Subject', 'Label', 'Depth', 'Width', 'Height', 'Length', 'Area']);
  await props.getByTestId('meas-label').fill('pl 1/2*7');
  await props.getByTestId('meas-label').press('Enter');
  await expect(props.getByTestId('meas-label')).toHaveValue('PL 1/2X7');
  // Each plate 1'-2" long: three of them are 3'-6".
  await props.getByTestId('meas-height').fill('0-14');
  await props.getByTestId('meas-height').press('Enter');
  await expect(props.getByTestId('meas-height')).toHaveValue(`1'-2"`);
  await expect(props.getByTestId('meas-result-length')).toHaveText(`3'-6"`);
  await expect(rows.first().locator('[data-col=length]')).toHaveText(`3'-6"`);
  await expect(rows.first().locator('[data-col="c:height"]')).toHaveText(`1'-2"`);
  // 7" wide: an area. Bare numbers are inches for Depth and Width.
  await props.getByTestId('meas-width').fill('7');
  await props.getByTestId('meas-width').press('Enter');
  await expect(props.getByTestId('meas-width')).toHaveValue(`0'-7"`);
  await expect(props.getByTestId('meas-result-area')).toHaveText('2.04 sf');
  // Its dimensions in inches.
  await props.getByTestId('meas-dim-unit').selectOption('in');
  await expect(props.getByTestId('meas-height')).toHaveValue(`14.00"`);
  await page.screenshot({ path: 'test-results/measurements-panel.png' });

  // A length: no Height.
  await page.getByTestId('chest-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await page.keyboard.press('Escape');
  await rows.nth(1).click();
  await expect(meas.getByTestId('prop-sec-meas-props')).toContainText('Length Measurement Properties');
  await expect(props.locator('.field > label')).toHaveText(['Subject', 'Label', 'Depth', 'Width', 'Length', 'Area']);
  // Written in inches, this one.
  await props.getByTestId('meas-length-unit').selectOption('in');
  await expect(rows.nth(1).locator('[data-col=length]')).toHaveText(`276.00"`);
  await expect(rows.first().locator('[data-col=length]')).toHaveText(`3'-6"`);
});

test('thumbnail size slider, split view keys and side panels resized at any window size', async ({ page }) => {
  await openSample(page);
  const thumbs = page.getByTestId('sheet-thumb');
  const box = async (i: number) => (await thumbs.nth(i).boundingBox())!;
  // Full width: one under the other.
  expect((await box(1)).y).toBeGreaterThan((await box(0)).y + 50);
  const wide = (await box(0)).width;
  // Small: side by side.
  await page.getByTestId('thumb-size').fill('90');
  expect(Math.abs((await box(1)).y - (await box(0)).y)).toBeLessThan(2);
  expect((await box(0)).width).toBeLessThan(wide / 1.5);
  await page.screenshot({ path: 'test-results/thumb-size.png' });
  await page.getByTestId('thumb-size').fill('400');
  expect((await box(1)).y).toBeGreaterThan((await box(0)).y + 50);

  // Split view from the keyboard (Settings → Keyboard can change the keys): every press splits again;
  // panes are closed by hand.
  const panes = page.getByTestId('pane');
  await page.locator('.viewer').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Shift+2');
  await expect(panes).toHaveCount(2);
  await page.keyboard.press('Control+Shift+2');
  await expect(panes).toHaveCount(3);
  await page.keyboard.press('Control+Shift+3');
  await expect(panes).toHaveCount(4);
  await page.keyboard.press('Control+Shift+3');
  await expect(panes).toHaveCount(5);
  await page.getByTestId('pane-close').first().click();
  await expect(panes).toHaveCount(4);
  await page.getByTestId('split-single').click();
  await expect(panes).toHaveCount(1);
  await page.locator('.menu-btn', { hasText: 'Window' }).click();
  await expect(page.locator('.menu-item', { hasText: 'Split Vertical' })).toContainText('Ctrl+Shift+2');
  await page.keyboard.press('Escape');

  // A narrow window: the side panel lies over the drawing and still resizes from its edge.
  await page.setViewportSize({ width: 760, height: 900 });
  const panel = page.locator('.side-panel.left');
  if (!(await panel.isVisible())) await page.getByTestId('tab-sheets').click();
  await expect(panel).toBeVisible();
  const before = (await panel.boundingBox())!.width;
  const grip = (await panel.locator('.side-grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 200);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + 200, { steps: 5 });
  await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBeLessThan(before - 40);
});
