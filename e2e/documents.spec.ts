import { expect, test, type Page } from '@playwright/test';
import { dragFrom, gotoSheet, openSample } from './helpers';

const SET = 'Sample-Structural-Set';
const ADDENDUM = 'Sample-S1.02-Addendum-2';

/** File → Open PDF…: the PDF opens as its own document, in a new tab. */
async function openPdf(page: Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.menu-btn', { hasText: 'File' }).click().then(() => page.locator('.dropdown .menu-item', { hasText: 'Open PDF…' }).click()),
  ]);
  await chooser.setFiles(file);
}

async function openTwo(page: Page) {
  await openSample(page);
  await openPdf(page, 'public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
}

const tabsOf = (page: Page, pane: number) => page.getByTestId('pane').nth(pane).getByTestId('doc-tab');
const activeTab = (page: Page, pane = 0) => page.getByTestId('pane').nth(pane).locator('[data-testid=doc-tab][aria-selected=true]');
const rows = (page: Page) => page.getByTestId('markup-row');

/** A rectangle markup on the sheet showing. */
async function drawBox(page: Page, at = 0) {
  await page.keyboard.press('r');
  await dragFrom(page, [900 + at, 700], [1200 + at, 900]);
  await page.keyboard.press('Escape');
}

test('each PDF is its own document: its own sheets, markups and undo', async ({ page }) => {
  await openTwo(page);
  await expect(activeTab(page)).toHaveText(ADDENDUM);
  // The Sheets panel lists the active document's sheets only.
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(1);
  await drawBox(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('doc-tab').nth(1).getByTestId('doc-tab-unsaved')).toHaveCount(1);
  await expect(page.getByTestId('doc-tab').nth(0).getByTestId('doc-tab-unsaved')).toHaveCount(0);

  // The set has none of the addendum's markups, and undo there leaves the addendum alone.
  await page.getByTestId('doc-tab').first().click();
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(7);
  await expect(rows(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await page.getByTestId('doc-tab').nth(1).click();
  await expect(rows(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(rows(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(rows(page)).toHaveCount(1);

  // Tabs remember their sheet; next and previous tab from the keyboard.
  await page.getByTestId('doc-tab').first().click();
  await gotoSheet(page, 3);
  await page.keyboard.press('Control+Shift+BracketRight');
  await expect(activeTab(page)).toHaveText(ADDENDUM);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(activeTab(page)).toHaveText(SET);
  await expect(page.getByTestId('sheet-thumb').nth(3)).toHaveClass(/active/);

  // Opening a file that is already open shows its tab.
  await openPdf(page, 'public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page)).toHaveText(ADDENDUM);
});

test('the takeoff is saved inside the PDF and comes back when it is opened again', async ({ page }, info) => {
  await openSample(page);
  await gotoSheet(page, 2);
  await drawBox(page);
  await expect(rows(page)).toHaveCount(1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  expect(download.suggestedFilename()).toBe(`${SET}.pdf`);
  const saved = info.outputPath(`${SET}.pdf`);
  await download.saveAs(saved);
  await expect(page.getByTestId('doc-tab-unsaved')).toHaveCount(0);

  // Saved: closing asks nothing.
  await page.getByTestId('doc-tab-close').click();
  await expect(page.getByTestId('open-sample')).toBeVisible();

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('open-pdf').click()]);
  await chooser.setFiles(saved);
  await expect(page.getByTestId('doc-tab')).toHaveText([SET]);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-col=page]')).toHaveText('S1.02');
  await expect(page.getByTestId('sheet-thumb').nth(2)).toHaveClass(/active/);

  // Unsaved changes: closing asks first.
  await drawBox(page, 400);
  await expect(page.getByTestId('doc-tab-unsaved')).toHaveCount(1);
  await page.getByTestId('doc-tab-close').click();
  await expect(page.getByTestId('unsaved-message')).toContainText(`${SET}.pdf`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId('doc-tab-close').click();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.getByTestId('open-sample')).toBeVisible();
});

test('standard details belong to the file they were made in', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('btn-details').click();
  await page.getByTestId('detail-new').click();
  await page.getByTestId('detail-name').fill('Set only');
  await page.getByTestId('detail-auto').uncheck();
  await page.getByTestId('item-subject').fill('Clip Angle');
  await page.getByTestId('details-save').click();
  await page.getByTestId('btn-details').click();
  await expect(page.getByTestId('detail-entry')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await openPdf(page, 'public/samples/Sample-S1.02-Addendum-2.pdf');
  await page.getByTestId('btn-details').click();
  await expect(page.getByTestId('detail-entry')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByTestId('doc-tab').first().click();
  await page.getByTestId('btn-details').click();
  await expect(page.getByTestId('detail-entry')).toHaveText([/Set only/]);
});

test('the Markups List layout is saved as the default, exported and imported', async ({ page }, info) => {
  await openSample(page);
  const headers = () => page.getByTestId('list-header');
  const header = (id: string) => page.locator(`[data-testid=list-header][data-col=${id}]`);

  // Rename a header, move a column by dragging its header, hide one from the header menu.
  await header('length').locator('.th-name').dblclick();
  await page.getByTestId('list-header-rename').fill('LF');
  await page.getByTestId('list-header-rename').press('Enter');
  await expect(header('length')).toContainText('LF');
  await header('count').dragTo(header('subject'), { targetPosition: { x: 4, y: 8 } });
  await expect(headers().first()).toHaveAttribute('data-col', 'count');
  await header('type').click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Hide Column' }).click();
  await expect(header('type')).toHaveCount(0);

  // Save it as the default: a file opened from now on starts with it.
  await page.getByTestId('btn-list-style').click();
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Save as Default Style' }).click();
  await openPdf(page, 'public/samples/Sample-S1.02-Addendum-2.pdf');
  await expect(headers().first()).toHaveAttribute('data-col', 'count');
  await expect(header('length')).toContainText('LF');
  await expect(header('type')).toHaveCount(0);

  // Export it (a backup), go back to the built-in layout here, then import it again.
  await page.getByTestId('btn-list-style').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.context-menu').getByRole('menuitem', { name: 'Export This Style…' }).click()]);
  const file = info.outputPath('style.json');
  await download.saveAs(file);
  await page.getByTestId('btn-list-style').click();
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Reset to Built-in Style' }).click();
  await expect(header('length')).toContainText('Length');
  await expect(header('type')).toHaveCount(1);
  // Each file has its own layout: the set keeps its own.
  await page.getByTestId('doc-tab').first().click();
  await expect(header('length')).toContainText('LF');
  await page.getByTestId('doc-tab').nth(1).click();
  await page.getByTestId('btn-list-style').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.context-menu').getByRole('menuitem', { name: 'Import Style…' }).click()]);
  await chooser.setFiles(file);
  await expect(header('length')).toContainText('LF');
  await expect(header('type')).toHaveCount(0);
  await expect(headers().first()).toHaveAttribute('data-col', 'count');
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
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(1); // the active pane's document

  // Drag the set's tab onto the drawing of pane 2: it moves there, and pane 1 (now empty) closes.
  await tabsOf(page, 0).first().dragTo(page.getByTestId('pane').nth(1).locator('.viewer'));
  await expect(page.getByTestId('pane')).toHaveCount(1);
  await expect(page.getByTestId('doc-tab')).toHaveText([ADDENDUM, SET]);
  await expect(activeTab(page)).toHaveText(SET);

  // Drag a tab to the front of the strip: tabs reorder.
  await page.getByTestId('doc-tab').nth(1).dragTo(page.getByTestId('doc-tab').first(), { targetPosition: { x: 4, y: 8 } });
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);

  // Split: the new pane shows the current document; its + menu shows the other one there too.
  await page.getByTestId('doc-tab').first().click();
  await page.locator('.menu-btn', { hasText: 'Window' }).click();
  await page.getByRole('menuitem', { name: 'Split Vertical', exact: true }).click();
  await expect(tabsOf(page, 1)).toHaveText([SET]);
  await page.getByTestId('pane').nth(1).getByTestId('doc-tab-add').click();
  await page.locator('.context-menu').getByRole('menuitem', { name: `Show ${ADDENDUM} Here` }).click();
  await expect(tabsOf(page, 1)).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page, 1)).toHaveText(ADDENDUM);

  // Closing a tab of a document shown in another pane only takes it out of this pane.
  await page.getByTestId('pane').nth(0).getByTestId('doc-tab-close').nth(1).click();
  await expect(tabsOf(page, 0)).toHaveText([SET]);
  // Drag a tab onto another pane's tab strip, before its first tab.
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

test('open documents come back after a reload, unsaved changes and all', async ({ page }) => {
  await openTwo(page);
  await drawBox(page);
  await expect(rows(page)).toHaveCount(1);
  await page.waitForTimeout(1500); // autosave
  await page.reload();
  await expect(page.getByTestId('doc-tab')).toHaveText([SET, ADDENDUM]);
  await expect(activeTab(page)).toHaveText(ADDENDUM);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('doc-tab').nth(1).getByTestId('doc-tab-unsaved')).toHaveCount(1);
  await page.getByTestId('doc-tab').first().click();
  await expect(page.getByTestId('sheet-thumb')).toHaveCount(7);
  await expect(rows(page)).toHaveCount(0);
});
