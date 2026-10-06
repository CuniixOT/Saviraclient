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
  logs: {
    open: () => ipcRenderer.invoke('logs-open'),
    state: () => ipcRenderer.invoke('logs-state'),
    clear: () => ipcRenderer.invoke('logs-clear'),
    stop: () => ipcRenderer.invoke('logs-stop'),
    folder: () => ipcRenderer.invoke('logs-folder'),
    window: (action) => ipcRenderer.invoke('logs-window', action),
    on: (callback) => {
      const channels = ['logs-lines', 'logs-stats', 'logs-reset', 'logs-ended'];
      const listeners = channels.map(channel => [channel, (_event, payload) => callback(channel.slice(5), payload)]);
      listeners.forEach(([channel, listener]) => ipcRenderer.on(channel, listener));
      return () => listeners.forEach(([channel, listener]) => ipcRenderer.removeListener(channel, listener));
    }
  },
  debug: {
    list: (kind) => ipcRenderer.invoke('debug-list', kind),
    read: (file) => ipcRenderer.invoke('debug-read', file),
    open: (file) => ipcRenderer.invoke('debug-open', file),
    reveal: (file) => ipcRenderer.invoke('debug-reveal', file),
    folder: () => ipcRenderer.invoke('debug-folder')
  },
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
