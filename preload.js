const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  auth: {
    hasPassword: () => ipcRenderer.invoke('auth:hasPassword'),
    setPassword: (p) => ipcRenderer.invoke('auth:setPassword', p),
    checkPassword: (p) => ipcRenderer.invoke('auth:checkPassword', p)
  },
  products: {
    getAll: () => ipcRenderer.invoke('products:getAll'),
    getById: (id) => ipcRenderer.invoke('products:getById', id),
    findByName: (name) => ipcRenderer.invoke('products:findByName', name),
    add: (d) => ipcRenderer.invoke('products:add', d),
    update: (id, f) => ipcRenderer.invoke('products:update', { id, fields: f }),
    delete: (id) => ipcRenderer.invoke('products:delete', id),
    priceHistory: (id) => ipcRenderer.invoke('products:priceHistory', id),
    adjustStock: (id, c, r) => ipcRenderer.invoke('products:adjustStock', { id, change: c, reason: r })
  },
  variants: {
    getByProduct: (pid) => ipcRenderer.invoke('variants:getByProduct', pid),
    getById: (id) => ipcRenderer.invoke('variants:getById', id),
    add: (d) => ipcRenderer.invoke('variants:add', d),
    update: (id, fields) => ipcRenderer.invoke('variants:update', { id, fields }),
    delete: (id) => ipcRenderer.invoke('variants:delete', id)
  },
  customers: {
    getAll: () => ipcRenderer.invoke('customers:getAll'),
    getById: (id) => ipcRenderer.invoke('customers:getById', id),
    update: (id, fields) => ipcRenderer.invoke('customers:update', { id, fields }),
    delete: (id) => ipcRenderer.invoke('customers:delete', id),
    aging: () => ipcRenderer.invoke('customers:aging'),
    payments: (id) => ipcRenderer.invoke('customers:payments', id),
    ledger: (id) => ipcRenderer.invoke('customers:ledger', id),
    addTransaction: (id, type, amount, note) => ipcRenderer.invoke('customers:addTransaction', { id, type, amount, note })
  },
  orders: {
    create: (d) => ipcRenderer.invoke('orders:create', d),
    addPayment: (id, amount, note) => ipcRenderer.invoke('orders:addPayment', { id, amount, note }),
    setFulfillment: (id, status) => ipcRenderer.invoke('orders:setFulfillment', { id, status }),
    getById: (id) => ipcRenderer.invoke('orders:getById', id),
    getAll: () => ipcRenderer.invoke('orders:getAll'),
    getByFilter: (f) => ipcRenderer.invoke('orders:getByFilter', f)
  },
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
    bestWorst: () => ipcRenderer.invoke('dashboard:bestWorst'),
    topDebtors: (limit) => ipcRenderer.invoke('dashboard:topDebtors', limit)
  },
  reports: {
    sales: (from, to) => ipcRenderer.invoke('reports:sales', { from, to })
  },
  system: {
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    saveFile: (options) => ipcRenderer.invoke('system:saveFile', options)
  },
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    getVersion: () => ipcRenderer.invoke('update:getVersion'),
    onEvent: (channel, callback) => {
      const valid = ['update:available', 'update:none', 'update:error', 'update:progress', 'update:downloaded'];
      if (!valid.includes(channel)) return () => {};
      const listener = (_, data) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },
  printer: {
    print: (invoice, printerName) => ipcRenderer.invoke('printer:print', { invoice, printerName }),
    test: (printerName) => ipcRenderer.invoke('printer:test', { printerName }),
    list: () => ipcRenderer.invoke('printer:list')
  },
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    create: () => ipcRenderer.invoke('backup:create'),
    restore: (filePath) => ipcRenderer.invoke('backup:restore', filePath),
    openFolder: (dir) => ipcRenderer.invoke('backup:openFolder', dir),
    getInfo: () => ipcRenderer.invoke('backup:getInfo')
  }
});
