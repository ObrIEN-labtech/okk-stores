const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./db');
const repo = require('./repository');

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

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

  ipcMain.handle('customers:getAll', () => repo.getAllCustomers());
  ipcMain.handle('customers:getById', (_, id) => repo.getCustomerById(id));
  ipcMain.handle('customers:update', (_, { id, fields }) => repo.updateCustomer(id, fields));
  ipcMain.handle('customers:delete', (_, id) => repo.deleteCustomer(id));
  ipcMain.handle('customers:aging', () => repo.getCustomerAging());

  ipcMain.handle('orders:create', (_, d) => repo.createOrder(d));
  ipcMain.handle('orders:addPayment', (_, { id, amount, note }) => repo.addPayment(id, amount, note));
  ipcMain.handle('orders:setFulfillment', (_, { id, status }) => repo.setFulfillment(id, status));
  ipcMain.handle('orders:getById', (_, id) => repo.getInvoiceById(id));
  ipcMain.handle('orders:getAll', () => repo.getAllInvoices());
  ipcMain.handle('orders:getByFilter', (_, f) => repo.getInvoicesByFilter(f));

  ipcMain.handle('dashboard:stats', () => repo.getDashboardStats());
  ipcMain.handle('dashboard:bestWorst', () => repo.getBestWorstSellers());

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
      if (encoding === 'base64') {
        fs.writeFileSync(result.filePath, Buffer.from(content, 'base64'));
      } else {
        fs.writeFileSync(result.filePath, content, 'utf8');
      }
      return { success: true, path: result.filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}
