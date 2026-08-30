const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getVersions: () => ipcRenderer.invoke('get-versions'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getPlatform: () => process.platform,
  isDev: process.argv.includes('--dev'),
  
  // 窗口操作
  openSettings: () => ipcRenderer.invoke('open-settings'),
  
  // 对话框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  // 文件系统操作
  fs: {
    exists: (path) => ipcRenderer.invoke('fs-exists', path),
    readJson: (path) => ipcRenderer.invoke('fs-read-json', path),
    writeJson: (path, data) => ipcRenderer.invoke('fs-write-json', path, data),
    writeFile: (path, data) => ipcRenderer.invoke('fs-write-file', path, data),
    readFile: (path, encoding) => ipcRenderer.invoke('fs-read-file', path, encoding),
    ensureDir: (path) => ipcRenderer.invoke('fs-ensure-dir', path),
    readdir: (path) => ipcRenderer.invoke('fs-readdir', path),
    stat: (path) => ipcRenderer.invoke('fs-stat', path),
    copy: (src, dest) => ipcRenderer.invoke('fs-copy', src, dest),
    move: (src, dest) => ipcRenderer.invoke('fs-move', src, dest),
    remove: (path) => ipcRenderer.invoke('fs-remove', path)
  },

  // 音频分析功能
  audio: {
    getMetadata: (filePath) => ipcRenderer.invoke('audio-get-metadata', filePath)
  },
  
  // ZIP操作
  zip: {
    exportProject: (projectPath, exportPath) => ipcRenderer.invoke('zip-export-project', projectPath, exportPath),
    importProject: (zipPath, extractPath) => ipcRenderer.invoke('zip-import-project', zipPath, extractPath),
    backupData: (backupPath) => ipcRenderer.invoke('zip-backup-data', backupPath),
    restoreData: (zipPath) => ipcRenderer.invoke('zip-restore-data', zipPath)
  },
  
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    setFullscreen: (fullscreen) => ipcRenderer.invoke('window-set-fullscreen', fullscreen),
    setSize: (width, height) => ipcRenderer.invoke('window-set-size', width, height),
    getSize: () => ipcRenderer.invoke('window-get-size'),
    isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
    openSRITest: () => ipcRenderer.invoke('window-open-sri-test'),
    openIoTPanel: () => ipcRenderer.invoke('window-open-iot-panel')
  },

  // IoT设备管理
  iot: {
    connectSerial: (port, baudRate) => ipcRenderer.invoke('iot-serial-connect', port, baudRate),
    disconnectSerial: () => ipcRenderer.invoke('iot-serial-disconnect'),
    listSerialPorts: () => ipcRenderer.invoke('iot-list-serial-ports'),
    getConnectionState: () => ipcRenderer.invoke('iot-get-connection-state'),
    onSerialData: (callback) => {
      ipcRenderer.on('iot-serial-data', (event, data) => callback(data));
    },
    onSerialError: (callback) => {
      ipcRenderer.on('iot-serial-error', (event, error) => callback(error));
    },
    onConnectionStateChanged: (callback) => {
      ipcRenderer.on('iot-connection-state-changed', (event, state) => callback(state));
    },
    onSRIScoreUpdated: (callback) => {
      ipcRenderer.on('sri-score-updated', (event, data) => callback(data));
    }
  },

  // IPC通用调用（用于SRI测试完成等事件）
  ipc: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, callback) => {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // 主题实时预览
  theme: {
    update: (payload) => ipcRenderer.send('theme-update', payload),
    onUpdate: (callback) => ipcRenderer.on('theme-update', (_evt, payload) => callback(payload))
  },

  // 简易存储（主进程 JSON 文件）
  storage: {
    get: (key) => ipcRenderer.invoke('storage-get', key),
    set: (key, value) => ipcRenderer.invoke('storage-set', key, value),
    onUpdate: (callback) => ipcRenderer.on('app-settings-updated', (_evt, settings) => callback(settings))
  },
  
  // Shell操作
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),
    setWallpaper: (imagePath) => ipcRenderer.invoke('shell-set-wallpaper', imagePath),
    canSetWallpaper: () => ipcRenderer.invoke('shell-can-set-wallpaper'),
    showInFolder: (path) => ipcRenderer.invoke('shell-show-in-folder', path)
  },
  
  // 监听菜单事件
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-new-project', callback);
    ipcRenderer.on('menu-open-project', callback);
    ipcRenderer.on('menu-about', callback);
  },
  
  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
