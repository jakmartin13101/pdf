// Smoke test for the desktop app: launches Electron on the built dist/ and checks the things that
// differ from the web version (app:// origin, PDF worker, native save, report window, files
// passed on the command line, Terms of Service). Run after `npm run build`:
//   node scripts/desktop-smoke.mjs [screenshot-dir]
// On Linux without a display, wrap it in xvfb-run.
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
const samplePdf = join(root, 'public', 'samples', 'Sample-Structural-Set.pdf');

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

  await win.getByText('Help', { exact: true }).click();
  await win.getByText('Terms of Service', { exact: true }).click();
  await win.getByTestId('terms').waitFor();
  check((await win.locator('.legal h3').count()) >= 19, 'Terms of Service dialog shows all sections');
  if (shots) await win.screenshot({ path: join(shots, 'desktop-terms.png') });
  await win.keyboard.press('Escape');

  const target = join(userData, 'Saved Project.takeoff.json');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(1500);
  check(existsSync(target) && JSON.parse(readFileSync(target, 'utf8')).app === 'takeoff-studio', 'Save Project writes through the native Save dialog');

  const reportOpened = app.waitForEvent('window');
  await win.evaluate(() => window.buildsuite.openReport('<!doctype html><title>Takeoff Summary Report</title><h1>Report</h1>'));
  const report = await reportOpened;
  await report.waitForLoadState('domcontentloaded');
  check((await report.locator('h1').textContent()) === 'Report', 'summary report opens in its own window');

  check(errors.length === 0, `no renderer errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await app.close();
}

// 2. "Open with": a PDF passed on the command line opens at launch.
{
  const { app, win } = await launch([samplePdf]);
  await win.waitForSelector('.pane canvas', { timeout: 30000 });
  await win.waitForTimeout(500);
  const name = await win.locator('.project-name').textContent();
  check(name?.includes('Sample-Structural-Set') ?? false, `PDF given on the command line opens on launch (${name})`);
  await app.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll desktop checks passed');
process.exit(failed ? 1 : 0);
