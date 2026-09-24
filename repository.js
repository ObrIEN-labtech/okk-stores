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
  const hashed = hashPassword(password);
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(hashed);
  return { success: true };
}

function checkAdminPassword(password) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  if (!row) return false;
  return verifyPassword(password, row.value);
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

  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO invoices
      (invoice_no,customer_name,customer_phone,subtotal,tax_rate,tax_amount,discount,total,
       amount_paid,balance,payment_status,fulfillment_status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(invoiceNo, customer_name || 'Walk-in Customer', customer_phone || '',
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

    if (paid > 0) {
      db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)')
        .run(invId, paid, 'Initial payment');
    }

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

function getAllInvoices() {
  return getDb().prepare('SELECT * FROM invoices ORDER BY created_at DESC').all();
}

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

  return {
    totalValue: Math.round(tv),
    totalCost: Math.round(tc),
    potentialProfit: Math.round(tv - tc),
    lowStock: ls, productCount: pc,
    todaySales: Math.round(ts),
    orderedNotPaid: { count: orderedNotPaid.c, amount: Math.round(orderedNotPaid.b) },
    paidNotTaken:  { count: paidNotTaken.c,  amount: Math.round(paidNotTaken.t) },
    takenNotPaid:  { count: takenNotPaid.c,  amount: Math.round(takenNotPaid.b) }
  };
}

function getBestWorstSellers() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.name,
           COALESCE(SUM(ii.quantity), 0) AS qty_sold,
           COALESCE(SUM(ii.line_total), 0) AS revenue
    FROM products p
    LEFT JOIN invoice_items ii ON ii.product_id = p.id
    GROUP BY p.id
    HAVING qty_sold > 0
    ORDER BY qty_sold DESC
  `).all();

  if (!rows.length) return { best: null, worst: null };
  return { best: rows[0], worst: rows[rows.length - 1] };
}

module.exports = {
  hasAdminPassword, setAdminPassword, checkAdminPassword,
  getAllProducts, getProductById, findProductByName, addProduct, updateProduct, deleteProduct,
  getPriceHistory, adjustStock,
  createOrder, addPayment, setFulfillment, getInvoiceById, getAllInvoices, getInvoicesByFilter,
  getDashboardStats, getBestWorstSellers
};
