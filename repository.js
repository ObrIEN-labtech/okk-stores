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
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(hashPassword(password));
  return { success: true };
}
function checkAdminPassword(password) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  return row ? verifyPassword(password, row.value) : false;
}

// ============ PRODUCTS ============
function getAllProducts() { return getDb().prepare('SELECT * FROM products ORDER BY name').all(); }
function getProductById(id) { return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id); }
function findProductByName(name) { return getDb().prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(name); }
function findProductByBarcode(barcode) {
  if (!barcode) return null;
  const db = getDb();
  const v = db.prepare('SELECT * FROM product_variants WHERE barcode = ?').get(barcode);
  if (v) { const p = db.prepare('SELECT * FROM products WHERE id = ?').get(v.product_id); return { type: 'variant', product: p, variant: v }; }
  const p = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);
  if (p) return { type: 'product', product: p, variant: null };
  return null;
}
function addProduct({ sku, name, category, cost_price, price, stock, reorder_level, location, barcode }) {
  const r = getDb().prepare('INSERT INTO products (sku,name,category,cost_price,price,stock,reorder_level,location,barcode) VALUES (?,?,?,?,?,?,?,?,?)').run(sku || null, name, category || 'General', cost_price || 0, price || 0, stock || 0, reorder_level || 10, location || '', barcode || '');
  if (stock && stock > 0) getDb().prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(r.lastInsertRowid, stock, 'Initial stock');
  return getProductById(r.lastInsertRowid);
}
function updateProduct(id, fields) {
  const e = getProductById(id); if (!e) throw new Error('Product not found');
  if (fields.price !== undefined && Number(fields.price) !== e.price) getDb().prepare('INSERT INTO price_history (product_id,old_price,new_price) VALUES (?,?,?)').run(id, e.price, fields.price);
  const allowed = ['sku','name','category','cost_price','price','stock','reorder_level','location','barcode'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return e;
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE products SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getProductById(id);
}
function deleteProduct(id) {
  const db = getDb();
  const soldCount = db.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE product_id = ?').get(id).c;
  const poCount = db.prepare('SELECT COUNT(*) AS c FROM purchase_order_items WHERE product_id = ?').get(id).c;
  const preOrderCount = db.prepare('SELECT COUNT(*) AS c FROM pre_order_items WHERE product_id = ?').get(id).c;
  if (soldCount > 0 || poCount > 0 || preOrderCount > 0) {
    throw new Error('Cannot delete: this product is referenced in past sales, purchase orders, or pre-orders. Set its stock to 0 or edit it instead.');
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { success: true };
}
function getPriceHistory(pid) { return getDb().prepare('SELECT * FROM price_history WHERE product_id = ? ORDER BY changed_at DESC').all(pid); }
function adjustStock(id, change, reason) {
  const p = getProductById(id); if (!p) throw new Error('Product not found');
  const ns = p.stock + change; if (ns < 0) throw new Error('Insufficient stock');
  getDb().prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ns, id);
  getDb().prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(id, change, reason || 'Adjustment');
  return getProductById(id);
}

// ============ PRODUCT VARIANTS ============
function getVariantsByProduct(productId) { return getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, price').all(productId); }
function getVariantById(id) { return getDb().prepare('SELECT * FROM product_variants WHERE id = ?').get(id); }
function addVariant({ product_id, label, price, cost_price, stock, sort_order, barcode }) {
  const r = getDb().prepare('INSERT INTO product_variants (product_id, label, price, cost_price, stock, sort_order, barcode) VALUES (?,?,?,?,?,?,?)').run(product_id, label, price || 0, cost_price || 0, stock || 0, sort_order || 0, barcode || '');
  return getVariantById(r.lastInsertRowid);
}
function updateVariant(id, fields) {
  const allowed = ['label','price','cost_price','stock','sort_order','barcode'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return getVariantById(id);
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE product_variants SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getVariantById(id);
}
function deleteVariant(id) { getDb().prepare('DELETE FROM product_variants WHERE id = ?').run(id); return { success: true }; }

// ============ CUSTOMERS ============
function getAllCustomers() {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM invoices WHERE customer_id = c.id) AS order_count,
      (SELECT COALESCE(SUM(total),0) FROM invoices WHERE customer_id = c.id) AS lifetime_total,
      (SELECT COALESCE(SUM(balance),0) FROM invoices WHERE customer_id = c.id) AS outstanding
    FROM customers c ORDER BY c.name
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
  if (!name || name.trim() === '' || name.toLowerCase() === 'walk-in customer') return { id: null, name: 'Walk-in Customer', phone: '' };
  const db = getDb();
  let existing = null;
  if (phone && phone.trim()) existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone.trim());
  if (!existing) existing = db.prepare('SELECT * FROM customers WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) return { id: existing.id, name: existing.name, phone: existing.phone || '' };
  try { const r = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name.trim(), (phone || '').trim()); return { id: r.lastInsertRowid, name: name.trim(), phone: (phone || '').trim() }; }
  catch (e) { const r = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name.trim(), ''); return { id: r.lastInsertRowid, name: name.trim(), phone: '' }; }
}
function updateCustomer(id, fields) {
  const allowed = ['name', 'phone', 'notes', 'credit_limit'];
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
  return getDb().prepare(`SELECT p.id, p.amount, p.note, p.created_at, i.invoice_no, i.total FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = ? ORDER BY p.created_at DESC`).all(customerId);
}
function getTopDebtors(limit) {
  const db = getDb();
  const now = Date.now();
  const rows = db.prepare(`SELECT c.id, c.name, c.phone, COALESCE(SUM(i.balance), 0) AS total_owed, MIN(i.created_at) AS oldest_invoice_date, COUNT(*) AS invoice_count FROM customers c JOIN invoices i ON i.customer_id = c.id WHERE i.balance > 0 GROUP BY c.id HAVING total_owed > 0 ORDER BY total_owed DESC LIMIT ?`).all(limit || 5);
  return rows.map(r => Object.assign({}, r, { days_overdue: r.oldest_invoice_date ? Math.floor((now - new Date(r.oldest_invoice_date).getTime()) / 86400000) : 0 }));
}
function getCustomerLedger(customerId) { return getDb().prepare('SELECT * FROM customer_transactions WHERE customer_id = ? ORDER BY created_at DESC').all(customerId); }
function addCustomerTransaction(customerId, type, amount, note) {
  const db = getDb();
  const c = getCustomerById(customerId); if (!c) throw new Error('Customer not found');
  if (type !== 'in' && type !== 'out') throw new Error('Type must be "in" or "out"');
  const amt = Math.round(amount); if (amt <= 0) throw new Error('Amount must be positive');
  const newBalance = (c.cash_balance || 0) + (type === 'in' ? amt : -amt);
  db.prepare('INSERT INTO customer_transactions (customer_id, type, amount, note) VALUES (?,?,?,?)').run(customerId, type, amt, note || '');
  db.prepare('UPDATE customers SET cash_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, customerId);
  return { success: true, newBalance: newBalance };
}

// ============ EXPENSES ============
function getAllExpenseCategories() { return getDb().prepare('SELECT * FROM expense_categories ORDER BY is_default DESC, name').all(); }
function addExpenseCategory(name) {
  if (!name || !name.trim()) throw new Error('Name required');
  try { const r = getDb().prepare('INSERT INTO expense_categories (name, is_default) VALUES (?, 0)').run(name.trim()); return { id: r.lastInsertRowid, name: name.trim(), is_default: 0 }; }
  catch (e) { throw new Error('Category already exists'); }
}
function deleteExpenseCategory(id) {
  const cat = getDb().prepare('SELECT * FROM expense_categories WHERE id = ?').get(id);
  if (cat && cat.is_default) throw new Error('Cannot delete a default category');
  getDb().prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
  return { success: true };
}
function getAllExpenses(fromDate, toDate) {
  const db = getDb();
  let q = 'SELECT * FROM expenses';
  const params = [];
  if (fromDate && toDate) { q += ' WHERE expense_date BETWEEN ? AND ?'; params.push(fromDate, toDate); }
  q += ' ORDER BY expense_date DESC, created_at DESC';
  return db.prepare(q).all(...params);
}
function addExpense({ category_id, category_name, amount, note, paid_by, expense_date }) {
  const amt = Math.round(amount); if (amt <= 0) throw new Error('Amount must be positive');
  const r = getDb().prepare('INSERT INTO expenses (category_id, category_name, amount, note, paid_by, expense_date) VALUES (?,?,?,?,?,?)').run(category_id || null, category_name, amt, note || '', paid_by || 'Cash', expense_date || new Date().toISOString().slice(0, 10));
  return getDb().prepare('SELECT * FROM expenses WHERE id = ?').get(r.lastInsertRowid);
}
function updateExpense(id, fields) {
  const allowed = ['category_id','category_name','amount','note','paid_by','expense_date'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return null;
  vals.push(id);
  getDb().prepare('UPDATE expenses SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getDb().prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}
function deleteExpense(id) { getDb().prepare('DELETE FROM expenses WHERE id = ?').run(id); return { success: true }; }
function getExpenseSummary(fromDate, toDate) {
  const db = getDb();
  const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS v FROM expenses WHERE expense_date BETWEEN ? AND ?').get(fromDate, toDate).v;
  const byCategory = db.prepare('SELECT category_name, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category_name ORDER BY amount DESC').all(fromDate, toDate);
  return { total: Math.round(total), byCategory };
}

// ============ CASH DEPOSITS ============
function getDepositorOutstanding(depositorName) {
  const row = getDb().prepare(`SELECT COALESCE(SUM(outstanding), 0) AS outstanding FROM cash_deposits WHERE LOWER(depositor_name) = LOWER(?)`).get(depositorName || '');
  return Math.round(row.outstanding || 0);
}
function getDepositorHistory(depositorName) {
  return getDb().prepare(`SELECT * FROM cash_deposits WHERE LOWER(depositor_name) = LOWER(?) ORDER BY entry_date DESC, created_at DESC`).all(depositorName || '');
}
function getAllDepositors() {
  return getDb().prepare(`SELECT depositor_name, MAX(depositor_phone) AS depositor_phone, COUNT(*) AS entry_count, COALESCE(SUM(CASE WHEN type='in' THEN amount_received ELSE 0 END), 0) AS total_received, COALESCE(SUM(CASE WHEN type='out' THEN amount_received ELSE 0 END), 0) AS total_paid_out, COALESCE(SUM(outstanding), 0) AS total_outstanding FROM cash_deposits GROUP BY LOWER(depositor_name) ORDER BY depositor_name`).all().map(r => Object.assign({}, r, { total_received: Math.round(r.total_received), total_paid_out: Math.round(r.total_paid_out), total_outstanding: Math.round(r.total_outstanding) }));
}
function getCashBookEntries(fromDate, toDate, depositorName) {
  const db = getDb();
  let q = 'SELECT * FROM cash_deposits WHERE 1=1';
  const params = [];
  if (fromDate && toDate) { q += ' AND entry_date BETWEEN ? AND ?'; params.push(fromDate, toDate); }
  if (depositorName) { q += ' AND LOWER(depositor_name) = LOWER(?)'; params.push(depositorName); }
  q += ' ORDER BY entry_date DESC, created_at DESC';
  return db.prepare(q).all(...params);
}
function addCashBookEntry({ depositor_name, depositor_phone, type, mode, amount_received, amount_expected, applied_to_previous, note, entry_date }) {
  const db = getDb();
  if (!depositor_name || !depositor_name.trim()) throw new Error('Depositor name is required');
  if (type !== 'in' && type !== 'out') throw new Error('Type must be "in" or "out"');
  if (mode !== 'full' && mode !== 'partial') throw new Error('Mode must be "full" or "partial"');
  const received = Math.round(amount_received || 0);
  if (received <= 0) throw new Error('Amount received must be positive');
  const expected = mode === 'full' ? received : Math.max(0, Math.round(amount_expected || 0));
  if (mode === 'partial' && expected < received) throw new Error('Expected amount cannot be less than received for a partial deposit');
  const previousOutstanding = getDepositorOutstanding(depositor_name);
  const applyPrev = Math.max(0, Math.min(Math.round(applied_to_previous || 0), Math.min(previousOutstanding, received)));
  const forCurrent = received - applyPrev;
  const remainingPrevious = previousOutstanding - applyPrev;
  const newOutstandingThis = Math.max(0, expected - forCurrent);
  const totalOutstanding = remainingPrevious + newOutstandingThis;
  const r = db.prepare(`INSERT INTO cash_deposits (depositor_name, depositor_phone, type, mode, amount_received, amount_expected, outstanding, applied_to_previous, previous_outstanding, note, entry_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(depositor_name.trim(), (depositor_phone || '').trim(), type, mode, received, expected, totalOutstanding, applyPrev, previousOutstanding, (note || '').trim(), entry_date || new Date().toISOString().slice(0, 10));
  return db.prepare('SELECT * FROM cash_deposits WHERE id = ?').get(r.lastInsertRowid);
}
function deleteCashBookEntry(id) { getDb().prepare('DELETE FROM cash_deposits WHERE id = ?').run(id); return { success: true }; }
function getCashBookSummary(fromDate, toDate) {
  const db = getDb();
  const period = db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount_received ELSE 0 END), 0) AS total_in, COALESCE(SUM(CASE WHEN type='out' THEN amount_received ELSE 0 END), 0) AS total_out, COALESCE(SUM(outstanding), 0) AS outstanding, COUNT(*) AS count FROM cash_deposits WHERE entry_date BETWEEN ? AND ?`).get(fromDate, toDate);
  const allTime = db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount_received ELSE 0 END), 0) AS total_in, COALESCE(SUM(CASE WHEN type='out' THEN amount_received ELSE 0 END), 0) AS total_out, COALESCE(SUM(outstanding), 0) AS outstanding FROM cash_deposits`).get();
  const totalIn = Math.round(period.total_in || 0);
  const totalOut = Math.round(period.total_out || 0);
  return {
    periodIn: totalIn, periodOut: totalOut, periodNet: totalIn - totalOut,
    periodCount: period.count, periodOutstanding: Math.round(period.outstanding || 0),
    lifetimeIn: Math.round(allTime.total_in || 0), lifetimeOut: Math.round(allTime.total_out || 0),
    lifetimeOutstanding: Math.round(allTime.outstanding || 0)
  };
}

// ============ SUPPLIERS ============
function getAllSuppliers() { return getDb().prepare('SELECT * FROM suppliers ORDER BY name').all(); }
function getSupplierById(id) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!s) return null;
  s.purchase_orders = db.prepare('SELECT * FROM purchase_orders WHERE supplier_id = ? ORDER BY created_at DESC').all(id);
  s.payments = db.prepare('SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY created_at DESC').all(id);
  return s;
}
function addSupplier({ name, phone, email, address, notes }) {
  if (!name || !name.trim()) throw new Error('Name required');
  const r = getDb().prepare('INSERT INTO suppliers (name, phone, email, address, notes) VALUES (?,?,?,?,?)').run(name.trim(), phone || '', email || '', address || '', notes || '');
  return getDb().prepare('SELECT * FROM suppliers WHERE id = ?').get(r.lastInsertRowid);
}
function updateSupplier(id, fields) {
  const allowed = ['name','phone','email','address','notes'];
  const upd = [], vals = [];
  for (const k of allowed) if (fields[k] !== undefined) { upd.push(k + ' = ?'); vals.push(fields[k]); }
  if (!upd.length) return null;
  upd.push('updated_at = CURRENT_TIMESTAMP'); vals.push(id);
  getDb().prepare('UPDATE suppliers SET ' + upd.join(', ') + ' WHERE id = ?').run(...vals);
  return getSupplierById(id);
}
function deleteSupplier(id) { getDb().prepare('DELETE FROM suppliers WHERE id = ?').run(id); return { success: true }; }
function addSupplierPayment({ supplier_id, po_id, amount, note }) {
  const db = getDb();
  const s = getSupplierById(supplier_id); if (!s) throw new Error('Supplier not found');
  const amt = Math.round(amount); if (amt <= 0) throw new Error('Amount must be positive');
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO supplier_payments (supplier_id, po_id, amount, note) VALUES (?,?,?,?)').run(supplier_id, po_id || null, amt, note || '');
    db.prepare('UPDATE suppliers SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(amt, supplier_id);
    if (po_id) {
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
      if (po) { const newPaid = po.amount_paid + amt; const newBal = Math.max(0, po.total - newPaid); db.prepare('UPDATE purchase_orders SET amount_paid = ?, balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newPaid, newBal, po_id); }
    }
  });
  tx();
  return getSupplierById(supplier_id);
}

// ============ PURCHASE ORDERS ============
function getAllPurchaseOrders(filter) {
  const db = getDb();
  let q = 'SELECT * FROM purchase_orders';
  if (filter === 'pending') q += " WHERE status = 'pending'";
  else if (filter === 'received') q += " WHERE status = 'received'";
  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all();
}
function getPurchaseOrderById(id) {
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
  if (!po) return null;
  po.items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(id);
  po.payments = db.prepare('SELECT * FROM supplier_payments WHERE po_id = ? ORDER BY created_at').all(id);
  return po;
}
function createPurchaseOrder({ supplier_id, supplier_name, items, notes, expected_date, amount_paid }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('No items in PO');
  const resolved = items.map(it => {
    let name = it.product_name || ''; let variantLabel = '';
    if (it.variant_id) { const v = getVariantById(it.variant_id); if (v) variantLabel = v.label; }
    if (!name && it.product_id) { const p = getProductById(it.product_id); if (p) name = p.name; }
    return { product_id: it.product_id || null, variant_id: it.variant_id || null, product_name: name, variant_label: variantLabel, quantity: it.quantity, unit_cost: it.unit_cost, line_total: Math.round(it.quantity * it.unit_cost) };
  });
  const subtotal = resolved.reduce((s, i) => s + i.line_total, 0);
  const total = subtotal;
  const paid = Math.max(0, Math.round(amount_paid || 0));
  const balance = total - paid;
  const last = db.prepare('SELECT id FROM purchase_orders ORDER BY id DESC LIMIT 1').get();
  const poNo = 'PO-' + String((last ? last.id + 1 : 1)).padStart(6, '0');
  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO purchase_orders (po_no, supplier_id, supplier_name, status, subtotal, total, amount_paid, balance, notes, expected_date) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(poNo, supplier_id || null, supplier_name, 'pending', subtotal, total, paid, balance, notes || '', expected_date || null);
    const poId = r.lastInsertRowid;
    for (const it of resolved) db.prepare('INSERT INTO purchase_order_items (po_id, product_id, variant_id, product_name, variant_label, quantity, unit_cost, line_total) VALUES (?,?,?,?,?,?,?,?)').run(poId, it.product_id, it.variant_id, it.product_name, it.variant_label, it.quantity, it.unit_cost, it.line_total);
    if (paid > 0 && supplier_id) {
      db.prepare('UPDATE suppliers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(balance, supplier_id);
      db.prepare('INSERT INTO supplier_payments (supplier_id, po_id, amount, note) VALUES (?,?,?,?)').run(supplier_id, poId, paid, 'Initial payment');
    } else if (balance > 0 && supplier_id) {
      db.prepare('UPDATE suppliers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(balance, supplier_id);
    }
    return poId;
  });
  return getPurchaseOrderById(tx());
}
function receivePurchaseOrder(id) {
  const db = getDb();
  const po = getPurchaseOrderById(id); if (!po) throw new Error('PO not found');
  if (po.status === 'received') throw new Error('Already received');
  const tx = db.transaction(() => {
    for (const it of po.items) {
      if (it.variant_id) db.prepare('UPDATE product_variants SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.variant_id);
      if (it.product_id) {
        db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.product_id);
        db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(it.product_id, it.quantity, 'PO received ' + po.po_no);
      }
    }
    db.prepare("UPDATE purchase_orders SET status = 'received', received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  });
  tx();
  return getPurchaseOrderById(id);
}
function cancelPurchaseOrder(id) {
  const db = getDb();
  const po = getPurchaseOrderById(id); if (!po) throw new Error('PO not found');
  if (po.status === 'received') throw new Error('Cannot cancel received PO');
  db.prepare("UPDATE purchase_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  if (po.supplier_id && po.balance > 0) db.prepare('UPDATE suppliers SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(po.balance, po.supplier_id);
  return getPurchaseOrderById(id);
}

// ============ STOCK TAKE ============
function getActiveStockTake() {
  const db = getDb();
  const st = db.prepare("SELECT * FROM stock_takes WHERE status = 'in_progress' ORDER BY id DESC LIMIT 1").get();
  if (!st) return null;
  st.items = db.prepare('SELECT * FROM stock_take_items WHERE stock_take_id = ? ORDER BY product_name').all(st.id);
  return st;
}
function startStockTake(notes) {
  const db = getDb();
  const existing = getActiveStockTake();
  if (existing) return existing;
  const r = db.prepare("INSERT INTO stock_takes (status, notes) VALUES ('in_progress', ?)").run(notes || '');
  const products = db.prepare('SELECT * FROM products ORDER BY name').all();
  const insertItem = db.prepare('INSERT INTO stock_take_items (stock_take_id, product_id, variant_id, product_name, variant_label, expected_qty, actual_qty, difference) VALUES (?,?,?,?,?,?,?,?)');
  for (const p of products) {
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(p.id);
    if (variants.length) { for (const v of variants) insertItem.run(r.lastInsertRowid, p.id, v.id, p.name, v.label, v.stock, v.stock, 0); }
    else insertItem.run(r.lastInsertRowid, p.id, null, p.name, '', p.stock, p.stock, 0);
  }
  return getActiveStockTake();
}
function updateStockTakeItem(itemId, actualQty, reason, note) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM stock_take_items WHERE id = ?').get(itemId);
  if (!item) throw new Error('Item not found');
  const actual = parseInt(actualQty);
  const diff = actual - item.expected_qty;
  db.prepare('UPDATE stock_take_items SET actual_qty = ?, difference = ?, reason = ?, note = ? WHERE id = ?').run(actual, diff, reason || '', note || '', itemId);
  return db.prepare('SELECT * FROM stock_take_items WHERE id = ?').get(itemId);
}
function completeStockTake(id, applyAdjustments) {
  const db = getDb();
  const st = db.prepare('SELECT * FROM stock_takes WHERE id = ?').get(id);
  if (!st) throw new Error('Stock take not found');
  const tx = db.transaction(() => {
    if (applyAdjustments) {
      const items = db.prepare('SELECT * FROM stock_take_items WHERE stock_take_id = ?').all(id);
      for (const it of items) {
        if (it.difference === 0) continue;
        if (it.variant_id) db.prepare('UPDATE product_variants SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.actual_qty, it.variant_id);
        db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.actual_qty, it.product_id);
        db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(it.product_id, it.difference, 'Stock take: ' + (it.reason || 'Adjustment'));
      }
    }
    db.prepare("UPDATE stock_takes SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  });
  tx();
  return { success: true };
}
function getStockTakeHistory() { return getDb().prepare("SELECT * FROM stock_takes WHERE status = 'completed' ORDER BY completed_at DESC").all(); }
function getStockTakeById(id) {
  const db = getDb();
  const st = db.prepare('SELECT * FROM stock_takes WHERE id = ?').get(id);
  if (!st) return null;
  st.items = db.prepare('SELECT * FROM stock_take_items WHERE stock_take_id = ? ORDER BY product_name').all(id);
  return st;
}

// ============ PRE-ORDERS ============
function getAllPreOrders(filter) {
  const db = getDb();
  let q = 'SELECT * FROM pre_orders';
  if (filter === 'active') q += " WHERE status = 'active'";
  else if (filter === 'completed') q += " WHERE status = 'completed'";
  else if (filter === 'cancelled') q += " WHERE status = 'cancelled'";
  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all();
}
function getPreOrderById(id) {
  const db = getDb();
  const po = db.prepare('SELECT * FROM pre_orders WHERE id = ?').get(id);
  if (!po) return null;
  po.items = db.prepare('SELECT * FROM pre_order_items WHERE pre_order_id = ?').all(id);
  po.payments = db.prepare('SELECT * FROM pre_order_payments WHERE pre_order_id = ? ORDER BY created_at').all(id);
  return po;
}
function createPreOrder({ customer_name, customer_phone, items, deposit, notes, expected_pickup }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('No items reserved');
  const resolved = items.map(it => {
    let name = it.product_name || ''; let variantLabel = ''; let unitPrice = it.unit_price || 0;
    if (it.variant_id) { const v = getVariantById(it.variant_id); if (v) { variantLabel = v.label; unitPrice = v.price; } }
    if (!name && it.product_id) { const p = getProductById(it.product_id); if (p) { name = p.name; if (!it.variant_id) unitPrice = p.price; } }
    return { product_id: it.product_id || null, variant_id: it.variant_id || null, product_name: name, variant_label: variantLabel, quantity: it.quantity, unit_price: unitPrice, line_total: Math.round(it.quantity * unitPrice) };
  });
  const total = resolved.reduce((s, i) => s + i.line_total, 0);
  const dep = Math.max(0, Math.min(Math.round(deposit || 0), total));
  const balance = total - dep;
  const customer = findOrCreateCustomer({ name: customer_name, phone: customer_phone });
  const last = db.prepare('SELECT id FROM pre_orders ORDER BY id DESC LIMIT 1').get();
  const poNo = 'PRE-' + String((last ? last.id + 1 : 1)).padStart(6, '0');
  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO pre_orders (pre_order_no, customer_id, customer_name, customer_phone, total, deposit, amount_paid, balance, status, notes, expected_pickup) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(poNo, customer.id, customer.name, customer.phone, total, dep, dep, balance, 'active', notes || '', expected_pickup || null);
    const poId = r.lastInsertRowid;
    for (const it of resolved) {
      db.prepare('INSERT INTO pre_order_items (pre_order_id, product_id, variant_id, product_name, variant_label, quantity, unit_price, line_total) VALUES (?,?,?,?,?,?,?,?)').run(poId, it.product_id, it.variant_id, it.product_name, it.variant_label, it.quantity, it.unit_price, it.line_total);
      if (it.variant_id) db.prepare('UPDATE product_variants SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.variant_id);
      if (it.product_id) { db.prepare('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.product_id); db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(it.product_id, -it.quantity, 'Pre-order reserved ' + poNo); }
    }
    if (dep > 0) db.prepare('INSERT INTO pre_order_payments (pre_order_id, amount, note) VALUES (?,?,?)').run(poId, dep, 'Initial deposit');
    return poId;
  });
  return getPreOrderById(tx());
}
function addPreOrderPayment(id, amount, note) {
  const db = getDb();
  const po = getPreOrderById(id); if (!po) throw new Error('Pre-order not found');
  if (po.status !== 'active') throw new Error('Pre-order not active');
  const amt = Math.max(0, Math.round(amount)); if (amt <= 0) throw new Error('Invalid amount');
  const newPaid = po.amount_paid + amt;
  const newBal = Math.max(0, po.total - newPaid);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO pre_order_payments (pre_order_id, amount, note) VALUES (?,?,?)').run(id, amt, note || '');
    db.prepare('UPDATE pre_orders SET amount_paid = ?, balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newPaid, newBal, id);
  });
  tx();
  return getPreOrderById(id);
}
function completePreOrder(id) {
  const po = getPreOrderById(id); if (!po) throw new Error('Pre-order not found');
  if (po.status !== 'active') throw new Error('Pre-order not active');
  if (po.balance > 0) throw new Error('Balance still outstanding: UGX ' + po.balance.toLocaleString());
  getDb().prepare("UPDATE pre_orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return getPreOrderById(id);
}
function cancelPreOrder(id) {
  const db = getDb();
  const po = getPreOrderById(id); if (!po) throw new Error('Pre-order not found');
  if (po.status !== 'active') throw new Error('Pre-order not active');
  const tx = db.transaction(() => {
    for (const it of po.items) {
      if (it.variant_id) db.prepare('UPDATE product_variants SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.variant_id);
      if (it.product_id) { db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.product_id); db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(it.product_id, it.quantity, 'Pre-order cancelled ' + po.pre_order_no); }
    }
    db.prepare("UPDATE pre_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  });
  tx();
  return getPreOrderById(id);
}

// ============ HELPERS ============
function computePaymentStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

// ============ ORDERS ============
function createOrder({ customer_name, customer_phone, items, tax_rate, discount, amount_paid, fulfillment_status, notes, pay_previous, allow_over_limit }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('Cart is empty');
  const resolved = items.map(it => {
    let unitPrice = 0, variantLabel = '', variantId = null, stockAvailable = 0, productName = '', productId = 0;
    if (it.variant_id) {
      const v = getVariantById(it.variant_id); if (!v) throw new Error('Variant not found');
      const p = getProductById(v.product_id); if (!p) throw new Error('Product not found');
      unitPrice = v.price; variantLabel = v.label; variantId = v.id; stockAvailable = v.stock; productName = p.name + ' (' + v.label + ')'; productId = p.id;
    } else {
      const p = getProductById(it.product_id); if (!p) throw new Error('Product ' + it.product_id + ' not found');
      unitPrice = p.price; stockAvailable = p.stock; productName = p.name; productId = p.id;
    }
    if (stockAvailable < it.quantity) throw new Error('Insufficient stock for ' + productName + ' (have ' + stockAvailable + ')');
    return { product_id: productId, product_name: productName, variant_id: variantId, variant_label: variantLabel, quantity: it.quantity, unit_price: unitPrice, line_total: Math.round(it.quantity * unitPrice) };
  });
  const subtotal = resolved.reduce((s, i) => s + i.line_total, 0);
  const taxAmount = Math.round(subtotal * (tax_rate || 0));
  const total = Math.max(0, subtotal + taxAmount - (discount || 0));
  const customer = findOrCreateCustomer({ name: customer_name, phone: customer_phone });
  let previousBalance = 0, creditLimit = 0;
  if (customer.id) {
    const row = db.prepare('SELECT COALESCE(SUM(balance), 0) AS b FROM invoices WHERE customer_id = ?').get(customer.id);
    previousBalance = Math.round(row.b || 0);
    const cust = db.prepare('SELECT credit_limit FROM customers WHERE id = ?').get(customer.id);
    creditLimit = (cust && cust.credit_limit) || 0;
  }
  const payPrev = Math.min(Math.max(0, Math.round(pay_previous || 0)), previousBalance);
  const remainingPaidForCurrent = Math.max(0, Math.round(amount_paid || 0) - payPrev);
  const paid = Math.min(remainingPaidForCurrent, total);
  const balance = total - paid;
  const newTotalDebt = (previousBalance - payPrev) + balance;
  if (creditLimit > 0 && newTotalDebt > creditLimit && !allow_over_limit) {
    throw new Error('Credit limit exceeded. Limit UGX ' + creditLimit.toLocaleString() + ', new debt would be UGX ' + newTotalDebt.toLocaleString() + '.');
  }
  if (payPrev > 0 && customer.id) {
    const tx = db.transaction(() => {
      let remaining = payPrev;
      const unpaid = db.prepare("SELECT id, balance FROM invoices WHERE customer_id = ? AND balance > 0 ORDER BY created_at ASC").all(customer.id);
      for (const inv of unpaid) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, inv.balance);
        const newBal = inv.balance - apply;
        const ci = db.prepare('SELECT total, amount_paid FROM invoices WHERE id = ?').get(inv.id);
        const newAmountPaid = ci.amount_paid + apply;
        const status = computePaymentStatus(ci.total, newAmountPaid);
        db.prepare('UPDATE invoices SET amount_paid = ?, balance = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newAmountPaid, newBal, status, inv.id);
        db.prepare('INSERT INTO payments (invoice_id, amount, note) VALUES (?,?,?)').run(inv.id, apply, 'Payment on credit (applied at new sale)');
        remaining -= apply;
      }
    });
    tx();
    previousBalance -= payPrev;
  }
  const paymentStatus = computePaymentStatus(total, paid);
  const fulfillment = fulfillment_status === 'taken' ? 'taken' : 'not_taken';
  const openingTotalDue = previousBalance + total;
  const last = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
  const invoiceNo = 'INV-' + String((last ? last.id + 1 : 1)).padStart(6, '0');
  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO invoices (invoice_no, customer_id, customer_name, customer_phone, subtotal, tax_rate, tax_amount, discount, total, amount_paid, balance, payment_status, fulfillment_status, notes, previous_balance, opening_total_due, paid_on_previous) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceNo, customer.id, customer.name, customer.phone, subtotal, tax_rate || 0, taxAmount, discount || 0, total, paid, balance, paymentStatus, fulfillment, notes || '', previousBalance, openingTotalDue, payPrev);
    const invId = r.lastInsertRowid;
    for (const it of resolved) {
      db.prepare(`INSERT INTO invoice_items (invoice_id, product_id, product_name, variant_id, variant_label, quantity, unit_price, line_total) VALUES (?,?,?,?,?,?,?,?)`).run(invId, it.product_id, it.product_name, it.variant_id, it.variant_label, it.quantity, it.unit_price, it.line_total);
      if (it.variant_id) db.prepare('UPDATE product_variants SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(it.quantity, it.variant_id);
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(it.quantity, it.product_id);
      db.prepare('INSERT INTO stock_movements (product_id,change,reason) VALUES (?,?,?)').run(it.product_id, -it.quantity, 'Sale ' + invoiceNo);
    }
    if (paid > 0) db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)').run(invId, paid, 'Payment at sale');
    return invId;
  });
  return getInvoiceById(tx());
}
function addPayment(invoiceId, amount, note) {
  const db = getDb();
  const inv = getInvoiceById(invoiceId); if (!inv) throw new Error('Invoice not found');
  const amt = Math.max(0, Math.round(amount)); if (amt <= 0) throw new Error('Invalid amount');
  const newPaid = inv.amount_paid + amt;
  const newBalance = Math.max(0, inv.total - newPaid);
  const status = computePaymentStatus(inv.total, newPaid);
  db.prepare('INSERT INTO payments (invoice_id,amount,note) VALUES (?,?,?)').run(invoiceId, amt, note || '');
  db.prepare('UPDATE invoices SET amount_paid=?, balance=?, payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newPaid, newBalance, status, invoiceId);
  return getInvoiceById(invoiceId);
}
function setFulfillment(invoiceId, status) {
  const db = getDb();
  const inv = getInvoiceById(invoiceId); if (!inv) throw new Error('Invoice not found');
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
    case 'unpaid': return db.prepare("SELECT * FROM invoices WHERE payment_status='unpaid' ORDER BY created_at DESC").all();
    case 'partial': return db.prepare("SELECT * FROM invoices WHERE payment_status='partial' ORDER BY created_at DESC").all();
    case 'paid': return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' ORDER BY created_at DESC").all();
    case 'not_taken': return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='not_taken' ORDER BY created_at DESC").all();
    case 'taken': return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='taken' ORDER BY created_at DESC").all();
    case 'paid_not_taken': return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' AND fulfillment_status='not_taken' ORDER BY created_at DESC").all();
    case 'taken_not_paid': return db.prepare("SELECT * FROM invoices WHERE fulfillment_status='taken' AND payment_status!='paid' ORDER BY created_at DESC").all();
    case 'cleared': return db.prepare("SELECT * FROM invoices WHERE payment_status='paid' AND fulfillment_status='taken' ORDER BY created_at DESC").all();
    default: return getAllInvoices();
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
  const onp = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS b FROM invoices WHERE payment_status='unpaid'").get();
  const pnt = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS t FROM invoices WHERE payment_status='paid' AND fulfillment_status='not_taken'").get();
  const tnp = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS b FROM invoices WHERE fulfillment_status='taken' AND payment_status!='paid'").get();
  const cc = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  const cd = db.prepare('SELECT COALESCE(SUM(balance),0) AS b FROM invoices WHERE customer_id IS NOT NULL').get().b;
  return {
    totalValue: Math.round(tv), totalCost: Math.round(tc), potentialProfit: Math.round(tv - tc),
    lowStock: ls, productCount: pc, todaySales: Math.round(ts),
    orderedNotPaid: { count: onp.c, amount: Math.round(onp.b) },
    paidNotTaken: { count: pnt.c, amount: Math.round(pnt.t) },
    takenNotPaid: { count: tnp.c, amount: Math.round(tnp.b) },
    customerCount: cc, customerDebt: Math.round(cd)
  };
}
function getBestWorstSellers() {
  const rows = getDb().prepare(`SELECT p.id, p.name, COALESCE(SUM(ii.quantity), 0) AS qty_sold, COALESCE(SUM(ii.line_total), 0) AS revenue FROM products p LEFT JOIN invoice_items ii ON ii.product_id = p.id GROUP BY p.id HAVING qty_sold > 0 ORDER BY qty_sold DESC`).all();
  if (!rows.length) return { best: null, worst: null };
  return { best: rows[0], worst: rows[rows.length - 1] };
}
function getOperationsSummary() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const monthlyExpenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE expense_date BETWEEN ? AND ?").get(monthStart, today).v;
  const monthlyRevenue = db.prepare("SELECT COALESCE(SUM(total),0) AS v FROM invoices WHERE DATE(created_at) BETWEEN ? AND ?").get(monthStart, today).v;
  const monthlyCogs = db.prepare(`SELECT COALESCE(SUM(ii.quantity * p.cost_price), 0) AS v FROM invoice_items ii JOIN products p ON p.id = ii.product_id JOIN invoices inv ON inv.id = ii.invoice_id WHERE DATE(inv.created_at) BETWEEN ? AND ?`).get(monthStart, today).v;
  const grossProfit = monthlyRevenue - monthlyCogs;
  const netProfit = grossProfit - monthlyExpenses;
  const pendingPOs = db.prepare("SELECT COUNT(*) AS c FROM purchase_orders WHERE status='pending'").get().c;
  const activePreOrders = db.prepare("SELECT COUNT(*) AS c FROM pre_orders WHERE status='active'").get().c;
  const supplierBalance = db.prepare("SELECT COALESCE(SUM(balance),0) AS b FROM suppliers").get().b;
  return { monthlyExpenses: Math.round(monthlyExpenses), monthlyRevenue: Math.round(monthlyRevenue), monthlyCogs: Math.round(monthlyCogs), grossProfit: Math.round(grossProfit), netProfit: Math.round(netProfit), pendingPOs, activePreOrders, supplierBalance: Math.round(supplierBalance) };
}

// ============ SALES REPORTS ============
function getSalesReport(fromDate, toDate) {
  const db = getDb();
  const totals = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS billed, COALESCE(SUM(amount_paid), 0) AS collected, COALESCE(SUM(balance), 0) AS outstanding, COALESCE(AVG(total), 0) AS avg_order FROM invoices WHERE DATE(created_at) BETWEEN ? AND ?`).get(fromDate, toDate);
  const cogsRow = db.prepare(`SELECT COALESCE(SUM(ii.quantity * p.cost_price), 0) AS cogs FROM invoice_items ii JOIN products p ON p.id = ii.product_id JOIN invoices inv ON inv.id = ii.invoice_id WHERE DATE(inv.created_at) BETWEEN ? AND ?`).get(fromDate, toDate);
  const daily = db.prepare(`SELECT DATE(created_at) AS day, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(amount_paid), 0) AS collected, COUNT(*) AS orders FROM invoices WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day`).all(fromDate, toDate);
  const topProducts = db.prepare(`SELECT ii.product_id, ii.product_name, SUM(ii.quantity) AS qty, SUM(ii.line_total) AS revenue FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id WHERE DATE(inv.created_at) BETWEEN ? AND ? GROUP BY ii.product_id ORDER BY revenue DESC LIMIT 15`).all(fromDate, toDate);
  const topCustomers = db.prepare(`SELECT COALESCE(c.name, i.customer_name) AS name, COUNT(*) AS orders, COALESCE(SUM(i.total), 0) AS billed, COALESCE(SUM(i.amount_paid), 0) AS paid, COALESCE(SUM(i.balance), 0) AS balance FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE DATE(i.created_at) BETWEEN ? AND ? GROUP BY COALESCE(c.id, i.customer_name) ORDER BY billed DESC LIMIT 15`).all(fromDate, toDate);
  const paymentSplit = db.prepare(`SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount FROM invoices WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY payment_status`).all(fromDate, toDate);
  return { range: { from: fromDate, to: toDate }, totals: { orders: totals.orders, billed: Math.round(totals.billed), collected: Math.round(totals.collected), outstanding: Math.round(totals.outstanding), avgOrder: Math.round(totals.avg_order), cogs: Math.round(cogsRow.cogs), profit: Math.round(totals.billed - cogsRow.cogs) }, daily, topProducts, topCustomers, paymentSplit };
}

module.exports = {
  hasAdminPassword, setAdminPassword, checkAdminPassword,
  getAllProducts, getProductById, findProductByName, findProductByBarcode, addProduct, updateProduct, deleteProduct,
  getPriceHistory, adjustStock,
  getVariantsByProduct, getVariantById, addVariant, updateVariant, deleteVariant,
  getAllCustomers, getCustomerById, findOrCreateCustomer, updateCustomer, deleteCustomer, getCustomerAging,
  getCustomerPayments, getTopDebtors, getCustomerLedger, addCustomerTransaction,
  getAllExpenseCategories, addExpenseCategory, deleteExpenseCategory,
  getAllExpenses, addExpense, updateExpense, deleteExpense, getExpenseSummary,
  getCashBookEntries, addCashBookEntry, deleteCashBookEntry, getCashBookSummary,
  getDepositorOutstanding, getDepositorHistory, getAllDepositors,
  getAllSuppliers, getSupplierById, addSupplier, updateSupplier, deleteSupplier, addSupplierPayment,
  getAllPurchaseOrders, getPurchaseOrderById, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
  getActiveStockTake, startStockTake, updateStockTakeItem, completeStockTake, getStockTakeHistory, getStockTakeById,
  getAllPreOrders, getPreOrderById, createPreOrder, addPreOrderPayment, completePreOrder, cancelPreOrder,
  createOrder, addPayment, setFulfillment, getInvoiceById, getAllInvoices, getInvoicesByFilter,
  getDashboardStats, getBestWorstSellers, getOperationsSummary,
  getSalesReport
};
