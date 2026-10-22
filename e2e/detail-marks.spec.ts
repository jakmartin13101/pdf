import { expect, test, type Locator, type Page } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, toScreen } from './helpers';

/** The points of an SVG path ("M x,y L x,y …"). */
async function pathPoints(path: Locator): Promise<{ x: number; y: number }[]> {
  const d = (await path.getAttribute('d')) ?? '';
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

const len = (p: { x: number; y: number }[]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
const dir = (p: { x: number; y: number }[]) => Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);

async function beams(page: Page) {
  // A W24X55 along grid line B (horizontal) and one down grid line 2 (vertical).
  await page.getByTestId('library-tool').filter({ hasText: 'W24X55' }).first().click();
  await clickAt(page, gx(0) + 9, gy(1));
  await clickAt(page, gx(1) - 9, gy(1));
  await clickAt(page, gx(2), gy(0) + 9);
  await clickAt(page, gx(2), gy(1) - 9);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-row')).toHaveCount(2);
}

test('material added by a standard detail is drawn beside its markup', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'DWG SNAP', exact: true }).click();
  await page.getByRole('button', { name: 'MARKUP SNAP', exact: true }).click();
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await beams(page);

  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('detail-name').fill('Beam material');
  await page.getByTestId('cond-column').selectOption({ label: 'Member Size' });
  await page.getByTestId('cond-value').selectOption('W24X55');
  // Clip angles × 4 (counted), a top angle the full length, studs @ 2'-0" OC.
  await page.getByTestId('item-subject').fill('L');
  await page.getByTestId('item-size').fill('L4X4X3/8');
  await page.getByTestId('item-length').fill(`0'-11 1/2"`);
  await page.getByTestId('item-rule').selectOption('each');
  await page.getByTestId('item-value').fill('4');
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(1).fill('L');
  await page.getByTestId('item-size').nth(1).fill('L3X3X1/4');
  await page.getByTestId('item-rule').nth(1).selectOption('full');
  await page.getByTestId('item-value').nth(1).fill('1');
  await page.getByTestId('add-item').click();
  await page.getByTestId('item-subject').nth(2).fill('Shear Stud');
  await page.getByTestId('item-size').nth(2).fill('3/4" stud');
  await page.getByTestId('item-rule').nth(2).selectOption('spacing');
  await page.getByTestId('item-value').nth(2).fill('24');
  await page.getByTestId('details-save').click();

  const marks = page.getByTestId('detail-mark');
  await expect(marks).toHaveCount(6);
  const beamGroups = page.locator('.markups g.mk-length');
  await expect(beamGroups).toHaveCount(2);
  await page.screenshot({ path: 'test-results/detail-marks-0.png' });

  for (let b = 0; b < 2; b++) {
    // The beam's line: after its wide hit stroke.
    const beam = await pathPoints(beamGroups.nth(b).locator('path').nth(1));
    const id = await beamGroups.nth(b).getAttribute('data-mid');
    const mine = page.locator(`[data-testid=detail-mark][data-mid="${id}"]`);
    await expect(mine).toHaveCount(3);

    // Full length: a line as long as the beam, the same way, a little to the side.
    const line = await pathPoints(mine.filter({ has: page.locator('path:not(.mk-hit):not(.mk-count)') }).locator('path:not(.mk-hit)').first());
    expect(Math.abs(len(line) - len(beam))).toBeLessThan(0.5);
    expect(Math.abs(dir(line) - dir(beam))).toBeLessThan(1e-3);
    const nx = -(beam[1].y - beam[0].y) / len(beam);
    const ny = (beam[1].x - beam[0].x) / len(beam);
    const off = Math.abs((line[0].x - beam[0].x) * nx + (line[0].y - beam[0].y) * ny);
    expect(off).toBeGreaterThan(2);
    expect(off).toBeLessThan(12);
    await expect(mine.filter({ hasText: 'L3X3X1/4' })).toHaveCount(1);

    // × 4: one count mark with the number, by the beam's label.
    const count = mine.filter({ hasText: '4 × L4X4X3/8' });
    await expect(count).toHaveCount(1);
    const label = await page.locator(`.markups g[data-mid="${id}"] .mk-label`).boundingBox();
    const mark = await count.locator('.mk-count').boundingBox();
    expect(label && mark).toBeTruthy();
    const gapX = mark!.x - (label!.x + label!.width);
    const gapY = Math.abs(mark!.y + mark!.height / 2 - (label!.y + label!.height / 2));
    // After the label (along it), within a line of it.
    if (b === 0) {
      expect(gapX).toBeGreaterThan(-4);
      expect(gapX).toBeLessThan(30);
      expect(gapY).toBeLessThan(label!.height);
    }

    // @ 2'-0" OC (with the end one): 13 studs along 23'-0", 10 along 18'-0", drawn along the beam.
    const n = b === 0 ? 13 : 10;
    const studs = mine.filter({ hasText: `${n} × 3/4" stud @ 2'-0"` });
    await expect(studs).toHaveCount(1);
    const at = await pathPoints(studs.locator('.mk-count'));
    expect(at.length).toBeGreaterThanOrEqual(n);
  }

  // Hover shows the material; clicking it picks the beam.
  const countMark = marks.filter({ hasText: '4 × L4X4X3/8' }).first();
  const owner = await countMark.getAttribute('data-mid');
  const count = countMark.locator('.mk-count');
  const box = (await count.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.hover-tip')).toContainText('Beam material');
  await expect(page.locator('.hover-tip')).toContainText(`4 EA × 0'-11 1/2"`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-testid=markup-row].sel')).toHaveCount(1);
  await expect(page.locator('[data-testid=markup-row].sel')).toHaveAttribute('data-mid', owner!);

  // Moving the beam takes its material with it.
  const before = await pathPoints(marks.first().locator('path:not(.mk-hit)').first());
  const start = await toScreen(page, (gx(0) + gx(1)) / 2, gy(1));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await pathPoints(marks.first().locator('path:not(.mk-hit)').first());
  expect(after[0].y - before[0].y).toBeGreaterThan(10);

  await page.screenshot({ path: 'test-results/detail-marks.png' });

  // Settings → Detail Marks: each shape's look. L lines become wide, dashed and blue; L count marks a
  // big star without the text.
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Detail Marks…' }).click();
  const L = page.locator('[data-testid=detail-style][data-shape="L"]');
  await L.getByTestId('ds-line-style').selectOption('dashed');
  await L.getByTestId('ds-line-width').fill('6');
  await L.getByTestId('ds-line-color').evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, '#0055ff');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await L.getByTestId('ds-count-symbol').selectOption('star');
  await L.getByTestId('ds-count-size').fill('10');
  await L.getByTestId('ds-count-label').uncheck();
  // The window can be moved out of the way, and doesn't dim the drawing.
  const win = page.getByTestId('modal');
  const head = win.locator('.modal-head');
  const hb = (await head.boundingBox())!;
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 260, hb.y + 300, { steps: 8 });
  await page.mouse.up();
  const moved = (await head.boundingBox())!;
  expect(moved.x - hb.x).toBeGreaterThan(150);
  expect(moved.y - hb.y).toBeGreaterThan(250);
  expect(await page.locator('.modal-back').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await win.getByRole('button', { name: 'Close' }).first().click();

  const angle = marks.filter({ hasText: 'L3X3X1/4' }).first().locator('path:not(.mk-hit)').first();
  await expect(angle).toHaveCSS('stroke', 'rgb(0, 85, 255)');
  expect(await angle.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
  await expect(marks.filter({ hasText: '4 × L4X4X3/8' })).toHaveCount(0);
  const star = page.locator('[data-testid=detail-mark].mk-detail-count .mk-count').first();
  expect(await star.getAttribute('d')).toMatch(/(L[^L]*){9}/); // a star: ten points

  // Settings: hide the material on the drawing.
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.locator('.menu-item', { hasText: 'Standard Detail Material on Drawing' }).click();
  await expect(marks).toHaveCount(0);
});
