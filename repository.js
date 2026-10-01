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

// ============ PRODUCT VARIANTS ============
function getVariantsByProduct(productId) {
  return getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, price').all(productId);
}
function getVariantById(id) {
  return getDb().prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
}
function addVariant({ product_id, label, price, cost_price, stock, sort_order }) {
  const r = getDb().prepare('INSERT INTO product_variants (product_id, label, price, cost_price, stock, sort_order) VALUES (?,?,?,?,?,?)')
    .run(product_id, label, price || 0, cost_price || 0, stock || 0, sort_order || 0);
  return getVariantById(r.lastInsertRowid);
}
function updateVariant(id, fields) {
  const allowed = ['label','price','cost_price','stock','sort_order'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return getVariantById(id);
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE product_variants SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getVariantById(id);
}
function deleteVariant(id) {
  getDb().prepare('DELETE FROM product_variants WHERE id = ?').run(id);
  return { success: true };
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
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!c) return null;
  c.invoices = db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC').all(id);
  c.lifetime_total = c.invoices.reduce((s, i) => s + i.total, 0);
  c.lifetime_paid = c.invoices.reduce((s, i) => s + i.amount_paid, 0);
  c.outstanding = c.invoices.reduce((s, i) => s + i.balance, 0);
  c.transactions = db.prepare('SELECT * FROM customer_transactions WHERE customer_id = ? ORDER BY created_at DESC').all(id);
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
  return getDb().prepare(`
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
    return Object.assign({}, r, { days_overdue: daysOverdue });
  });
}

// ============ CUSTOMER TRANSACTIONS (Cash ledger) ============
function getCustomerLedger(customerId) {
  return getDb().prepare('SELECT * FROM customer_transactions WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
}
function addCustomerTransaction(customerId, type, amount, note) {
  const db = getDb();
  const c = getCustomerById(customerId);
  if (!c) throw new Error('Customer not found');
  if (type !== 'in' && type !== 'out') throw new Error('Type must be "in" or "out"');
  const amt = Math.round(amount);
  if (amt <= 0) throw new Error('Amount must be positive');
  const delta = type === 'in' ? amt : -amt;
  const newBalance = (c.cash_balance || 0) + delta;
  db.prepare('INSERT INTO customer_transactions (customer_id, type, amount, note) VALUES (?,?,?,?)')
    .run(customerId, type, amt, note || '');
  db.prepare('UPDATE customers SET cash_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newBalance, customerId);
  return { success: true, newBalance: newBalance };
}

// ============ HELPERS ============
function computePaymentStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

// ============ ORDERS ============
function createOrder({ customer_name, customer_phone, items, tax_rate, discount, amount_paid, fulfillment_status, notes, pay_previous }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('Cart is empty');

  const resolved = items.map(it => {
    let unitPrice = 0;
    let variantLabel = '';
    let variantId = null;
    let stockAvailable = 0;
    let productName = '';
    let productId = 0;

    if (it.variant_id) {
      const v = getVariantById(it.variant_id);
      if (!v) throw new Error('Variant ' + it.variant_id + ' not found');
      const p = getProductById(v.product_id);
      if (!p) throw new Error('Product for variant not found');
      unitPrice = v.price;
      variantLabel = v.label;
      variantId = v.id;
      stockAvailable = v.stock;
      productName = p.name + ' (' + v.label + ')';
      productId = p.id;
    } else {
      const p = getProductById(it.product_id);
      if (!p) throw new Error('Product ' + it.product_id + ' not found');
      unitPrice = p.price;
      stockAvailable = p.stock;
      productName = p.name;
      productId = p.id;
    }

    if (stockAvailable < it.quantity) {
      throw new Error('Insufficient stock for ' + productName + ' (have ' + stockAvailable + ')');
    }

    return {
      product_id: productId,
      product_name: productName,
      variant_id: variantId,
      variant_label: variantLabel,
      quantity: it.quantity,
      unit_price: unitPrice,
      line_total: Math.round(it.quantity * unitPrice)
    };
  });

  const subtotal = resolved.reduce((s, i) => s + i.line_total, 0);
  const taxAmount = Math.round(subtotal * (tax_rate || 0));
  const total = Math.max(0, subtotal + taxAmount - (discount || 0));

  const customer = findOrCreateCustomer({ name: customer_name, phone: customer_phone });

  // Previous balance
  let previousBalance = 0;
  if (customer.id) {
    const row = db.prepare('SELECT COALESCE(SUM(balance), 0) AS b FROM invoices WHERE customer_id = ?').get(customer.id);
    previousBalance = Math.round(row.b || 0);
  }
  const payPrev = Math.min(Math.max(0, Math.round(pay_previous || 0)), previousBalance);

  if (payPrev > 0 && customer.id) {
    const tx = db.transaction(() => {
      let remaining = payPrev;
      const unpaid = db.prepare("SELECT id, balance FROM invoices WHERE customer_id = ? AND balance > 0 ORDER BY created_at ASC").all(customer.id);
      for (const inv of unpaid) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, inv.balance);
        const newBal = inv.balance - apply;
        const currentInv = db.prepare('SELECT total, amount_paid FROM invoices WHERE id = ?').get(inv.id);
        const newAmountPaid = currentInv.amount_paid + apply;
        const status = computePaymentStatus(currentInv.total, newAmountPaid);
        db.prepare('UPDATE invoices SET amount_paid = ?, balance = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newAmountPaid, newBal, status, inv.id);
        db.prepare('INSERT INTO payments (invoice_id, amount, note) VALUES (?,?,?)')
          .run(inv.id, apply, 'Payment on credit (applied at new sale)');
        remaining -= apply;
      }
    });
    tx();
    previousBalance -= payPrev;
  }

  const remainingPaidForCurrent = Math.max(0, Math.round(amount_paid || 0) - payPrev);
  const paid = Math.min(remainingPaidForCurrent, total);
  const balance = total - paid;
  const paymentStatus = computePaymentStatus(total, paid);
  const fulfillment = fulfillment_status === 'taken' ? 'taken' : 'not_taken';
  const openingTotalDue = previousBalance + total;

  const last = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
  const invoiceNo = 'INV-' + String((last ? last.id + 1 : 1)).padStart(6, '0');

  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO invoices
      (invoice_no, customer_id, customer_name, customer_phone, subtotal, tax_rate, tax_amount, discount, total,
       amount_paid, balance, payment_status, fulfillment_status, notes,
       previous_balance, opening_total_due, paid_on_previous)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(invoiceNo, customer.id, customer.name, customer.phone,
        subtotal, tax_rate || 0, taxAmount, discount || 0, total,
        paid, balance, paymentStatus, fulfillment, notes || '',
        previousBalance, openingTotalDue, payPrev);

    const invId = r.lastInsertRowid;

    for (const it of resolved) {
      db.prepare(`INSERT INTO invoice_items
        (invoice_id, product_id, product_name, variant_id, variant_label, quantity, unit_price, line_total)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(invId, it.product_id, it.product_name, it.variant_id, it.variant_label, it.quantity, it.unit_price, it.line_total);

      if (it.variant_id) {
        db.prepare('UPDATE product_variants SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(it.quantity, it.variant_id);
      }
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(it.quantity, it.product_id);
      db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)')
        .run(it.product_id, -it.quantity, 'Sale ' + invoiceNo);
    }

    if (paid > 0) db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)').run(invId, paid, 'Payment at sale');

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
    daily: daily, topProducts: topProducts, topCustomers: topCustomers, paymentSplit: paymentSplit
  };
}

module.exports = {
  hasAdminPassword, setAdminPassword, checkAdminPassword,
  getAllProducts, getProductById, findProductByName, addProduct, updateProduct, deleteProduct,
  getPriceHistory, adjustStock,
  getVariantsByProduct, getVariantById, addVariant, updateVariant, deleteVariant,
  getAllCustomers, getCustomerById, findOrCreateCustomer, updateCustomer, deleteCustomer, getCustomerAging,
  getCustomerPayments, getTopDebtors, getCustomerLedger, addCustomerTransaction,
  createOrder, addPayment, setFulfillment, getInvoiceById, getAllInvoices, getInvoicesByFilter,
  getDashboardStats, getBestWorstSellers,
  getSalesReport
};
