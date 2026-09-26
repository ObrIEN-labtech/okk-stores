console.log('>>> ui.js loaded (Dream POS + Backups)');
var api = window.api;

function UGX(n) { return 'UGX ' + Math.round(Number(n) || 0).toLocaleString(); }
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }
function fmtDate(d) {
  if (!d) return '';
  var dt = new Date(d);
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// ============ TOASTS ============
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration === undefined ? 3500 : duration;
  var container = document.getElementById('toast-container');
  var icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span>' +
    '<span class="toast-message">' + escapeHtml(message) + '</span>' +
    '<button class="toast-close">x</button>';
  container.appendChild(el);
  function remove() { el.classList.add('removing'); setTimeout(function(){ el.remove(); }, 250); }
  el.querySelector('.toast-close').addEventListener('click', remove);
  if (duration > 0) setTimeout(remove, duration);
  return el;
}
window.toast = {
  success: function(m){ return showToast(m, 'success'); },
  error:   function(m){ return showToast(m, 'error', 5000); },
  warning: function(m){ return showToast(m, 'warning', 4000); },
  info:    function(m){ return showToast(m, 'info'); }
};

// ============ CONFIRM ============
function showConfirm(options) {
  return new Promise(function(resolve) {
    var modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.innerHTML =
      '<div class="confirm-box">' +
        '<div class="confirm-icon">' + (options.icon || '?') + '</div>' +
        '<div class="confirm-title">' + escapeHtml(options.title || 'Are you sure?') + '</div>' +
        '<div class="confirm-message">' + escapeHtml(options.message || '') + '</div>' +
        '<div class="confirm-actions">' +
          '<button class="btn btn-light cancel">' + escapeHtml(options.cancelText || 'Cancel') + '</button>' +
          '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + ' confirm">' + escapeHtml(options.confirmText || 'Confirm') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    function cleanup(answer) { modal.remove(); resolve(answer); }
    modal.querySelector('.cancel').addEventListener('click', function(){ cleanup(false); });
    modal.querySelector('.confirm').addEventListener('click', function(){ cleanup(true); });
    modal.addEventListener('click', function(e){ if (e.target === modal) cleanup(false); });
    document.addEventListener('keydown', function onEsc(e){
      if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); cleanup(false); }
    });
  });
}
window.confirmDialog = showConfirm;

// ============ DARK MODE ============
function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
    var lbl = document.getElementById('dark-toggle-label');
    if (lbl) lbl.textContent = 'Light Mode';
    localStorage.setItem('okk_dark', '1');
  } else {
    document.body.classList.remove('dark-mode');
    var lbl2 = document.getElementById('dark-toggle-label');
    if (lbl2) lbl2.textContent = 'Dark Mode';
    localStorage.setItem('okk_dark', '0');
  }
}
function initDarkMode() {
  var saved = localStorage.getItem('okk_dark');
  applyDarkMode(saved === '1');
}
initDarkMode();
document.getElementById('btn-dark-toggle').addEventListener('click', function() {
  var isDark = document.body.classList.contains('dark-mode');
  applyDarkMode(!isDark);
});

// ============ AUTH ============
var isSettingUp = false;
async function initLogin() {
  var hasPw = await api.auth.hasPassword();
  var label = document.getElementById('login-label');
  var confirmLabel = document.getElementById('login-confirm-label');
  var btn = document.getElementById('btn-login');
  if (!hasPw) {
    isSettingUp = true;
    label.childNodes[0].nodeValue = 'Create a Password';
    confirmLabel.style.display = '';
    btn.textContent = 'Create & Sign In';
    document.getElementById('login-error').textContent = 'First time setup - create an admin password';
    document.getElementById('login-error').style.color = '#17A2B8';
  } else {
    isSettingUp = false;
    label.childNodes[0].nodeValue = 'Enter Password';
    confirmLabel.style.display = 'none';
    btn.textContent = 'Sign In';
    document.getElementById('login-error').textContent = '';
  }
  document.getElementById('login-pass').focus();
}
async function tryLogin() {
  var pw = document.getElementById('login-pass').value;
  var err = document.getElementById('login-error');
  if (isSettingUp) {
    var pw2 = document.getElementById('login-pass2').value;
    if (!pw || pw.length < 4) { err.style.color = '#EA5455'; err.textContent = 'Password must be at least 4 characters'; return; }
    if (pw !== pw2) { err.style.color = '#EA5455'; err.textContent = 'Passwords do not match'; return; }
    try { await api.auth.setPassword(pw); showApp(); window.toast.success('Password created - welcome to OKK Stores'); }
    catch (e) { err.style.color = '#EA5455'; err.textContent = e.message || 'Setup failed'; }
  } else {
    var ok = await api.auth.checkPassword(pw);
    if (ok) { showApp(); window.toast.success('Welcome back'); }
    else {
      err.style.color = '#EA5455';
      err.textContent = 'Incorrect password';
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  }
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-pass2').value = '';
  sessionStorage.setItem('okk_logged_in', '1');
  loadDashboard();
  updateNotificationBadge();
}
function logout() {
  sessionStorage.removeItem('okk_logged_in');
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-pass').focus();
  initLogin();
}
document.getElementById('btn-login').addEventListener('click', tryLogin);
['login-pass','login-pass2'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e){ if (e.key === 'Enter') tryLogin(); });
});
document.getElementById('btn-logout').addEventListener('click', async function() {
  var ok = await showConfirm({ title: 'Log out?', message: 'You will need to re-enter your password.', confirmText: 'Log Out', icon: '?' });
  if (ok) logout();
});

// ============ NAVIGATION ============
document.querySelectorAll('.sidebar-nav a').forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.sidebar-nav a').forEach(function(a){ a.classList.remove('active'); });
    link.classList.add('active');
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    var viewEl = document.getElementById('view-' + link.dataset.view);
    if (viewEl) viewEl.classList.add('active');
    refreshView(link.dataset.view);
  });
});
function refreshView(v) {
  if (v === 'dashboard') { loadDashboard(); updateNotificationBadge(); }
  if (v === 'products') loadProducts();
  if (v === 'customers') loadCustomers();
  if (v === 'sale') loadSaleProducts();
  if (v === 'orders') loadOrders('all');
  if (v === 'reports') loadReports();
  if (v === 'backups') loadBackups();
}

// ============ DASHBOARD ============
async function loadDashboard() {
  var s = await api.dashboard.stats();
  document.getElementById('stat-value').textContent = UGX(s.totalValue);
  document.getElementById('stat-profit').textContent = UGX(s.potentialProfit);
  document.getElementById('stat-products').textContent = s.productCount;
  document.getElementById('stat-lowstock').textContent = s.lowStock;
  document.getElementById('stat-sales').textContent = UGX(s.todaySales);
  document.getElementById('stat-onp-c').textContent = s.orderedNotPaid.count;
  document.getElementById('stat-onp-a').textContent = UGX(s.orderedNotPaid.amount);
  document.getElementById('stat-pnt-c').textContent = s.paidNotTaken.count;
  document.getElementById('stat-pnt-a').textContent = UGX(s.paidNotTaken.amount);
  document.getElementById('stat-tnp-c').textContent = s.takenNotPaid.count;
  document.getElementById('stat-tnp-a').textContent = UGX(s.takenNotPaid.amount);
  document.getElementById('stat-cust-debt').textContent = UGX(s.customerDebt);
  document.getElementById('stat-cust-count').textContent = s.customerCount + ' customers';
  var aging = await api.customers.aging();
  document.getElementById('age-current').textContent = UGX(aging.current);
  document.getElementById('age-30').textContent = UGX(aging.d30);
  document.getElementById('age-60').textContent = UGX(aging.d60);
  document.getElementById('age-90').textContent = UGX(aging.d90);
  document.getElementById('age-older').textContent = UGX(aging.older);
  var products = await api.products.getAll();
  var low = products.filter(function(p){ return p.stock <= p.reorder_level; });
  var tb = document.querySelector('#low-stock-table tbody');
  tb.innerHTML = low.length
    ? low.map(function(p){ return '<tr><td><b>' + escapeHtml(p.name) + '</b></td><td>' + p.stock + '</td><td>' + p.reorder_level +
        '</td><td><button class="btn btn-light btn-sm" onclick="restock(' + p.id + ')">Restock</button></td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">All products sufficiently stocked.</td></tr>';
  var bw = await api.dashboard.bestWorst();
  if (bw.best) { document.getElementById('stat-best').textContent = bw.best.name; document.getElementById('stat-best-qty').textContent = bw.best.qty_sold + ' sold'; }
  else { document.getElementById('stat-best').textContent = 'No sales yet'; document.getElementById('stat-best-qty').textContent = ''; }
  if (bw.worst && (!bw.best || bw.worst.name !== bw.best.name)) {
    document.getElementById('stat-worst').textContent = bw.worst.name;
    document.getElementById('stat-worst-qty').textContent = bw.worst.qty_sold + ' sold';
  } else { document.getElementById('stat-worst').textContent = '—'; document.getElementById('stat-worst-qty').textContent = ''; }
}
window.restock = async function(id) {
  var qty = parseInt(prompt('Add how many units?') || 0);
  if (qty > 0) { await api.products.adjustStock(id, qty, 'Restock'); loadDashboard(); window.toast.success('Stock updated'); }
};

// ============ NOTIFICATIONS ============
async function updateNotificationBadge() {
  try {
    var products = await api.products.getAll();
    var low = products.filter(function(p){ return p.stock <= p.reorder_level; }).length;
    var aging = await api.customers.aging();
    var overdueCount = 0;
    if (aging.d60 > 0) overdueCount += 1;
    if (aging.d90 > 0) overdueCount += 1;
    if (aging.older > 0) overdueCount += 1;
    var total = low + overdueCount;
    var badge = document.getElementById('notif-badge');
    if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  } catch (e) { /* silent */ }
}
async function renderNotifications() {
  var products = await api.products.getAll();
  var low = products.filter(function(p){ return p.stock <= p.reorder_level; });
  var aging = await api.customers.aging();
  var html = '<div class="notif-head">Notifications</div>';
  if (!low.length && aging.older === 0 && aging.d90 === 0 && aging.d60 === 0) {
    html += '<div class="notif-empty">All clear — no alerts</div>';
  } else {
    low.slice(0, 5).forEach(function(p) {
      html += '<div class="notif-item" onclick="gotoView(\'products\')"><span class="notif-dot warning"></span><span class="notif-body"><b>' + escapeHtml(p.name) + '</b> is low<small>Only ' + p.stock + ' left — reorder at ' + p.reorder_level + '</small></span></div>';
    });
    if (aging.older > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot danger"></span><span class="notif-body"><b>Very old debt: ' + UGX(aging.older) + '</b><small>180+ days overdue</small></span></div>';
    if (aging.d90 > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot danger"></span><span class="notif-body"><b>Debt 91–180 days: ' + UGX(aging.d90) + '</b><small>Follow up with customers</small></span></div>';
    if (aging.d60 > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot warning"></span><span class="notif-body"><b>Debt 61–90 days: ' + UGX(aging.d60) + '</b><small>Consider sending reminders</small></span></div>';
  }
  var dd = document.getElementById('notification-dropdown');
  dd.innerHTML = html;
  dd.classList.remove('hidden');
}
window.gotoView = function(viewName) {
  var link = document.querySelector('.sidebar-nav a[data-view="' + viewName + '"]');
  if (link) link.click();
  document.getElementById('notification-dropdown').classList.add('hidden');
};
document.getElementById('btn-notifications').addEventListener('click', function(e) {
  e.stopPropagation();
  var dd = document.getElementById('notification-dropdown');
  if (dd.classList.contains('hidden')) renderNotifications(); else dd.classList.add('hidden');
});
document.addEventListener('click', function(e) {
  var dd = document.getElementById('notification-dropdown');
  if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && e.target.id !== 'btn-notifications') dd.classList.add('hidden');
});

// ============ GLOBAL SEARCH ============
var globalSearchTimer = null;
document.getElementById('global-search').addEventListener('input', function(e) {
  clearTimeout(globalSearchTimer);
  var term = e.target.value.trim().toLowerCase();
  var dropdown = document.getElementById('global-search-results');
  if (!term) { dropdown.classList.add('hidden'); return; }
  globalSearchTimer = setTimeout(async function() {
    var products = await api.products.getAll();
    var customers = await api.customers.getAll();
    var orders = await api.orders.getAll();
    var pHits = products.filter(function(p){ return p.name.toLowerCase().includes(term); }).slice(0, 4);
    var cHits = customers.filter(function(c){ return c.name.toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term); }).slice(0, 4);
    var oHits = orders.filter(function(o){ return (o.invoice_no || '').toLowerCase().includes(term) || (o.customer_name || '').toLowerCase().includes(term); }).slice(0, 4);
    var html = '';
    if (!pHits.length && !cHits.length && !oHits.length) html = '<div class="search-empty">No results for "' + escapeHtml(term) + '"</div>';
    else {
      if (pHits.length) { html += '<div class="search-group-title">Products</div>'; pHits.forEach(function(p) { html += '<div class="search-result" onclick="gotoProduct(' + p.id + ')">' + escapeHtml(p.name) + '<span class="result-meta">' + UGX(p.price) + ' • ' + p.stock + ' in stock</span></div>'; }); }
      if (cHits.length) { html += '<div class="search-group-title">Customers</div>'; cHits.forEach(function(c) { html += '<div class="search-result" onclick="gotoCustomer(' + c.id + ')">' + escapeHtml(c.name) + '<span class="result-meta">' + escapeHtml(c.phone || '—') + ' • owes ' + UGX(c.outstanding) + '</span></div>'; }); }
      if (oHits.length) { html += '<div class="search-group-title">Invoices</div>'; oHits.forEach(function(o) { html += '<div class="search-result" onclick="gotoOrder(' + o.id + ')">' + escapeHtml(o.invoice_no) + '<span class="result-meta">' + escapeHtml(o.customer_name) + ' • ' + UGX(o.total) + '</span></div>'; }); }
    }
    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  }, 200);
});
window.gotoProduct = function(id) { document.getElementById('global-search-results').classList.add('hidden'); document.getElementById('global-search').value = ''; window.gotoView('products'); };
window.gotoCustomer = function(id) { document.getElementById('global-search-results').classList.add('hidden'); document.getElementById('global-search').value = ''; window.gotoView('customers'); setTimeout(function() { viewCustomer(id); }, 150); };
window.gotoOrder = function(id) { document.getElementById('global-search-results').classList.add('hidden'); document.getElementById('global-search').value = ''; window.gotoView('orders'); setTimeout(function() { viewOrder(id); }, 150); };

// ============ PRODUCTS ============
var cachedProducts = [];
var productSearchTerm = '';
document.getElementById('product-search').addEventListener('input', function(e){ productSearchTerm = e.target.value.toLowerCase(); renderProductRows(); });
async function loadProducts() { cachedProducts = await api.products.getAll(); renderProductRows(); }
function renderProductRows() {
  var f = cachedProducts.filter(function(p){ return p.name.toLowerCase().includes(productSearchTerm) || (p.category || '').toLowerCase().includes(productSearchTerm); });
  var tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = f.length
    ? f.map(function(p) {
        var m = p.price > 0 ? (((p.price - p.cost_price) / p.price) * 100).toFixed(1) : '0.0';
        return '<tr><td><b>' + escapeHtml(p.name) + '</b></td><td>' + escapeHtml(p.category || '') + '</td><td>' + UGX(p.cost_price) + '</td><td><b>' + UGX(p.price) + '</b></td><td>' + m + '%</td><td>' + p.stock + '</td><td><button class="btn btn-light btn-sm" onclick="editProduct(' + p.id + ')">Edit</button><button class="btn btn-light btn-sm" onclick="changePrice(' + p.id + ')">Price</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(' + p.id + ')">Delete</button></td></tr>';
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No products. Click "+ Add Product".</td></tr>';
}
function openModal(title, body, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').classList.remove('hidden');
  var confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.style.display = '';
  document.getElementById('modal-cancel').textContent = 'Cancel';
  var oldBtn = confirmBtn;
  var newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  newBtn.addEventListener('click', async function() {
    try { await onConfirm(); closeModal(); }
    catch (e) { window.toast.error(e.message || String(e)); }
  });
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('btn-add-product').addEventListener('click', function() {
  openModal('Add Product',
    '<label>Name *<input id="f-name"></label><label>Category<input id="f-category" value="General"></label><label>Cost Price (UGX)<input id="f-cost" type="number" step="1" value="0"></label><label>Sale Price (UGX)<input id="f-price" type="number" step="1" value="0"></label><label>Initial Stock<input id="f-stock" type="number" value="0"></label>',
    async function() {
      var name = document.getElementById('f-name').value.trim();
      if (!name) throw new Error('Name is required');
      await api.products.add({ name: name, sku: null, category: document.getElementById('f-category').value.trim() || 'General', cost_price: parseInt(document.getElementById('f-cost').value) || 0, price: parseInt(document.getElementById('f-price').value) || 0, stock: parseInt(document.getElementById('f-stock').value) || 0, reorder_level: 10, location: '' });
      await loadProducts();
      window.toast.success('Product added: ' + name);
    });
});
window.editProduct = function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  openModal('Edit Product',
    '<label>Name<input id="e-name" value="' + escapeAttr(p.name) + '"></label><label>Category<input id="e-category" value="' + escapeAttr(p.category || '') + '"></label><label>Cost Price (UGX)<input id="e-cost" type="number" step="1" value="' + p.cost_price + '"></label><label>Sale Price (UGX)<input id="e-price" type="number" step="1" value="' + p.price + '"></label><label>Stock<input id="e-stock" type="number" value="' + p.stock + '"></label>',
    async function() {
      await api.products.update(id, { name: document.getElementById('e-name').value.trim(), category: document.getElementById('e-category').value.trim(), cost_price: parseInt(document.getElementById('e-cost').value) || 0, price: parseInt(document.getElementById('e-price').value) || 0, stock: parseInt(document.getElementById('e-stock').value) || 0 });
      await loadProducts();
      window.toast.success('Product updated');
    });
};
window.changePrice = function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  openModal('Change Price — ' + p.name, '<label>Current<input value="' + UGX(p.price) + '" disabled></label><label>New Price (UGX)<input id="np-price" type="number" step="1" value="' + p.price + '"></label>',
    async function() {
      var np = parseInt(document.getElementById('np-price').value);
      if (isNaN(np) || np < 0) throw new Error('Invalid price');
      await api.products.update(id, { price: np });
      await loadProducts();
      window.toast.success('Price updated to ' + UGX(np));
    });
};
window.deleteProduct = async function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  var ok = await showConfirm({ title: 'Delete product?', message: 'Delete "' + p.name + '"? This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.products.delete(id);
  await loadProducts();
  window.toast.success('Product deleted');
};

// ============ CUSTOMERS ============
var cachedCustomers = [];
var customerSearchTerm = '';
document.getElementById('customer-search').addEventListener('input', function(e){ customerSearchTerm = e.target.value.toLowerCase(); renderCustomerRows(); });
async function loadCustomers() { cachedCustomers = await api.customers.getAll(); renderCustomerRows(); }
function renderCustomerRows() {
  var f = cachedCustomers.filter(function(c){ return c.name.toLowerCase().includes(customerSearchTerm) || (c.phone || '').toLowerCase().includes(customerSearchTerm); });
  var tbody = document.querySelector('#customer-table tbody');
  tbody.innerHTML = f.length
    ? f.map(function(c) {
        return '<tr><td><a href="#" onclick="viewCustomer(' + c.id + '); return false;" style="color:var(--primary);text-decoration:none;font-weight:600;">' + escapeHtml(c.name) + '</a></td><td>' + escapeHtml(c.phone || '—') + '</td><td>' + c.order_count + '</td><td><b>' + UGX(c.lifetime_total) + '</b></td><td style="color:' + (c.outstanding > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">' + UGX(c.outstanding) + '</td><td><button class="btn btn-light btn-sm" onclick="viewCustomer(' + c.id + ')">View</button><button class="btn btn-light btn-sm" onclick="editCustomer(' + c.id + ')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteCustomer(' + c.id + ')">Delete</button></td></tr>';
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No customers yet.</td></tr>';
}
window.viewCustomer = async function(id) {
  var c = await api.customers.getById(id);
  var ordersHtml = c.invoices.length
    ? c.invoices.map(function(i) {
        return '<tr><td><b>' + escapeHtml(i.invoice_no) + '</b><div style="font-size:11px;color:var(--text-muted);">' + new Date(i.created_at).toLocaleDateString() + '</div></td><td>' + UGX(i.total) + '</td><td>' + UGX(i.amount_paid) + '</td><td style="color:' + (i.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(i.balance) + '</td><td><span class="pill ' + i.payment_status + '">' + i.payment_status + '</span></td><td><span class="pill ' + i.fulfillment_status + '">' + i.fulfillment_status.replace('_',' ') + '</span></td><td><button class="btn btn-light btn-sm" onclick="viewOrder(' + i.id + ')">View</button></td></tr>';
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No orders yet.</td></tr>';
  var summary = '<div class="customer-profile-summary"><div class="cell"><span>Lifetime Spend</span><b>' + UGX(c.lifetime_total) + '</b></div><div class="cell"><span>Total Paid</span><b style="color:var(--success);">' + UGX(c.lifetime_paid) + '</b></div><div class="cell"><span>Outstanding</span><b style="color:var(--danger);">' + UGX(c.outstanding) + '</b></div><div class="cell"><span>Orders</span><b>' + c.invoices.length + '</b></div></div>';
  document.getElementById('modal-title').textContent = 'Customer: ' + c.name;
  document.getElementById('modal-body').innerHTML =
    '<div style="margin-bottom:16px;color:var(--text-muted);font-size:13px;display:flex;justify-content:space-between;align-items:center;"><span>Phone: ' + escapeHtml(c.phone || '—') + '</span><button class="btn btn-light btn-sm" onclick="exportCustomerStatement(' + c.id + ')">Export Statement PDF</button></div>' +
    summary +
    '<h3 style="font-size:12px;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Order History</h3>' +
    '<div style="max-height:340px;overflow-y:auto;"><table class="data-table compact"><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Fulfillment</th><th></th></tr></thead><tbody>' + ordersHtml + '</tbody></table></div>';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
window.editCustomer = function(id) {
  var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return;
  openModal('Edit Customer', '<label>Name<input id="c-name" value="' + escapeAttr(c.name) + '"></label><label>Phone<input id="c-phone" value="' + escapeAttr(c.phone || '') + '"></label>',
    async function() {
      await api.customers.update(id, { name: document.getElementById('c-name').value.trim(), phone: document.getElementById('c-phone').value.trim() });
      await loadCustomers();
      window.toast.success('Customer updated');
    });
};
window.deleteCustomer = async function(id) {
  var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return;
  var ok = await showConfirm({ title: 'Delete customer?', message: 'Delete "' + c.name + '"? Their orders stay in the system but become unlinked.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.customers.delete(id);
  await loadCustomers();
  window.toast.success('Customer deleted');
};

// ============ NEW ORDER ============
var saleProducts = [];
var cart = [];
var selectedCustomer = null;
async function loadSaleProducts() { saleProducts = await api.products.getAll(); renderSaleProducts(''); renderCart(); }
var saleSearchInput = document.getElementById('sale-search');
var acBox = document.getElementById('autocomplete-box');
var acIndex = -1;
saleSearchInput.addEventListener('input', function(e) {
  var term = e.target.value.trim().toLowerCase();
  if (!term) { acBox.classList.add('hidden'); acIndex = -1; return; }
  var matches = saleProducts.filter(function(p){ return p.name.toLowerCase().includes(term); }).slice(0, 8);
  if (!matches.length) { acBox.classList.add('hidden'); return; }
  acBox.innerHTML = matches.map(function(p, i) { return '<div class="item' + (i === 0 ? ' active' : '') + '" data-id="' + p.id + '">' + escapeHtml(p.name) + '<span class="meta">' + UGX(p.price) + ' • ' + p.stock + ' in stock</span></div>'; }).join('');
  acBox.classList.remove('hidden');
  acIndex = 0;
  acBox.querySelectorAll('.item').forEach(function(el) {
    el.addEventListener('click', function() { addToCart(parseInt(el.dataset.id)); saleSearchInput.value=''; acBox.classList.add('hidden'); saleSearchInput.focus(); });
  });
});
saleSearchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var term = saleSearchInput.value.trim().toLowerCase();
    if (!term) return;
    var activeEl = acBox.querySelector('.item.active');
    if (activeEl) addToCart(parseInt(activeEl.dataset.id));
    else {
      var exact = saleProducts.find(function(p){ return p.name.toLowerCase() === term; });
      if (exact) addToCart(exact.id);
      else { var partial = saleProducts.find(function(p){ return p.name.toLowerCase().includes(term); }); if (partial) addToCart(partial.id); else window.toast.warning('No product matches "' + term + '"'); }
    }
    saleSearchInput.value = ''; acBox.classList.add('hidden'); acIndex = -1;
  } else if (e.key === 'ArrowDown') { e.preventDefault(); var items = acBox.querySelectorAll('.item'); if (!items.length) return; if (acIndex >= 0) items[acIndex].classList.remove('active'); acIndex = Math.min(acIndex + 1, items.length - 1); items[acIndex].classList.add('active'); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); var items2 = acBox.querySelectorAll('.item'); if (!items2.length) return; if (acIndex >= 0) items2[acIndex].classList.remove('active'); acIndex = Math.max(acIndex - 1, 0); items2[acIndex].classList.add('active'); }
  else if (e.key === 'Escape') { acBox.classList.add('hidden'); acIndex = -1; }
});
function renderSaleProducts(term) {
  term = term || '';
  var f = saleProducts.filter(function(p){ return p.name.toLowerCase().includes(term); });
  var c = document.getElementById('sale-product-list');
  c.innerHTML = f.length
    ? f.map(function(p) { return '<div class="product-card" onclick="addToCart(' + p.id + ')"><div class="name">' + escapeHtml(p.name) + '</div><div class="price">' + UGX(p.price) + '</div><div class="stock">' + p.stock + ' in stock</div></div>'; }).join('')
    : '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:24px;">No products. Add products first.</p>';
}
window.addToCart = function(pid) {
  var p = saleProducts.find(function(x){ return x.id === pid; }); if (!p) return;
  if (p.stock <= 0) { window.toast.warning('Out of stock'); return; }
  var ex = cart.find(function(c){ return c.product_id === pid; });
  if (ex) { if (ex.quantity + 1 > p.stock) { window.toast.warning('Only ' + p.stock + ' in stock'); return; } ex.quantity += 1; }
  else cart.push({ product_id: p.id, name: p.name, price: p.price, quantity: 1, stock: p.stock });
  renderCart();
};
window.updateQty = function(pid, q) {
  q = parseInt(q) || 0;
  var it = cart.find(function(c){ return c.product_id === pid; }); if (!it) return;
  if (q <= 0) { removeFromCart(pid); return; }
  if (q > it.stock) { window.toast.warning('Only ' + it.stock + ' in stock'); q = it.stock; }
  it.quantity = q; renderCart();
};
window.removeFromCart = function(pid) { cart = cart.filter(function(c){ return c.product_id !== pid; }); renderCart(); };
function computeCartTotals() {
  var subtotal = cart.reduce(function(s, i){ return s + i.price * i.quantity; }, 0);
  var taxRate = parseFloat(document.getElementById('cart-tax').value) || 0;
  var discount = Math.max(0, parseInt(document.getElementById('cart-discount').value) || 0);
  var taxAmount = Math.round(subtotal * (taxRate / 100));
  var total = Math.max(0, subtotal + taxAmount - discount);
  var paid = Math.max(0, parseInt(document.getElementById('cart-paid').value) || 0);
  if (paid > total) paid = total;
  return { subtotal: subtotal, taxRate: taxRate, taxAmount: taxAmount, discount: discount, total: total, paid: paid, balance: total - paid };
}
function renderCart() {
  var tbody = document.querySelector('#cart-table tbody');
  tbody.innerHTML = cart.length
    ? cart.map(function(it) { return '<tr><td>' + escapeHtml(it.name) + '</td><td><input type="number" min="1" value="' + it.quantity + '" onchange="updateQty(' + it.product_id + ', this.value)"></td><td>' + UGX(it.price) + '</td><td><b>' + UGX(it.price * it.quantity) + '</b></td><td><button class="btn btn-danger btn-sm" onclick="removeFromCart(' + it.product_id + ')">x</button></td></tr>'; }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Cart is empty. Type product name above or click a card.</td></tr>';
  var t = computeCartTotals();
  document.getElementById('cart-subtotal').textContent = UGX(t.subtotal);
  document.getElementById('cart-total').textContent = UGX(t.total);
  document.getElementById('cart-balance').textContent = UGX(t.balance);
}
['cart-tax','cart-discount','cart-paid'].forEach(function(id) { document.getElementById(id).addEventListener('input', renderCart); });
var custSearchInput = document.getElementById('customer-search-input');
var custAcBox = document.getElementById('customer-autocomplete');
var selectedCustBox = document.getElementById('selected-customer');
var custDebtBox = document.getElementById('customer-debt');
custSearchInput.addEventListener('input', function(e) {
  var term = e.target.value.trim().toLowerCase();
  if (!term) { custAcBox.classList.add('hidden'); return; }
  var matches = cachedCustomers.filter(function(c) { return c.name.toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term); }).slice(0, 8);
  if (!matches.length) { custAcBox.classList.add('hidden'); return; }
  custAcBox.innerHTML = matches.map(function(c) { return '<div class="item" data-id="' + c.id + '">' + escapeHtml(c.name) + '<span class="meta">' + escapeHtml(c.phone || '—') + ' • owes ' + UGX(c.outstanding) + '</span></div>'; }).join('');
  custAcBox.classList.remove('hidden');
  custAcBox.querySelectorAll('.item').forEach(function(el) { el.addEventListener('click', function() { selectCustomer(parseInt(el.dataset.id)); }); });
});
custSearchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var term = custSearchInput.value.trim();
    if (!term) return;
    var first = custAcBox.querySelector('.item');
    if (first) selectCustomer(parseInt(first.dataset.id));
    else { selectedCustomer = { id: null, name: term, phone: '', outstanding: 0 }; showSelectedCustomer(); }
    custAcBox.classList.add('hidden');
  } else if (e.key === 'Escape') { custAcBox.classList.add('hidden'); }
});
function selectCustomer(id) { var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return; selectedCustomer = c; showSelectedCustomer(); custAcBox.classList.add('hidden'); custSearchInput.value = ''; }
function showSelectedCustomer() {
  if (!selectedCustomer) { selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); return; }
  selectedCustBox.classList.remove('hidden');
  document.getElementById('selected-customer-name').textContent = selectedCustomer.name;
  document.getElementById('selected-customer-phone').textContent = selectedCustomer.phone || '';
  if (selectedCustomer.outstanding > 0) { custDebtBox.classList.remove('hidden'); custDebtBox.classList.remove('clean'); custDebtBox.textContent = 'Existing debt: ' + UGX(selectedCustomer.outstanding); }
  else if (selectedCustomer.id) { custDebtBox.classList.remove('hidden'); custDebtBox.classList.add('clean'); custDebtBox.textContent = 'No outstanding balance'; }
  else custDebtBox.classList.add('hidden');
}
document.getElementById('btn-customer-change').addEventListener('click', function() { selectedCustomer = null; selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); custSearchInput.focus(); });
document.getElementById('btn-customer-clear').addEventListener('click', function() { selectedCustomer = null; custSearchInput.value = ''; selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); custAcBox.classList.add('hidden'); });
document.getElementById('btn-checkout').addEventListener('click', async function() {
  if (!cart.length) { window.toast.warning('Cart is empty'); return; }
  var t = computeCartTotals();
  var taxRate = (t.taxRate || 0) / 100;
  var customer_name = selectedCustomer ? selectedCustomer.name : '';
  var customer_phone = selectedCustomer ? selectedCustomer.phone : '';
  var taken = document.getElementById('cart-taken').checked;
  try {
    var inv = await api.orders.create({ customer_name: customer_name, customer_phone: customer_phone, items: cart.map(function(c){ return { product_id: c.product_id, quantity: c.quantity }; }), tax_rate: taxRate, discount: t.discount, amount_paid: t.paid, fulfillment_status: taken ? 'taken' : 'not_taken' });
    cart = []; selectedCustomer = null;
    document.getElementById('cart-tax').value = 0;
    document.getElementById('cart-discount').value = 0;
    document.getElementById('cart-paid').value = 0;
    document.getElementById('cart-taken').checked = false;
    custSearchInput.value = '';
    selectedCustBox.classList.add('hidden');
    custDebtBox.classList.add('hidden');
    await loadSaleProducts();
    await loadCustomers();
    updateNotificationBadge();
    window.toast.success('Sale recorded: ' + inv.invoice_no);
    showReceipt(inv);
  } catch (e) { window.toast.error(e.message || String(e)); }
});

// ============ ORDERS ============
var currentFilter = 'all';
var allOrders = [];
document.querySelectorAll('#order-tabs .tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('#order-tabs .tab').forEach(function(t){ t.classList.remove('active'); });
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    loadOrders(currentFilter);
  });
});
document.getElementById('order-customer-search').addEventListener('input', renderOrdersTable);
document.getElementById('btn-clear-search').addEventListener('click', function() { document.getElementById('order-customer-search').value = ''; renderOrdersTable(); });
async function loadOrders(filter) { allOrders = await api.orders.getByFilter(filter || 'all'); renderOrdersTable(); }
function renderOrdersTable() {
  var term = (document.getElementById('order-customer-search').value || '').trim().toLowerCase();
  var rows = term ? allOrders.filter(function(r) { return (r.customer_name || '').toLowerCase().includes(term) || (r.customer_phone || '').toLowerCase().includes(term); }) : allOrders;
  var tbody = document.querySelector('#orders-table tbody');
  tbody.innerHTML = rows.length
    ? rows.map(function(r) {
        var pay = '<span class="pill ' + r.payment_status + '">' + r.payment_status + '</span>';
        var ful = '<span class="pill ' + r.fulfillment_status + '">' + r.fulfillment_status.replace('_',' ') + '</span>';
        var cust = r.customer_id ? '<a href="#" onclick="viewCustomer(' + r.customer_id + '); return false;" style="color:var(--primary);text-decoration:none;font-weight:600;">' + escapeHtml(r.customer_name) + '</a>' : escapeHtml(r.customer_name);
        return '<tr><td><b>' + escapeHtml(r.invoice_no) + '</b></td><td>' + cust + (r.customer_phone ? '<div style="font-size:11px;color:var(--text-muted);">' + escapeHtml(r.customer_phone) + '</div>' : '') + '</td><td><b>' + UGX(r.total) + '</b></td><td>' + UGX(r.amount_paid) + '</td><td style="color:' + (r.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">' + UGX(r.balance) + '</td><td>' + pay + '</td><td>' + ful + '</td><td>' + new Date(r.created_at).toLocaleDateString() + '</td><td><button class="btn btn-light btn-sm" onclick="viewOrder(' + r.id + ')">View</button></td></tr>';
      }).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">No orders match.</td></tr>';
}
window.viewOrder = async function(id) { var inv = await api.orders.getById(id); showReceipt(inv); };

// ============ RECEIPT ============
function showReceipt(inv) {
  var items = inv.items.map(function(i) { return '<div class="line"><span>' + escapeHtml(i.product_name) + ' x ' + i.quantity + '</span><span>' + UGX(i.line_total) + '</span></div><div class="line" style="color:var(--text-light);font-size:11px;padding-left:8px;">@ ' + UGX(i.unit_price) + '</div>'; }).join('');
  var paymentPill = '<span class="pill ' + inv.payment_status + '">' + inv.payment_status + '</span>';
  var fulfillPill = '<span class="pill ' + inv.fulfillment_status + '">' + inv.fulfillment_status.replace('_',' ') + '</span>';
  var paymentBlock = '';
  if (inv.balance > 0) {
    paymentBlock = '<div class="line"><span>Subtotal</span><span>' + UGX(inv.subtotal) + '</span></div>' + (inv.tax_amount > 0 ? '<div class="line"><span>Tax</span><span>' + UGX(inv.tax_amount) + '</span></div>' : '') + (inv.discount > 0 ? '<div class="line"><span>Discount</span><span>-' + UGX(inv.discount) + '</span></div>' : '') + '<div class="line"><span>TOTAL</span><span><b>' + UGX(inv.total) + '</b></span></div><div class="line"><span>Paid</span><span style="color:var(--success);">' + UGX(inv.amount_paid) + '</span></div><div class="balance-big">BALANCE DUE: ' + UGX(inv.balance) + '</div>';
  } else {
    paymentBlock = '<div class="line"><span>Subtotal</span><span>' + UGX(inv.subtotal) + '</span></div>' + (inv.tax_amount > 0 ? '<div class="line"><span>Tax</span><span>' + UGX(inv.tax_amount) + '</span></div>' : '') + (inv.discount > 0 ? '<div class="line"><span>Discount</span><span>-' + UGX(inv.discount) + '</span></div>' : '') + '<div class="total-row"><span>TOTAL</span><span>' + UGX(inv.total) + '</span></div><div class="paid-big">✓ FULLY PAID</div>';
  }
  document.getElementById('receipt-body').innerHTML =
    '<div class="header"><h2>OKK STORES</h2><p>Plot 14 Keyo Road, Gulu City</p><p>Tel: 0772949121</p><p style="margin-top:8px;">Sales Receipt</p></div>' +
    '<div class="line"><span>Invoice:</span><b>' + escapeHtml(inv.invoice_no) + '</b></div>' +
    '<div class="line"><span>Date:</span><span>' + new Date(inv.created_at).toLocaleString() + '</span></div>' +
    '<div class="line"><span>Customer:</span><span>' + escapeHtml(inv.customer_name) + '</span></div>' +
    (inv.customer_phone ? '<div class="line"><span>Phone:</span><span>' + escapeHtml(inv.customer_phone) + '</span></div>' : '') +
    '<div class="status-row screen-only">' + paymentPill + fulfillPill + '</div>' +
    '<div class="divider"></div>' + items + '<div class="divider"></div>' + paymentBlock +
    '<div class="divider"></div><p style="text-align:center;font-size:11px;color:var(--text-muted);margin-top:10px;">Thank you for shopping with OKK Stores!</p>' +
    '<div class="modal-actions screen-only" style="margin-top:18px;">' +
      (inv.fulfillment_status === 'not_taken' ? '<button class="btn btn-success" onclick="markTaken(' + inv.id + ')">Mark as Taken</button>' : '<button class="btn btn-light" onclick="markNotTaken(' + inv.id + ')">Mark as Not Taken</button>') +
      (inv.balance > 0 ? '<button class="btn btn-primary" onclick="recordPayment(' + inv.id + ',' + inv.balance + ')">Add Payment</button>' : '') +
      '<button class="btn btn-wa" onclick="shareWhatsApp(' + inv.id + ')">Share to WhatsApp</button>' +
      '<button class="btn btn-light" onclick="downloadInvoicePDF(' + inv.id + ')">PDF</button>' +
    '</div>';
  document.getElementById('receipt-modal').classList.remove('hidden');
}
window.markTaken = async function(id) { await api.orders.setFulfillment(id, 'taken'); var inv = await api.orders.getById(id); showReceipt(inv); window.toast.success('Marked as taken'); if (document.getElementById('view-orders').classList.contains('active')) loadOrders(currentFilter); if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard(); };
window.markNotTaken = async function(id) { await api.orders.setFulfillment(id, 'not_taken'); var inv = await api.orders.getById(id); showReceipt(inv); window.toast.info('Marked as not taken'); if (document.getElementById('view-orders').classList.contains('active')) loadOrders(currentFilter); if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard(); };
window.recordPayment = function(id, max) {
  var amt = parseInt(prompt('Enter payment amount (UGX). Max: ' + max, max) || 0);
  if (!amt || amt <= 0) return;
  (async function() {
    try {
      await api.orders.addPayment(id, amt, 'Additional payment');
      var inv = await api.orders.getById(id);
      showReceipt(inv);
      window.toast.success('Payment recorded: ' + UGX(amt));
      if (document.getElementById('view-orders').classList.contains('active')) loadOrders(currentFilter);
      if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
    } catch (e) { window.toast.error(e.message); }
  })();
};
window.shareWhatsApp = async function(id) {
  var inv = await api.orders.getById(id);
  var phone = (inv.customer_phone || '').replace(/[^0-9]/g, '');
  if (!phone) { window.toast.warning('No customer phone on this receipt.'); return; }
  var msg = '*OKK STORES*\nPlot 14 Keyo Road, Gulu City\nTel: 0772949121\n--------------------\n';
  msg += '*Invoice:* ' + inv.invoice_no + '\n';
  msg += '*Date:* ' + new Date(inv.created_at).toLocaleString() + '\n';
  msg += '*Customer:* ' + inv.customer_name + '\n--------------------\n';
  inv.items.forEach(function(i) { msg += i.product_name + ' x ' + i.quantity + '  =  ' + UGX(i.line_total) + '\n'; });
  msg += '--------------------\nSubtotal: ' + UGX(inv.subtotal) + '\n';
  if (inv.tax_amount > 0) msg += 'Tax: ' + UGX(inv.tax_amount) + '\n';
  if (inv.discount > 0) msg += 'Discount: -' + UGX(inv.discount) + '\n';
  msg += '*TOTAL: ' + UGX(inv.total) + '*\nPaid: ' + UGX(inv.amount_paid) + '\n';
  if (inv.balance > 0) msg += '*BALANCE DUE: ' + UGX(inv.balance) + '*\n'; else msg += 'FULLY PAID\n';
  msg += '--------------------\nThank you!';
  await window.api.system.openExternal('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg));
  window.toast.success('Opening WhatsApp...');
};
document.getElementById('receipt-close').addEventListener('click', function(){ document.getElementById('receipt-modal').classList.add('hidden'); });
document.getElementById('receipt-print').addEventListener('click', function(){ window.print(); });

// ============ REPORTS ============
var currentReport = null;
var chartRevenue = null, chartPayments = null, chartProducts = null;
var CHART_COLORS = { primary: '#FE9F43', secondary: '#092C4C', success: '#28C76F', danger: '#EA5455', warning: '#FF9F43', info: '#17A2B8', purple: '#7367F0' };
function getRangeByKey(key) {
  var now = new Date();
  var from = new Date(), to = new Date();
  if (key === 'today') { /* same day */ }
  else if (key === '7d') from.setDate(now.getDate() - 6);
  else if (key === '30d') from.setDate(now.getDate() - 29);
  else if (key === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (key === 'lastmonth') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (key === 'year') from = new Date(now.getFullYear(), 0, 1);
  return { from: fmtDate(from), to: fmtDate(to) };
}
document.querySelectorAll('.range-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.range-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    var r = getRangeByKey(btn.dataset.range);
    document.getElementById('report-from').value = r.from;
    document.getElementById('report-to').value = r.to;
    loadReports();
  });
});
document.getElementById('btn-apply-range').addEventListener('click', loadReports);
async function loadReports() {
  var from = document.getElementById('report-from').value;
  var to = document.getElementById('report-to').value;
  if (!from || !to) { var r = getRangeByKey('month'); from = r.from; to = r.to; document.getElementById('report-from').value = from; document.getElementById('report-to').value = to; }
  var data = await api.reports.sales(from, to);
  currentReport = data;
  document.getElementById('rep-billed').textContent = UGX(data.totals.billed);
  document.getElementById('rep-collected').textContent = UGX(data.totals.collected);
  document.getElementById('rep-outstanding').textContent = UGX(data.totals.outstanding);
  document.getElementById('rep-profit').textContent = UGX(data.totals.profit);
  document.getElementById('rep-orders').textContent = data.totals.orders;
  document.getElementById('rep-avg').textContent = UGX(data.totals.avgOrder);
  renderRevenueChart(data.daily);
  renderPaymentsChart(data.paymentSplit);
  renderProductsChart(data.topProducts);
  renderTopCustomers(data.topCustomers);
  renderDailyTable(data.daily);
}
function renderRevenueChart(daily) {
  var ctx = document.getElementById('chart-revenue');
  if (chartRevenue) chartRevenue.destroy();
  chartRevenue = new Chart(ctx, { type: 'line', data: { labels: daily.map(function(d){ return d.day; }), datasets: [{ label: 'Revenue (UGX)', data: daily.map(function(d){ return d.revenue; }), borderColor: CHART_COLORS.primary, backgroundColor: 'rgba(254, 159, 67, 0.1)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: CHART_COLORS.primary, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: function(v){ return 'UGX ' + Number(v).toLocaleString(); } } }, x: { grid: { display: false } } } } });
}
function renderPaymentsChart(split) {
  var ctx = document.getElementById('chart-payments');
  if (chartPayments) chartPayments.destroy();
  var labels = split.map(function(s){ return s.payment_status; });
  var values = split.map(function(s){ return s.amount; });
  var colors = { paid: CHART_COLORS.success, partial: CHART_COLORS.warning, unpaid: CHART_COLORS.danger };
  chartPayments = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: values, backgroundColor: labels.map(function(l){ return colors[l] || CHART_COLORS.info; }), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function(c){ return c.label + ': UGX ' + Number(c.raw).toLocaleString(); } } } } } });
}
function renderProductsChart(products) {
  var ctx = document.getElementById('chart-products');
  if (chartProducts) chartProducts.destroy();
  chartProducts = new Chart(ctx, { type: 'bar', data: { labels: products.map(function(p){ return p.product_name; }), datasets: [{ label: 'Revenue (UGX)', data: products.map(function(p){ return p.revenue; }), backgroundColor: CHART_COLORS.purple, borderRadius: 6, barThickness: 22 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: function(v){ return 'UGX ' + Number(v).toLocaleString(); } } }, y: { grid: { display: false } } } } });
}
function renderTopCustomers(customers) {
  var tbody = document.querySelector('#top-customers-table tbody');
  tbody.innerHTML = customers.length
    ? customers.map(function(c) { return '<tr><td><b>' + escapeHtml(c.name) + '</b></td><td>' + c.orders + '</td><td>' + UGX(c.billed) + '</td><td style="color:' + (c.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(c.balance) + '</td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No sales in this period.</td></tr>';
}
function renderDailyTable(daily) {
  var tbody = document.querySelector('#daily-table tbody');
  tbody.innerHTML = daily.length
    ? daily.slice().reverse().map(function(d) { return '<tr><td>' + d.day + '</td><td>' + d.orders + '</td><td>' + UGX(d.revenue) + '</td><td>' + UGX(d.collected) + '</td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No sales in this period.</td></tr>';
}

// ============ PDF / CSV EXPORTS ============
function pdfHeader(doc) {
  doc.setFontSize(18); doc.setFont(undefined, 'bold'); doc.text('OKK STORES', 105, 15, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text('Plot 14 Keyo Road, Gulu City  •  Tel: 0772949121', 105, 21, { align: 'center' });
}
function downloadInvoicePDF(id) {
  (async function() {
    try {
      var inv = await api.orders.getById(id);
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF();
      pdfHeader(doc);
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Sales Receipt', 105, 30, { align: 'center' });
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text('Invoice: ' + inv.invoice_no, 20, 42);
      doc.text('Date: ' + new Date(inv.created_at).toLocaleString(), 20, 48);
      doc.text('Customer: ' + inv.customer_name, 20, 54);
      if (inv.customer_phone) doc.text('Phone: ' + inv.customer_phone, 20, 60);
      var rows = inv.items.map(function(i) { return [i.product_name, String(i.quantity), 'UGX ' + i.unit_price.toLocaleString(), 'UGX ' + i.line_total.toLocaleString()]; });
      doc.autoTable({ head: [['Item', 'Qty', 'Unit Price', 'Total']], body: rows, startY: 68, theme: 'striped', headStyles: { fillColor: [254, 159, 67] }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
      var y = doc.lastAutoTable.finalY + 8;
      doc.text('Subtotal: UGX ' + inv.subtotal.toLocaleString(), 140, y);
      if (inv.tax_amount > 0) doc.text('Tax: UGX ' + inv.tax_amount.toLocaleString(), 140, y + 6);
      if (inv.discount > 0) doc.text('Discount: -UGX ' + inv.discount.toLocaleString(), 140, y + 12);
      doc.setFont(undefined, 'bold'); doc.text('TOTAL: UGX ' + inv.total.toLocaleString(), 140, y + 20);
      doc.setFont(undefined, 'normal'); doc.text('Paid: UGX ' + inv.amount_paid.toLocaleString(), 140, y + 28);
      if (inv.balance > 0) { doc.setTextColor(234, 84, 85); doc.setFont(undefined, 'bold'); doc.text('BALANCE DUE: UGX ' + inv.balance.toLocaleString(), 140, y + 36); doc.setTextColor(0, 0, 0); }
      else { doc.setTextColor(40, 199, 111); doc.setFont(undefined, 'bold'); doc.text('FULLY PAID', 140, y + 36); doc.setTextColor(0, 0, 0); }
      doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text('Thank you for shopping with OKK Stores!', 105, 280, { align: 'center' });
      var res = await window.api.system.saveFile({ defaultName: inv.invoice_no + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
      if (res.success) window.toast.success('Saved: ' + res.path);
      else if (res.error) window.toast.error('Save failed: ' + res.error);
    } catch (e) { window.toast.error(e.message || String(e)); }
  })();
}
window.downloadInvoicePDF = downloadInvoicePDF;
async function exportCustomerStatement(customerId) {
  try {
    var c = await api.customers.getById(customerId);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    pdfHeader(doc);
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Customer Statement', 105, 30, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('Customer: ' + c.name, 20, 42);
    if (c.phone) doc.text('Phone: ' + c.phone, 20, 48);
    doc.text('Statement Date: ' + new Date().toLocaleString(), 20, c.phone ? 54 : 48);
    var rows = c.invoices.map(function(i) { return [i.invoice_no, new Date(i.created_at).toLocaleDateString(), 'UGX ' + i.total.toLocaleString(), 'UGX ' + i.amount_paid.toLocaleString(), 'UGX ' + i.balance.toLocaleString(), i.payment_status]; });
    doc.autoTable({ head: [['Invoice', 'Date', 'Total', 'Paid', 'Balance', 'Status']], body: rows, startY: 62, theme: 'striped', headStyles: { fillColor: [254, 159, 67] }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    var y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Lifetime Billed: UGX ' + c.lifetime_total.toLocaleString(), 20, y);
    doc.text('Lifetime Paid:   UGX ' + c.lifetime_paid.toLocaleString(), 20, y + 7);
    doc.setTextColor(234, 84, 85); doc.text('Outstanding:     UGX ' + c.outstanding.toLocaleString(), 20, y + 14);
    doc.setTextColor(0, 0, 0);
    var res = await window.api.system.saveFile({ defaultName: 'Statement_' + c.name.replace(/[^a-z0-9]/gi, '_') + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
    if (res.success) window.toast.success('Saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error(e.message || String(e)); }
}
window.exportCustomerStatement = exportCustomerStatement;
document.getElementById('btn-export-pdf').addEventListener('click', async function() {
  if (!currentReport) { window.toast.warning('Load a report first'); return; }
  try {
    var data = currentReport;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    pdfHeader(doc);
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('Sales Report', 105, 30, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('Period: ' + data.range.from + ' to ' + data.range.to, 105, 36, { align: 'center' });
    var summaryRows = [['Total Billed', 'UGX ' + data.totals.billed.toLocaleString()],['Total Collected', 'UGX ' + data.totals.collected.toLocaleString()],['Outstanding', 'UGX ' + data.totals.outstanding.toLocaleString()],['Cost of Goods Sold', 'UGX ' + data.totals.cogs.toLocaleString()],['Estimated Profit', 'UGX ' + data.totals.profit.toLocaleString()],['Number of Orders', String(data.totals.orders)],['Average Order Value', 'UGX ' + data.totals.avgOrder.toLocaleString()]];
    doc.autoTable({ head: [['Summary', 'Value']], body: summaryRows, startY: 44, theme: 'grid', headStyles: { fillColor: [254, 159, 67] }, columnStyles: { 1: { halign: 'right' } } });
    if (data.topProducts.length) {
      var pRows = data.topProducts.map(function(p) { return [p.product_name, String(p.qty), 'UGX ' + p.revenue.toLocaleString()]; });
      doc.autoTable({ head: [['Top Products', 'Qty Sold', 'Revenue']], body: pRows, startY: doc.lastAutoTable.finalY + 10, theme: 'striped', headStyles: { fillColor: [115, 103, 240] }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } } });
    }
    if (data.topCustomers.length) {
      var cRows = data.topCustomers.map(function(c) { return [c.name, String(c.orders), 'UGX ' + c.billed.toLocaleString(), 'UGX ' + c.balance.toLocaleString()]; });
      doc.autoTable({ head: [['Top Customers', 'Orders', 'Billed', 'Balance']], body: cRows, startY: doc.lastAutoTable.finalY + 10, theme: 'striped', headStyles: { fillColor: [40, 199, 111] }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
    }
    var res = await window.api.system.saveFile({ defaultName: 'Sales_Report_' + data.range.from + '_to_' + data.range.to + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
    if (res.success) window.toast.success('Report saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error(e.message || String(e)); }
});
document.getElementById('btn-export-csv').addEventListener('click', async function() {
  if (!currentReport) { window.toast.warning('Load a report first'); return; }
  var data = currentReport;
  var lines = [];
  lines.push('OKK STORES - Sales Report');
  lines.push('Period,' + data.range.from + ',' + data.range.to);
  lines.push(''); lines.push('Summary');
  lines.push('Total Billed,' + data.totals.billed);
  lines.push('Total Collected,' + data.totals.collected);
  lines.push('Outstanding,' + data.totals.outstanding);
  lines.push('Cost of Goods Sold,' + data.totals.cogs);
  lines.push('Estimated Profit,' + data.totals.profit);
  lines.push('Number of Orders,' + data.totals.orders);
  lines.push('Average Order Value,' + data.totals.avgOrder);
  lines.push(''); lines.push('Top Products'); lines.push('Product,Quantity,Revenue');
  data.topProducts.forEach(function(p) { lines.push('"' + p.product_name.replace(/"/g,'""') + '",' + p.qty + ',' + p.revenue); });
  lines.push(''); lines.push('Top Customers'); lines.push('Customer,Orders,Billed,Balance');
  data.topCustomers.forEach(function(c) { lines.push('"' + c.name.replace(/"/g,'""') + '",' + c.orders + ',' + c.billed + ',' + c.balance); });
  lines.push(''); lines.push('Daily Breakdown'); lines.push('Date,Orders,Billed,Collected');
  data.daily.forEach(function(d) { lines.push(d.day + ',' + d.orders + ',' + d.revenue + ',' + d.collected); });
  var res = await window.api.system.saveFile({ defaultName: 'Sales_Report_' + data.range.from + '_to_' + data.range.to + '.csv', content: lines.join('\n'), encoding: 'utf8' });
  if (res.success) window.toast.success('CSV saved: ' + res.path);
  else if (res.error) window.toast.error('Save failed: ' + res.error);
});

// ============ BACKUP & RESTORE ============
async function loadBackups() {
  try {
    var info = await api.backup.getInfo();
    var list = await api.backup.list();

    document.getElementById('backup-count').textContent = list.length;
    document.getElementById('backup-primary-dir').textContent = info.dirs[0] || '—';

    if (list.length > 0) {
      var last = new Date(list[0].mtime);
      document.getElementById('backup-last').textContent =
        last.toLocaleDateString() + ' ' + last.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    } else {
      document.getElementById('backup-last').textContent = 'No backups yet';
    }

    var tbody = document.querySelector('#backups-table tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No backups found. Click "Backup Now" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function(b) {
      var dt = new Date(b.mtime);
      var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      var sizeKB = Math.round(b.size / 1024);
      var sizeStr = sizeKB < 1024 ? sizeKB + ' KB' : (sizeKB / 1024).toFixed(1) + ' MB';
      var locShort = b.dir.indexOf(':') > -1 ? b.dir.split('\\').slice(0,2).join('\\') : b.dir;
      return '<tr>' +
        '<td>' + dateStr + '</td>' +
        '<td><b>' + escapeHtml(b.filename) + '</b></td>' +
        '<td>' + sizeStr + '</td>' +
        '<td style="font-size:12px;color:var(--text-muted);">' + escapeHtml(locShort) + '</td>' +
        '<td>' +
          '<button class="btn btn-light btn-sm" onclick="openBackupFolder(\'' + escapeAttr(b.dir) + '\')">Open</button>' +
          '<button class="btn btn-danger btn-sm" onclick="restoreBackup(\'' + escapeAttr(b.fullPath) + '\')">Restore</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    window.toast.error('Failed to load backups: ' + e.message);
  }
}
window.openBackupFolder = async function(dirOrKey) {
  try {
    var dir = dirOrKey;
    if (dirOrKey === 'primary') {
      var info = await api.backup.getInfo();
      dir = info.dirs[0];
    }
    if (!dir) { window.toast.warning('Folder path unavailable'); return; }
    await api.backup.openFolder(dir);
  } catch (e) {
    window.toast.error('Could not open folder: ' + e.message);
  }
};
window.restoreBackup = async function(filePath) {
  var confirmed = await showConfirm({
    title: 'Restore this backup?',
    message: 'This will replace ALL current data with the backup from ' + filePath.split(/[\\\/]/).pop() + '. A safety copy of the current data is saved first. The app will restart.',
    confirmText: 'Restore & Restart',
    danger: true,
    icon: '⟲'
  });
  if (!confirmed) return;
  window.toast.info('Restoring backup...');
  try {
    var result = await api.backup.restore(filePath);
    window.toast.success('Backup restored. Restarting...');
    console.log('Safety backup saved at:', result.safetyBackup);
  } catch (e) {
    window.toast.error('Restore failed: ' + e.message);
  }
};
document.getElementById('btn-backup-now').addEventListener('click', async function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Backing up...';
  try {
    var result = await api.backup.create();
    window.toast.success('Backup created: ' + result.filename + ' (' + result.files + ' files)');
    await loadBackups();
  } catch (e) {
    window.toast.error('Backup failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Backup Now';
  }
});

// ============ AUTO-UPDATER ============
(async function initUpdater() {
  try {
    var version = await api.updater.getVersion();
    var vEl = document.getElementById('user-version');
    if (vEl) vEl.textContent = 'v' + version;
  } catch (e) { /* silent */ }
  api.updater.onEvent('update:available', function(info) { window.toast.info('Update available: v' + info.version + ' - downloading...', 6000); });
  api.updater.onEvent('update:none', function(info) { console.log('[updater] Up to date'); });
  api.updater.onEvent('update:error', function(data) { console.error('[updater] Error:', data.message); });
  api.updater.onEvent('update:progress', function(data) { /* no-op */ });
  api.updater.onEvent('update:downloaded', function(info) { showUpdateReadyToast(info.version); });
})();
function showUpdateReadyToast(version) {
  var container = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast success';
  el.style.minWidth = '340px';
  el.innerHTML = '<span class="toast-icon">↑</span><span class="toast-message"><b>Update ready: v' + escapeHtml(version) + '</b><br><span style="font-size:12px;color:var(--text-muted);">Restart to apply the new version.</span></span><button class="toast-close" style="display:none;">x</button>';
  var restart = document.createElement('button');
  restart.textContent = 'Restart Now';
  restart.className = 'btn btn-primary btn-sm';
  restart.addEventListener('click', async function() { restart.disabled = true; restart.textContent = 'Restarting...'; await api.updater.install(); });
  el.appendChild(restart);
  container.appendChild(el);
}
document.getElementById('btn-check-update').addEventListener('click', async function() {
  window.toast.info('Checking for updates...');
  try { await api.updater.check(); } catch (e) { window.toast.error('Update check failed'); }
});

// ============ BOOT ============
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
if (sessionStorage.getItem('okk_logged_in') === '1') {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  loadDashboard();
  updateNotificationBadge();
} else {
  initLogin();
}
console.log('>>> ui.js ready');
