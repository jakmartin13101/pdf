// BuildSuite Takeoff Studio – Windows desktop shell (Electron main process).
//
// The renderer is the same Vite build as the web version (dist/). It is served from a
// private app:// origin instead of file:// so fetch(), module workers (pdf.js) and
// IndexedDB autosave behave exactly like they do on a web server.

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const PRODUCT = 'BuildSuite Takeoff Studio';
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ICON = path.join(ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const ORIGIN = 'app://takeoff-studio';
const DEV_URL = process.env.TAKEOFF_DEV_URL; // e.g. http://localhost:5173 for live reload while developing

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

app.setName(PRODUCT);
if (process.platform === 'win32') app.setAppUserModelId('com.buildsuite.takeoffstudio');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// ---------------------------------------------------------------------------
// Files passed on the command line ("Open with", drag onto the shortcut)

const OPENABLE = /\.(pdf|json)$/i;
let pendingFiles = [];

function filesFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && OPENABLE.test(a) && fs.existsSync(a));
}

async function readFiles(paths) {
  const out = [];
  for (const p of paths) {
    try {
      out.push({ name: path.basename(p), data: new Uint8Array(await fsp.readFile(p)) });
    } catch {
      /* unreadable – skip */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

let mainWindow = null;
let lastDir = null;

function serveDist(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
  return fsp
    .readFile(file)
    .then(
      (body) =>
        new Response(body, {
          headers: {
            'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            ...(file.endsWith('.html') ? { 'content-security-policy': CSP } : {}),
          },
        }),
    )
    .catch(() => new Response('Not found', { status: 404 }));
}

const devToolsKey = (input) => input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'));

function createWindow() {
  const win = new BrowserWindow({
    title: PRODUCT,
    icon: ICON,
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1b1f24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  const { webContents } = win;
  webContents.setVisualZoomLevelLimits(1, 1);

  // Keep the app on its own origin; send web links to the default browser.
  const allowed = (url) => url.startsWith(ORIGIN + '/') || (DEV_URL && url.startsWith(DEV_URL));
  webContents.on('will-navigate', (e, url) => {
    if (allowed(url)) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Detached split panes: blank same-origin windows the renderer draws into (see Panes.tsx).
    if ((url === 'about:blank' || url === '') && frameName.startsWith('takeoff-pane-')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: PRODUCT,
          icon: ICON,
          minWidth: 360,
          minHeight: 260,
          autoHideMenuBar: true,
          backgroundColor: '#1b1f24',
        },
      };
    }
    if (/^https?:\/\//.test(url) && !allowed(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('did-create-window', (child) => {
    child.setMenu(null);
    const wc = child.webContents;
    wc.setVisualZoomLevelLimits(1, 1);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.on('before-input-event', (_e, input) => devToolsKey(input) && wc.toggleDevTools());
  });

  // F12 / Ctrl+Shift+I open developer tools for troubleshooting.
  webContents.on('before-input-event', (_e, input) => devToolsKey(input) && webContents.toggleDevTools());

  void win.loadURL(DEV_URL || `${ORIGIN}/index.html`);
  return win;
}

// ---------------------------------------------------------------------------
// IPC used by the renderer through electron/preload.cjs

const FILTERS = {
  pdf: 'PDF Document',
  json: 'Takeoff Project',
  csv: 'CSV (Excel)',
  html: 'Web Page',
};

ipcMain.handle('buildsuite:save-file', async (event, name, data) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const safe = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const ext = path.extname(safe).slice(1).toLowerCase();
  const res = await dialog.showSaveDialog(win, {
    title: 'Save As',
    defaultPath: path.join(lastDir ?? app.getPath('documents'), safe),
    filters: [...(ext ? [{ name: FILTERS[ext] ?? `${ext.toUpperCase()} File`, extensions: [ext] }] : []), { name: 'All Files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePath) return false;
  await fsp.writeFile(res.filePath, Buffer.from(data));
  lastDir = path.dirname(res.filePath);
  return true;
});

// Reports open in their own window; written to a temp file so the print button works.
ipcMain.handle('buildsuite:open-report', async (_event, html) => {
  const file = path.join(os.tmpdir(), `BuildSuite-Takeoff-Report-${Date.now()}.html`);
  await fsp.writeFile(file, String(html), 'utf8');
  const report = new BrowserWindow({
    title: 'Takeoff Summary Report',
    icon: ICON,
    width: 1000,
    height: 800,
    parent: mainWindow ?? undefined,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  report.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  report.webContents.on('will-navigate', (e) => e.preventDefault());
  report.on('closed', () => fsp.rm(file, { force: true }).catch(() => {}));
  await report.loadFile(file);
  return true;
});

ipcMain.handle('buildsuite:take-open-files', async () => {
  const files = await readFiles(pendingFiles);
  pendingFiles = [];
  return files;
});

// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingFiles = filesFromArgv(process.argv);

  app.on('second-instance', async (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const files = await readFiles(filesFromArgv(argv));
    if (files.length) mainWindow.webContents.send('buildsuite:open-files', files);
  });

  app.whenReady().then(() => {
    protocol.handle('app', serveDist);
    Menu.setApplicationMenu(null); // the app draws its own menu bar
    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
      // Detached panes and report windows belong to the main window.
      for (const w of BrowserWindow.getAllWindows()) w.destroy();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
