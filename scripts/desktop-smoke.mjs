// Smoke test for the desktop app: launches Electron on the built dist/ and checks the things that
// differ from the web version (app:// origin, PDF worker, native save, report window, files
// passed on the command line, Terms of Service). Run after `npm run build`:
//   node scripts/desktop-smoke.mjs [screenshot-dir]
// On Linux without a display, wrap it in xvfb-run.
import { _electron as electron } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
const samplePdf = join(root, 'public', 'samples', 'Sample-Structural-Set.pdf');
const addendumPdf = join(root, 'public', 'samples', 'Sample-S1.02-Addendum-2.pdf');

/**
 * A short-lived Pro license for the Pro checks, when the signing key is here (license/ on a developer's
 * computer, the LICENSE_PRIVATE_KEY secret in CI); released builds trust no other key.
 */
function proLicense(computers) {
  if (!process.env.LICENSE_PRIVATE_KEY && !existsSync(join(root, 'license', 'private-key.jwk.json'))) return null;
  const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const args = ['issue', '--tier', 'pro', '--name', 'Desktop smoke test', '--expires', tomorrow, ...(computers ? ['--computers', computers] : [])];
  return execFileSync(process.execPath, [join(root, 'scripts', 'license.mjs'), ...args], { encoding: 'utf8' }).trim();
}

/** A well-formed Pro license signed by a key nobody trusts: the program must refuse it. */
async function forgedLicense() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const b64 = (b) => Buffer.from(b).toString('base64url');
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, product: 'takeoff-studio', tier: 'pro', name: 'Forged', issued: '2026-01-01', id: 'x' }));
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, payload);
  return `BSTS1.${b64(payload)}.${b64(new Uint8Array(sig))}`;
}

// Where the first run saves the sample set (with its takeoff inside); later runs open it again.
const savedPdf = join(mkdtempSync(join(os.tmpdir(), 'takeoff-saved-')), 'Saved Set.pdf');

/** A rectangle markup on the sheet showing. */
async function drawBox(win, dx = 0) {
  await win.keyboard.press('r');
  const b = await win.locator('.page').first().boundingBox();
  await win.mouse.move(b.x + b.width * 0.3 + dx, b.y + b.height * 0.3);
  await win.mouse.down();
  await win.mouse.move(b.x + b.width * 0.4 + dx, b.y + b.height * 0.45, { steps: 6 });
  await win.mouse.up();
  await win.keyboard.press('Escape');
}

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed++;
};

async function launch(extraArgs = []) {
  const userData = mkdtempSync(join(os.tmpdir(), 'takeoff-smoke-'));
  const app = await electron.launch({ cwd: root, args: [root, `--user-data-dir=${userData}`, ...extraArgs] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  return { app, win, errors, userData };
}

// 1. Fresh start: start screen, bridge, sample set, terms, native save, report window.
{
  const { app, win, errors, userData } = await launch();
  check(win.url().startsWith('app://takeoff-studio/'), `served from app:// (${win.url()})`);
  check((await win.title()) === 'BuildSuite Takeoff Studio', 'window title');
  check(await win.evaluate(() => typeof window.buildsuite?.saveFile === 'function'), 'desktop bridge exposed');
  check(await win.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined'), 'no Node.js in the renderer');

  await win.getByTestId('open-sample').click();
  await win.waitForSelector('.pane canvas', { timeout: 30000 });
  const opened = await win
    .waitForFunction(() => document.body.innerText.includes('Sheets (7)'), null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(opened, 'sample drawing set opened (PDF worker running)');
  if (shots) await win.screenshot({ path: join(shots, 'desktop-main.png') });

  // License: a new install is a week's Basic trial; a forged key is refused (the check runs on app://).
  check((await win.getByTestId('license-badge').textContent()) === 'Trial · 7d', 'a new install starts a 7-day Basic trial');
  await win.getByTestId('license-badge').click();
  await win.getByTestId('license-key').fill(await forgedLicense());
  await win.getByTestId('license-activate').click();
  const refused = await win
    .getByTestId('license-error')
    .filter({ hasText: 'not genuine' })
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check(refused, 'a forged license key is refused');
  // This computer's ID comes from the operating system (the same on every start).
  await win.getByTestId('license-computer-id').filter({ hasText: /-/ }).waitFor({ timeout: 5000 }).catch(() => undefined);
  const computer = (await win.getByTestId('license-computer-id').textContent())?.trim() ?? '';
  check(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(computer), `this computer has a computer ID (${computer})`);
  const pro = proLicense(computer);
  if (pro) {
    // A license for another computer doesn't work here; one for this computer does.
    await win.getByTestId('license-key').fill(proLicense('ZZZZ-ZZZZ-ZZZZ-ZZZZ'));
    await win.getByTestId('license-activate').click();
    const elsewhere = await win
      .getByTestId('license-error')
      .filter({ hasText: 'another computer' })
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check(elsewhere, 'a license for another computer is refused');
    await win.getByTestId('license-key').fill(pro);
    await win.getByTestId('license-activate').click();
    await win.getByTestId('license-name').waitFor({ timeout: 10000 }).catch(() => undefined);
    check((await win.getByTestId('license-badge').textContent()) === 'Pro', 'a Pro license for this computer activates Pro');
  } else console.log('SKIP  Pro checks: no license signing key (license/private-key.jwk.json or LICENSE_PRIVATE_KEY)');
  await win.keyboard.press('Escape');

  await win.getByText('Help', { exact: true }).click();
  await win.getByText('Terms of Service', { exact: true }).click();
  await win.getByTestId('terms').waitFor();
  check((await win.locator('.legal h3').count()) >= 19, 'Terms of Service dialog shows all sections');
  if (shots) await win.screenshot({ path: join(shots, 'desktop-terms.png') });
  await win.keyboard.press('Escape');

  // Save: the takeoff goes into the PDF. The sample came from the app, not a file, so Save asks where.
  await drawBox(win);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, savedPdf);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(2000);
  const takeoff = existsSync(savedPdf)
    ? await pdfjs
        .getDocument({ data: new Uint8Array(readFileSync(savedPdf)), verbosity: 0 })
        .promise.then((d) => d.getAttachments())
        .then((a) => JSON.parse(new TextDecoder().decode(a['BuildSuite-Takeoff.json'].content)))
        .catch(() => null)
    : null;
  check(takeoff?.doc?.markups?.length === 1 && takeoff.doc.sheets.length === 7, 'Save writes the takeoff into the PDF through the native Save dialog');
  check((await win.getByTestId('doc-tab').first().textContent()) === 'Saved Set', `the tab takes the saved file's name (${await win.getByTestId('doc-tab').first().textContent()})`);

  const reportOpened = app.waitForEvent('window');
  await win.evaluate(() => window.buildsuite.openReport('<!doctype html><title>Takeoff Summary Report</title><h1>Report</h1>'));
  const report = await reportOpened;
  await report.waitForLoadState('domcontentloaded');
  check((await report.locator('h1').textContent()) === 'Report', 'summary report opens in its own window');

  // Overlay compare: S1.01 over S1.02, auto-aligned, drawn as two tinted layers.
  await win.getByTestId('sheet-thumb').nth(2).click();
  await win.getByTestId('tb-compare').click();
  await win.getByTestId('compare-start').click();
  await win.getByTestId('compare-ok').click();
  const aligned = await win
    .getByTestId('compare-status')
    .filter({ hasText: /Auto-aligned/ })
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(aligned && (await win.getByTestId('overlay-b').count()) === 1, 'overlay compare renders and auto-aligns');
  if (shots) await win.screenshot({ path: join(shots, 'desktop-overlay.png') });
  await win.getByTestId('compare-remove').click();

  // Automatic takeoff (Pro): the labelled beams and tubing on S1.02 are found from the PDF's line work.
  await win.getByTestId('tb-auto').click();
  if (pro) {
    await win.getByTestId('auto-find').click();
    const found = await win
      .getByTestId('auto-status')
      .filter({ hasText: '50 members in 5 sizes' })
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    check(found && (await win.getByTestId('auto-member').count()) === 50, 'automatic takeoff finds the labelled beams and tubing');
    if (shots) await win.screenshot({ path: join(shots, 'desktop-auto-takeoff.png') });
    await win.getByTestId('auto-clear').click();
  } else {
    check(await win.getByTestId('license-upsell').isVisible(), 'without Pro, Auto opens the license window');
    await win.keyboard.press('Escape');
  }

  // Settings & Preferences from the Settings menu.
  await win.locator('.menu-btn', { hasText: /^Settings$/ }).click();
  await win.locator('.dropdown .menu-item', { hasText: 'Auto Takeoff Line Styles' }).click();
  check((await win.getByTestId('style-rule').count()) === 6, 'Settings menu opens settings with the auto takeoff line styles');
  // Text and icon size: the window itself zooms (not the page's styles), and back to normal.
  const dpr0 = await win.evaluate(() => window.devicePixelRatio);
  const zoomedTo = (k) =>
    win
      .waitForFunction(([d, f]) => Math.abs(window.devicePixelRatio - d * f) < 0.02, [dpr0, k], { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  await win.getByTestId('set-tab-general').click();
  await win.getByTestId('set-ui-scale').selectOption('1.25');
  check((await zoomedTo(1.25)) && (await win.evaluate(() => document.documentElement.style.zoom)) === '', 'text and icon size zooms the desktop window to 125%');
  await win.getByTestId('set-ui-scale-reset').click();
  check(await zoomedTo(1), 'and back to 100%');
  await win.getByTestId('settings-done').click();

  // Split the view and detach a pane into its own desktop window.
  await win.getByTestId('split-vertical').click();
  const paneOpened = app.waitForEvent('window');
  await win.getByTestId('pane-detach').nth(1).click();
  const paneWin = await paneOpened;
  const paneRendered = await paneWin
    .waitForSelector('.pane canvas', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check(paneRendered && (await win.getByTestId('pane').count()) === 1, 'a split pane detaches into its own window');
  if (shots) await paneWin.screenshot({ path: join(shots, 'desktop-detached-pane.png') });
  const paneTitle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getTitle()));
  check(paneTitle.some((t) => t.includes('BuildSuite Takeoff Studio') && t.includes('–')), `detached window is titled (${paneTitle.join(' | ')})`);

  check(errors.length === 0, `no renderer errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await app.close();
}

// 2. "Open with": PDFs passed on the command line open at launch, each in its own document tab.
{
  const { app, win } = await launch([samplePdf, addendumPdf]);
  await win.waitForSelector('.pane canvas', { timeout: 30000 });
  await win.waitForTimeout(500);
  const name = await win.locator('.project-name').textContent();
  check(name === 'Sample-S1.02-Addendum-2', `PDFs given on the command line open on launch, the last one showing (${name})`);
  const tabs = await win.getByTestId('doc-tab').allTextContents();
  check(tabs.length === 2, `each PDF opens in its own document tab (${tabs.join(' | ')})`);
  const activeTab = () => win.locator('[data-testid=doc-tab][aria-selected=true]').textContent();
  const before = await activeTab();
  await win.keyboard.press('Control+Tab');
  await win.waitForTimeout(300);
  const after = await activeTab();
  check(!!before && !!after && before !== after, `Ctrl+Tab switches document tabs (${before} → ${after})`);
  await app.close();
}

// 3. A PDF saved with its takeoff: the takeoff comes back, and Save writes to the same file.
{
  const { app, win } = await launch([savedPdf]);
  await win.waitForSelector('.pane canvas', { timeout: 30000 });
  await win.getByTestId('markup-row').first().waitFor({ timeout: 15000 }).catch(() => {});
  check((await win.getByTestId('markup-row').count()) === 1, 'opening the saved PDF brings its takeoff back');
  await drawBox(win, 120);
  await app.evaluate(({ dialog }) => {
    globalThis.__askedWhere = false;
    dialog.showSaveDialog = async () => ((globalThis.__askedWhere = true), { canceled: true });
  });
  const before = statSync(savedPdf).mtimeMs;
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(2000);
  const asked = await app.evaluate(() => globalThis.__askedWhere);
  check(!asked && statSync(savedPdf).mtimeMs > before, 'Save writes back to the file it was opened from');
  await app.close();
}
{
  const { app, win } = await launch([savedPdf]);
  await win.waitForSelector('.pane canvas', { timeout: 30000 });
  await win.getByTestId('markup-row').nth(1).waitFor({ timeout: 15000 }).catch(() => {});
  check((await win.getByTestId('markup-row').count()) === 2, 'the file saved in place has both markups');
  await app.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll desktop checks passed');
process.exit(failed ? 1 : 0);
