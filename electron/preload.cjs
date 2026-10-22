const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('savira', {
  state: () => ipcRenderer.invoke('state'),
  save: (settings) => ipcRenderer.invoke('save', settings),
  login: () => ipcRenderer.invoke('login'),
  logout: (uuid) => ipcRenderer.invoke('logout', uuid),
  switchAccount: (uuid) => ipcRenderer.invoke('account-switch', uuid),
  presence: (page) => ipcRenderer.invoke('presence-page', page),
  launch: () => ipcRenderer.invoke('launch'),
  panorama: () => ipcRenderer.invoke('panorama'),
  openFolder: () => ipcRenderer.invoke('folder'),
  selectJava: () => ipcRenderer.invoke('java'),
  window: (action) => ipcRenderer.invoke('window', action),
  profiles: {
    minecraftVersions: () => ipcRenderer.invoke('versions-minecraft'),
    loaderVersions: (loader, minecraft) => ipcRenderer.invoke('versions-loader', loader, minecraft),
    importPack: () => ipcRenderer.invoke('profile-import'),
    openFolder: (id) => ipcRenderer.invoke('profile-folder', id),
    blockIcons: () => ipcRenderer.invoke('profile-icons'),
    iconFromFile: () => ipcRenderer.invoke('profile-icon-file'),
    iconFromUrl: (url) => ipcRenderer.invoke('profile-icon-url', url),
    content: (id, kind) => ipcRenderer.invoke('content-list', id, kind),
    toggle: (id, kind, file, enabled) => ipcRenderer.invoke('content-toggle', id, kind, file, enabled),
    remove: (id, kind, file) => ipcRenderer.invoke('content-delete', id, kind, file),
    update: (id, kind, file) => ipcRenderer.invoke('content-update', id, kind, file),
    install: (id, kind, projectId, versionId) => ipcRenderer.invoke('content-install', id, kind, projectId, versionId),
    project: (projectId) => ipcRenderer.invoke('browse-project', projectId),
    versions: (projectId) => ipcRenderer.invoke('browse-versions', projectId),
    where: (projectId, kind) => ipcRenderer.invoke('browse-where', projectId, kind),
    installPack: (projectId, versionId) => ipcRenderer.invoke('browse-install-pack', projectId, versionId),
    openLink: (url) => ipcRenderer.invoke('open-link', url),
    folder: (id, kind) => ipcRenderer.invoke('content-folder', id, kind),
    addFiles: (id, kind) => ipcRenderer.invoke('content-add-files', id, kind),
    search: (options) => ipcRenderer.invoke('browse-search', options),
    tags: (kind) => ipcRenderer.invoke('browse-tags', kind),
    openProject: (type, slug) => ipcRenderer.invoke('browse-open', type, slug),
    worlds: (id) => ipcRenderer.invoke('profile-worlds', id),
    play: (id, target) => ipcRenderer.invoke('profile-play', id, target),
    screenshots: (id) => ipcRenderer.invoke('profile-screenshots', id),
    openScreenshot: (id, file, reveal) => ipcRenderer.invoke('profile-screenshot-open', id, file, reveal),
    deleteScreenshot: (id, file) => ipcRenderer.invoke('profile-screenshot-delete', id, file),
    stats: (id) => ipcRenderer.invoke('profile-stats', id),
    duplicate: (id, name) => ipcRenderer.invoke('profile-duplicate', id, name),
    exportEntries: (id) => ipcRenderer.invoke('profile-export-entries', id),
    exportPack: (id, options) => ipcRenderer.invoke('profile-export', id, options),
    packVersions: (id) => ipcRenderer.invoke('pack-versions', id),
    switchPack: (id, versionId) => ipcRenderer.invoke('pack-switch', id, versionId)
  },
  skins: {
    list: () => ipcRenderer.invoke('skins-list'),
    fetch: (query) => ipcRenderer.invoke('skins-fetch', query),
    save: (skin) => ipcRenderer.invoke('skins-save', skin),
    remove: (id) => ipcRenderer.invoke('skins-delete', id),
    apply: (id) => ipcRenderer.invoke('skins-apply', id)
  },
  capes: {
    list: () => ipcRenderer.invoke('capes-list'),
    current: () => ipcRenderer.invoke('cape-current'),
    vanilla: () => ipcRenderer.invoke('capes-vanilla'),
    setVanilla: (capeId) => ipcRenderer.invoke('capes-vanilla-set', capeId),
    add: (cape) => ipcRenderer.invoke('capes-add', cape),
    update: (id, changes) => ipcRenderer.invoke('capes-update', id, changes),
    remove: (id) => ipcRenderer.invoke('capes-delete', id),
    wear: (id) => ipcRenderer.invoke('capes-wear', id),
    favorite: (key) => ipcRenderer.invoke('capes-favorite', key),
    template: (kind, png) => ipcRenderer.invoke('capes-template', kind, png)
  },
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
  },
  onSettings: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings', listener);
    return () => ipcRenderer.removeListener('settings', listener);
  }
});
