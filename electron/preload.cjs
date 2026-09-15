// Sandboxed Electron preload scripts use the limited CommonJS preload API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld(
  'fieldsteadDesktop',
  Object.freeze({
    platform: process.platform,
    desktop: true,
  }),
);
