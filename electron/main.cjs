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

// ---------------------------------------------------------------------------
// Graphics card (Settings → Speed & Graphics). Read before the GPU process starts, so a change applies
// after a restart. auto: hardware acceleration with GPU rasterization; off: software only (for
// problem drivers); force: also use graphics cards Chromium has on its blocklist.

const graphicsFile = () => path.join(app.getPath('userData'), 'graphics.json');
function readGraphics() {
  try {
    return JSON.parse(fs.readFileSync(graphicsFile(), 'utf8'));
  } catch {
    return {};
  }
}
const GPU_MODES = ['auto', 'off', 'force'];
const graphics = { gpu: 'auto', ...readGraphics() };
if (!GPU_MODES.includes(graphics.gpu)) graphics.gpu = 'auto';
if (graphics.gpu === 'off') app.disableHardwareAcceleration();
else {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  if (graphics.gpu === 'force') app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

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

// Files the user chose (opened, given on the command line, or saved through a dialog): the renderer
// may write back to these and no others (Save writes a document's takeoff into its PDF).
const granted = new Set();
const grantKey = (p) => path.resolve(p).toLowerCase();

async function readFiles(paths) {
  const out = [];
  for (const p of paths) {
    try {
      out.push({ name: path.basename(p), data: new Uint8Array(await fsp.readFile(p)), path: p });
      granted.add(grantKey(p));
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
  granted.add(grantKey(res.filePath));
  return res.filePath;
});

// Open PDFs (or takeoff files) through the native dialog, so Save can write back to them.
ipcMain.handle('buildsuite:open-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const res = await dialog.showOpenDialog(win, {
    title: 'Open',
    defaultPath: lastDir ?? app.getPath('documents'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF and Takeoff Files', extensions: ['pdf', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return [];
  lastDir = path.dirname(res.filePaths[0]);
  return readFiles(res.filePaths);
});

// Save to a file the user opened or saved before (written to a temporary file first, then moved).
ipcMain.handle('buildsuite:write-file', async (_event, file, data) => {
  const target = String(file);
  if (!granted.has(grantKey(target))) return false;
  const tmp = `${target}.${process.pid}.saving`;
  try {
    await fsp.writeFile(tmp, Buffer.from(data));
    await fsp.rename(tmp, target);
    return true;
  } catch {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    return false;
  }
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

ipcMain.handle('buildsuite:graphics', async () => {
  let gpu = null;
  try {
    const info = await app.getGPUInfo('basic');
    const dev = info?.gpuDevice?.find((d) => d.active) ?? info?.gpuDevice?.[0];
    gpu = dev ? { vendorId: dev.vendorId, deviceId: dev.deviceId, driver: dev.driverVersion ?? '' } : null;
  } catch {
    /* not available */
  }
  return { mode: graphics.gpu, saved: { gpu: 'auto', ...readGraphics() }.gpu, status: app.getGPUFeatureStatus(), gpu };
});

ipcMain.handle('buildsuite:set-graphics', async (_event, mode) => {
  if (!GPU_MODES.includes(mode)) return false;
  await fsp.mkdir(path.dirname(graphicsFile()), { recursive: true });
  await fsp.writeFile(graphicsFile(), JSON.stringify({ ...readGraphics(), gpu: mode }, null, 2));
  return true;
});

ipcMain.handle('buildsuite:relaunch', async () => {
  app.relaunch();
  app.exit(0);
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
