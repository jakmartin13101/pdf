import { expect, test, type Page } from '@playwright/test';
import { openSample } from './helpers';

const SET = 'Sample-Structural-Set';
const ADDENDUM = 'Sample-S1.02-Addendum-2';

/** The sample set, then the addendum opened from File → Open PDF (a second document tab). */
async function openTwo(page: Page) {
  await openSample(page);
  await addAddendum(page);
}

async function addAddendum(page: Page) {
  await expect(page.getByTestId('doc-tab')).toHaveText([SET]);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.menu-btn', { hasText: 'File' }).click().then(() => page.getByText('Open PDF in a New Tab…').click()),
  ]);
  await chooser.setFiles('public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(8);
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
}

const tabsOf = (page: Page, pane: number) => page.getByTestId('pane').nth(pane).getByTestId('doc-tab');
const activeTab = (page: Page, pane = 0) => page.getByTestId('pane').nth(pane).locator('[data-testid=doc-tab][aria-selected=true]');

test('each open PDF gets its own tab in the active pane', async ({ page }) => {
  await openSample(page);
  // A single document in a single pane: its tab has nothing to close.
  await expect(page.getByTestId('doc-tab-close')).toHaveCount(0);

  await addAddendum(page);
  await expect(activeTab(page)).toHaveText(ADDENDUM);
  await expect(page.getByTestId('sheet-thumb').nth(7)).toHaveClass(/active/);

  // Tabs remember their sheet.
  await page.getByTestId('doc-tab').first().click();
  await expect(activeTab(page)).toHaveText(SET);
  await page.getByTestId('sheet-thumb').nth(3).click();
  await page.getByTestId('doc-tab').nth(1).click();
  await expect(page.getByTestId('sheet-thumb').nth(7)).toHaveClass(/active/);
  await page.getByTestId('doc-tab').first().click();
  await expect(page.getByTestId('sheet-thumb').nth(3)).toHaveClass(/active/);

  // Next and previous tab from the keyboard.
  await page.keyboard.press('Control+Shift+BracketRight');
  await expect(activeTab(page)).toHaveText(ADDENDUM);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(activeTab(page)).toHaveText(SET);

  // Closing a tab keeps the document in the project; the + menu (or its sheets) open it again.
  await page.getByTestId('doc-tab-close').nth(1).click();
  await expect(page.getByTestId('doc-tab')).toHaveText([SET]);
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(8);
  await page.getByTestId('doc-tab-add').click();
  await page.locator('.context-menu').getByRole('menuitem', { name: ADDENDUM }).click();
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page)).toHaveText(ADDENDUM);

  await page.getByTestId('doc-tab-close').nth(1).click();
  await page.getByTestId('sheet-thumb').nth(7).click();
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page)).toHaveText(ADDENDUM);
});

test('tabs move between panes by dragging or from their menu', async ({ page }) => {
  await openTwo(page);

  // Move the addendum into a new pane of its own.
  await page.getByTestId('doc-tab').nth(1).click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Move to New Pane' }).click();
  await expect(page.getByTestId('pane')).toHaveCount(2);
  await expect(tabsOf(page, 0)).toHaveText([SET]);
  await expect(tabsOf(page, 1)).toHaveText([ADDENDUM]);
  await expect(page.getByTestId('pane').nth(1).locator('.pane-head.active')).toHaveCount(1);

  // Drag the set's tab onto the drawing of pane 2: it moves there, and pane 1 (now empty) closes.
  await tabsOf(page, 0).first().dragTo(page.getByTestId('pane').nth(1).locator('.viewer'));
  await expect(page.getByTestId('pane')).toHaveCount(1);
  await expect(page.getByTestId('doc-tab')).toHaveText([ADDENDUM, SET]);
  await expect(activeTab(page)).toHaveText(SET);

  // Drag a tab to the front of the strip: tabs reorder.
  const first = page.getByTestId('doc-tab').first();
  await page.getByTestId('doc-tab').nth(1).dragTo(first, { targetPosition: { x: 4, y: 8 } });
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);

  // Split: the new pane shows the current document; show the other one there too (both panes keep it).
  await page.getByTestId('doc-tab').first().click();
  await page.locator('.menu-btn', { hasText: 'Window' }).click();
  await page.getByRole('menuitem', { name: 'Split Vertical', exact: true }).click();
  await expect(page.getByTestId('pane')).toHaveCount(2);
  await expect(tabsOf(page, 1)).toHaveText([SET]);
  await tabsOf(page, 0).nth(1).click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Also Show in Pane' }).hover();
  await page.locator('.context-menu .submenu').getByRole('menuitem', { name: 'Pane 2' }).click();
  await expect(tabsOf(page, 0)).toHaveText([SET, ADDENDUM]);
  await expect(tabsOf(page, 1)).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page, 1)).toHaveText(ADDENDUM);

  // Drag a tab onto another pane's tab strip, before its first tab.
  await page.getByTestId('pane').nth(0).getByTestId('doc-tab-close').nth(1).click();
  await expect(tabsOf(page, 0)).toHaveText([SET]);
  await tabsOf(page, 1).nth(1).dragTo(tabsOf(page, 0).first(), { targetPosition: { x: 4, y: 8 } });
  await expect(tabsOf(page, 0)).toHaveText([ADDENDUM, SET]);
  await expect(tabsOf(page, 1)).toHaveText([SET]);
  await expect(activeTab(page, 0)).toHaveText(ADDENDUM);
  await expect(page.getByTestId('pane').nth(0).locator('.pane-head.active')).toHaveCount(1);
});

test('a tab can move to its own window', async ({ page }) => {
  await openTwo(page);
  await page.getByTestId('doc-tab').nth(1).click({ button: 'right' });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.context-menu').getByRole('menuitem', { name: 'Move to New Window' }).click(),
  ]);
  await popup.waitForSelector('.pane canvas');
  await expect(popup.getByTestId('doc-tab')).toHaveText([ADDENDUM]);
  await expect(page.getByTestId('pane')).toHaveCount(1);
  await expect(page.getByTestId('doc-tab')).toHaveText([SET]);
});
