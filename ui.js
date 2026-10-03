console.log('>>> ui.js loaded (v3.1.0 + money formatter)');
var api = window.api;

function UGX(n) { return 'UGX ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

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

// ---------- MONEY INPUT FORMATTER ----------
// Adds thousands separators (1,000,000) as the user types.
// Works on any input with class="money-input". The raw numeric value
// stays accessible via getMoneyValue(id).
function attachMoneyFormatter(el) {
  if (!el || el.dataset.moneyBound === '1') return;
  el.dataset.moneyBound = '1';
  el.setAttribute('type', 'text');
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocomplete', 'off');

  var initial = el.value;
  if (initial !== '' && !isNaN(initial)) {
    el.value = parseInt(initial, 10).toLocaleString('en-US');
  }

  el.addEventListener('input', function() {
    var raw = el.value.replace(/[^0-9]/g, '');
    if (raw === '') { el.value = ''; return; }
    var num = parseInt(raw, 10);
    var caretFromEnd = el.value.length - el.selectionStart;
    el.value = num.toLocaleString('en-US');
    var newPos = Math.max(0, el.value.length - caretFromEnd);
    try { el.setSelectionRange(newPos, newPos); } catch (e) {}
  });

  el.addEventListener('blur', function() {
    var raw = el.value.replace(/[^0-9]/g, '');
    if (raw === '') { el.value = ''; return; }
    el.value = parseInt(raw, 10).toLocaleString('en-US');
  });
}

function getMoneyValue(elOrId) {
  var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return 0;
  var raw = String(el.value || '').replace(/[^0-9]/g, '');
  return raw === '' ? 0 : parseInt(raw, 10);
}

function setMoneyValue(elOrId, value) {
  var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  var n = parseInt(value, 10);
  el.value = isNaN(n) ? '' : n.toLocaleString('en-US');
}

function bindAllMoneyInputs(scope) {
  var root = scope || document;
  root.querySelectorAll('input.money-input').forEach(attachMoneyFormatter);
}

// ============ TOASTS ============
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration === undefined ? 3500 : duration;
  var container = document.getElementById('toast-container');
  var icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span class="toast-message">' + escapeHtml(message) + '</span><button class="toast-close">x</button>';
  container.appendChild(el);
  function remove() { el.classList.add('removing'); setTimeout(function(){ el.remove(); }, 250); }
  el.querySelector('.toast-close').addEventListener('click', remove);
  if (duration > 0) setTimeout(remove, duration);
}
window.toast = {
  success: function(m){ showToast(m, 'success'); },
  error:   function(m){ showToast(m, 'error', 5000); },
  warning: function(m){ showToast(m, 'warning', 4000); },
  info:    function(m){ showToast(m, 'info'); }
};

function showConfirm(options) {
  return new Promise(function(resolve) {
    var modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.innerHTML = '<div class="confirm-box"><div class="confirm-icon">' + (options.icon || '?') + '</div><div class="confirm-title">' + escapeHtml(options.title || 'Are you sure?') + '</div><div class="confirm-message">' + escapeHtml(options.message || '') + '</div><div class="confirm-actions"><button class="btn btn-light cancel">' + escapeHtml(options.cancelText || 'Cancel') + '</button><button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + ' confirm">' + escapeHtml(options.confirmText || 'Confirm') + '</button></div></div>';
    document.body.appendChild(modal);
    function cleanup(a) { modal.remove(); resolve(a); }
    modal.querySelector('.cancel').addEventListener('click', function(){ cleanup(false); });
    modal.querySelector('.confirm').addEventListener('click', function(){ cleanup(true); });
    modal.addEventListener('click', function(e){ if (e.target === modal) cleanup(false); });
    document.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); cleanup(false); } });
  });
}
window.confirmDialog = showConfirm;

// ============ DARK MODE ============
function applyDarkMode(enabled) {
  if (enabled) { document.body.classList.add('dark-mode'); var l=document.getElementById('dark-toggle-label'); if(l) l.textContent='Light Mode'; localStorage.setItem('okk_dark','1'); }
  else { document.body.classList.remove('dark-mode'); var l2=document.getElementById('dark-toggle-label'); if(l2) l2.textContent='Dark Mode'; localStorage.setItem('okk_dark','0'); }
}
applyDarkMode(localStorage.getItem('okk_dark') === '1');
document.getElementById('btn-dark-toggle').addEventListener('click', function() { applyDarkMode(!document.body.classList.contains('dark-mode')); });

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
    try { await api.auth.setPassword(pw); showApp(); window.toast.success('Password created'); }
    catch (e) { err.style.color = '#EA5455'; err.textContent = e.message || 'Setup failed'; }
  } else {
    var ok = await api.auth.checkPassword(pw);
    if (ok) { showApp(); window.toast.success('Welcome back'); }
    else { err.style.color = '#EA5455'; err.textContent = 'Incorrect password'; document.getElementById('login-pass').value = ''; document.getElementById('login-pass').focus(); }
  }
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-pass2').value = '';
  sessionStorage.setItem('okk_logged_in', '1');
  bindAllMoneyInputs(document);
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
['login-pass','login-pass2'].forEach(function(id) { document.getElementById(id).addEventListener('keydown', function(e){ if (e.key === 'Enter') tryLogin(); }); });
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
  if (v === 'suppliers') loadSuppliers();
  if (v === 'purchases') loadPurchaseOrders('all');
  if (v === 'stocktake') loadStockTake();
  if (v === 'expenses') loadExpenses();
  if (v === 'cashbook') { loadCashBook(); loadDepositors(); }
  if (v === 'preorders') loadPreOrders('all');
  if (v === 'sale') loadSaleProducts();
  if (v === 'orders') loadOrders('all');
  if (v === 'reports') loadReports();
  if (v === 'backups') loadBackups();
}

// ============ DASHBOARD TABS ============
document.querySelectorAll('#dash-tabs .tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('#dash-tabs .tab').forEach(function(t){ t.classList.remove('active'); });
    tab.classList.add('active');
    document.querySelectorAll('.dash-tab-content').forEach(function(c){ c.classList.add('hidden'); });
    document.getElementById('dash-' + tab.dataset.tab).classList.remove('hidden');
    if (tab.dataset.tab === 'operations') loadOperationsSummary();
  });
});

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
    ? low.map(function(p){ return '<tr><td><b>' + escapeHtml(p.name) + '</b></td><td>' + p.stock + '</td><td>' + p.reorder_level + '</td><td><button class="btn btn-light btn-sm" onclick="restock(' + p.id + ')">Restock</button></td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">All products sufficiently stocked.</td></tr>';
  var bw = await api.dashboard.bestWorst();
  if (bw.best) { document.getElementById('stat-best').textContent = bw.best.name; document.getElementById('stat-best-qty').textContent = bw.best.qty_sold + ' sold'; }
  else { document.getElementById('stat-best').textContent = 'No sales yet'; document.getElementById('stat-best-qty').textContent = ''; }
  if (bw.worst && (!bw.best || bw.worst.name !== bw.best.name)) {
    document.getElementById('stat-worst').textContent = bw.worst.name;
    document.getElementById('stat-worst-qty').textContent = bw.worst.qty_sold + ' sold';
  } else { document.getElementById('stat-worst').textContent = '—'; document.getElementById('stat-worst-qty').textContent = ''; }
  await loadTopDebtors();
}
async function loadOperationsSummary() {
  try {
    var o = await api.dashboard.operations();
    document.getElementById('ops-expenses').textContent = UGX(o.monthlyExpenses);
    document.getElementById('ops-gross').textContent = UGX(o.grossProfit);
    document.getElementById('ops-net').textContent = UGX(o.netProfit);
    document.getElementById('ops-pending-pos').textContent = o.pendingPOs;
    document.getElementById('ops-preorders').textContent = o.activePreOrders;
    document.getElementById('ops-supplier-balance').textContent = UGX(o.supplierBalance);
    document.getElementById('ops-revenue').textContent = UGX(o.monthlyRevenue);
    document.getElementById('ops-cogs').textContent = UGX(o.monthlyCogs);
    var margin = o.monthlyRevenue > 0 ? ((o.grossProfit / o.monthlyRevenue) * 100).toFixed(1) : '0';
    document.getElementById('ops-margin').textContent = margin + '%';
  } catch (e) { console.error('[ops]', e); }
}
window.restock = async function(id) {
  var qty = parseInt(prompt('Add how many units?') || 0);
  if (qty > 0) { await api.products.adjustStock(id, qty, 'Restock'); loadDashboard(); window.toast.success('Stock updated'); }
};

// ============ FOLLOW-UP DEBTORS ============
async function loadTopDebtors() {
  try {
    var debtors = await api.dashboard.topDebtors(5);
    var tbody = document.querySelector('#top-debtors-table tbody');
    if (!tbody) return;
    if (!debtors.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No overdue balances. Well done!</td></tr>'; return; }
    tbody.innerHTML = debtors.map(function(d) {
      var days = d.days_overdue;
      var daysClass = days > 90 ? 'var(--danger)' : (days > 30 ? 'var(--warning)' : 'var(--success)');
      var phone = (d.phone || '').replace(/[^0-9]/g, '');
      var waBtn = phone ? '<button class="btn btn-wa btn-sm" onclick="sendDebtReminder(' + d.id + ',\'' + escapeAttr(d.name) + '\',' + d.total_owed + ',\'' + escapeAttr(d.phone || '') + '\')">WhatsApp</button>' : '';
      return '<tr><td><b>' + escapeHtml(d.name) + '</b>' + (d.phone ? '<div style="font-size:11px;color:var(--text-muted);">' + escapeHtml(d.phone) + '</div>' : '') + '</td><td style="color:var(--danger);font-weight:700;">' + UGX(d.total_owed) + '</td><td><span style="color:' + daysClass + ';font-weight:600;">' + days + ' days</span></td><td>' + d.invoice_count + '</td><td>' + waBtn + '<button class="btn btn-light btn-sm" onclick="viewCustomer(' + d.id + ')">View</button><button class="btn btn-primary btn-sm" onclick="quickPayment(' + d.id + ')">Record Payment</button></td></tr>';
    }).join('');
  } catch (e) { console.error('[debtors]', e); }
}
window.sendDebtReminder = async function(customerId, customerName, amount, phone) {
  var cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) { window.toast.warning('No phone number on file.'); return; }
  var msg = '*OKK STORES*\nPlot 14 Keyo Road, Gulu City\nTel: 0772949121\n-------------------------\n\nDear ' + customerName + ',\n\nYou have an outstanding balance of *UGX ' + Number(amount).toLocaleString('en-US') + '*. Please settle at your convenience.\n\n— OKK Stores';
  await window.api.system.openExternal('https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg));
  window.toast.success('Opening WhatsApp...');
};
window.quickPayment = async function(customerId) {
  try {
    var c = await api.customers.getById(customerId);
    if (!c || !c.invoices || !c.invoices.length) { window.toast.warning('No invoices.'); return; }
    var unpaid = c.invoices.filter(function(i) { return i.balance > 0; });
    if (!unpaid.length) { window.toast.info('No outstanding balance.'); return; }
    if (unpaid.length === 1) { recordPayment(unpaid[0].id, unpaid[0].balance); return; }
    var rows = unpaid.map(function(i) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);"><div><b>' + escapeHtml(i.invoice_no) + '</b><div style="font-size:11px;color:var(--text-muted);">' + new Date(i.created_at).toLocaleDateString() + '</div></div><div style="color:var(--danger);font-weight:700;">' + UGX(i.balance) + '</div><button class="btn btn-primary btn-sm" onclick="closeModal();recordPayment(' + i.id + ',' + i.balance + ')">Pay</button></div>'; }).join('');
    openModal('Choose Invoice — ' + c.name, rows, async function() {});
    document.getElementById('modal-confirm').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { window.toast.error('Failed: ' + e.message); }
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
    if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
  } catch (e) {}
}
async function renderNotifications() {
  var products = await api.products.getAll();
  var low = products.filter(function(p){ return p.stock <= p.reorder_level; });
  var aging = await api.customers.aging();
  var html = '<div class="notif-head">Notifications</div>';
  if (!low.length && aging.older === 0 && aging.d90 === 0 && aging.d60 === 0) html += '<div class="notif-empty">All clear — no alerts</div>';
  else {
    low.slice(0, 5).forEach(function(p) { html += '<div class="notif-item" onclick="gotoView(\'products\')"><span class="notif-dot warning"></span><span class="notif-body"><b>' + escapeHtml(p.name) + '</b> is low<small>Only ' + p.stock + ' left — reorder at ' + p.reorder_level + '</small></span></div>'; });
    if (aging.older > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot danger"></span><span class="notif-body"><b>Very old debt: ' + UGX(aging.older) + '</b><small>180+ days overdue</small></span></div>';
    if (aging.d90 > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot danger"></span><span class="notif-body"><b>Debt 91–180 days: ' + UGX(aging.d90) + '</b><small>Follow up</small></span></div>';
    if (aging.d60 > 0) html += '<div class="notif-item" onclick="gotoView(\'orders\')"><span class="notif-dot warning"></span><span class="notif-body"><b>Debt 61–90 days: ' + UGX(aging.d60) + '</b><small>Send reminders</small></span></div>';
  }
  var dd = document.getElementById('notification-dropdown');
  dd.innerHTML = html;
  dd.classList.remove('hidden');
}
window.gotoView = function(viewName) { var link = document.querySelector('.sidebar-nav a[data-view="' + viewName + '"]'); if (link) link.click(); document.getElementById('notification-dropdown').classList.add('hidden'); };
document.getElementById('btn-notifications').addEventListener('click', function(e) { e.stopPropagation(); var dd = document.getElementById('notification-dropdown'); if (dd.classList.contains('hidden')) renderNotifications(); else dd.classList.add('hidden'); });
document.addEventListener('click', function(e) { var dd = document.getElementById('notification-dropdown'); if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && e.target.id !== 'btn-notifications') dd.classList.add('hidden'); });

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
    if (!pHits.length && !cHits.length && !oHits.length) html = '<div class="search-empty">No results</div>';
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
  var f = cachedProducts.filter(function(p){ return p.name.toLowerCase().includes(productSearchTerm) || (p.category || '').toLowerCase().includes(productSearchTerm) || (p.barcode || '').includes(productSearchTerm); });
  var tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = f.length
    ? f.map(function(p) {
        var m = p.price > 0 ? (((p.price - p.cost_price) / p.price) * 100).toFixed(1) : '0.0';
        return '<tr><td><b>' + escapeHtml(p.name) + '</b></td><td>' + escapeHtml(p.category || '') + '</td><td>' + UGX(p.cost_price) + '</td><td><b>' + UGX(p.price) + '</b></td><td>' + m + '%</td><td>' + p.stock + '</td><td><code style="font-size:11px;">' + escapeHtml(p.barcode || '—') + '</code></td><td><button class="btn btn-light btn-sm" onclick="manageVariants(' + p.id + ')">Variants</button></td><td><button class="btn btn-light btn-sm" onclick="editProduct(' + p.id + ')">Edit</button><button class="btn btn-light btn-sm" onclick="changePrice(' + p.id + ')">Price</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(' + p.id + ')">Delete</button></td></tr>';
      }).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">No products.</td></tr>';
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
    try { await onConfirm(); closeModal(); } catch (e) { window.toast.error(e.message || String(e)); }
  });
  bindAllMoneyInputs(document.getElementById('modal-body'));
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('btn-add-product').addEventListener('click', function() {
  openModal('Add Product',
    '<label>Name *<input id="f-name"></label><label>Category<input id="f-category" value="General"></label><label>Cost Price (UGX)<input id="f-cost" class="money-input" value="0"></label><label>Sale Price (UGX)<input id="f-price" class="money-input" value="0"></label><label>Initial Stock<input id="f-stock" type="number" value="0"></label><label>Barcode<input id="f-barcode" placeholder="Optional"></label>',
    async function() {
      var name = document.getElementById('f-name').value.trim();
      if (!name) throw new Error('Name is required');
      await api.products.add({ name: name, sku: null, category: document.getElementById('f-category').value.trim() || 'General', cost_price: getMoneyValue('f-cost'), price: getMoneyValue('f-price'), stock: parseInt(document.getElementById('f-stock').value) || 0, reorder_level: 10, location: '', barcode: document.getElementById('f-barcode').value.trim() });
      await loadProducts();
      window.toast.success('Product added: ' + name);
    });
});
window.editProduct = function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  openModal('Edit Product',
    '<label>Name<input id="e-name" value="' + escapeAttr(p.name) + '"></label><label>Category<input id="e-category" value="' + escapeAttr(p.category || '') + '"></label><label>Cost Price (UGX)<input id="e-cost" class="money-input" value="' + p.cost_price + '"></label><label>Sale Price (UGX)<input id="e-price" class="money-input" value="' + p.price + '"></label><label>Stock<input id="e-stock" type="number" value="' + p.stock + '"></label><label>Barcode<input id="e-barcode" value="' + escapeAttr(p.barcode || '') + '"></label>',
    async function() {
      await api.products.update(id, { name: document.getElementById('e-name').value.trim(), category: document.getElementById('e-category').value.trim(), cost_price: getMoneyValue('e-cost'), price: getMoneyValue('e-price'), stock: parseInt(document.getElementById('e-stock').value) || 0, barcode: document.getElementById('e-barcode').value.trim() });
      await loadProducts();
      window.toast.success('Product updated');
    });
};
window.changePrice = function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  openModal('Change Price — ' + p.name, '<label>Current<input value="' + UGX(p.price) + '" disabled></label><label>New Price (UGX)<input id="np-price" class="money-input" value="' + p.price + '"></label>',
    async function() {
      var np = getMoneyValue('np-price');
      if (np <= 0) throw new Error('Invalid price');
      await api.products.update(id, { price: np });
      await loadProducts();
      window.toast.success('Price updated to ' + UGX(np));
    });
};
window.deleteProduct = async function(id) {
  var p = cachedProducts.find(function(x){ return x.id === id; }); if (!p) return;
  var ok = await showConfirm({ title: 'Delete product?', message: 'Delete "' + p.name + '"? This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  try {
    await api.products.delete(id);
    await loadProducts();
    window.toast.success('Product deleted');
  } catch (e) {
    window.toast.error(e.message || 'Cannot delete this product');
  }
};

// ============ VARIANTS ============
window.manageVariants = async function(productId) {
  var p = cachedProducts.find(function(x){ return x.id === productId; }); if (!p) return;
  var variants = await api.variants.getByProduct(productId);
  var rows = variants.map(function(v) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;"><div><b>' + escapeHtml(v.label) + '</b><div style="font-size:11px;color:var(--text-muted);">Price ' + UGX(v.price) + ' • Cost ' + UGX(v.cost_price) + ' • Stock ' + v.stock + (v.barcode ? ' • BC ' + escapeHtml(v.barcode) : '') + '</div></div><div><button class="btn btn-light btn-sm" onclick="editVariant(' + productId + ',' + v.id + ')">Edit</button><button class="btn btn-danger btn-sm" onclick="removeVariant(' + productId + ',' + v.id + ')">Delete</button></div></div>';
  }).join('');
  var body = '<p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:14px;">Add packaging variants (e.g. Sugar 25kg / 10kg / 1kg).</p>' + (rows || '<p style="color:var(--text-muted);text-align:center;padding:16px;">No variants yet.</p>') + '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="addVariantForm(' + productId + ')">+ Add Variant</button>';
  openModal('Variants — ' + p.name, body, async function() {});
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
window.addVariantForm = function(productId) {
  var body = '<label>Label *<input id="v-label" placeholder="e.g. 25kg"></label><label>Sale Price (UGX)<input id="v-price" class="money-input" value="0"></label><label>Cost Price (UGX)<input id="v-cost" class="money-input" value="0"></label><label>Stock<input id="v-stock" type="number" value="0"></label><label>Barcode<input id="v-barcode"></label>';
  openModal('Add Variant', body, async function() {
    var label = document.getElementById('v-label').value.trim();
    if (!label) throw new Error('Label is required');
    await api.variants.add({ product_id: productId, label: label, price: getMoneyValue('v-price'), cost_price: getMoneyValue('v-cost'), stock: parseInt(document.getElementById('v-stock').value) || 0, sort_order: 0, barcode: document.getElementById('v-barcode').value.trim() });
    window.toast.success('Variant added');
    manageVariants(productId);
  });
};
window.editVariant = async function(productId, variantId) {
  var variants = await api.variants.getByProduct(productId);
  var v = variants.find(function(x){ return x.id === variantId; }); if (!v) return;
  var body = '<label>Label<input id="v-label" value="' + escapeAttr(v.label) + '"></label><label>Sale Price (UGX)<input id="v-price" class="money-input" value="' + v.price + '"></label><label>Cost Price (UGX)<input id="v-cost" class="money-input" value="' + v.cost_price + '"></label><label>Stock<input id="v-stock" type="number" value="' + v.stock + '"></label><label>Barcode<input id="v-barcode" value="' + escapeAttr(v.barcode || '') + '"></label>';
  openModal('Edit Variant', body, async function() {
    await api.variants.update(variantId, { label: document.getElementById('v-label').value.trim(), price: getMoneyValue('v-price'), cost_price: getMoneyValue('v-cost'), stock: parseInt(document.getElementById('v-stock').value) || 0, barcode: document.getElementById('v-barcode').value.trim() });
    window.toast.success('Variant updated');
    manageVariants(productId);
  });
};
window.removeVariant = async function(productId, variantId) {
  var ok = await showConfirm({ title: 'Delete variant?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.variants.delete(variantId);
  window.toast.success('Variant deleted');
  manageVariants(productId);
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
        var cashBal = Number(c.cash_balance || 0);
        var cashClass = cashBal > 0 ? 'var(--success)' : (cashBal < 0 ? 'var(--danger)' : 'var(--text-muted)');
        var limit = Number(c.credit_limit || 0);
        var limitStr = limit > 0 ? UGX(limit) : '—';
        var overLimit = limit > 0 && c.outstanding >= limit;
        return '<tr><td><a href="#" onclick="viewCustomer(' + c.id + '); return false;" style="color:var(--primary);text-decoration:none;font-weight:600;">' + escapeHtml(c.name) + '</a></td><td>' + escapeHtml(c.phone || '—') + '</td><td>' + c.order_count + '</td><td><b>' + UGX(c.lifetime_total) + '</b></td><td style="color:' + (c.outstanding > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">' + UGX(c.outstanding) + '</td><td style="color:' + (overLimit ? 'var(--danger)' : 'var(--text-muted)') + ';">' + limitStr + '</td><td style="color:' + cashClass + ';font-weight:600;">' + UGX(cashBal) + '</td><td><button class="btn btn-light btn-sm" onclick="viewCustomer(' + c.id + ')">View</button><button class="btn btn-light btn-sm" onclick="editCustomer(' + c.id + ')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteCustomer(' + c.id + ')">Delete</button></td></tr>';
      }).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">No customers yet.</td></tr>';
}
window.viewCustomer = async function(id) {
  var c = await api.customers.getById(id);
  var ledger = await api.customers.ledger(id);
  var ordersHtml = c.invoices.length
    ? c.invoices.map(function(i) { return '<tr><td><b>' + escapeHtml(i.invoice_no) + '</b><div style="font-size:11px;color:var(--text-muted);">' + new Date(i.created_at).toLocaleDateString() + '</div></td><td>' + UGX(i.total) + '</td><td>' + UGX(i.amount_paid) + '</td><td style="color:' + (i.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(i.balance) + '</td><td><span class="pill ' + i.payment_status + '">' + i.payment_status + '</span></td><td><span class="pill ' + i.fulfillment_status + '">' + i.fulfillment_status.replace('_',' ') + '</span></td><td><button class="btn btn-light btn-sm" onclick="viewOrder(' + i.id + ')">View</button></td></tr>'; }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No orders yet.</td></tr>';
  var ledgerHtml = ledger.length
    ? ledger.map(function(t) { var cls = t.type === 'in' ? 'ledger-tx-in' : 'ledger-tx-out'; var sign = t.type === 'in' ? '+' : '-'; return '<tr><td>' + new Date(t.created_at).toLocaleString() + '</td><td>' + (t.type === 'in' ? 'Cash Received' : 'Cash Paid Out') + '</td><td>' + escapeHtml(t.note || '') + '</td><td class="' + cls + '">' + sign + ' ' + UGX(t.amount) + '</td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">No ledger entries.</td></tr>';
  var cashBal = Number(c.cash_balance || 0);
  var cashColor = cashBal > 0 ? 'var(--success)' : (cashBal < 0 ? 'var(--danger)' : 'var(--text)');
  var limit = Number(c.credit_limit || 0);
  var summary = '<div class="customer-profile-summary"><div class="cell"><span>Lifetime Spend</span><b>' + UGX(c.lifetime_total) + '</b></div><div class="cell"><span>Total Paid</span><b style="color:var(--success);">' + UGX(c.lifetime_paid) + '</b></div><div class="cell"><span>Outstanding</span><b style="color:var(--danger);">' + UGX(c.outstanding) + '</b></div><div class="cell"><span>Cash Balance</span><b style="color:' + cashColor + ';">' + UGX(cashBal) + '</b></div></div>';
  document.getElementById('modal-title').textContent = 'Customer: ' + c.name;
  document.getElementById('modal-body').innerHTML =
    '<div style="margin-bottom:16px;color:var(--text-muted);font-size:13px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><span>Phone: ' + escapeHtml(c.phone || '—') + (limit > 0 ? ' • Credit Limit: ' + UGX(limit) : '') + '</span><div><button class="btn btn-light btn-sm" onclick="recordCashTx(' + c.id + ',\'in\')">Cash In</button><button class="btn btn-light btn-sm" onclick="recordCashTx(' + c.id + ',\'out\')">Cash Out</button><button class="btn btn-light btn-sm" onclick="exportCustomerStatement(' + c.id + ')">Statement PDF</button></div></div>' +
    summary +
    '<h3 style="font-size:12px;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Order History</h3><div style="max-height:260px;overflow-y:auto;"><table class="data-table compact"><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Fulfillment</th><th></th></tr></thead><tbody>' + ordersHtml + '</tbody></table></div>' +
    '<h3 style="font-size:12px;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Cash Ledger</h3><div style="max-height:220px;overflow-y:auto;"><table class="data-table compact"><thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th></tr></thead><tbody>' + ledgerHtml + '</tbody></table></div>';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
  bindAllMoneyInputs(document.getElementById('modal-body'));
};
window.recordCashTx = function(customerId, type) {
  var label = type === 'in' ? 'Cash Received' : 'Cash Paid Out';
  var body = '<label>Amount (UGX)<input id="ct-amount" class="money-input" value="0"></label><label>Note<input id="ct-note"></label>';
  openModal(label, body, async function() {
    var amt = getMoneyValue('ct-amount');
    if (amt <= 0) throw new Error('Amount must be positive');
    await api.customers.addTransaction(customerId, type, amt, document.getElementById('ct-note').value.trim());
    window.toast.success(label + ': ' + UGX(amt));
    setTimeout(function() { viewCustomer(customerId); }, 200);
  });
};
window.editCustomer = function(id) {
  var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return;
  openModal('Edit Customer', '<label>Name<input id="c-name" value="' + escapeAttr(c.name) + '"></label><label>Phone<input id="c-phone" value="' + escapeAttr(c.phone || '') + '"></label><label>Credit Limit (UGX, 0 = no limit)<input id="c-limit" class="money-input" value="' + (c.credit_limit || 0) + '"></label>',
    async function() {
      await api.customers.update(id, { name: document.getElementById('c-name').value.trim(), phone: document.getElementById('c-phone').value.trim(), credit_limit: getMoneyValue('c-limit') });
      await loadCustomers();
      window.toast.success('Customer updated');
    });
};
window.deleteCustomer = async function(id) {
  var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return;
  var ok = await showConfirm({ title: 'Delete customer?', message: 'Delete "' + c.name + '"?', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.customers.delete(id);
  await loadCustomers();
  window.toast.success('Customer deleted');
};

// ============ NEW ORDER ============
var saleProducts = [];
var cart = [];
var selectedCustomer = null;
var cachedVariants = {};
async function loadSaleProducts() {
  saleProducts = await api.products.getAll();
  cachedVariants = {};
  for (var i = 0; i < saleProducts.length; i++) {
    var vs = await api.variants.getByProduct(saleProducts[i].id);
    if (vs && vs.length) cachedVariants[saleProducts[i].id] = vs;
  }
  renderSaleProducts(''); renderCart();
}
var saleSearchInput = document.getElementById('sale-search');
var acBox = document.getElementById('autocomplete-box');
var acIndex = -1;
saleSearchInput.addEventListener('input', function(e) {
  var term = e.target.value.trim().toLowerCase();
  if (!term) { acBox.classList.add('hidden'); acIndex = -1; return; }
  var matches = saleProducts.filter(function(p){ return p.name.toLowerCase().includes(term) || (p.barcode || '') === term; }).slice(0, 8);
  if (!matches.length) { acBox.classList.add('hidden'); return; }
  acBox.innerHTML = matches.map(function(p, i) {
    var hasV = cachedVariants[p.id] && cachedVariants[p.id].length;
    return '<div class="item' + (i === 0 ? ' active' : '') + '" data-id="' + p.id + '">' + escapeHtml(p.name) + '<span class="meta">' + (hasV ? 'has variants • ' : UGX(p.price) + ' • ') + 'stock ' + p.stock + '</span></div>';
  }).join('');
  acBox.classList.remove('hidden');
  acIndex = 0;
  acBox.querySelectorAll('.item').forEach(function(el) {
    el.addEventListener('click', function() { pickProduct(parseInt(el.dataset.id)); saleSearchInput.value=''; acBox.classList.add('hidden'); saleSearchInput.focus(); });
  });
});
saleSearchInput.addEventListener('keydown', async function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var term = saleSearchInput.value.trim();
    if (!term) return;
    try {
      var bc = await api.products.findByBarcode(term);
      if (bc) {
        if (bc.variant) addToCart(bc.product.id, bc.variant.id);
        else pickProduct(bc.product.id);
        saleSearchInput.value = ''; acBox.classList.add('hidden'); acIndex = -1;
        return;
      }
    } catch (err) {}
    var lower = term.toLowerCase();
    var activeEl = acBox.querySelector('.item.active');
    if (activeEl) pickProduct(parseInt(activeEl.dataset.id));
    else {
      var exact = saleProducts.find(function(p){ return p.name.toLowerCase() === lower; });
      if (exact) pickProduct(exact.id);
      else { var partial = saleProducts.find(function(p){ return p.name.toLowerCase().includes(lower); }); if (partial) pickProduct(partial.id); else window.toast.warning('No product matches "' + term + '"'); }
    }
    saleSearchInput.value = ''; acBox.classList.add('hidden'); acIndex = -1;
  } else if (e.key === 'ArrowDown') { e.preventDefault(); var items = acBox.querySelectorAll('.item'); if (!items.length) return; if (acIndex >= 0) items[acIndex].classList.remove('active'); acIndex = Math.min(acIndex + 1, items.length - 1); items[acIndex].classList.add('active'); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); var items2 = acBox.querySelectorAll('.item'); if (!items2.length) return; if (acIndex >= 0) items2[acIndex].classList.remove('active'); acIndex = Math.max(acIndex - 1, 0); items2[acIndex].classList.add('active'); }
  else if (e.key === 'Escape') { acBox.classList.add('hidden'); acIndex = -1; }
});
function pickProduct(productId) {
  var variants = cachedVariants[productId];
  if (variants && variants.length) showVariantPicker(productId, variants);
  else addToCart(productId, null);
}
function showVariantPicker(productId, variants) {
  var p = saleProducts.find(function(x){ return x.id === productId; });
  var body = '<p style="margin-bottom:12px;color:var(--text-muted);font-size:13px;">Choose a variant for <b>' + escapeHtml(p.name) + '</b>:</p>';
  body += variants.map(function(v) {
    return '<button class="btn btn-light btn-block" style="justify-content:space-between;margin-bottom:6px;text-align:left;padding:12px 16px;" onclick="closeModal();addToCart(' + productId + ',' + v.id + ')"><span><b>' + escapeHtml(v.label) + '</b> <span style="color:var(--text-muted);font-size:12px;">(' + v.stock + ' in stock)</span></span><span style="color:var(--primary);font-weight:700;">' + UGX(v.price) + '</span></button>';
  }).join('');
  openModal('Select Variant', body, async function() {});
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Cancel';
}
function renderSaleProducts(term) {
  term = term || '';
  var f = saleProducts.filter(function(p){ return p.name.toLowerCase().includes(term); });
  var c = document.getElementById('sale-product-list');
  c.innerHTML = f.length
    ? f.map(function(p) {
        var variants = cachedVariants[p.id];
        var variantBadge = variants && variants.length ? '<div class="stock" style="color:var(--primary);font-weight:600;">' + variants.length + ' variants</div>' : '';
        var priceDisplay = variants && variants.length ? 'From ' + UGX(Math.min.apply(null, variants.map(function(v){ return v.price; }))) : UGX(p.price);
        return '<div class="product-card" onclick="pickProduct(' + p.id + ')"><div class="name">' + escapeHtml(p.name) + '</div><div class="price">' + priceDisplay + '</div><div class="stock">' + p.stock + ' in stock</div>' + variantBadge + '</div>';
      }).join('')
    : '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:24px;">No products.</p>';
}
window.addToCart = function(productId, variantId) {
  var p = saleProducts.find(function(x){ return x.id === productId; }); if (!p) return;
  var name = p.name, price = p.price, stock = p.stock, variantLabel = '';
  if (variantId) {
    var v = (cachedVariants[productId] || []).find(function(x){ return x.id === variantId; });
    if (!v) return;
    name = p.name + ' (' + v.label + ')';
    price = v.price;
    stock = v.stock;
    variantLabel = v.label;
  }
  if (stock <= 0) { window.toast.warning('Out of stock'); return; }
  var key = variantId ? ('v' + variantId) : ('p' + productId);
  var ex = cart.find(function(c){ return c.key === key; });
  if (ex) { if (ex.quantity + 1 > stock) { window.toast.warning('Only ' + stock + ' in stock'); return; } ex.quantity += 1; }
  else cart.push({ key: key, product_id: productId, variant_id: variantId || null, variant_label: variantLabel, name: name, price: price, quantity: 1, stock: stock });
  renderCart();
};
window.updateQty = function(key, q) {
  q = parseInt(q) || 0;
  var it = cart.find(function(c){ return c.key === key; }); if (!it) return;
  if (q <= 0) { removeFromCart(key); return; }
  if (q > it.stock) { window.toast.warning('Only ' + it.stock + ' in stock'); q = it.stock; }
  it.quantity = q; renderCart();
};
window.removeFromCart = function(key) { cart = cart.filter(function(c){ return c.key !== key; }); renderCart(); };
function computeCartTotals() {
  var subtotal = cart.reduce(function(s, i){ return s + i.price * i.quantity; }, 0);
  var taxRate = parseFloat(document.getElementById('cart-tax').value) || 0;
  var discount = Math.max(0, getMoneyValue('cart-discount'));
  var taxAmount = Math.round(subtotal * (taxRate / 100));
  var total = Math.max(0, subtotal + taxAmount - discount);
  var prevBalance = selectedCustomer ? Math.round(selectedCustomer.outstanding || 0) : 0;
  var payPrev = Math.max(0, getMoneyValue('cart-pay-prev'));
  if (payPrev > prevBalance) payPrev = prevBalance;
  var grandDue = prevBalance + total - payPrev;
  var paid = Math.max(0, getMoneyValue('cart-paid'));
  var paidForCurrent = Math.max(0, paid - payPrev);
  var balance = Math.max(0, total - paidForCurrent);
  return { subtotal: subtotal, taxRate: taxRate, taxAmount: taxAmount, discount: discount, total: total, prevBalance: prevBalance, payPrev: payPrev, grandDue: grandDue, paid: paid, balance: balance };
}
function renderCart() {
  var tbody = document.querySelector('#cart-table tbody');
  tbody.innerHTML = cart.length
    ? cart.map(function(it) { return '<tr><td>' + escapeHtml(it.name) + '</td><td><input type="number" min="1" value="' + it.quantity + '" onchange="updateQty(\'' + it.key + '\', this.value)"></td><td>' + UGX(it.price) + '</td><td><b>' + UGX(it.price * it.quantity) + '</b></td><td><button class="btn btn-danger btn-sm" onclick="removeFromCart(\'' + it.key + '\')">x</button></td></tr>'; }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Cart is empty.</td></tr>';
  var t = computeCartTotals();
  document.getElementById('cart-subtotal').textContent = UGX(t.subtotal);
  document.getElementById('cart-total').textContent = UGX(t.total);
  var prevRow = document.getElementById('prev-balance-row');
  if (t.prevBalance > 0) {
    prevRow.classList.remove('hidden');
    document.getElementById('cart-prev-balance').textContent = UGX(t.prevBalance);
    document.getElementById('cart-grand-due').textContent = UGX(t.grandDue);
  } else { prevRow.classList.add('hidden'); setMoneyValue('cart-pay-prev', 0); }
  document.getElementById('cart-balance').textContent = UGX(t.balance);
  var warnEl = document.getElementById('credit-warning');
  if (selectedCustomer && selectedCustomer.credit_limit > 0) {
    var newTotalDebt = (t.prevBalance - t.payPrev) + t.balance;
    if (newTotalDebt > selectedCustomer.credit_limit) {
      warnEl.classList.remove('hidden');
      warnEl.textContent = '⚠ CREDIT LIMIT EXCEEDED. Limit: ' + UGX(selectedCustomer.credit_limit) + '. New debt would be: ' + UGX(newTotalDebt) + '.';
    } else warnEl.classList.add('hidden');
  } else warnEl.classList.add('hidden');
}
['cart-tax'].forEach(function(id) { var el = document.getElementById(id); if (el) el.addEventListener('input', renderCart); });
['cart-discount','cart-paid','cart-pay-prev'].forEach(function(id) { var el = document.getElementById(id); if (el) el.addEventListener('input', renderCart); });
var custSearchInput = document.getElementById('customer-search-input');
var custAcBox = document.getElementById('customer-autocomplete');
var selectedCustBox = document.getElementById('selected-customer');
var custDebtBox = document.getElementById('customer-debt');
custSearchInput.addEventListener('input', function(e) {
  var term = e.target.value.trim().toLowerCase();
  if (!term) { custAcBox.classList.add('hidden'); return; }
  var matches = cachedCustomers.filter(function(c) { return c.name.toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term); }).slice(0, 8);
  if (!matches.length) { custAcBox.classList.add('hidden'); return; }
  custAcBox.innerHTML = matches.map(function(c) { return '<div class="item" data-id="' + c.id + '">' + escapeHtml(c.name) + '<span class="meta">' + escapeHtml(c.phone || '—') + ' • owes ' + UGX(c.outstanding) + (c.credit_limit > 0 ? ' • limit ' + UGX(c.credit_limit) : '') + '</span></div>'; }).join('');
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
    else { selectedCustomer = { id: null, name: term, phone: '', outstanding: 0, credit_limit: 0 }; showSelectedCustomer(); renderCart(); }
    custAcBox.classList.add('hidden');
  } else if (e.key === 'Escape') custAcBox.classList.add('hidden');
});
function selectCustomer(id) { var c = cachedCustomers.find(function(x){ return x.id === id; }); if (!c) return; selectedCustomer = c; showSelectedCustomer(); custAcBox.classList.add('hidden'); custSearchInput.value = ''; renderCart(); }
function showSelectedCustomer() {
  if (!selectedCustomer) { selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); return; }
  selectedCustBox.classList.remove('hidden');
  document.getElementById('selected-customer-name').textContent = selectedCustomer.name;
  document.getElementById('selected-customer-phone').textContent = selectedCustomer.phone || '';
  if (selectedCustomer.outstanding > 0) { custDebtBox.classList.remove('hidden'); custDebtBox.classList.remove('clean'); custDebtBox.textContent = 'Existing debt: ' + UGX(selectedCustomer.outstanding); }
  else if (selectedCustomer.id) { custDebtBox.classList.remove('hidden'); custDebtBox.classList.add('clean'); custDebtBox.textContent = 'No outstanding balance'; }
  else custDebtBox.classList.add('hidden');
}
document.getElementById('btn-customer-change').addEventListener('click', function() { selectedCustomer = null; selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); renderCart(); custSearchInput.focus(); });
document.getElementById('btn-customer-clear').addEventListener('click', function() { selectedCustomer = null; custSearchInput.value = ''; selectedCustBox.classList.add('hidden'); custDebtBox.classList.add('hidden'); custAcBox.classList.add('hidden'); renderCart(); });
document.getElementById('btn-checkout').addEventListener('click', async function() {
  if (!cart.length) { window.toast.warning('Cart is empty'); return; }
  var t = computeCartTotals();
  var taxRate = (t.taxRate || 0) / 100;
  var typedName = (custSearchInput.value || '').trim();
  var customer_name = selectedCustomer ? selectedCustomer.name : typedName;
  var customer_phone = selectedCustomer ? selectedCustomer.phone : '';
  var taken = document.getElementById('cart-taken').checked;
  var overLimit = selectedCustomer && selectedCustomer.credit_limit > 0 && ((t.prevBalance - t.payPrev) + t.balance) > selectedCustomer.credit_limit;
  var allowOverLimit = false;
  if (overLimit) {
    var ok = await showConfirm({ title: 'Credit limit exceeded', message: 'This sale would put ' + customer_name + ' over their credit limit. Proceed anyway?', confirmText: 'Proceed', danger: true, icon: '!' });
    if (!ok) return;
    allowOverLimit = true;
  }
  try {
    var inv = await api.orders.create({ customer_name: customer_name, customer_phone: customer_phone, items: cart.map(function(c){ return { product_id: c.product_id, variant_id: c.variant_id, quantity: c.quantity }; }), tax_rate: taxRate, discount: t.discount, amount_paid: t.paid, pay_previous: t.payPrev, fulfillment_status: taken ? 'taken' : 'not_taken', allow_over_limit: allowOverLimit });
    cart = []; selectedCustomer = null;
    document.getElementById('cart-tax').value = 0;
    setMoneyValue('cart-discount', 0);
    setMoneyValue('cart-paid', 0);
    setMoneyValue('cart-pay-prev', 0);
    document.getElementById('cart-taken').checked = false;
    custSearchInput.value = '';
    selectedCustBox.classList.add('hidden');
    custDebtBox.classList.add('hidden');
    document.getElementById('credit-warning').classList.add('hidden');
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
  var items = inv.items.map(function(i) { var label = i.variant_label ? ' (' + escapeHtml(i.variant_label) + ')' : ''; return '<div class="line"><span>' + escapeHtml(i.product_name) + label + ' x ' + i.quantity + '</span><span>' + UGX(i.line_total) + '</span></div><div class="line" style="color:var(--text-light);font-size:11px;padding-left:8px;">@ ' + UGX(i.unit_price) + '</div>'; }).join('');
  var paymentPill = '<span class="pill ' + inv.payment_status + '">' + inv.payment_status + '</span>';
  var fulfillPill = '<span class="pill ' + inv.fulfillment_status + '">' + inv.fulfillment_status.replace('_',' ') + '</span>';
  var paymentBlock = '';
  if ((inv.previous_balance || 0) > 0) {
    paymentBlock += '<div class="divider"></div><div class="line" style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Account Summary</div><div class="line"><span>Previous Outstanding</span><span>' + UGX(inv.previous_balance) + '</span></div>';
    if ((inv.paid_on_previous || 0) > 0) paymentBlock += '<div class="line"><span>Paid on Previous</span><span style="color:var(--success);">' + UGX(inv.paid_on_previous) + '</span></div>';
    paymentBlock += '<div class="line"><span>This Order</span><span>' + UGX(inv.total) + '</span></div><div class="line"><span><b>Total Due Now</b></span><span><b>' + UGX(inv.opening_total_due) + '</b></span></div><div class="divider"></div>';
  }
  paymentBlock += '<div class="line"><span>Subtotal</span><span>' + UGX(inv.subtotal) + '</span></div>' + (inv.tax_amount > 0 ? '<div class="line"><span>Tax</span><span>' + UGX(inv.tax_amount) + '</span></div>' : '') + (inv.discount > 0 ? '<div class="line"><span>Discount</span><span>-' + UGX(inv.discount) + '</span></div>' : '') + '<div class="line"><span>TOTAL</span><span><b>' + UGX(inv.total) + '</b></span></div><div class="line"><span>Paid</span><span style="color:var(--success);">' + UGX(inv.amount_paid) + '</span></div>';
  if (inv.balance > 0) paymentBlock += '<div class="balance-big">BALANCE DUE: ' + UGX(inv.balance) + '</div>';
  else paymentBlock += '<div class="paid-big">✓ FULLY PAID</div>';
  var paymentHistory = '';
  if (inv.payments && inv.payments.length > 0) {
    paymentHistory = '<div class="divider"></div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:6px;">Payment History</div>';
    paymentHistory += inv.payments.map(function(p) { return '<div class="line" style="font-size:12px;"><span>' + new Date(p.created_at).toLocaleString() + '</span><span style="color:var(--success);">+ ' + UGX(p.amount) + '</span></div>' + (p.note && p.note !== 'Initial payment' ? '<div class="line" style="font-size:11px;color:var(--text-muted);padding-left:8px;">' + escapeHtml(p.note) + '</div>' : ''); }).join('');
  }
  document.getElementById('receipt-body').innerHTML =
    '<div class="header"><h2>OKK STORES</h2><p>Plot 14 Keyo Road, Gulu City</p><p>Tel: 0772949121</p><p style="margin-top:8px;">Sales Receipt</p></div>' +
    '<div class="line"><span>Invoice:</span><b>' + escapeHtml(inv.invoice_no) + '</b></div>' +
    '<div class="line"><span>Date:</span><span>' + new Date(inv.created_at).toLocaleString() + '</span></div>' +
    '<div class="line"><span>Customer:</span><span>' + escapeHtml(inv.customer_name) + '</span></div>' +
    (inv.customer_phone ? '<div class="line"><span>Phone:</span><span>' + escapeHtml(inv.customer_phone) + '</span></div>' : '') +
    '<div class="status-row screen-only">' + paymentPill + fulfillPill + '</div>' +
    '<div class="divider"></div>' + items + '<div class="divider"></div>' + paymentBlock + paymentHistory +
    '<div class="divider"></div><p style="text-align:center;font-size:11px;color:var(--text-muted);margin-top:10px;">Thank you for shopping with OKK Stores!</p>' +
    '<div class="modal-actions screen-only" style="margin-top:18px;flex-wrap:wrap;">' +
      (inv.fulfillment_status === 'not_taken' ? '<button class="btn btn-success" onclick="markTaken(' + inv.id + ')">Mark as Taken</button>' : '<button class="btn btn-light" onclick="markNotTaken(' + inv.id + ')">Mark as Not Taken</button>') +
      '<button class="btn btn-info" onclick="printThermal(' + inv.id + ')">Print</button>' +
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
  (async function() { try { await api.orders.addPayment(id, amt, 'Additional payment'); var inv = await api.orders.getById(id); showReceipt(inv); window.toast.success('Payment recorded: ' + UGX(amt)); if (document.getElementById('view-orders').classList.contains('active')) loadOrders(currentFilter); if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard(); } catch (e) { window.toast.error(e.message); } })();
};
window.shareWhatsApp = async function(id) {
  var inv = await api.orders.getById(id);
  var phone = (inv.customer_phone || '').replace(/[^0-9]/g, '');
  if (!phone) { window.toast.warning('No customer phone.'); return; }
  var msg = '*OKK STORES*\nPlot 14 Keyo Road, Gulu City\nTel: 0772949121\n--------------------\n*Invoice:* ' + inv.invoice_no + '\n*Date:* ' + new Date(inv.created_at).toLocaleString() + '\n*Customer:* ' + inv.customer_name + '\n--------------------\n';
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

// ============ EXPENSES ============
var cachedExpenseCats = [];
async function loadExpenses() {
  try {
    var from = document.getElementById('expense-from').value;
    var to = document.getElementById('expense-to').value;
    if (!from) { var d = new Date(); d.setDate(1); from = fmtDate(d); document.getElementById('expense-from').value = from; }
    if (!to) { to = fmtDate(new Date()); document.getElementById('expense-to').value = to; }
    cachedExpenseCats = await api.expenses.getCategories();
    var list = await api.expenses.getAll(from, to);
    var summary = await api.expenses.summary(from, to);
    document.getElementById('expense-total').textContent = UGX(summary.total);
    document.getElementById('expense-count').textContent = list.length;
    var sumTbody = document.querySelector('#expense-summary-table tbody');
    sumTbody.innerHTML = summary.byCategory.length ? summary.byCategory.map(function(c) { return '<tr><td><b>' + escapeHtml(c.category_name) + '</b></td><td>' + c.count + '</td><td>' + UGX(c.amount) + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px;">No expenses in this period.</td></tr>';
    var tbody = document.querySelector('#expense-table tbody');
    tbody.innerHTML = list.length ? list.map(function(e) { return '<tr><td>' + e.expense_date + '</td><td>' + escapeHtml(e.category_name) + '</td><td>' + escapeHtml(e.note || '') + '</td><td>' + escapeHtml(e.paid_by || '') + '</td><td><b>' + UGX(e.amount) + '</b></td><td><button class="btn btn-light btn-sm" onclick="editExpense(' + e.id + ')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteExpenseRow(' + e.id + ')">Delete</button></td></tr>'; }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No expenses recorded.</td></tr>';
  } catch (e) { console.error(e); window.toast.error('Failed: ' + e.message); }
}
document.getElementById('btn-expense-filter').addEventListener('click', loadExpenses);
document.getElementById('btn-add-expense').addEventListener('click', async function() {
  if (!cachedExpenseCats.length) cachedExpenseCats = await api.expenses.getCategories();
  var catOpts = cachedExpenseCats.map(function(c) { return '<option value="' + c.id + '|' + escapeAttr(c.name) + '">' + escapeHtml(c.name) + '</option>'; }).join('');
  var body = '<label>Category<select id="ex-cat">' + catOpts + '</select></label><label>Amount (UGX)<input id="ex-amt" class="money-input" value="0"></label><label>Date<input id="ex-date" type="date" value="' + fmtDate(new Date()) + '"></label><label>Paid By<input id="ex-paid" value="Cash"></label><label>Note<input id="ex-note"></label>';
  openModal('Add Expense', body, async function() {
    var parts = document.getElementById('ex-cat').value.split('|');
    var amt = getMoneyValue('ex-amt');
    if (amt <= 0) throw new Error('Amount required');
    await api.expenses.add({ category_id: parseInt(parts[0]), category_name: parts[1], amount: amt, expense_date: document.getElementById('ex-date').value, paid_by: document.getElementById('ex-paid').value.trim(), note: document.getElementById('ex-note').value.trim() });
    window.toast.success('Expense recorded');
    loadExpenses();
  });
});
window.editExpense = async function(id) {
  var from = document.getElementById('expense-from').value;
  var to = document.getElementById('expense-to').value;
  var list = await api.expenses.getAll(from, to);
  var e = list.find(function(x) { return x.id === id; });
  if (!e) return;
  if (!cachedExpenseCats.length) cachedExpenseCats = await api.expenses.getCategories();
  var catOpts = cachedExpenseCats.map(function(c) { return '<option value="' + c.id + '|' + escapeAttr(c.name) + '"' + (c.name === e.category_name ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('');
  var body = '<label>Category<select id="ex-cat">' + catOpts + '</select></label><label>Amount (UGX)<input id="ex-amt" class="money-input" value="' + e.amount + '"></label><label>Date<input id="ex-date" type="date" value="' + e.expense_date + '"></label><label>Paid By<input id="ex-paid" value="' + escapeAttr(e.paid_by || '') + '"></label><label>Note<input id="ex-note" value="' + escapeAttr(e.note || '') + '"></label>';
  openModal('Edit Expense', body, async function() {
    var parts = document.getElementById('ex-cat').value.split('|');
    await api.expenses.update(id, { category_id: parseInt(parts[0]), category_name: parts[1], amount: getMoneyValue('ex-amt'), expense_date: document.getElementById('ex-date').value, paid_by: document.getElementById('ex-paid').value.trim(), note: document.getElementById('ex-note').value.trim() });
    window.toast.success('Expense updated');
    loadExpenses();
  });
};
window.deleteExpenseRow = async function(id) {
  var ok = await showConfirm({ title: 'Delete expense?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.expenses.delete(id);
  window.toast.success('Deleted');
  loadExpenses();
};
window.manageExpenseCategories = async function() {
  var cats = await api.expenses.getCategories();
  var rows = cats.map(function(c) { return '<div style="display:flex;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;"><b>' + escapeHtml(c.name) + (c.is_default ? ' <span class="pill">default</span>' : '') + '</b>' + (!c.is_default ? '<button class="btn btn-danger btn-sm" onclick="removeExpenseCategory(' + c.id + ')">Delete</button>' : '') + '</div>'; }).join('');
  var body = rows + '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="addExpenseCategoryForm()">+ Add Category</button>';
  openModal('Expense Categories', body, async function() {});
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
window.addExpenseCategoryForm = function() {
  openModal('Add Category', '<label>Name *<input id="new-cat-name"></label>', async function() {
    var n = document.getElementById('new-cat-name').value.trim();
    if (!n) throw new Error('Name required');
    await api.expenses.addCategory(n);
    window.toast.success('Category added');
    manageExpenseCategories();
  });
};
window.removeExpenseCategory = async function(id) {
  var ok = await showConfirm({ title: 'Delete category?', message: 'Cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  try { await api.expenses.deleteCategory(id); window.toast.success('Category deleted'); manageExpenseCategories(); }
  catch (e) { window.toast.error(e.message); }
};

// ============ CASH BOOK ============
async function loadCashBook() {
  try {
    var from = document.getElementById('cashbook-from').value;
    var to = document.getElementById('cashbook-to').value;
    if (!from) { var d = new Date(); d.setDate(1); from = fmtDate(d); document.getElementById('cashbook-from').value = from; }
    if (!to) { to = fmtDate(new Date()); document.getElementById('cashbook-to').value = to; }
    var depositor = (document.getElementById('cashbook-search').value || '').trim();

    var summary = await api.cashbook.summary(from, to);
    document.getElementById('cb-in').textContent = UGX(summary.periodIn);
    document.getElementById('cb-out').textContent = UGX(summary.periodOut);
    document.getElementById('cb-net').textContent = UGX(summary.periodNet);
    document.getElementById('cb-outstanding').textContent = UGX(summary.periodOutstanding);
    document.getElementById('cb-lifetime-outstanding').textContent = UGX(summary.lifetimeOutstanding);
    document.getElementById('cb-lifetime-in').textContent = UGX(summary.lifetimeIn);
    document.getElementById('cb-lifetime-out').textContent = UGX(summary.lifetimeOut);
    document.getElementById('cb-count').textContent = summary.periodCount;

    var list = await api.cashbook.getAll(from, to, depositor);
    document.getElementById('cb-entries-hint').textContent = list.length + ' entries';

    var tbody = document.querySelector('#cashbook-table tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px;">No entries for this period.</td></tr>';
    } else {
      tbody.innerHTML = list.map(function(e) {
        var typeLabel = e.type === 'in' ? 'Cash In' : 'Cash Out';
        var typePill = e.type === 'in' ? 'paid' : 'unpaid';
        var modeLabel = e.mode === 'full' ? 'Full' : 'Partial';
        var outCell = e.outstanding > 0 ? '<span style="color:var(--danger);font-weight:700;">' + UGX(e.outstanding) + '</span>' : '<span style="color:var(--success);">' + UGX(0) + '</span>';
        var applied = e.applied_to_previous > 0 ? UGX(e.applied_to_previous) : '—';
        var expected = e.amount_expected > 0 ? UGX(e.amount_expected) : '—';
        return '<tr>' +
          '<td>' + e.entry_date + '</td>' +
          '<td><b>' + escapeHtml(e.depositor_name) + '</b>' + (e.depositor_phone ? '<div style="font-size:11px;color:var(--text-muted);">' + escapeHtml(e.depositor_phone) + '</div>' : '') + '</td>' +
          '<td><span class="pill ' + typePill + '">' + typeLabel + '</span></td>' +
          '<td>' + modeLabel + '</td>' +
          '<td><b>' + UGX(e.amount_received) + '</b></td>' +
          '<td>' + expected + '</td>' +
          '<td>' + applied + '</td>' +
          '<td>' + outCell + '</td>' +
          '<td>' + escapeHtml(e.note || '') + '</td>' +
          '<td>' +
            '<button class="btn btn-light btn-sm" onclick="viewDepositor(\'' + escapeAttr(e.depositor_name) + '\')">View</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteCashBookRow(' + e.id + ')">Delete</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }
  } catch (err) {
    console.error('[cashbook]', err);
    window.toast.error('Failed to load cash book: ' + err.message);
  }
}

async function loadDepositors() {
  try {
    var list = await api.cashbook.depositors();
    var tbody = document.querySelector('#depositors-table tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No depositors yet.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(d) {
      var outCol = d.total_outstanding > 0 ? 'var(--danger)' : 'var(--success)';
      var safeName = d.depositor_name.replace(/'/g, "\\'");
      return '<tr>' +
        '<td><b>' + escapeHtml(d.depositor_name) + '</b></td>' +
        '<td>' + escapeHtml(d.depositor_phone || '—') + '</td>' +
        '<td>' + d.entry_count + '</td>' +
        '<td>' + UGX(d.total_received) + '</td>' +
        '<td>' + UGX(d.total_paid_out) + '</td>' +
        '<td style="color:' + outCol + ';font-weight:700;">' + UGX(d.total_outstanding) + '</td>' +
        '<td>' +
          '<button class="btn btn-light btn-sm" onclick="viewDepositor(\'' + safeName + '\')">View</button>' +
          (d.depositor_phone ? '<button class="btn btn-wa btn-sm" onclick="notifyDepositor(\'' + safeName + '\',\'' + escapeAttr(d.depositor_phone) + '\',' + d.total_outstanding + ')">WhatsApp</button>' : '') +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (e) { console.error(e); }
}

document.getElementById('btn-cashbook-filter').addEventListener('click', loadCashBook);
document.getElementById('cashbook-search').addEventListener('input', loadCashBook);
document.getElementById('btn-add-cashbook').addEventListener('click', function() { openAddDepositModal(''); });

async function openAddDepositModal(prefillName) {
  var body =
    '<label>Depositor Name *<input id="cb-name" value="' + escapeAttr(prefillName || '') + '" placeholder="Person who brought the money"></label>' +
    '<label>Phone (for WhatsApp/SMS)<input id="cb-phone" placeholder="077xxxxxxx"></label>' +
    '<label>Type<select id="cb-type"><option value="in">Cash In (received)</option><option value="out">Cash Out (paid to someone)</option></select></label>' +
    '<label>Mode<select id="cb-mode"><option value="full">Full deposit (received = expected)</option><option value="partial">Partial deposit (specify expected)</option></select></label>' +
    '<label>Amount Received (UGX)<input id="cb-amt" class="money-input" value="0"></label>' +
    '<div id="cb-expected-wrap" class="hidden"><label>Amount Expected (UGX)<input id="cb-expected" class="money-input" value="0"></label></div>' +
    '<div id="cb-prev-wrap" class="hidden" style="background:#fff5eb;border:1px dashed #FF9F43;border-radius:8px;padding:12px;margin:10px 0;">' +
      '<div style="font-size:12px;font-weight:700;color:#d97706;text-transform:uppercase;margin-bottom:6px;">Previous Outstanding</div>' +
      '<div id="cb-prev-amount" style="font-size:18px;font-weight:800;color:var(--danger);margin-bottom:8px;">UGX 0</div>' +
      '<label>Apply to Previous Debt (UGX)<input id="cb-apply" class="money-input" value="0"></label>' +
    '</div>' +
    '<label>Date<input id="cb-date" type="date" value="' + fmtDate(new Date()) + '"></label>' +
    '<label>Note<input id="cb-note" placeholder="e.g. Daily sales, refund"></label>';

  openModal('Record Cash Deposit', body, async function() {
    var name = document.getElementById('cb-name').value.trim();
    if (!name) throw new Error('Depositor name is required');
    var amt = getMoneyValue('cb-amt');
    if (amt <= 0) throw new Error('Amount received must be positive');
    var mode = document.getElementById('cb-mode').value;
    var expected = mode === 'full' ? amt : (getMoneyValue('cb-expected') || amt);
    var appliedPrev = getMoneyValue('cb-apply');

    await api.cashbook.add({
      depositor_name: name,
      depositor_phone: document.getElementById('cb-phone').value.trim(),
      type: document.getElementById('cb-type').value,
      mode: mode,
      amount_received: amt,
      amount_expected: expected,
      applied_to_previous: appliedPrev,
      note: document.getElementById('cb-note').value.trim(),
      entry_date: document.getElementById('cb-date').value
    });
    window.toast.success('Cash entry recorded');
    loadCashBook();
    loadDepositors();
  });

  setTimeout(async function() {
    var nameInput = document.getElementById('cb-name');
    var modeSelect = document.getElementById('cb-mode');
    var expWrap = document.getElementById('cb-expected-wrap');
    var prevWrap = document.getElementById('cb-prev-wrap');
    var prevAmt = document.getElementById('cb-prev-amount');

    async function refreshPrevious() {
      var n = nameInput.value.trim();
      if (!n) { prevWrap.classList.add('hidden'); return; }
      try {
        var out = await api.cashbook.depositorOutstanding(n);
        if (out > 0) {
          prevWrap.classList.remove('hidden');
          prevAmt.textContent = UGX(out);
          var applyInput = document.getElementById('cb-apply');
          if (applyInput) applyInput.setAttribute('max', out);
        } else {
          prevWrap.classList.add('hidden');
        }
      } catch (e) {}
    }

    modeSelect.addEventListener('change', function() {
      if (modeSelect.value === 'partial') expWrap.classList.remove('hidden');
      else expWrap.classList.add('hidden');
    });
    nameInput.addEventListener('blur', refreshPrevious);
    refreshPrevious();
  }, 100);
}

window.deleteCashBookRow = async function(id) {
  var ok = await showConfirm({ title: 'Delete entry?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.cashbook.delete(id);
  window.toast.success('Entry deleted');
  loadCashBook();
  loadDepositors();
};

window.viewDepositor = async function(name) {
  try {
    var history = await api.cashbook.depositorHistory(name);
    if (!history.length) { window.toast.warning('No entries for ' + name); return; }
    var phone = history[0].depositor_phone || '';
    var totalReceived = history.reduce(function(s, e) { return s + (e.type === 'in' ? e.amount_received : 0); }, 0);
    var totalOut = history.reduce(function(s, e) { return s + (e.type === 'out' ? e.amount_received : 0); }, 0);
    var outstanding = await api.cashbook.depositorOutstanding(name);

    var rows = history.map(function(e) {
      var typeLabel = e.type === 'in' ? 'In' : 'Out';
      var cls = e.type === 'in' ? 'ledger-tx-in' : 'ledger-tx-out';
      var sign = e.type === 'in' ? '+' : '-';
      return '<tr>' +
        '<td>' + e.entry_date + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + (e.amount_expected > 0 ? UGX(e.amount_expected) : '—') + '</td>' +
        '<td class="' + cls + '">' + sign + ' ' + UGX(e.amount_received) + '</td>' +
        '<td>' + (e.applied_to_previous > 0 ? UGX(e.applied_to_previous) : '—') + '</td>' +
        '<td style="color:' + (e.outstanding > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:700;">' + UGX(e.outstanding) + '</td>' +
        '<td>' + escapeHtml(e.note || '') + '</td>' +
      '</tr>';
    }).join('');

    var summaryHtml =
      '<div class="customer-profile-summary">' +
        '<div class="cell"><span>Total Received</span><b style="color:var(--success);">' + UGX(totalReceived) + '</b></div>' +
        '<div class="cell"><span>Total Paid Out</span><b style="color:var(--danger);">' + UGX(totalOut) + '</b></div>' +
        '<div class="cell"><span>Outstanding</span><b style="color:' + (outstanding > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(outstanding) + '</b></div>' +
        '<div class="cell"><span>Entries</span><b>' + history.length + '</b></div>' +
      '</div>';

    var actions =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;">' +
        (phone ? '<button class="btn btn-wa" onclick="notifyDepositor(\'' + escapeAttr(name) + '\',\'' + escapeAttr(phone) + '\',' + outstanding + ')">Notify WhatsApp</button>' : '') +
        (phone ? '<button class="btn btn-info" onclick="smsDepositor(\'' + escapeAttr(name) + '\',\'' + escapeAttr(phone) + '\',' + outstanding + ')">Notify SMS</button>' : '') +
        '<button class="btn btn-light" onclick="exportDepositorStatementPDF(\'' + escapeAttr(name) + '\')">Statement PDF</button>' +
        '<button class="btn btn-light" onclick="exportDepositorStatementCSV(\'' + escapeAttr(name) + '\')">Statement CSV</button>' +
        '<button class="btn btn-primary" onclick="closeModal();openAddDepositModal(\'' + escapeAttr(name) + '\')">+ New Deposit</button>' +
      '</div>';

    document.getElementById('modal-title').textContent = 'Depositor: ' + name + (phone ? ' — ' + phone : '');
    document.getElementById('modal-body').innerHTML =
      summaryHtml + actions +
      '<table class="data-table compact"><thead><tr><th>Date</th><th>Type</th><th>Expected</th><th>Received</th><th>Applied Prev</th><th>Outstanding</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table>';
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('modal-confirm').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { window.toast.error('Failed: ' + e.message); }
};

window.notifyDepositor = function(name, phone, outstanding) {
  var cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) { window.toast.warning('No phone number on file.'); return; }
  var msg = '*OKK STORES*\nPlot 14 Keyo Road, Gulu City\nTel: 0772949121\n-------------------------\n\nDear ' + name + ',\n\n';
  if (outstanding > 0) {
    msg += 'We have received your cash deposit. Your current outstanding balance is *UGX ' + Number(outstanding).toLocaleString('en-US') + '*. Please settle at your convenience.\n\n';
  } else {
    msg += 'Thank you. Your account is fully settled.\n\n';
  }
  msg += '— OKK Stores';
  window.api.system.openExternal('https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg));
  window.toast.success('Opening WhatsApp...');
};

window.smsDepositor = function(name, phone, outstanding) {
  var cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) { window.toast.warning('No phone number on file.'); return; }
  var msg = 'OKK Stores: ' + (outstanding > 0 ? 'Cash received. Outstanding UGX ' + Number(outstanding).toLocaleString('en-US') : 'Account settled. Thank you.');
  window.api.system.openExternal('sms:' + cleanPhone + '?body=' + encodeURIComponent(msg));
};

window.exportDepositorStatementPDF = async function(name) {
  try {
    var history = await api.cashbook.depositorHistory(name);
    var outstanding = await api.cashbook.depositorOutstanding(name);
    var totalReceived = history.reduce(function(s, e) { return s + (e.type === 'in' ? e.amount_received : 0); }, 0);
    var totalOut = history.reduce(function(s, e) { return s + (e.type === 'out' ? e.amount_received : 0); }, 0);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    pdfHeader(doc);
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Depositor Statement', 105, 30, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('Depositor: ' + name, 20, 42);
    if (history[0].depositor_phone) doc.text('Phone: ' + history[0].depositor_phone, 20, 48);
    doc.text('Statement Date: ' + new Date().toLocaleString(), 20, history[0].depositor_phone ? 54 : 48);
    var rows = history.map(function(e) {
      return [e.entry_date, e.type === 'in' ? 'In' : 'Out', 'UGX ' + (e.amount_expected || 0).toLocaleString('en-US'), 'UGX ' + e.amount_received.toLocaleString('en-US'), 'UGX ' + (e.applied_to_previous || 0).toLocaleString('en-US'), 'UGX ' + (e.outstanding || 0).toLocaleString('en-US'), e.note || ''];
    });
    doc.autoTable({
      head: [['Date','Type','Expected','Received','Applied Prev','Outstanding','Note']],
      body: rows, startY: history[0].depositor_phone ? 62 : 56, theme: 'grid',
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    var y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Total Received: UGX ' + Math.round(totalReceived).toLocaleString('en-US'), 20, y);
    doc.text('Total Paid Out: UGX ' + Math.round(totalOut).toLocaleString('en-US'), 20, y + 7);
    doc.text('Outstanding: UGX ' + Math.round(outstanding).toLocaleString('en-US'), 20, y + 14);
    var res = await window.api.system.saveFile({ defaultName: 'Depositor_' + name.replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
    if (res.success) window.toast.success('Saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error('Failed: ' + (e.message || e)); }
};

window.exportDepositorStatementCSV = async function(name) {
  try {
    var history = await api.cashbook.depositorHistory(name);
    var outstanding = await api.cashbook.depositorOutstanding(name);
    var lines = [];
    lines.push('OKK STORES - Depositor Statement');
    lines.push('Depositor,' + name);
    lines.push('Statement Date,' + new Date().toLocaleString());
    lines.push('Outstanding,UGX ' + outstanding);
    lines.push('');
    lines.push('Date,Type,Expected,Received,Applied Prev,Outstanding,Note');
    history.forEach(function(e) {
      lines.push([e.entry_date, e.type === 'in' ? 'In' : 'Out', e.amount_expected || 0, e.amount_received, e.applied_to_previous || 0, e.outstanding || 0, '"' + (e.note || '').replace(/"/g, '""') + '"'].join(','));
    });
    var res = await window.api.system.saveFile({ defaultName: 'Depositor_' + name.replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0, 10) + '.csv', content: lines.join('\n'), encoding: 'utf8' });
    if (res.success) window.toast.success('CSV saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error('Failed: ' + (e.message || e)); }
};

document.getElementById('btn-cashbook-export-pdf').addEventListener('click', async function() {
  try {
    var from = document.getElementById('cashbook-from').value;
    var to = document.getElementById('cashbook-to').value;
    var list = await api.cashbook.getAll(from, to, '');
    if (!list.length) { window.toast.warning('No entries to export'); return; }
    var summary = await api.cashbook.summary(from, to);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    pdfHeader(doc);
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Cash Book Report', 105, 30, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('Period: ' + from + ' to ' + to, 105, 36, { align: 'center' });
    var rows = list.map(function(e) { return [e.entry_date, e.depositor_name, e.type === 'in' ? 'In' : 'Out', e.mode, 'UGX ' + e.amount_received.toLocaleString('en-US'), 'UGX ' + (e.amount_expected || 0).toLocaleString('en-US'), 'UGX ' + (e.outstanding || 0).toLocaleString('en-US'), e.note || '']; });
    doc.autoTable({ head: [['Date','Depositor','Type','Mode','Received','Expected','Outstanding','Note']], body: rows, startY: 44, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
    var y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Period Received: UGX ' + summary.periodIn.toLocaleString('en-US'), 20, y);
    doc.text('Period Paid Out: UGX ' + summary.periodOut.toLocaleString('en-US'), 20, y + 7);
    doc.text('Period Outstanding: UGX ' + summary.periodOutstanding.toLocaleString('en-US'), 20, y + 14);
    var res = await window.api.system.saveFile({ defaultName: 'CashBook_' + from + '_to_' + to + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
    if (res.success) window.toast.success('Saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error('Failed: ' + e.message); }
});

document.getElementById('btn-cashbook-export-csv').addEventListener('click', async function() {
  try {
    var from = document.getElementById('cashbook-from').value;
    var to = document.getElementById('cashbook-to').value;
    var list = await api.cashbook.getAll(from, to, '');
    if (!list.length) { window.toast.warning('No entries to export'); return; }
    var lines = [];
    lines.push('OKK STORES - Cash Book');
    lines.push('Period,' + from + ',' + to);
    lines.push('');
    lines.push('Date,Depositor,Phone,Type,Mode,Received,Expected,Applied Prev,Outstanding,Note');
    list.forEach(function(e) {
      lines.push([e.entry_date, '"' + e.depositor_name.replace(/"/g, '""') + '"', e.depositor_phone || '', e.type === 'in' ? 'In' : 'Out', e.mode, e.amount_received, e.amount_expected || 0, e.applied_to_previous || 0, e.outstanding || 0, '"' + (e.note || '').replace(/"/g, '""') + '"'].join(','));
    });
    var res = await window.api.system.saveFile({ defaultName: 'CashBook_' + from + '_to_' + to + '.csv', content: lines.join('\n'), encoding: 'utf8' });
    if (res.success) window.toast.success('CSV saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { window.toast.error('Failed: ' + e.message); }
});

// ============ SUPPLIERS ============
var cachedSuppliers = [];
var supplierSearchTerm = '';
document.getElementById('supplier-search').addEventListener('input', function(e){ supplierSearchTerm = e.target.value.toLowerCase(); renderSupplierRows(); });
async function loadSuppliers() { cachedSuppliers = await api.suppliers.getAll(); renderSupplierRows(); }
function renderSupplierRows() {
  var f = cachedSuppliers.filter(function(s) { return s.name.toLowerCase().includes(supplierSearchTerm); });
  var tbody = document.querySelector('#supplier-table tbody');
  tbody.innerHTML = f.length ? f.map(function(s) {
    var bal = Number(s.balance || 0);
    var col = bal > 0 ? 'var(--danger)' : (bal < 0 ? 'var(--success)' : 'var(--text-muted)');
    return '<tr><td><b>' + escapeHtml(s.name) + '</b></td><td>' + escapeHtml(s.phone || '—') + '</td><td>' + escapeHtml(s.email || '—') + '</td><td style="color:' + col + ';font-weight:700;">' + UGX(bal) + '</td><td><button class="btn btn-light btn-sm" onclick="viewSupplier(' + s.id + ')">View</button><button class="btn btn-light btn-sm" onclick="editSupplier(' + s.id + ')">Edit</button><button class="btn btn-primary btn-sm" onclick="paySupplier(' + s.id + ')">Pay</button><button class="btn btn-danger btn-sm" onclick="deleteSupplierRow(' + s.id + ')">Delete</button></td></tr>';
  }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No suppliers.</td></tr>';
}
document.getElementById('btn-add-supplier').addEventListener('click', function() {
  openModal('Add Supplier', '<label>Name *<input id="s-name"></label><label>Phone<input id="s-phone"></label><label>Email<input id="s-email"></label><label>Address<input id="s-address"></label><label>Notes<input id="s-notes"></label>',
    async function() {
      await api.suppliers.add({ name: document.getElementById('s-name').value.trim(), phone: document.getElementById('s-phone').value.trim(), email: document.getElementById('s-email').value.trim(), address: document.getElementById('s-address').value.trim(), notes: document.getElementById('s-notes').value.trim() });
      window.toast.success('Supplier added');
      loadSuppliers();
    });
});
window.editSupplier = function(id) {
  var s = cachedSuppliers.find(function(x) { return x.id === id; }); if (!s) return;
  openModal('Edit Supplier', '<label>Name<input id="s-name" value="' + escapeAttr(s.name) + '"></label><label>Phone<input id="s-phone" value="' + escapeAttr(s.phone || '') + '"></label><label>Email<input id="s-email" value="' + escapeAttr(s.email || '') + '"></label><label>Address<input id="s-address" value="' + escapeAttr(s.address || '') + '"></label><label>Notes<input id="s-notes" value="' + escapeAttr(s.notes || '') + '"></label>',
    async function() {
      await api.suppliers.update(id, { name: document.getElementById('s-name').value.trim(), phone: document.getElementById('s-phone').value.trim(), email: document.getElementById('s-email').value.trim(), address: document.getElementById('s-address').value.trim(), notes: document.getElementById('s-notes').value.trim() });
      window.toast.success('Supplier updated');
      loadSuppliers();
    });
};
window.deleteSupplierRow = async function(id) {
  var ok = await showConfirm({ title: 'Delete supplier?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true, icon: '!' });
  if (!ok) return;
  await api.suppliers.delete(id);
  loadSuppliers();
  window.toast.success('Supplier deleted');
};
window.viewSupplier = async function(id) {
  var s = await api.suppliers.getById(id);
  var posHtml = s.purchase_orders.length ? s.purchase_orders.map(function(p) { return '<tr><td><b>' + escapeHtml(p.po_no) + '</b></td><td><span class="pill ' + p.status + '">' + p.status + '</span></td><td>' + UGX(p.total) + '</td><td>' + UGX(p.balance) + '</td><td>' + new Date(p.created_at).toLocaleDateString() + '</td></tr>'; }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">No purchase orders.</td></tr>';
  var payHtml = s.payments.length ? s.payments.map(function(p) { return '<tr><td>' + new Date(p.created_at).toLocaleString() + '</td><td>' + UGX(p.amount) + '</td><td>' + escapeHtml(p.note || '') + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px;">No payments recorded.</td></tr>';
  document.getElementById('modal-title').textContent = 'Supplier: ' + s.name;
  document.getElementById('modal-body').innerHTML = '<div style="margin-bottom:12px;color:var(--text-muted);font-size:13px;">Phone: ' + escapeHtml(s.phone || '—') + ' • Email: ' + escapeHtml(s.email || '—') + '<br>Balance owed: <b style="color:' + (s.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(s.balance) + '</b></div><h3 style="font-size:12px;margin:16px 0 8px;text-transform:uppercase;color:var(--text-muted);">Purchase Orders</h3><div style="max-height:220px;overflow-y:auto;"><table class="data-table compact"><thead><tr><th>PO #</th><th>Status</th><th>Total</th><th>Balance</th><th>Date</th></tr></thead><tbody>' + posHtml + '</tbody></table></div><h3 style="font-size:12px;margin:16px 0 8px;text-transform:uppercase;color:var(--text-muted);">Payments</h3><div style="max-height:200px;overflow-y:auto;"><table class="data-table compact"><thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead><tbody>' + payHtml + '</tbody></table></div>';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
window.paySupplier = function(id) {
  var s = cachedSuppliers.find(function(x) { return x.id === id; }); if (!s) return;
  var bal = Number(s.balance || 0);
  openModal('Pay Supplier — ' + s.name, '<label>Amount (UGX)<input id="sp-amt" class="money-input" value="' + (bal > 0 ? bal : 0) + '"></label><label>Note<input id="sp-note"></label>',
    async function() {
      var amt = getMoneyValue('sp-amt');
      if (amt <= 0) throw new Error('Amount required');
      await api.suppliers.addPayment({ supplier_id: id, po_id: null, amount: amt, note: document.getElementById('sp-note').value.trim() });
      window.toast.success('Payment recorded');
      loadSuppliers();
    });
};

// ============ PURCHASE ORDERS ============
var currentPOFilter = 'all';
document.querySelectorAll('.po-filter').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.po-filter').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentPOFilter = btn.dataset.filter;
    loadPurchaseOrders(currentPOFilter);
  });
});
async function loadPurchaseOrders(filter) {
  var list = await api.po.getAll(filter || 'all');
  if (!cachedSuppliers.length) cachedSuppliers = await api.suppliers.getAll();
  var tbody = document.querySelector('#po-table tbody');
  tbody.innerHTML = list.length ? list.map(function(p) {
    return '<tr><td><b>' + escapeHtml(p.po_no) + '</b></td><td>' + escapeHtml(p.supplier_name) + '</td><td><span class="pill ' + p.status + '">' + p.status + '</span></td><td>' + UGX(p.total) + '</td><td>' + UGX(p.amount_paid) + '</td><td style="color:' + (p.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(p.balance) + '</td><td>' + new Date(p.created_at).toLocaleDateString() + '</td><td>' + (p.status === 'pending' ? '<button class="btn btn-success btn-sm" onclick="receivePO(' + p.id + ')">Receive</button><button class="btn btn-light btn-sm" onclick="cancelPO(' + p.id + ')">Cancel</button>' : '<button class="btn btn-light btn-sm" onclick="viewPO(' + p.id + ')">View</button>') + '</td></tr>';
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">No purchase orders.</td></tr>';
}
window.receivePO = async function(id) {
  var ok = await showConfirm({ title: 'Receive PO?', message: 'This will add the items to your stock and mark the PO as received.', confirmText: 'Receive', icon: '✓' });
  if (!ok) return;
  try { await api.po.receive(id); window.toast.success('PO received, stock updated'); loadPurchaseOrders(currentPOFilter); loadProducts(); }
  catch (e) { window.toast.error(e.message); }
};
window.cancelPO = async function(id) {
  var ok = await showConfirm({ title: 'Cancel PO?', message: 'This will cancel the purchase order.', confirmText: 'Cancel PO', danger: true, icon: '!' });
  if (!ok) return;
  try { await api.po.cancel(id); window.toast.success('PO cancelled'); loadPurchaseOrders(currentPOFilter); }
  catch (e) { window.toast.error(e.message); }
};
window.viewPO = async function(id) {
  var p = await api.po.getById(id);
  var items = p.items.map(function(it) { return '<tr><td>' + escapeHtml(it.product_name) + (it.variant_label ? ' (' + escapeHtml(it.variant_label) + ')' : '') + '</td><td>' + it.quantity + '</td><td>' + UGX(it.unit_cost) + '</td><td>' + UGX(it.line_total) + '</td></tr>'; }).join('');
  document.getElementById('modal-title').textContent = 'PO ' + p.po_no;
  document.getElementById('modal-body').innerHTML = '<div style="margin-bottom:12px;"><b>' + escapeHtml(p.supplier_name) + '</b> — <span class="pill ' + p.status + '">' + p.status + '</span></div><table class="data-table compact"><thead><tr><th>Item</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead><tbody>' + items + '</tbody></table><div style="margin-top:12px;text-align:right;font-size:14px;"><b>Total: ' + UGX(p.total) + '</b><br>Paid: ' + UGX(p.amount_paid) + '<br>Balance: ' + UGX(p.balance) + '</div>';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
document.getElementById('btn-add-po').addEventListener('click', async function() {
  if (!cachedSuppliers.length) cachedSuppliers = await api.suppliers.getAll();
  if (!cachedSuppliers.length) { window.toast.warning('Add a supplier first'); return; }
  var supOpts = cachedSuppliers.map(function(s) { return '<option value="' + s.id + '|' + escapeAttr(s.name) + '">' + escapeHtml(s.name) + '</option>'; }).join('');
  var body = '<label>Supplier<select id="po-supplier">' + supOpts + '</select></label><label>Notes<input id="po-notes"></label><label>Expected Date<input id="po-expected" type="date"></label><label>Amount Paid Now (UGX)<input id="po-paid" class="money-input" value="0"></label><div style="margin-top:14px;"><b>Items</b></div><div id="po-items-list" style="margin-top:8px;max-height:200px;overflow-y:auto;"></div><button class="btn btn-light btn-sm" style="margin-top:8px;" onclick="addPOItemRow()">+ Add Item</button>';
  openModal('New Purchase Order', body, async function() {
    var supParts = document.getElementById('po-supplier').value.split('|');
    var items = [];
    var rows = document.querySelectorAll('#po-items-list .po-item-row');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var name = r.querySelector('.po-name').value.trim();
      var qty = parseInt(r.querySelector('.po-qty').value) || 0;
      var costRaw = String(r.querySelector('.po-cost').value).replace(/[^0-9]/g, '');
      var cost = parseInt(costRaw, 10) || 0;
      if (name && qty > 0) items.push({ product_id: null, variant_id: null, product_name: name, quantity: qty, unit_cost: cost });
    }
    if (!items.length) throw new Error('Add at least one item');
    await api.po.create({ supplier_id: parseInt(supParts[0]), supplier_name: supParts[1], items: items, notes: document.getElementById('po-notes').value.trim(), expected_date: document.getElementById('po-expected').value || null, amount_paid: getMoneyValue('po-paid') });
    window.toast.success('Purchase order created');
    loadPurchaseOrders(currentPOFilter);
  });
  setTimeout(function() { addPOItemRow(); }, 100);
});
window.addPOItemRow = function() {
  var list = document.getElementById('po-items-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'po-item-row';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 100px 30px;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input class="po-name" placeholder="Item name" style="padding:6px 10px;font-size:13px;"><input class="po-qty" type="number" placeholder="Qty" value="1" style="padding:6px 10px;font-size:13px;"><input class="po-cost money-input" placeholder="Cost" value="0" style="padding:6px 10px;font-size:13px;"><button class="btn btn-danger btn-sm" onclick="this.parentNode.remove()">×</button>';
  list.appendChild(row);
  bindAllMoneyInputs(row);
};

// ============ STOCK TAKE ============
async function loadStockTake() {
  try {
    var st = await api.stocktake.getActive();
    var container = document.getElementById('stocktake-content');
    if (!st) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:32px;">No active stock take. Click "Start New Stock Take" to begin.</p>';
      return;
    }
    var rows = st.items.map(function(it) {
      var diff = it.difference || 0;
      var diffClass = diff > 0 ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-zero');
      var diffStr = diff > 0 ? '+' + diff : (diff === 0 ? '0' : String(diff));
      return '<tr><td>' + escapeHtml(it.product_name) + (it.variant_label ? ' (' + escapeHtml(it.variant_label) + ')' : '') + '</td><td>' + it.expected_qty + '</td><td><input type="number" value="' + it.actual_qty + '" onchange="updateStockItem(' + it.id + ', this.value)"></td><td class="' + diffClass + '">' + diffStr + '</td><td><input type="text" placeholder="Reason" value="' + escapeAttr(it.reason || '') + '" onchange="updateStockItemReason(' + it.id + ', this.value, \'\')"></td></tr>';
    }).join('');
    container.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">' +
        '<div><b>Started:</b> ' + new Date(st.started_at).toLocaleString() + '<br><b>Items:</b> ' + st.items.length + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-success" onclick="finishStockTake(' + st.id + ', true)">Complete &amp; Apply Adjustments</button>' +
          '<button class="btn btn-light" onclick="finishStockTake(' + st.id + ', false)">Complete Without Adjusting</button>' +
        '</div>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table stocktake-table"><thead><tr><th>Product</th><th>Expected</th><th>Actual</th><th>Diff</th><th>Reason</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch (e) { console.error(e); }
}
window.updateStockItem = async function(itemId, val) {
  try { await api.stocktake.updateItem(itemId, parseInt(val) || 0, '', ''); loadStockTake(); }
  catch (e) { window.toast.error(e.message); }
};
window.updateStockItemReason = async function(itemId, reason, note) {
  try { await api.stocktake.updateItem(itemId, 0, reason, note); }
  catch (e) {}
};
document.getElementById('btn-stocktake-start').addEventListener('click', async function() {
  try { await api.stocktake.start(''); window.toast.success('Stock take started'); loadStockTake(); }
  catch (e) { window.toast.error(e.message); }
});
window.finishStockTake = async function(id, apply) {
  var ok = await showConfirm({ title: 'Complete stock take?', message: apply ? 'This will update your stock to match the physical counts.' : 'This will complete without adjusting stock.', confirmText: 'Complete', icon: '✓' });
  if (!ok) return;
  try { await api.stocktake.complete(id, apply); window.toast.success('Stock take completed'); loadStockTake(); loadProducts(); }
  catch (e) { window.toast.error(e.message); }
};
document.getElementById('btn-stocktake-history').addEventListener('click', async function() {
  var hist = await api.stocktake.history();
  var rows = hist.length ? hist.map(function(h) { return '<tr><td>' + new Date(h.completed_at).toLocaleString() + '</td><td>' + h.notes + '</td><td><button class="btn btn-light btn-sm" onclick="viewStockTakeHistory(' + h.id + ')">View</button></td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px;">No completed stock takes.</td></tr>';
  openModal('Stock Take History', '<table class="data-table compact"><thead><tr><th>Completed</th><th>Notes</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>', async function() {});
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
});
window.viewStockTakeHistory = async function(id) {
  var st = await api.stocktake.getById(id);
  var items = st.items.map(function(it) { return '<tr><td>' + escapeHtml(it.product_name) + '</td><td>' + it.expected_qty + '</td><td>' + it.actual_qty + '</td><td>' + it.difference + '</td><td>' + escapeHtml(it.reason || '') + '</td></tr>'; }).join('');
  openModal('Stock Take ' + id, '<table class="data-table compact"><thead><tr><th>Product</th><th>Expected</th><th>Actual</th><th>Diff</th><th>Reason</th></tr></thead><tbody>' + items + '</tbody></table>', async function() {});
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};

// ============ PRE-ORDERS ============
var currentPreFilter = 'all';
document.querySelectorAll('.pre-filter').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.pre-filter').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentPreFilter = btn.dataset.filter;
    loadPreOrders(currentPreFilter);
  });
});
async function loadPreOrders(filter) {
  var list = await api.preorders.getAll(filter || 'all');
  var tbody = document.querySelector('#preorder-table tbody');
  tbody.innerHTML = list.length ? list.map(function(p) {
    return '<tr><td><b>' + escapeHtml(p.pre_order_no) + '</b></td><td>' + escapeHtml(p.customer_name) + '<div style="font-size:11px;color:var(--text-muted);">' + escapeHtml(p.customer_phone || '') + '</div></td><td>—</td><td>' + UGX(p.total) + '</td><td>' + UGX(p.deposit) + '</td><td style="color:' + (p.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(p.balance) + '</td><td><span class="pill ' + p.status + '">' + p.status + '</span></td><td><button class="btn btn-light btn-sm" onclick="viewPreOrder(' + p.id + ')">View</button>' + (p.status === 'active' ? '<button class="btn btn-primary btn-sm" onclick="payPreOrder(' + p.id + ')">Pay</button>' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">No pre-orders.</td></tr>';
}
window.viewPreOrder = async function(id) {
  var p = await api.preorders.getById(id);
  var items = p.items.map(function(it) { return '<tr><td>' + escapeHtml(it.product_name) + (it.variant_label ? ' (' + escapeHtml(it.variant_label) + ')' : '') + '</td><td>' + it.quantity + '</td><td>' + UGX(it.unit_price) + '</td><td>' + UGX(it.line_total) + '</td></tr>'; }).join('');
  var payments = p.payments.map(function(pay) { return '<tr><td>' + new Date(pay.created_at).toLocaleString() + '</td><td>' + UGX(pay.amount) + '</td><td>' + escapeHtml(pay.note || '') + '</td></tr>'; }).join('');
  document.getElementById('modal-title').textContent = 'Pre-Order ' + p.pre_order_no;
  document.getElementById('modal-body').innerHTML =
    '<div style="margin-bottom:12px;"><b>' + escapeHtml(p.customer_name) + '</b> — <span class="pill ' + p.status + '">' + p.status + '</span>' + (p.expected_pickup ? '<br><small>Expected pickup: ' + p.expected_pickup + '</small>' : '') + '</div>' +
    '<h3 style="font-size:12px;margin:12px 0 8px;text-transform:uppercase;color:var(--text-muted);">Reserved Items</h3><table class="data-table compact"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>' + items + '</tbody></table>' +
    '<div style="margin-top:12px;text-align:right;font-size:14px;"><b>Total: ' + UGX(p.total) + '</b><br>Deposit: ' + UGX(p.deposit) + '<br>Paid: ' + UGX(p.amount_paid) + '<br><span style="color:var(--danger);">Balance: ' + UGX(p.balance) + '</span></div>' +
    '<h3 style="font-size:12px;margin:16px 0 8px;text-transform:uppercase;color:var(--text-muted);">Payments</h3><table class="data-table compact"><thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead><tbody>' + payments + '</tbody></table>';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
};
window.payPreOrder = async function(id) {
  var p = await api.preorders.getById(id);
  if (p.balance <= 0) { window.toast.info('Already paid in full'); return; }
  openModal('Pay Pre-Order — Balance ' + UGX(p.balance), '<label>Amount (UGX)<input id="pp-amt" class="money-input" value="' + p.balance + '"></label><label>Note<input id="pp-note"></label>',
    async function() {
      var amt = getMoneyValue('pp-amt');
      if (amt <= 0) throw new Error('Amount required');
      await api.preorders.addPayment(id, amt, document.getElementById('pp-note').value.trim());
      window.toast.success('Payment recorded');
      loadPreOrders(currentPreFilter);
    });
};
document.getElementById('btn-add-preorder').addEventListener('click', async function() {
  var body = '<label>Customer Name *<input id="pre-cust"></label><label>Customer Phone<input id="pre-phone"></label><label>Expected Pickup Date<input id="pre-date" type="date"></label><label>Deposit (UGX)<input id="pre-dep" class="money-input" value="0"></label><label>Notes<input id="pre-notes"></label><div style="margin-top:14px;"><b>Items Reserved</b></div><div id="pre-items-list" style="margin-top:8px;max-height:200px;overflow-y:auto;"></div><button class="btn btn-light btn-sm" style="margin-top:8px;" onclick="addPreOrderItemRow()">+ Add Item</button>';
  openModal('New Pre-Order', body, async function() {
    var items = [];
    var rows = document.querySelectorAll('#pre-items-list .pre-item-row');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var name = r.querySelector('.pre-name').value.trim();
      var qty = parseInt(r.querySelector('.pre-qty').value) || 0;
      var priceRaw = String(r.querySelector('.pre-price').value).replace(/[^0-9]/g, '');
      var price = parseInt(priceRaw, 10) || 0;
      if (name && qty > 0) items.push({ product_id: null, variant_id: null, product_name: name, quantity: qty, unit_price: price });
    }
    if (!items.length) throw new Error('Add at least one item');
    await api.preorders.create({ customer_name: document.getElementById('pre-cust').value.trim(), customer_phone: document.getElementById('pre-phone').value.trim(), items: items, deposit: getMoneyValue('pre-dep'), notes: document.getElementById('pre-notes').value.trim(), expected_pickup: document.getElementById('pre-date').value || null });
    window.toast.success('Pre-order created');
    loadPreOrders(currentPreFilter);
  });
  setTimeout(function() { addPreOrderItemRow(); }, 100);
});
window.addPreOrderItemRow = function() {
  var list = document.getElementById('pre-items-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'pre-item-row';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 70px 100px 30px;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input class="pre-name" placeholder="Item" style="padding:6px 10px;font-size:13px;"><input class="pre-qty" type="number" placeholder="Qty" value="1" style="padding:6px 10px;font-size:13px;"><input class="pre-price money-input" placeholder="Price" value="0" style="padding:6px 10px;font-size:13px;"><button class="btn btn-danger btn-sm" onclick="this.parentNode.remove()">×</button>';
  list.appendChild(row);
  bindAllMoneyInputs(row);
};

// ============ REPORTS ============
var currentReport = null;
var chartRevenue = null, chartPayments = null, chartProducts = null;
var CHART_COLORS = { primary: '#FE9F43', secondary: '#092C4C', success: '#28C76F', danger: '#EA5455', warning: '#FF9F43', info: '#17A2B8', purple: '#7367F0' };
function getRangeByKey(key) {
  var now = new Date();
  var from = new Date(), to = new Date();
  if (key === 'today') {}
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
  tbody.innerHTML = customers.length ? customers.map(function(c) { return '<tr><td><b>' + escapeHtml(c.name) + '</b></td><td>' + c.orders + '</td><td>' + UGX(c.billed) + '</td><td style="color:' + (c.balance > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + UGX(c.balance) + '</td></tr>'; }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No sales.</td></tr>';
}
function renderDailyTable(daily) {
  var tbody = document.querySelector('#daily-table tbody');
  tbody.innerHTML = daily.length ? daily.slice().reverse().map(function(d) { return '<tr><td>' + d.day + '</td><td>' + d.orders + '</td><td>' + UGX(d.revenue) + '</td><td>' + UGX(d.collected) + '</td></tr>'; }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No sales.</td></tr>';
}

// ============ PDF EXPORTS ============
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
      var rows = inv.items.map(function(i) { return [i.product_name + (i.variant_label ? ' (' + i.variant_label + ')' : ''), String(i.quantity), 'UGX ' + i.unit_price.toLocaleString(), 'UGX ' + i.line_total.toLocaleString()]; });
      doc.autoTable({ head: [['Item', 'Qty', 'Unit Price', 'Total']], body: rows, startY: 68, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, bodyStyles: { textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.1 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
      var y = doc.lastAutoTable.finalY + 10;
      if ((inv.previous_balance || 0) > 0) { doc.text('Previous Outstanding: UGX ' + inv.previous_balance.toLocaleString(), 20, y); if ((inv.paid_on_previous || 0) > 0) doc.text('Paid on Previous: UGX ' + inv.paid_on_previous.toLocaleString(), 20, y + 6); y += 12; }
      doc.text('Subtotal: UGX ' + inv.subtotal.toLocaleString(), 140, y);
      if (inv.tax_amount > 0) doc.text('Tax: UGX ' + inv.tax_amount.toLocaleString(), 140, y + 6);
      if (inv.discount > 0) doc.text('Discount: -UGX ' + inv.discount.toLocaleString(), 140, y + 12);
      doc.setFont(undefined, 'bold'); doc.text('TOTAL: UGX ' + inv.total.toLocaleString(), 140, y + 20);
      doc.setFont(undefined, 'normal'); doc.text('Paid: UGX ' + inv.amount_paid.toLocaleString(), 140, y + 28);
      if (inv.balance > 0) { doc.setFont(undefined, 'bold'); doc.text('BALANCE DUE: UGX ' + inv.balance.toLocaleString(), 140, y + 36); }
      else { doc.setFont(undefined, 'bold'); doc.text('FULLY PAID', 140, y + 36); }
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
    var payments = await api.customers.payments(customerId);
    var ledger = await api.customers.ledger(customerId);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    pdfHeader(doc);
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Customer Statement', 105, 30, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('Customer: ' + c.name, 20, 42);
    if (c.phone) doc.text('Phone: ' + c.phone, 20, 48);
    doc.text('Statement Date: ' + new Date().toLocaleString(), 20, c.phone ? 54 : 48);
    var y = c.phone ? 62 : 56;
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text('Invoices', 20, y); doc.setFont(undefined, 'normal');
    var invRows = c.invoices.map(function(i) { return [i.invoice_no, new Date(i.created_at).toLocaleDateString(), 'UGX ' + i.total.toLocaleString(), 'UGX ' + i.amount_paid.toLocaleString(), 'UGX ' + i.balance.toLocaleString(), i.payment_status]; });
    doc.autoTable({ head: [['Invoice', 'Date', 'Total', 'Paid', 'Balance', 'Status']], body: invRows, startY: y + 4, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text('Payments Received', 20, y); doc.setFont(undefined, 'normal');
    var payRows = payments.map(function(p) { return [new Date(p.created_at).toLocaleDateString(), p.invoice_no, p.note || 'Payment', 'UGX ' + p.amount.toLocaleString()]; });
    if (!payRows.length) payRows = [['—', '—', 'No payments', '—']];
    doc.autoTable({ head: [['Date', 'Invoice', 'Note', 'Amount']], body: payRows, startY: y + 4, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 3: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text('Cash Ledger', 20, y); doc.setFont(undefined, 'normal');
    var ledgerRows = ledger.map(function(t) { return [new Date(t.created_at).toLocaleDateString(), t.type === 'in' ? 'Cash In' : 'Cash Out', t.note || '', (t.type === 'in' ? '+' : '-') + ' UGX ' + t.amount.toLocaleString()]; });
    if (!ledgerRows.length) ledgerRows = [['—', '—', 'No cash entries', '—']];
    doc.autoTable({ head: [['Date', 'Type', 'Note', 'Amount']], body: ledgerRows, startY: y + 4, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 3: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 12;
    var totalReceived = payments.reduce(function(s, p) { return s + p.amount; }, 0);
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Lifetime Billed:', 20, y); doc.setFont(undefined, 'normal'); doc.text('UGX ' + c.lifetime_total.toLocaleString(), 80, y);
    doc.setFont(undefined, 'bold'); doc.text('Payments Received:', 20, y + 7); doc.setFont(undefined, 'normal'); doc.text('UGX ' + Math.round(totalReceived).toLocaleString(), 80, y + 7);
    doc.setFont(undefined, 'bold'); doc.text('Outstanding Balance:', 20, y + 14); doc.text('UGX ' + c.outstanding.toLocaleString(), 80, y + 14);
    doc.text('Cash Balance:', 20, y + 21); doc.text('UGX ' + Number(c.cash_balance || 0).toLocaleString(), 80, y + 21);
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text('Computer-generated statement from OKK Stores.', 105, 280, { align: 'center' });
    var res = await window.api.system.saveFile({ defaultName: 'Statement_' + c.name.replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf', content: doc.output('datauristring').split(',')[1], encoding: 'base64' });
    if (res.success) window.toast.success('Saved: ' + res.path);
    else if (res.error) window.toast.error('Save failed: ' + res.error);
  } catch (e) { console.error('[statement]', e); window.toast.error('Statement failed: ' + (e.message || e)); }
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
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text('Period: ' + data.range.from + ' to ' + data.range.to, 105, 36, { align: 'center' });
    var summaryRows = [['Total Billed', 'UGX ' + data.totals.billed.toLocaleString()],['Total Collected', 'UGX ' + data.totals.collected.toLocaleString()],['Outstanding', 'UGX ' + data.totals.outstanding.toLocaleString()],['Cost of Goods Sold', 'UGX ' + data.totals.cogs.toLocaleString()],['Estimated Profit', 'UGX ' + data.totals.profit.toLocaleString()],['Number of Orders', String(data.totals.orders)],['Average Order Value', 'UGX ' + data.totals.avgOrder.toLocaleString()]];
    doc.autoTable({ head: [['Summary', 'Value']], body: summaryRows, startY: 44, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 1: { halign: 'right' } } });
    if (data.topProducts.length) { var pRows = data.topProducts.map(function(p) { return [p.product_name, String(p.qty), 'UGX ' + p.revenue.toLocaleString()]; }); doc.autoTable({ head: [['Top Products', 'Qty Sold', 'Revenue']], body: pRows, startY: doc.lastAutoTable.finalY + 10, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } } }); }
    if (data.topCustomers.length) { var cRows = data.topCustomers.map(function(c) { return [c.name, String(c.orders), 'UGX ' + c.billed.toLocaleString(), 'UGX ' + c.balance.toLocaleString()]; }); doc.autoTable({ head: [['Top Customers', 'Orders', 'Billed', 'Balance']], body: cRows, startY: doc.lastAutoTable.finalY + 10, theme: 'grid', headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } }); }
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
    if (list.length > 0) { var last = new Date(list[0].mtime); document.getElementById('backup-last').textContent = last.toLocaleDateString() + ' ' + last.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
    else document.getElementById('backup-last').textContent = 'No backups yet';
    var tbody = document.querySelector('#backups-table tbody');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No backups found.</td></tr>'; return; }
    tbody.innerHTML = list.map(function(b) {
      var dt = new Date(b.mtime);
      var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      var sizeKB = Math.round(b.size / 1024);
      var sizeStr = sizeKB < 1024 ? sizeKB + ' KB' : (sizeKB / 1024).toFixed(1) + ' MB';
      var locShort = b.dir.indexOf(':') > -1 ? b.dir.split('\\').slice(0,2).join('\\') : b.dir;
      return '<tr><td>' + dateStr + '</td><td><b>' + escapeHtml(b.filename) + '</b></td><td>' + sizeStr + '</td><td style="font-size:12px;color:var(--text-muted);">' + escapeHtml(locShort) + '</td><td><button class="btn btn-light btn-sm" onclick="openBackupFolder(\'' + escapeAttr(b.dir) + '\')">Open</button><button class="btn btn-danger btn-sm" onclick="restoreBackup(\'' + escapeAttr(b.fullPath) + '\')">Restore</button></td></tr>';
    }).join('');
  } catch (e) { window.toast.error('Failed: ' + e.message); }
}
window.openBackupFolder = async function(dirOrKey) {
  try { var dir = dirOrKey; if (dirOrKey === 'primary') { var info = await api.backup.getInfo(); dir = info.dirs[0]; } if (!dir) { window.toast.warning('Unavailable'); return; } await api.backup.openFolder(dir); }
  catch (e) { window.toast.error('Could not open: ' + e.message); }
};
window.restoreBackup = async function(filePath) {
  var confirmed = await showConfirm({ title: 'Restore this backup?', message: 'This will replace ALL current data with the backup. A safety copy is saved first. The app will restart.', confirmText: 'Restore & Restart', danger: true, icon: '⟲' });
  if (!confirmed) return;
  window.toast.info('Restoring backup...');
  try { var result = await api.backup.restore(filePath); window.toast.success('Backup restored. Restarting...'); }
  catch (e) { window.toast.error('Restore failed: ' + e.message); }
};
document.getElementById('btn-backup-now').addEventListener('click', async function() {
  var btn = this; btn.disabled = true; btn.textContent = 'Backing up...';
  try { var result = await api.backup.create(); window.toast.success('Backup created: ' + result.filename); await loadBackups(); }
  catch (e) { window.toast.error('Backup failed: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Backup Now'; }
});

// ============ THERMAL PRINTER ============
var PRINTER_KEY = 'okk_printer_name';
function getSavedPrinter() { return localStorage.getItem(PRINTER_KEY) || 'POS-58'; }
window.printThermal = async function(invoiceId) {
  try { var inv = await api.orders.getById(invoiceId); var printerName = getSavedPrinter(); window.toast.info('Printing to ' + printerName + '...'); await api.printer.print(inv, printerName); window.toast.success('Receipt sent'); }
  catch (e) { window.toast.error('Print failed: ' + (e.message || e)); }
};
window.testPrinter = async function() {
  try { var printerName = getSavedPrinter(); await api.printer.test(printerName); window.toast.success('Test sent'); }
  catch (e) { window.toast.error('Test print failed: ' + (e.message || e)); }
};
window.savePrinterName = function(name) { if (!name || !name.trim()) { window.toast.warning('Enter printer name'); return; } localStorage.setItem(PRINTER_KEY, name.trim()); window.toast.success('Printer set'); };
window.loadPrinterList = async function() {
  try { var printers = await api.printer.list(); var el = document.getElementById('printer-list'); if (!el) return; if (!printers.length) { el.innerHTML = 'No printers detected.'; return; } el.innerHTML = 'Detected: ' + printers.map(function(p) { var safe = p.replace(/'/g, "\\'"); return '<b style="cursor:pointer;color:var(--primary);" onclick="document.getElementById(\'printer-name-input\').value=\'' + safe + '\'">' + escapeHtml(p) + '</b>'; }).join(' &middot; '); if (!localStorage.getItem(PRINTER_KEY)) { var inp = document.getElementById('printer-name-input'); if (inp) inp.value = printers[0]; } }
  catch (e) { window.toast.error('Could not detect'); }
};
(function() { var input = document.getElementById('printer-name-input'); if (input) input.value = getSavedPrinter(); })();

// ============ AUTO-UPDATER ============
(async function initUpdater() {
  try { var version = await api.updater.getVersion(); var vEl = document.getElementById('user-version'); if (vEl) vEl.textContent = 'v' + version; } catch (e) {}
  api.updater.onEvent('update:available', function(info) { window.toast.info('Update available: v' + info.version, 6000); });
  api.updater.onEvent('update:none', function(info) { console.log('[updater] Up to date'); });
  api.updater.onEvent('update:error', function(data) { console.error('[updater] Error:', data.message); });
  api.updater.onEvent('update:progress', function(data) {});
  api.updater.onEvent('update:downloaded', function(info) { showUpdateReadyToast(info.version); });
})();
function showUpdateReadyToast(version) {
  var container = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast success';
  el.style.minWidth = '340px';
  el.innerHTML = '<span class="toast-icon">↑</span><span class="toast-message"><b>Update ready: v' + escapeHtml(version) + '</b><br><span style="font-size:12px;color:var(--text-muted);">Restart to apply.</span></span><button class="toast-close" style="display:none;">x</button>';
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
  bindAllMoneyInputs(document);
  loadDashboard();
  updateNotificationBadge();
} else {
  bindAllMoneyInputs(document);
  initLogin();
}
console.log('>>> ui.js ready');
