const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initDatabase } = require('./db');
const repo = require('./repository');
const updater = require('./updater');

app.disableHardwareAcceleration();
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1024, minHeight: 640,
    title: 'OKK Stores', backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  initDatabase(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();
  if (app.isPackaged) {
    updater.initUpdater(mainWindow);
  } else {
    console.log('[updater] Skipped - running in development mode');
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getBackupDirs() {
  const dirs = [];
  if (process.platform === 'win32') {
    ['E', 'D', 'F', 'G', 'H'].forEach(letter => {
      const p = letter + ':\\OKK-Backups';
      try { if (fs.existsSync(p)) dirs.push(p); } catch (e) {}
    });
    const local = path.join(os.homedir(), 'Documents', 'OKK-Backups');
    if (!dirs.includes(local)) dirs.push(local);
  } else {
    const local = path.join(os.homedir(), 'Documents', 'OKK-Backups');
    dirs.push(local);
    const home = path.join(os.homedir(), 'OKK-Backups');
    if (!dirs.includes(home)) dirs.push(home);
  }
  return dirs;
}
function getDbPath() { return path.join(app.getPath('userData'), 'okk-stores.db'); }
function listBackups() {
  const dirs = getBackupDirs();
  const backups = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.match(/^okk-stores_.*\.db$/)) continue;
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        backups.push({ filename: f, dir: dir, fullPath: full, size: st.size, mtime: st.mtime.toISOString() });
      }
    } catch (e) {}
  }
  backups.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  return backups;
}
function stampForFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function createManualBackup() {
  const src = getDbPath();
  if (!fs.existsSync(src)) throw new Error('Database file not found at ' + src);
  const dirs = getBackupDirs();
  const destDir = dirs[0];
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const stamp = stampForFilename();
  const baseName = 'okk-stores_' + stamp + '.db';
  let copied = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    const srcFile = src + suffix;
    if (fs.existsSync(srcFile)) { fs.copyFileSync(srcFile, path.join(destDir, baseName + suffix)); copied++; }
  }
  return { success: true, dir: destDir, filename: baseName, files: copied };
}
async function restoreBackup(backupFilePath) {
  const dbPath = getDbPath();
  if (!fs.existsSync(backupFilePath)) throw new Error('Backup file not found: ' + backupFilePath);
  const stamp = stampForFilename();
  const safetyName = 'PRE_RESTORE_' + stamp + '.db';
  const safetyDir = path.join(os.homedir(), 'Documents', 'OKK-Backups');
  if (!fs.existsSync(safetyDir)) fs.mkdirSync(safetyDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(safetyDir, safetyName + suffix));
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
  }
  fs.copyFileSync(backupFilePath, dbPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = backupFilePath + suffix;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, dbPath + suffix);
  }
  return { success: true, safetyBackup: path.join(safetyDir, safetyName) };
}

function registerIpcHandlers() {
  ipcMain.handle('auth:hasPassword', () => repo.hasAdminPassword());
  ipcMain.handle('auth:setPassword', (_, p) => repo.setAdminPassword(p));
  ipcMain.handle('auth:checkPassword', (_, p) => repo.checkAdminPassword(p));

  ipcMain.handle('products:getAll', () => repo.getAllProducts());
  ipcMain.handle('products:getById', (_, id) => repo.getProductById(id));
  ipcMain.handle('products:findByName', (_, name) => repo.findProductByName(name));
  ipcMain.handle('products:add', (_, d) => repo.addProduct(d));
  ipcMain.handle('products:update', (_, { id, fields }) => repo.updateProduct(id, fields));
  ipcMain.handle('products:delete', (_, id) => repo.deleteProduct(id));
  ipcMain.handle('products:priceHistory', (_, id) => repo.getPriceHistory(id));
  ipcMain.handle('products:adjustStock', (_, { id, change, reason }) => repo.adjustStock(id, change, reason));

  ipcMain.handle('variants:getByProduct', (_, pid) => repo.getVariantsByProduct(pid));
  ipcMain.handle('variants:getById', (_, id) => repo.getVariantById(id));
  ipcMain.handle('variants:add', (_, d) => repo.addVariant(d));
  ipcMain.handle('variants:update', (_, { id, fields }) => repo.updateVariant(id, fields));
  ipcMain.handle('variants:delete', (_, id) => repo.deleteVariant(id));

  ipcMain.handle('customers:getAll', () => repo.getAllCustomers());
  ipcMain.handle('customers:getById', (_, id) => repo.getCustomerById(id));
  ipcMain.handle('customers:update', (_, { id, fields }) => repo.updateCustomer(id, fields));
  ipcMain.handle('customers:delete', (_, id) => repo.deleteCustomer(id));
  ipcMain.handle('customers:aging', () => repo.getCustomerAging());
  ipcMain.handle('customers:payments', (_, id) => repo.getCustomerPayments(id));
  ipcMain.handle('customers:ledger', (_, id) => repo.getCustomerLedger(id));
  ipcMain.handle('customers:addTransaction', (_, { id, type, amount, note }) => repo.addCustomerTransaction(id, type, amount, note));

  ipcMain.handle('orders:create', (_, d) => repo.createOrder(d));
  ipcMain.handle('orders:addPayment', (_, { id, amount, note }) => repo.addPayment(id, amount, note));
  ipcMain.handle('orders:setFulfillment', (_, { id, status }) => repo.setFulfillment(id, status));
  ipcMain.handle('orders:getById', (_, id) => repo.getInvoiceById(id));
  ipcMain.handle('orders:getAll', () => repo.getAllInvoices());
  ipcMain.handle('orders:getByFilter', (_, f) => repo.getInvoicesByFilter(f));

  ipcMain.handle('dashboard:stats', () => repo.getDashboardStats());
  ipcMain.handle('dashboard:bestWorst', () => repo.getBestWorstSellers());
  ipcMain.handle('dashboard:topDebtors', (_, limit) => repo.getTopDebtors(limit || 5));
  ipcMain.handle('reports:sales', (_, { from, to }) => repo.getSalesReport(from, to));

  ipcMain.handle('system:openExternal', (_, url) => shell.openExternal(url));
  ipcMain.handle('system:saveFile', async (_, { defaultName, content, encoding }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: defaultName.endsWith('.pdf')
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePath) return { success: false };
    try {
      if (encoding === 'base64') fs.writeFileSync(result.filePath, Buffer.from(content, 'base64'));
      else fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, path: result.filePath };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('update:check', () => updater.checkNow());
  ipcMain.handle('update:install', () => updater.quitAndInstall());
  ipcMain.handle('update:getVersion', () => app.getVersion());

  ipcMain.handle('printer:print', async (_, { invoice, printerName }) => {
    const printer = require('./printer');
    return printer.printReceipt(invoice, printerName);
  });
  ipcMain.handle('printer:test', async (_, { printerName }) => {
    const printer = require('./printer');
    return printer.testPrint(printerName);
  });
  ipcMain.handle('printer:list', async () => {
    if (process.platform !== 'win32') return [];
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      const { stdout } = await execAsync('powershell -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"');
      return stdout.trim().split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
    } catch (e) { return []; }
  });

  ipcMain.handle('backup:list', () => listBackups());
  ipcMain.handle('backup:create', () => createManualBackup());
  ipcMain.handle('backup:restore', async (_, filePath) => {
    const result = await restoreBackup(filePath);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
    return result;
  });
  ipcMain.handle('backup:openFolder', (_, dir) => { shell.openPath(dir); return { success: true }; });
  ipcMain.handle('backup:getInfo', () => ({ dbPath: getDbPath(), dirs: getBackupDirs() }));
}
