const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('glide', {
  invoke: (ch, ...args) => ipcRenderer.invoke(ch, ...args),
  send: (ch, ...args) => ipcRenderer.send(ch, ...args),
  on: (ch, cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
});
