const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['win:state', 'win:shown', 'tab:open', 'shortcut', 'ext:confirm', 'ext:changed', 'page:mousedown',
  'perm:ask', 'download:start', 'download:done', 'update:ready'];

contextBridge.exposeInMainWorld('kona', {
  platform: process.platform,
  close: () => ipcRenderer.send('win:close'),
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  devtools: () => ipcRenderer.send('win:devtools'),
  setTheme: (value) => ipcRenderer.send('theme:set', value),
  extList: () => ipcRenderer.invoke('ext:list'),
  extRemove: (id) => ipcRenderer.invoke('ext:remove', id),
  extConfirmReply: (id, ok) => ipcRenderer.send('ext:confirm-reply', { id, ok }),
  suggest: (q, partition, engine) => ipcRenderer.invoke('suggest', q, partition, engine),
  setPrefs: (partition, prefs) => ipcRenderer.send('prefs:set', partition, prefs),
  permReply: (id, allow) => ipcRenderer.send('perm:reply', { id, allow }),
  showDownload: (file) => ipcRenderer.invoke('download:show', file),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  sitesList: (partition) => ipcRenderer.invoke('sites:list', partition),
  sitesRemove: (partition, site) => ipcRenderer.invoke('sites:remove', partition, site),
  privateOpen: () => ipcRenderer.invoke('private:open'),
  clearBrowsingData: (partition, what) => ipcRenderer.invoke('data:clear', partition, what),
  installUpdate: () => ipcRenderer.send('update:install'),
  privateClose: (partition) => ipcRenderer.invoke('private:close', partition),
  profileUse: (partition) => ipcRenderer.invoke('profile:use', partition),
  profileForget: (partition) => ipcRenderer.invoke('profile:forget', partition),
  on: (channel, fn) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
});
