import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, toScreen } from './helpers';

test('text and icon size: the whole program larger, the drawing and the mouse still line up', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  const button = page.getByTestId('tb-calibrate');
  const normal = (await button.boundingBox())!;
  const font = async () => Number((await page.locator('.menu-btn', { hasText: 'File' }).evaluate((el) => getComputedStyle(el).fontSize)).replace('px', ''));
  const fontNormal = await font();

  // Settings → General: 125%.
  await page.keyboard.press('Control+,');
  await page.getByTestId('set-tab-general').click();
  await page.getByTestId('set-ui-scale').selectOption('1.25');
  await page.getByRole('button', { name: 'Close' }).last().click();
  const big = (await button.boundingBox())!;
  expect(big.height / normal.height).toBeCloseTo(1.25, 1);
  expect(big.width / normal.width).toBeCloseTo(1.25, 1);
  // (The text keeps its size in the page's own pixels: it is the whole window that is larger.)
  expect(await font()).toBe(fontNormal);
  await page.screenshot({ path: 'test-results/ui-scale-125.png' });

  // Drawing at the larger size: the clicks land where they are made.
  await page.getByTestId('library-tool').filter({ hasText: 'W12X26' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-row').first().locator('[data-col=length]')).toHaveText(`23'-0"`);
  // Menus open at the pointer.
  const at = await toScreen(page, gx(3), gy(3));
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = (await page.locator('.context-menu').boundingBox())!;
  expect(Math.abs(menu.x - at.x)).toBeLessThan(6);
  expect(Math.abs(menu.y - at.y)).toBeLessThan(6);
  await page.keyboard.press('Escape');
  // A dock's edge follows the mouse when dragged.
  const left = page.locator('.side-panel.left');
  const w0 = (await left.boundingBox())!.width;
  const edge = (await page.locator('.workspace > .splitter-v').first().boundingBox())!;
  await page.mouse.move(edge.x + 2, edge.y + 200);
  await page.mouse.down();
  await page.mouse.move(edge.x + 62, edge.y + 200, { steps: 4 });
  await page.mouse.up();
  expect(Math.abs((await left.boundingBox())!.width - w0 - 60)).toBeLessThan(4);

  // Kept for next time; the keyboard and the View menu change it too.
  await page.reload();
  await expect(page.getByTestId('tb-calibrate')).toBeVisible();
  expect((await page.getByTestId('tb-calibrate').boundingBox())!.height / normal.height).toBeCloseTo(1.25, 1);
  await page.keyboard.press('Control+Shift+Minus');
  await page.locator('.menu-btn', { hasText: 'View' }).click();
  await expect(page.locator('.dropdown .menu-item', { hasText: 'Text and Icon Size' })).toContainText('110%');
  await page.locator('.dropdown .menu-item', { hasText: 'Text and Icon Size' }).hover();
  await page.getByRole('menuitem', { name: '100% (normal)', exact: true }).click();
  expect((await page.getByTestId('tb-calibrate').boundingBox())!.height).toBeCloseTo(normal.height, 0);
});
