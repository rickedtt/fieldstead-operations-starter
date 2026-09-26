import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron';

// Omarchy compatibility: use X11 without disabling every Chromium fallback.
// In particular, do not combine --disable-gpu with --disable-software-rasterizer.
app.commandLine.appendSwitch('ozone-platform', 'x11');
import { clearEmailConfig, emailBulkAction, emailMessageAction, getEmailAccounts, getEmailAttachmentMetadata, getEmailConfig, previewEmailAttachment, saveEmailAttachment, saveEmailConfig, sendEmail, syncEmail, testEmailConnection } from './email-service.mjs';
import { createSetupStore } from './setup-store.mjs';
import { openSafeExternalLink } from './external-link.mjs';
import { createOperationalAttachmentStore, OPERATIONAL_ATTACHMENT_MIME_TYPES } from './operational-attachment-store.mjs';
import { forwardServerOutput } from './server-output.mjs';
import updater from 'electron-updater';
const { autoUpdater } = updater;

autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://github.com/rickedtt/fieldstead-operations-starter/releases/latest/download/',
  useMultipleRangeRequest: false,
});

// Use Omarchy's GNOME keyring for Electron safeStorage.
app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
import {
  isAllowedDesktopUrl,
  isAllowedNavigationUrl,
  localServerUrl,
  LOOPBACK_HOST,
  PREFERRED_PORT,
  PRODUCT_NAME,
  WINDOW_BACKGROUND_COLOR,
} from './desktop-config.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let serverProcess;
let shutdownStarted = false;
let allowQuit = false;

function operationalAttachmentStore() {
  return createOperationalAttachmentStore(path.join(app.getPath('userData'), 'operational-attachments'));
}

function attachmentResult(error) {
  return { ok: false, message: error instanceof Error ? error.message : String(error) };
}

function publishUpdateStatus(status) {
  mainWindow?.webContents.send('fieldstead-update-status', status);
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']) {
  autoUpdater.on(event, (...args) => publishUpdateStatus({ event, detail: args[0] ?? null }));
}

ipcMain.handle('fieldstead:email-config', async () => getEmailConfig());
ipcMain.handle('fieldstead:email-accounts', async () => getEmailAccounts());
ipcMain.handle('fieldstead:email-test', async (_event, input) => {
  try { return await testEmailConnection(input); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('fieldstead:email-save', async (_event, input) => {
  try { return { ok: true, config: await saveEmailConfig(input) }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('fieldstead:email-clear', async (_event, accountId) => clearEmailConfig(accountId));
ipcMain.handle('fieldstead:email-sync', async (_event, accountId) => { try { return await syncEmail(accountId); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('fieldstead:email-send', async (_event, input, accountId) => { try { return await sendEmail(input, accountId); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('fieldstead:email-action', async (_event, accountId, uid, action) => { try { return await emailMessageAction(accountId, uid, action); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('fieldstead:email-bulk-action', async (_event, accountId, uids, action) => { try { return await emailBulkAction(accountId, uids, action); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('fieldstead:email-attachment-preview', async (_event, accountId, messageId, attachmentId) => {
  try {
    const preview = await previewEmailAttachment(accountId, messageId, attachmentId);
    const error = await shell.openPath(preview.path);
    return error ? { ok: false, message: error } : { ok: true, filename: preview.filename };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle('fieldstead:email-attachment-save', async (_event, accountId, messageId, attachmentId) => {
  try {
    const attachment = await getEmailAttachmentMetadata(accountId, messageId, attachmentId);
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Save email attachment',
      defaultPath: attachment.filename,
      buttonLabel: 'Save',
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    const saved = await saveEmailAttachment(accountId, messageId, attachmentId, choice.filePath);
    return { ok: true, filename: saved.filename, bytes: saved.bytes };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle('fieldstead:email-open-external-link', async (_event, url) => {
  try { return await openSafeExternalLink(shell.openExternal, url); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('fieldstead:operational-attachment-list', async (_event, ownerType, ownerId) => {
  try { return { ok: true, attachments: await operationalAttachmentStore().list(ownerType, ownerId) }; }
  catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-choose', async (_event, ownerType, ownerId, actorId) => {
  try {
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: 'Add job or service request attachment',
      buttonLabel: 'Add attachment',
      properties: ['openFile'],
      filters: [{ name: 'Safe documents and photos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt'] }],
    });
    if (choice.canceled || !choice.filePaths[0]) return { ok: false, canceled: true };
    const sourcePath = choice.filePaths[0];
    const extension = path.extname(sourcePath).toLowerCase();
    const typeByExtension = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp', '.pdf':'application/pdf', '.txt':'text/plain' };
    const contentType = typeByExtension[extension];
    if (!contentType || !OPERATIONAL_ATTACHMENT_MIME_TYPES.includes(contentType)) throw new Error('This attachment type is not allowed.');
    const attachment = await operationalAttachmentStore().importFile({
      id: `attachment-${crypto.randomUUID()}`, ownerType, ownerId, sourcePath,
      originalFilename: path.basename(sourcePath), contentType, actorId,
      createdAt: new Date().toISOString(), source: { kind: 'desktop-upload' },
    });
    return { ok: true, attachment };
  } catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-preview', async (_event, attachmentId) => {
  try {
    const preview = await operationalAttachmentStore().preview(attachmentId);
    const error = await shell.openPath(preview.path);
    return error ? { ok: false, message: error } : { ok: true, filename: preview.filename };
  } catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-export', async (_event, attachmentId) => {
  try {
    const attachment = await operationalAttachmentStore().metadata(attachmentId);
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Export attachment', defaultPath: attachment.filename, buttonLabel: 'Export',
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    return { ok: true, ...(await operationalAttachmentStore().exportFile(attachmentId, choice.filePath)) };
  } catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-delete', async (_event, attachmentId, actorId, actorRole = 'owner_admin') => {
  try {
    if (actorRole !== 'owner_admin') throw new Error('Owner approval is required to delete an attachment.');
    return { ok: true, attachment: await operationalAttachmentStore().delete(attachmentId, { actorId, deletedAt: new Date().toISOString() }) };
  } catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-backup-manifest', async () => {
  try { return { ok: true, manifest: await operationalAttachmentStore().backupManifest() }; }
  catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:operational-attachment-store-export', async () => {
  try {
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Export complete attachment store',
      defaultPath: `fieldstead-attachment-store-${new Date().toISOString().slice(0, 10)}`,
      buttonLabel: 'Export store', properties: ['createDirectory'],
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    return { ok: true, ...(await operationalAttachmentStore().exportManagedStore(choice.filePath)) };
  } catch (error) { return attachmentResult(error); }
});
ipcMain.handle('fieldstead:setup-get', () => createSetupStore(app.getPath('userData')).load());
ipcMain.handle('fieldstead:setup-save', (_event, state) => createSetupStore(app.getPath('userData')).save(state));
ipcMain.handle('fieldstead:app-version', () => app.getVersion());

ipcMain.handle('fieldstead:check-for-updates', async () => {
  if (!app.isPackaged) return { status: 'development', message: 'Updates are checked from the packaged GitHub release.' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const available = result?.updateInfo?.version && result.updateInfo.version !== app.getVersion();
    return { status: available ? 'available' : 'current', version: result?.updateInfo?.version ?? app.getVersion() };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fieldstead:download-update', async () => {
  try { await autoUpdater.downloadUpdate(); return { status: 'downloading' }; }
  catch (error) { return { status: 'error', message: error instanceof Error ? error.message : String(error) }; }
});

ipcMain.handle('fieldstead:install-update', () => {
  allowQuit = true;
  autoUpdater.quitAndInstall();
  return { status: 'installing' };
});

function serverRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.resolve(moduleDirectory, '..', 'dist', 'standalone');
}

function serverEntrypoint(root) {
  const candidates = [
    path.join(root, 'server.js'),
    path.join(root, 'dist', 'server', 'index.js'),
  ];
  return candidates.find((candidate) => fsSync.existsSync(candidate)) ?? candidates[0];
}

function tryPort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen({ host: LOOPBACK_HOST, port, exclusive: true }, () => {
      const address = probe.address();
      probe.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function selectLoopbackPort() {
  try {
    return await tryPort(PREFERRED_PORT);
  } catch (error) {
    if (error?.code !== 'EADDRINUSE' && error?.code !== 'EACCES') throw error;
    return tryPort(0);
  }
}

function startServer(port) {
  const root = serverRoot();
  const entrypoint = serverEntrypoint(root);
  if (!fsSync.existsSync(entrypoint)) throw new Error(`Desktop server entrypoint missing: ${entrypoint}`);

  serverProcess = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      HOST: LOOPBACK_HOST,
      PORT: String(port),
      NODE_ENV: 'production',
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  forwardServerOutput(serverProcess.stdout, process.stdout);
  forwardServerOutput(serverProcess.stderr, process.stderr);

  return serverProcess;
}

function waitForServer(url, child, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };

    const onExit = (code, signal) => {
      finish(new Error(`The local Vinext server exited before startup (code ${code}, signal ${signal ?? 'none'}).`));
    };

    const poll = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
        finish(new Error('Timed out while starting the local Vinext server.'));
        return;
      }

      const request = http.get(url, { timeout: 1_000 }, (response) => {
        response.resume();
        finish();
      });
      request.on('timeout', () => request.destroy());
      request.on('error', () => setTimeout(poll, 150));
    };

    child.once('exit', onExit);
    poll();
  });
}

function lockRendererToLoopback(serverUrl) {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedDesktopUrl(details.url, serverUrl) });
  });
}

function createWindow(serverUrl) {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1440, Math.max(800, workArea.width - 24));
  const height = Math.min(940, Math.max(600, workArea.height - 24));
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(1024, width),
    minHeight: Math.min(700, height),
    show: false,
    title: PRODUCT_NAME,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    webPreferences: {
      preload: path.join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openSafeExternalLink(shell.openExternal, url).catch(() => undefined);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigationUrl(targetUrl, serverUrl)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  return mainWindow.loadURL(serverUrl);
}

async function stopServer() {
  if (shutdownStarted) return;
  shutdownStarted = true;

  const child = serverProcess;
  serverProcess = undefined;
  if (!child || child.exitCode !== null || child.killed) return;

  await new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 4_000);
    forceTimer.unref();
    child.once('exit', () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

app.on('before-quit', (event) => {
  if (allowQuit || shutdownStarted) return;
  event.preventDefault();
  void stopServer().finally(() => {
    allowQuit = true;
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try {
    const port = await selectLoopbackPort();
    const url = localServerUrl(port);
    lockRendererToLoopback(url);
    const child = startServer(port);
    await waitForServer(url, child);
    await createWindow(url);
    if (app.isPackaged) void Promise.resolve(autoUpdater.checkForUpdates()).catch(() => undefined);
  } catch (error) {
    await stopServer();
    dialog.showErrorBox(
      `${PRODUCT_NAME} could not start`,
      error instanceof Error ? error.message : String(error),
    );
    allowQuit = true;
    app.quit();
  }
});
