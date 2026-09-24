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
  customers: {
    getAll: () => ipcRenderer.invoke('customers:getAll'),
    getById: (id) => ipcRenderer.invoke('customers:getById', id),
    update: (id, fields) => ipcRenderer.invoke('customers:update', { id, fields }),
    delete: (id) => ipcRenderer.invoke('customers:delete', id),
    aging: () => ipcRenderer.invoke('customers:aging')
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
    bestWorst: () => ipcRenderer.invoke('dashboard:bestWorst')
  },
  reports: {
    sales: (from, to) => ipcRenderer.invoke('reports:sales', { from, to })
  },
  system: {
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    saveFile: (options) => ipcRenderer.invoke('system:saveFile', options)
  }
});
