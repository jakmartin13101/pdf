import { expect, test } from '@playwright/test';
import { calibrateFoundationPlan, clickAt, gotoSheet, gx, gy, openSample, showProperties } from './helpers';

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
  await expect(tool.getByTestId('size-box')).toHaveValue('W24X68');
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
  await expect(rows.locator('[data-col=subject]')).toHaveText(['W', 'W']);
  await expect(rows.locator('[data-col="c:member_size"]')).toHaveText(['W24X68', 'W21X44']);
  // 23'-0" at 68 and 44 plf
  await expect(rows.locator('[data-col="c:weight"]')).toHaveText(['1,564 lbs', '1,012 lbs']);

  // The size stays with the tool across sessions.
  await page.reload();
  await expect(page.getByTestId('chest-tool').filter({ hasText: 'W Beam' }).getByTestId('size-box')).toHaveValue('W21X44');
});

test('tool chest tools can be hidden and shown again', async ({ page }) => {
  await openSample(page);
  const w12 = page.getByTestId('chest-tool').filter({ hasText: 'W12X26' });
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
  await page.getByTestId('chest-tool').filter({ hasText: 'HSS6X6X3/8 Column' }).click();
  for (let i = 0; i < 3; i++) await clickAt(page, gx(i), gy(2));
  await page.keyboard.press('Escape');

  const rows = page.getByTestId('markup-row');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await showProperties(page, 'measurement');

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

  // Split as often as wanted: the active pane (the new one) splits again, side by side…
  await page.getByTestId('split-vertical').click();
  await page.getByTestId('split-vertical').click();
  await expect(panes).toHaveCount(4);
  const xs = await panes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.x), Math.round(r.width)]));
  // Four across, evenly.
  for (let i = 1; i < 4; i++) expect(xs[i][0]).toBeGreaterThan(xs[i - 1][0] + 50);
  expect(Math.max(...xs.map((x) => x[1])) - Math.min(...xs.map((x) => x[1]))).toBeLessThan(6);
  // …one above the other, and four ways.
  await page.getByTestId('split-horizontal').click();
  await expect(panes).toHaveCount(5);
  await page.getByTestId('split-grid').click();
  await expect(panes).toHaveCount(8);
  await page.screenshot({ path: 'test-results/split-many.png' });
  // Drag a divider: the panes beside it change size.
  const div = page.getByTestId('pane-divider').first();
  const db = (await div.boundingBox())!;
  const w0 = (await panes.first().boundingBox())!.width;
  await page.mouse.move(db.x + db.width / 2, db.y + 40);
  await page.mouse.down();
  await page.mouse.move(db.x + db.width / 2 + 60, db.y + 40, { steps: 5 });
  await page.mouse.up();
  expect((await panes.first().boundingBox())!.width).toBeGreaterThan(w0 + 40);
  // Panes close by hand, one at a time…
  await page.getByTestId('pane-close').last().click();
  await expect(panes).toHaveCount(7);
  // …or all but the active one.
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

test('docks split into sections: the sheets and the tool chest on the left at once', async ({ page }) => {
  await openSample(page);
  const left = page.locator('.side-panel.left');
  await expect(left.getByTestId('dock-section')).toHaveCount(1);

  // Drag the Tool Chest tab onto the lower part of the Sheets panel: a new section below it.
  const tab = page.getByTestId('tab-tool-chest');
  const t = (await tab.boundingBox())!;
  const sheets = (await left.getByTestId('dock-section').first().boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(sheets.x + sheets.width / 2, sheets.y + sheets.height * 0.9, { steps: 12 });
  await expect(page.getByTestId('drop-section')).toHaveText('New section below');
  await page.mouse.up();
  await expect(left.getByTestId('dock-section')).toHaveCount(2);
  await expect(left.getByTestId('sheet-thumb').first()).toBeVisible();
  await expect(left.getByTestId('chest-tool').first()).toBeVisible();
  await expect(page.getByTestId('dock-left').getByTestId('side-tab-group')).toHaveCount(2);

  // Drag the splitter between them: the sheets get taller, the tool chest shorter.
  const [a0, b0] = [(await left.getByTestId('dock-section').nth(0).boundingBox())!, (await left.getByTestId('dock-section').nth(1).boundingBox())!];
  const bar = (await left.locator('.dock-sections > .splitter-h').boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 80, { steps: 6 });
  await page.mouse.up();
  const [a1, b1] = [(await left.getByTestId('dock-section').nth(0).boundingBox())!, (await left.getByTestId('dock-section').nth(1).boundingBox())!];
  expect(a1.height - a0.height).toBeGreaterThan(60);
  expect(b0.height - b1.height).toBeGreaterThan(60);
  // And the dock wider.
  const edge = (await page.locator('.workspace > .splitter-v').first().boundingBox())!;
  await page.mouse.move(edge.x + 2, edge.y + 200);
  await page.mouse.down();
  await page.mouse.move(edge.x + 62, edge.y + 200, { steps: 4 });
  await page.mouse.up();
  expect((await left.boundingBox())!.width - sheets.width).toBeGreaterThan(50);

  // From the panel menu: Properties docks left (as a tab with the sheets), then splits off; Layers too.
  const show = async (tabId: string, id: string) => {
    if (!(await page.getByTestId(`dock-menu-${id}`).isVisible())) await page.getByTestId(tabId).click();
  };
  await show('tab-properties', 'properties');
  await page.getByTestId('dock-menu-properties').click();
  await page.getByText('Dock Left', { exact: true }).click();
  await page.getByTestId('dock-menu-properties').click();
  await page.getByText('Split Below (New Section)', { exact: true }).click();
  await show('tab-layers', 'layers');
  await page.getByTestId('dock-menu-layers').click();
  await page.getByText('Dock Left', { exact: true }).click();
  await page.getByTestId('dock-menu-layers').click();
  await page.getByText('Split Below (New Section)', { exact: true }).click();
  await expect(left.getByTestId('dock-section')).toHaveCount(4);
  // Split three times: no more.
  await show('tab-measurements', 'measurements');
  await page.getByTestId('dock-menu-measurements').click();
  await page.getByText('Dock Left', { exact: true }).click();
  await page.getByTestId('dock-menu-measurements').click();
  await expect(page.locator('.menu-item', { hasText: 'Split Below (New Section)' })).toHaveClass(/disabled/);
  await page.keyboard.press('Escape');

  // The bottom dock: the Takeoff Summary next to the Markups List.
  await show('tab-summary', 'summary');
  await page.getByTestId('dock-menu-summary').click();
  await page.getByText('Split Right (New Section)', { exact: true }).click();
  const bottom = page.getByTestId('dock-bottom');
  await expect(bottom.getByTestId('dock-section')).toHaveCount(2);
  await expect(bottom.getByTestId('markup-list-search').or(bottom.locator('.list-toolbar')).first()).toBeVisible();
  await expect(bottom.locator('.summary').first()).toBeVisible();

  // The layout is kept.
  await page.reload();
  await expect(page.locator('.side-panel.left').getByTestId('dock-section')).toHaveCount(4);
});
