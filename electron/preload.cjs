const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('savira', {
  state: () => ipcRenderer.invoke('state'),
  save: (settings) => ipcRenderer.invoke('save', settings),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  launch: () => ipcRenderer.invoke('launch'),
  panorama: () => ipcRenderer.invoke('panorama'),
  openFolder: () => ipcRenderer.invoke('folder'),
  selectJava: () => ipcRenderer.invoke('java'),
  window: (action) => ipcRenderer.invoke('window', action),
  update: {
    state: () => ipcRenderer.invoke('update-state'),
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    cancel: () => ipcRenderer.invoke('update-cancel'),
    install: () => ipcRenderer.invoke('update-install'),
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('update-status', listener);
      return () => ipcRenderer.removeListener('update-status', listener);
    }
  },
  setup: {
    info: () => ipcRenderer.invoke('setup-info'),
    chooseDir: (current) => ipcRenderer.invoke('setup-dir', current),
    install: (options) => ipcRenderer.invoke('setup-install', options),
    uninstall: (options) => ipcRenderer.invoke('setup-uninstall', options),
    launch: () => ipcRenderer.invoke('setup-launch'),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('setup-progress', listener);
      return () => ipcRenderer.removeListener('setup-progress', listener);
    }
  },
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('status', listener);
    return () => ipcRenderer.removeListener('status', listener);
  }
});
