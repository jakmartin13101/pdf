import { expect, test, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, toScreen } from './helpers';

async function setUp(page: Page) {
  await openSample(page);
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
}

test('a picked tool shows what it draws in Properties, to change before drawing', async ({ page }) => {
  await setUp(page);
  const props = page.locator('[data-panel="properties"]');
  const rows = page.getByTestId('markup-row');

  // A Tool Library tool: its fields, every section open; changes are kept in the tool.
  await page.getByTestId('library-tool').filter({ hasText: 'W12X26' }).first().click();
  await expect(props).toBeVisible();
  await expect(props.getByTestId('tool-props')).toContainText('Kept in the Tool Library tool “W12X26”');
  await expect(props.locator('.panel-header')).toContainText('Tool: W12X26');
  await expect(page.getByTestId('prop-main').locator('.field > label')).toHaveText(['Subject', 'Label', 'Height', 'Finish']);
  await expect(page.getByTestId('prop-sec-tool-style')).toHaveClass(/open/);
  await expect(page.getByTestId('prop-sec-tool-properties')).toHaveClass(/open/);
  await expect(page.locator('[data-testid=prop-field][data-key="c:grade"] input')).toHaveValue('A992');
  await page.getByTestId('prop-col-finish').fill('Galvanize');
  await page.getByTestId('prop-col-finish').press('Enter');
  await page.screenshot({ path: 'test-results/tool-properties.png' });

  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('[data-col="c:finish"]')).toHaveText('Galvanize');
  await expect(rows.first().locator('[data-col="c:member_size"]')).toHaveText('W12X26');
  // Drawn: Properties shows the new markup.
  await expect(page.getByTestId('prop-measurement')).toHaveText(`23'-0"`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('library-tool').filter({ hasText: 'W12X26' }).first().click();
  await expect(page.getByTestId('prop-col-finish')).toHaveValue('Galvanize');
  await page.keyboard.press('Escape');

  // A plain measuring tool: the Measurements panel sets up the next measurement too (kept as its defaults).
  const meas = page.locator('[data-panel="measurements"]');
  await meas.getByTestId('meas-tool-length').click();
  await expect(meas.getByTestId('meas-props')).toBeVisible();
  await expect(meas.locator('.prop-sec-head', { hasText: 'Next Length Measurement' })).toBeVisible();
  await expect(meas.getByTestId('meas-result')).toHaveCount(0);
  await expect(props.getByTestId('tool-props')).toContainText('Kept as this tool’s defaults');
  await meas.getByTestId('meas-label').fill('bp3*3*1/4');
  await meas.getByTestId('meas-label').press('Enter');
  await meas.getByTestId('meas-subject').selectOption('BP');
  await expect(page.getByTestId('prop-label')).toHaveValue('BP3X3X1/4');
  await clickAt(page, gx(0) + 9, gy(2));
  await clickAt(page, gx(1) - 9, gy(2));
  await expect(rows).toHaveCount(2);
  // A bent plate measured as a length: 23'-0" × 5.10 lb/ft.
  await expect(rows.nth(1).locator('[data-col=subject]')).toHaveText('BP');
  await expect(rows.nth(1).locator('[data-col="c:weight"]')).toHaveText('117 lbs');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Back to the built-in properties.
  await meas.getByTestId('meas-tool-length').click();
  await props.getByTestId('tool-props-reset').click();
  await expect(meas.getByTestId('meas-label')).toHaveValue('');
});

test('paste puts the farthest-left point of what was copied at the pointer', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('library-tool').filter({ hasText: 'W12X26' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+c');

  const at = await toScreen(page, gx(2), gy(3));
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('markup-row')).toHaveCount(2);
  // The pasted line is selected: its box starts at the pointer (the box stands 4 px off the line).
  const box = (await page.locator('.sel .sel-box').boundingBox())!;
  expect(Math.abs(box.x + 4 - at.x)).toBeLessThan(2.5);
  expect(Math.abs(box.y + box.height / 2 - at.y)).toBeLessThan(2.5);

  // Right-click Paste: at the point clicked.
  const at2 = await toScreen(page, gx(4), gy(2) + 40);
  await page.mouse.click(at2.x, at2.y, { button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: /^Paste/ }).click();
  await expect(page.getByTestId('markup-row')).toHaveCount(3);
  const box2 = (await page.locator('.sel .sel-box').boundingBox())!;
  expect(Math.abs(box2.x + 4 - at2.x)).toBeLessThan(2.5);
  expect(Math.abs(box2.y + box2.height / 2 - at2.y)).toBeLessThan(2.5);
});

test('full-screen crosshairs, and the view moving while drawing past its edge', async ({ page }) => {
  await setUp(page);
  const viewer = page.getByTestId('viewer').first();
  const vb = (await viewer.boundingBox())!;

  // Crosshairs: off at first; on with the drawing tools (Settings menu), or always (Settings).
  await page.getByTestId('meas-tool-length').first().click();
  const p = await toScreen(page, gx(1), gy(1) + 50);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('crosshair')).toHaveCount(0);
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.dropdown .menu-item', { hasText: 'Full-Screen Crosshairs' }).click();
  await page.mouse.move(p.x + 3, p.y + 3);
  await page.mouse.move(p.x, p.y);
  const ch = page.getByTestId('crosshair');
  await expect(ch).toBeVisible();
  const v = (await ch.locator('.ch-v').boundingBox())!;
  const h = (await ch.locator('.ch-h').boundingBox())!;
  expect(Math.abs(v.x - p.x)).toBeLessThan(2);
  expect(Math.abs(h.y - p.y)).toBeLessThan(2);
  // They cross the whole pane.
  expect(h.width).toBeGreaterThan(vb.width - 4);
  expect(v.height).toBeGreaterThan(vb.height - 4);
  await page.screenshot({ path: 'test-results/crosshairs.png' });
  await page.keyboard.press('Escape');
  await page.mouse.move(p.x + 3, p.y);
  await expect(ch).toHaveCount(0);
  await page.keyboard.press('Control+,');
  await page.getByTestId('set-tab-editing').click();
  await page.getByTestId('set-crosshair').selectOption('always');
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.mouse.move(p.x, p.y);
  await expect(ch).toBeVisible();

  // Drawing a length up to the right edge: the view moves along, the length keeps growing.
  const page0 = (await page.locator('.page').boundingBox())!;
  await page.getByTestId('meas-tool-length').first().click();
  await clickAt(page, gx(1), gy(2));
  await page.mouse.move(vb.x + vb.width - 30, vb.y + vb.height / 2, { steps: 4 });
  await page.mouse.move(vb.x + vb.width - 4, vb.y + vb.height / 2, { steps: 2 });
  await expect.poll(async () => (await page.locator('.page').boundingBox())!.x, { timeout: 3000 }).toBeLessThan(page0.x - 120);
  // Back from the edge: it stops.
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2, { steps: 2 });
  const stopped = (await page.locator('.page').boundingBox())!.x;
  await page.waitForTimeout(400);
  expect((await page.locator('.page').boundingBox())!.x).toBe(stopped);
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await expect(page.getByTestId('markup-row')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Turned off, the view stays put.
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.dropdown .menu-item', { hasText: 'Move View at Edge While Drawing' }).click();
  const page1 = (await page.locator('.page').boundingBox())!;
  await page.getByTestId('meas-tool-length').first().click();
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.mouse.move(vb.x + vb.width - 4, vb.y + vb.height / 2, { steps: 4 });
  await page.waitForTimeout(700);
  expect((await page.locator('.page').boundingBox())!.x).toBe(page1.x);
});
