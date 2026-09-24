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
    emailMessageAction: (accountId, uid, action) => ipcRenderer.invoke('fieldstead:email-action', accountId, uid, action),
    emailBulkAction: (accountId, uids, action) => ipcRenderer.invoke('fieldstead:email-bulk-action', accountId, uids, action),
    previewEmailAttachment: (accountId, messageId, attachmentId) => ipcRenderer.invoke('fieldstead:email-attachment-preview', accountId, messageId, attachmentId),
    saveEmailAttachment: (accountId, messageId, attachmentId) => ipcRenderer.invoke('fieldstead:email-attachment-save', accountId, messageId, attachmentId),
    openEmailExternalLink: (url) => ipcRenderer.invoke('fieldstead:email-open-external-link', url),
    chooseOperationalAttachment: (ownerType, ownerId, actorId) => ipcRenderer.invoke('fieldstead:operational-attachment-choose', ownerType, ownerId, actorId),
    listOperationalAttachments: (ownerType, ownerId) => ipcRenderer.invoke('fieldstead:operational-attachment-list', ownerType, ownerId),
    previewOperationalAttachment: (attachmentId) => ipcRenderer.invoke('fieldstead:operational-attachment-preview', attachmentId),
    exportOperationalAttachment: (attachmentId) => ipcRenderer.invoke('fieldstead:operational-attachment-export', attachmentId),
    deleteOperationalAttachment: (attachmentId, actorId) => ipcRenderer.invoke('fieldstead:operational-attachment-delete', attachmentId, actorId),
    getOperationalAttachmentBackupManifest: () => ipcRenderer.invoke('fieldstead:operational-attachment-backup-manifest'),
    getSetupState: () => ipcRenderer.invoke('fieldstead:setup-get'),
    saveSetupState: (state) => ipcRenderer.invoke('fieldstead:setup-save', state),
    getAppVersion: () => ipcRenderer.invoke('fieldstead:app-version'),
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
