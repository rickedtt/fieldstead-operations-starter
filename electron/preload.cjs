// Sandboxed Electron preload scripts use the limited CommonJS preload API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'fieldsteadDesktop',
  Object.freeze({
    platform: process.platform,
    desktop: true,
    getEmailConfig: () => ipcRenderer.invoke('fieldstead:email-config'),
    getEmailAccounts: () => ipcRenderer.invoke('fieldstead:email-accounts'),
    testEmailConnection: (input) => ipcRenderer.invoke('fieldstead:email-test', input),
    saveEmailConfig: (input) => ipcRenderer.invoke('fieldstead:email-save', input),
    clearEmailConfig: (accountId) => ipcRenderer.invoke('fieldstead:email-clear', accountId),
    syncEmail: (accountId) => ipcRenderer.invoke('fieldstead:email-sync', accountId),
    sendEmail: (input, accountId) => ipcRenderer.invoke('fieldstead:email-send', input, accountId),
    checkForUpdates: () => ipcRenderer.invoke('fieldstead:check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('fieldstead:download-update'),
    installUpdate: () => ipcRenderer.invoke('fieldstead:install-update'),
    onUpdateStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('fieldstead-update-status', listener);
      return () => ipcRenderer.removeListener('fieldstead-update-status', listener);
    },
  }),
);
