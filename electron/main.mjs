import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, screen, session } from 'electron';
import { clearEmailConfig, emailMessageAction, getEmailAccounts, getEmailConfig, saveEmailConfig, sendEmail, syncEmail, testEmailConnection } from './email-service.mjs';
import updater from 'electron-updater';
const { autoUpdater } = updater;

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'rickedtt',
  repo: 'fieldstead-operations-starter',
  private: false,
  releaseType: 'release',
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
} from './desktop-config.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let serverProcess;
let shutdownStarted = false;
let allowQuit = false;

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
  const entrypoint = path.join(root, 'server.js');

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

  serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[vinext] ${chunk}`));
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[vinext] ${chunk}`));

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
    backgroundColor: '#17324d',
    webPreferences: {
      preload: path.join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
