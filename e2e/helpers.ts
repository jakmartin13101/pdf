// Shared helpers for the end-to-end tests (sample drawing set in public/samples).
import { expect, type Page } from '@playwright/test';

export const SHEET_W = 2592; // sample sheets are ARCH D (36" x 24") = 2592 x 1728 pt
export const gx = (i: number) => 260 + i * 225; // grid lines in page points (25'-0" bays at 1/8")
export const gy = (j: number) => 300 + j * 180; // 20'-0" bays

export async function toScreen(page: Page, x: number, y: number) {
  const b = (await page.locator('.page').boundingBox())!;
  const k = b.width / SHEET_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

export async function clickAt(page: Page, x: number, y: number, opts: { button?: 'left' | 'right' } = {}) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, opts);
}

export async function dragFrom(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

export async function openSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-sample').click();
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(7);
}

export async function gotoSheet(page: Page, index: number) {
  await page.getByTestId('sheet-thumb').nth(index).click();
  await page.waitForTimeout(300);
}

export async function calibrateFoundationPlan(page: Page, applyTo = 'all') {
  await gotoSheet(page, 1);
  await page.getByTestId('tb-calibrate').click();
  // the 20'-0" dimension string left of grid line 1-2
  await clickAt(page, 125, 300);
  await clickAt(page, 125, 480);
  await page.getByTestId('calibrate-input').fill(`20'-0"`);
  await page.getByTestId('apply-to').selectOption(applyTo);
  await expect(page.getByTestId('calibrate-result')).toContainText(`1/8" = 1'-0"`);
  await page.getByTestId('calibrate-ok').click();
}
