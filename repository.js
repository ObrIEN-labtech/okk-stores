const crypto = require('crypto');
const { getDb } = require('./db');

// ============ AUTH ============
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.createHash('sha256').update(s + ':' + password).digest('hex');
  return s + ':' + h;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}
function hasAdminPassword() {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  return !!(row && row.value);
}
function setAdminPassword(password) {
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(hashPassword(password));
  return { success: true };
}
function checkAdminPassword(password) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  return row ? verifyPassword(password, row.value) : false;
}

// ============ PRODUCTS ============
function getAllProducts() { return getDb().prepare('SELECT * FROM products ORDER BY name').all(); }
function getProductById(id) { return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id); }
function findProductByName(name) {
  return getDb().prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(name);
}
function addProduct({ sku, name, category, cost_price, price, stock, reorder_level, location }) {
  const r = getDb().prepare('INSERT INTO products (sku,name,category,cost_price,price,stock,reorder_level,location) VALUES (?,?,?,?,?,?,?,?)')
    .run(sku || null, name, category || 'General', cost_price || 0, price || 0, stock || 0, reorder_level || 10, location || '');
  if (stock && stock > 0) {
    getDb().prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)')
      .run(r.lastInsertRowid, stock, 'Initial stock');
  }
  return getProductById(r.lastInsertRowid);
}
function updateProduct(id, fields) {
  const e = getProductById(id);
  if (!e) throw new Error('Product not found');
  if (fields.price !== undefined && Number(fields.price) !== e.price) {
    getDb().prepare('INSERT INTO price_history (product_id,old_price,new_price) VALUES (?,?,?)')
      .run(id, e.price, fields.price);
  }
  const allowed = ['sku','name','category','cost_price','price','stock','reorder_level','location'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return e;
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE products SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getProductById(id);
}
function deleteProduct(id) { getDb().prepare('DELETE FROM products WHERE id = ?').run(id); return { success: true }; }
function getPriceHistory(pid) { return getDb().prepare('SELECT * FROM price_history WHERE product_id = ? ORDER BY changed_at DESC').all(pid); }
function adjustStock(id, change, reason) {
  const p = getProductById(id); if (!p) throw new Error('Product not found');
  const ns = p.stock + change; if (ns < 0) throw new Error('Insufficient stock');
  getDb().prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ns, id);
  getDb().prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(id, change, reason || 'Adjustment');
  return getProductById(id);
}

// ============ CUSTOMERS ============
function getAllCustomers() {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM invoices WHERE customer_id = c.id) AS order_count,
      (SELECT COALESCE(SUM(total),0) FROM invoices WHERE customer_id = c.id) AS lifetime_total,
      (SELECT COALESCE(SUM(balance),0) FROM invoices WHERE customer_id = c.id) AS outstanding
    FROM customers c
    ORDER BY c.name
  `).all();
}
function getCustomerById(id) {
  const c = getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!c) return null;
  c.invoices = getDb().prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC').all(id);
  c.lifetime_total = c.invoices.reduce((s, i) => s + i.total, 0);
  c.lifetime_paid = c.invoices.reduce((s, i) => s + i.amount_paid, 0);
  c.outstanding = c.invoices.reduce((s, i) => s + i.balance, 0);
  return c;
}
function findOrCreateCustomer({ name, phone }) {
  if (!name || name.trim() === '' || name.toLowerCase() === 'walk-in customer') {
    return { id: null, name: 'Walk-in Customer', phone: '' };
  }
  const db = getDb();
  let existing = null;
  if (phone && phone.trim()) existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone.trim());
  if (!existing) existing = db.prepare('SELECT * FROM customers WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) return { id: existing.id, name: existing.name, phone: existing.phone || '' };
  try {
    const r = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name.trim(), (phone || '').trim());
    return { id: r.lastInsertRowid, name: name.trim(), phone: (phone || '').trim() };
  } catch (e) {
    const r = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name.trim(), '');
    return { id: r.lastInsertRowid, name: name.trim(), phone: '' };
  }
}
function updateCustomer(id, fields) {
  const allowed = ['name', 'phone', 'notes'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return getCustomerById(id);
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE customers SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getCustomerById(id);
}
function deleteCustomer(id) { getDb().prepare('DELETE FROM customers WHERE id = ?').run(id); return { success: true }; }
function getCustomerAging() {
  const db = getDb();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  const rows = db.prepare('SELECT created_at, balance FROM invoices WHERE balance > 0 AND customer_id IS NOT NULL').all();
  const now = Date.now();
  for (const r of rows) {
    const days = Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
    if (days <= 30) buckets.current += r.balance;
    else if (days <= 60) buckets.d30 += r.balance;
    else if (days <= 90) buckets.d60 += r.balance;
    else if (days <= 180) buckets.d90 += r.balance;
    else buckets.older += r.balance;
  }
  return buckets;
}
function getCustomerPayments(customerId) {
  const db = getDb();
  return db.prepare(`
    SELECT p.id, p.amount, p.note, p.created_at,
           i.invoice_no, i.total
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.customer_id = ?
    ORDER BY p.created_at DESC
  `).all(customerId);
}
function getTopDebtors(limit) {
  const db = getDb();
  const now = Date.now();
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone,
           COALESCE(SUM(i.balance), 0) AS total_owed,
           MIN(i.created_at) AS oldest_invoice_date,
           COUNT(*) AS invoice_count
    FROM customers c
    JOIN invoices i ON i.customer_id = c.id
    WHERE i.balance > 0
    GROUP BY c.id
    HAVING total_owed > 0
    ORDER BY total_owed DESC
    LIMIT ?
  `).all(limit || 5);
  return rows.map(r => {
    const daysOverdue = r.oldest_invoice_date
      ? Math.floor((now - new Date(r.oldest_invoice_date).getTime()) / 86400000)
      : 0;
    return { ...r, days_overdue: daysOverdue };
  });
}

// ============ HELPERS ============
function computePaymentStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

// ============ ORDERS ============
function createOrder({ customer_name, customer_phone, items, tax_rate, discount, amount_paid, fulfillment_status, notes }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('Cart is empty');
  const resolved = items.map(it => {
    const p = getProductById(it.product_id);
    if (!p) throw new Error('Product ' + it.product_id + ' not found');
    if (p.stock < it.quantity) throw new Error('Insufficient stock for ' + p.name + ' (have ' + p.stock + ')');
    return {
      product_id: p.id, product_name: p.name, quantity: it.quantity,
      unit_price: p.price, line_total: Math.round(it.quantity * p.price)
    };
  });
  const subtotal = resolved.reduce((s, i) => s + i.line_total, 0);
  const taxAmount = Math.round(subtotal * (tax_rate || 0));
  const total = Math.max(0, subtotal + taxAmount - (discount || 0));
  const paid = Math.min(Math.max(0, Math.round(amount_paid || 0)), total);
  const balance = total - paid;
  const paymentStatus = computePaymentStatus(total, paid);
  const fulfillment = fulfillment_status === 'taken' ? 'taken' : 'not_taken';
  const last = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
  const invoiceNo = 'INV-' + String((last ? last.id + 1 : 1)).padStart(6, '0');
  const customer = findOrCreateCustomer({ name: customer_name, phone: customer_phone });

  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO invoices
      (invoice_no, customer_id, customer_name, customer_phone, subtotal, tax_rate, tax_amount, discount, total,
       amount_paid, balance, payment_status, fulfillment_status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(invoiceNo, customer.id, customer.name, customer.phone,
        subtotal, tax_rate || 0, taxAmount, discount || 0, total,
        paid, balance, paymentStatus, fulfillment, notes || '');
    const invId = r.lastInsertRowid;
    for (const it of resolved) {
      db.prepare('INSERT INTO invoice_items (invoice_id,product_id,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)')
        .run(invId, it.product_id, it.product_name, it.quantity, it.unit_price, it.line_total);
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(it.quantity, it.product_id);
      db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)')
        .run(it.product_id, -it.quantity, 'Sale ' + invoiceNo);
    }
    if (paid > 0) db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)').run(invId, paid, 'Initial payment');
    return invId;
  });
  return getInvoiceById(tx());
}
function addPayment(invoiceId, amount, note) {
  const db = getDb();
  const inv = getInvoiceById(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const amt = Math.max(0, Math.round(amount));
  if (amt <= 0) throw new Error('Invalid amount');
  const newPaid = inv.amount_paid + amt;
  const newBalance = Math.max(0, inv.total - newPaid);
  const status = computePaymentStatus(inv.total, newPaid);
  db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)').run(invoiceId, amt, note || '');
  db.prepare('UPDATE invoices SET amount_paid=?, balance=?, payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(newPaid, newBalance, status, invoiceId);
  return getInvoiceById(invoiceId);
}
function setFulfillment(invoiceId, status) {
  const db = getDb();
  const inv = getInvoiceById(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const s = status === 'taken' ? 'taken' : 'not_taken';
  db.prepare('UPDATE invoices SET fulfillment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(s, invoiceId);
  return getInvoiceById(invoiceId);
}
function getInvoiceById(id) {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) return null;
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at').all(id);
  return inv;
}
function getAllInvoices() { return getDb().prepare('SELECT * FROM invoices ORDER BY created_at DESC').all(); }
function getInvoicesByFilter(filter) {
  const db = getDb();
  switch (filter) {
    case 'unpaid':      return db.prepare("SELECT * FROM invoices WHERE payment_status='unpaid' ORDER BY created_at DESC").all();
    case 'partial':     return db.prepare("SELECT * FROM invoices WHERE payment_status='partial' ORDER BY created_at DESC").all();
    case 'paid':        return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' ORDER BY created_at DESC").all();
    case 'not_taken':   return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='not_taken' ORDER BY created_at DESC").all();
    case 'taken':       return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='taken' ORDER BY created_at DESC").all();
    case 'paid_not_taken': return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' AND fulfillment_status='not_taken' ORDER BY created_at DESC").all();
    case 'taken_not_paid': return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='taken' AND payment_status!='paid' ORDER BY created_at DESC").all();
    case 'cleared':     return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' AND fulfillment_status='taken' ORDER BY created_at DESC").all();
    default:            return getAllInvoices();
  }
}

// ============ DASHBOARD ============
function getDashboardStats() {
  const db = getDb();
  const tv = db.prepare('SELECT COALESCE(SUM(price * stock), 0) AS v FROM products').get().v;
  const tc = db.prepare('SELECT COALESCE(SUM(cost_price * stock), 0) AS v FROM products').get().v;
  const ls = db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= reorder_level').get().c;
  const pc = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const ts = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) AS v FROM invoices WHERE DATE(created_at) = DATE('now')").get().v;
  const orderedNotPaid = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS b FROM invoices WHERE payment_status='unpaid'").get();
  const paidNotTaken = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS t FROM invoices WHERE payment_status='paid' AND fulfillment_status='not_taken'").get();
  const takenNotPaid = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS b FROM invoices WHERE fulfillment_status='taken' AND payment_status!='paid'").get();
  const custCount = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  const custDebt = db.prepare('SELECT COALESCE(SUM(balance),0) AS b FROM invoices WHERE customer_id IS NOT NULL').get().b;
  return {
    totalValue: Math.round(tv), totalCost: Math.round(tc), potentialProfit: Math.round(tv - tc),
    lowStock: ls, productCount: pc, todaySales: Math.round(ts),
    orderedNotPaid: { count: orderedNotPaid.c, amount: Math.round(orderedNotPaid.b) },
    paidNotTaken:  { count: paidNotTaken.c,  amount: Math.round(paidNotTaken.t) },
    takenNotPaid:  { count: takenNotPaid.c,  amount: Math.round(takenNotPaid.b) },
    customerCount: custCount, customerDebt: Math.round(custDebt)
  };
}
function getBestWorstSellers() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.name, COALESCE(SUM(ii.quantity), 0) AS qty_sold, COALESCE(SUM(ii.line_total), 0) AS revenue
    FROM products p LEFT JOIN invoice_items ii ON ii.product_id = p.id
    GROUP BY p.id HAVING qty_sold > 0 ORDER BY qty_sold DESC
  `).all();
  if (!rows.length) return { best: null, worst: null };
  return { best: rows[0], worst: rows[rows.length - 1] };
}

// ============ SALES REPORTS ============
function getSalesReport(fromDate, toDate) {
  const db = getDb();
  const totals = db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS billed,
           COALESCE(SUM(amount_paid), 0) AS collected,
           COALESCE(SUM(balance), 0) AS outstanding,
           COALESCE(AVG(total), 0) AS avg_order
    FROM invoices WHERE DATE(created_at) BETWEEN ? AND ?
  `).get(fromDate, toDate);
  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(ii.quantity * p.cost_price), 0) AS cogs
    FROM invoice_items ii JOIN products p ON p.id = ii.product_id
    JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE DATE(inv.created_at) BETWEEN ? AND ?
  `).get(fromDate, toDate);
  const daily = db.prepare(`
    SELECT DATE(created_at) AS day, COALESCE(SUM(total), 0) AS revenue,
           COALESCE(SUM(amount_paid), 0) AS collected, COUNT(*) AS orders
    FROM invoices WHERE DATE(created_at) BETWEEN ? AND ?
    GROUP BY DATE(created_at) ORDER BY day
  `).all(fromDate, toDate);
  const topProducts = db.prepare(`
    SELECT ii.product_id, ii.product_name, SUM(ii.quantity) AS qty, SUM(ii.line_total) AS revenue
    FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE DATE(inv.created_at) BETWEEN ? AND ?
    GROUP BY ii.product_id ORDER BY revenue DESC LIMIT 15
  `).all(fromDate, toDate);
  const topCustomers = db.prepare(`
    SELECT COALESCE(c.name, i.customer_name) AS name, COUNT(*) AS orders,
           COALESCE(SUM(i.total), 0) AS billed,
           COALESCE(SUM(i.amount_paid), 0) AS paid,
           COALESCE(SUM(i.balance), 0) AS balance
    FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
    WHERE DATE(i.created_at) BETWEEN ? AND ?
    GROUP BY COALESCE(c.id, i.customer_name) ORDER BY billed DESC LIMIT 15
  `).all(fromDate, toDate);
  const paymentSplit = db.prepare(`
    SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount
    FROM invoices WHERE DATE(created_at) BETWEEN ? AND ?
    GROUP BY payment_status
  `).all(fromDate, toDate);
  return {
    range: { from: fromDate, to: toDate },
    totals: {
      orders: totals.orders, billed: Math.round(totals.billed),
      collected: Math.round(totals.collected), outstanding: Math.round(totals.outstanding),
      avgOrder: Math.round(totals.avg_order), cogs: Math.round(cogsRow.cogs),
      profit: Math.round(totals.billed - cogsRow.cogs)
    },
    daily, topProducts, topCustomers, paymentSplit
  };
}

module.exports = {
  hasAdminPassword, setAdminPassword, checkAdminPassword,
  getAllProducts, getProductById, findProductByName, addProduct, updateProduct, deleteProduct,
  getPriceHistory, adjustStock,
  getAllCustomers, getCustomerById, findOrCreateCustomer, updateCustomer, deleteCustomer, getCustomerAging,
  getCustomerPayments, getTopDebtors,
  createOrder, addPayment, setFulfillment, getInvoiceById, getAllInvoices, getInvoicesByFilter,
  getDashboardStats, getBestWorstSellers,
  getSalesReport
};
