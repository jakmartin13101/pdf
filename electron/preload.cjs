// Exposes the small desktop API the renderer uses (see DesktopBridge in src/brand.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buildsuite', {
  platform: process.platform,
  saveFile: (name, data) => ipcRenderer.invoke('buildsuite:save-file', name, data),
  openFilesDialog: () => ipcRenderer.invoke('buildsuite:open-dialog'),
  writeFile: (file, data) => ipcRenderer.invoke('buildsuite:write-file', file, data),
  openReport: (html) => ipcRenderer.invoke('buildsuite:open-report', html),
  takeOpenFiles: () => ipcRenderer.invoke('buildsuite:take-open-files'),
  graphics: () => ipcRenderer.invoke('buildsuite:graphics'),
  setGraphics: (mode) => ipcRenderer.invoke('buildsuite:set-graphics', mode),
  relaunch: () => ipcRenderer.invoke('buildsuite:relaunch'),
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('buildsuite:open-files', listener);
    return () => ipcRenderer.removeListener('buildsuite:open-files', listener);
  },
});
