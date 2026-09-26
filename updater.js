const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updateDownloaded = false;

function initUpdater(window) {
  mainWindow = window;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    send('update:available', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] Up to date:', info.version);
    send('update:none', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
    send('update:error', { message: err.message });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version);
    updateDownloaded = true;
    send('update:downloaded', { version: info.version });
  });

  setTimeout(() => checkNow(), 10000);
  setInterval(() => checkNow(), 6 * 60 * 60 * 1000);
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function checkNow() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    console.error('[updater] checkNow failed:', e.message);
  }
}

async function quitAndInstall() {
  if (!updateDownloaded) {
    throw new Error('No update ready to install');
  }
  setImmediate(() => {
    autoUpdater.quitAndInstall(true, true);
  });
  return { success: true };
}

module.exports = { initUpdater, checkNow, quitAndInstall };
