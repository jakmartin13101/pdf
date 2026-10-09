import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample } from './helpers';

test('size tool keeps its typed size as the label until it is changed', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);

  await page.getByTestId('btn-shape-tool').click();
  await page.getByTestId('shape-size').fill('24 x 68');
  await page.getByTestId('shape-name').fill('W Beam');
  await page.getByTestId('shape-font').selectOption('Times');
  await page.getByTestId('shape-tool-save').click();

  const tool = page.getByTestId('chest-tool').filter({ hasText: 'W Beam' });
  await expect(tool.getByTestId('size-box')).toHaveValue('W24x68');
  await tool.click();
  await clickAt(page, gx(0) + 9, gy(0));
  await clickAt(page, gx(1) - 9, gy(0));
  await page.keyboard.press('Escape');

  // Type a new size; Enter starts the tool with it.
  await tool.getByTestId('size-box').fill('w21x44');
  await tool.getByTestId('size-box').press('Enter');
  await clickAt(page, gx(1) + 9, gy(0));
  await clickAt(page, gx(2) - 9, gy(0));
  await page.keyboard.press('Escape');

  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('[data-col=subject]')).toHaveText(['W24x68', 'W21x44']);
  await expect(rows.locator('[data-col="c:member_size"]')).toHaveText(['W24x68', 'W21x44']);
  // 23'-0" at 68 and 44 plf
  await expect(rows.locator('[data-col="c:weight"]')).toHaveText(['1,564 lbs', '1,012 lbs']);

  // The size stays with the tool across sessions.
  await page.reload();
  await expect(page.getByTestId('chest-tool').filter({ hasText: 'W Beam' }).getByTestId('size-box')).toHaveValue('W21x44');
});

test('tool chest tools can be hidden and shown again', async ({ page }) => {
  await openSample(page);
  const w12 = page.getByTestId('chest-tool').filter({ hasText: 'W12x26' });
  await expect(w12).toHaveCount(1);
  await w12.click({ button: 'right' });
  await page.getByText('Hide Tool', { exact: true }).click();
  await expect(w12).toHaveCount(0);

  await page.getByTestId('btn-show-hidden').click();
  await expect(w12).toHaveCount(1);
  await expect(w12).toHaveClass(/is-hidden/);
  await w12.getByTestId('tool-visibility').click();
  await expect(w12).not.toHaveClass(/is-hidden/);
  await page.getByTestId('btn-show-hidden').click();
  await expect(w12).toHaveCount(1);
});

test('count markups take a manual quantity, resume counting and split', async ({ page }) => {
  await openSample(page);
  await calibrateFoundationPlan(page);
  await gotoSheet(page, 2);
  await page.getByTestId('chest-tool').filter({ hasText: 'HSS6x6x3/8 Column' }).click();
  for (let i = 0; i < 3; i++) await clickAt(page, gx(i), gy(2));
  await page.keyboard.press('Escape');

  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await page.getByTestId('tab-properties').click();

  await page.getByTestId('prop-count-override').fill('10');
  await page.getByTestId('prop-count-override').press('Enter');
  await expect(rows.first().locator('[data-col=count]')).toHaveText('10*');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows.first().locator('[data-col=count]')).toHaveText('3');

  await page.getByTestId('btn-resume-count').click();
  await page.getByTestId('tb-fit-page').click(); // selecting the row zoomed in on the markup
  await clickAt(page, gx(3), gy(2));
  await clickAt(page, gx(4), gy(2));
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('[data-col=count]')).toHaveText('5');

  await rows.first().click();
  await page.getByTestId('btn-split-all').click();
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('[data-col=count]')).toHaveText(['1', '1', '1', '1', '1']);
});

test('document splits into panes that show different sheets', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('split-vertical').click();
  const panes = page.getByTestId('pane');
  await expect(panes).toHaveCount(2);
  await page.getByTestId('pane-sheet').nth(1).selectOption({ label: 'S1.02 – Roof Framing Plan' });
  await expect(page.getByTestId('pane-sheet').nth(0).locator('option:checked')).toHaveText('G0.01 – Cover Sheet');
  await expect(page.getByTestId('pane-sheet').nth(1).locator('option:checked')).toHaveText('S1.02 – Roof Framing Plan');
  await expect(panes.nth(1).locator('canvas').first()).toBeVisible();

  await page.getByTestId('split-grid').click();
  await expect(panes).toHaveCount(4);
  await page.getByTestId('split-horizontal').click();
  await expect(panes).toHaveCount(2);
  await page.getByTestId('split-single').click();
  await expect(panes).toHaveCount(1);
});

test('panels float, dock to another side and the layout can be locked', async ({ page }) => {
  await openSample(page);
  // Drag the Tool Chest tab into the middle of the drawing: it becomes a floating window.
  const tab = page.getByTestId('tab-tool-chest');
  const box = (await tab.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 450, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('float-toolchest')).toBeVisible();

  // Dock it on the left from its menu.
  await page.getByTestId('dock-menu-toolchest').click();
  await page.getByText('Dock Left', { exact: true }).click();
  await expect(page.getByTestId('float-toolchest')).toHaveCount(0);
  await expect(page.locator('.side-panel.left').getByTestId('toolchest')).toBeVisible();

  // Toolbar to the right side.
  await page.getByTestId('dock-menu-toolbar').click();
  await page.getByText('Dock Right', { exact: true }).click();
  await expect(page.locator('.toolbar.vertical')).toBeVisible();

  // Locked layouts refuse to move panels.
  await page.getByTestId('dock-menu-toolbar').click();
  await page.getByText('Lock Workspace Layout', { exact: true }).click();
  await expect(page.locator('.app.layout-locked')).toHaveCount(1);
  await page.getByTestId('dock-menu-toolchest').click();
  await expect(page.locator('.menu-item', { hasText: /^Float$/ })).toHaveClass(/disabled/);
});
