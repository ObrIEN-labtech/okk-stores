const path = require('path');
const Database = require('better-sqlite3');
let db = null;

function initDatabase(userDataPath) {
  db = new Database(path.join(userDataPath, 'okk-stores.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ============ CORE TABLES ============
  db.exec(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT DEFAULT 'General',
    cost_price REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER DEFAULT 10,
    location TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.exec(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
    old_price REAL NOT NULL, new_price REAL NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.exec(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_name TEXT DEFAULT 'Walk-in Customer',
    customer_phone TEXT DEFAULT '',
    subtotal REAL NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    fulfillment_status TEXT NOT NULL DEFAULT 'not_taken',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id))`);

  db.exec(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
    amount REAL NOT NULL, note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
    change INTEGER NOT NULL, reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  // ============ v2.9 TABLES ============
  db.exec(`CREATE TABLE IF NOT EXISTS customer_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE)`);

  // ============ v3.0 TABLES ============

  db.exec(`CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.exec(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    category_name TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    paid_by TEXT DEFAULT 'Cash',
    expense_date DATE NOT NULL DEFAULT (DATE('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES expense_categories(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    balance REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_no TEXT UNIQUE NOT NULL,
    supplier_id INTEGER,
    supplier_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    subtotal REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    expected_date DATE,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    received_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    product_id INTEGER,
    variant_id INTEGER,
    product_name TEXT NOT NULL,
    variant_label TEXT DEFAULT '',
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    line_total REAL NOT NULL,
    FOREIGN KEY(po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    po_id INTEGER,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS stock_takes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    notes TEXT DEFAULT '',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME)`);

  db.exec(`CREATE TABLE IF NOT EXISTS stock_take_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_take_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    product_name TEXT NOT NULL,
    variant_label TEXT DEFAULT '',
    expected_qty INTEGER NOT NULL DEFAULT 0,
    actual_qty INTEGER NOT NULL DEFAULT 0,
    difference INTEGER NOT NULL DEFAULT 0,
    reason TEXT DEFAULT '',
    note TEXT DEFAULT '',
    FOREIGN KEY(stock_take_id) REFERENCES stock_takes(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE)`);

  db.exec(`CREATE TABLE IF NOT EXISTS pre_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pre_order_no TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    deposit REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT '',
    expected_pickup DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS pre_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pre_order_id INTEGER NOT NULL,
    product_id INTEGER,
    variant_id INTEGER,
    product_name TEXT NOT NULL,
    variant_label TEXT DEFAULT '',
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    FOREIGN KEY(pre_order_id) REFERENCES pre_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS pre_order_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pre_order_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pre_order_id) REFERENCES pre_orders(id) ON DELETE CASCADE)`);

    // 12. Cash Deposits (depositor-based ledger with reconciliation)
  db.exec(`CREATE TABLE IF NOT EXISTS cash_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    depositor_name TEXT NOT NULL,
    depositor_phone TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'in',
    mode TEXT NOT NULL DEFAULT 'full',
    amount_received REAL NOT NULL DEFAULT 0,
    amount_expected REAL NOT NULL DEFAULT 0,
    outstanding REAL NOT NULL DEFAULT 0,
    applied_to_previous REAL NOT NULL DEFAULT 0,
    previous_outstanding REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    entry_date DATE NOT NULL DEFAULT (DATE('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_deposits_name ON cash_deposits(depositor_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON cash_deposits(entry_date)`);

  // ============ MIGRATIONS ============
  runMigrations();

  // ============ SEED DATA ============
  seedDefaultCategories();

  return db;
}

function columnExists(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
  } catch (e) { return false; }
}

function runMigrations() {
  if (!columnExists('customers', 'cash_balance')) {
    db.exec('ALTER TABLE customers ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added customers.cash_balance');
  }
  if (!columnExists('customers', 'credit_limit')) {
    db.exec('ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added customers.credit_limit');
  }
  if (!columnExists('invoices', 'previous_balance')) {
    db.exec('ALTER TABLE invoices ADD COLUMN previous_balance REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.previous_balance');
  }
  if (!columnExists('invoices', 'opening_total_due')) {
    db.exec('ALTER TABLE invoices ADD COLUMN opening_total_due REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.opening_total_due');
  }
  if (!columnExists('invoices', 'paid_on_previous')) {
    db.exec('ALTER TABLE invoices ADD COLUMN paid_on_previous REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.paid_on_previous');
  }
  if (!columnExists('invoice_items', 'variant_label')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN variant_label TEXT DEFAULT ''");
    console.log('[migration] Added invoice_items.variant_label');
  }
  if (!columnExists('invoice_items', 'variant_id')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN variant_id INTEGER');
    console.log('[migration] Added invoice_items.variant_id');
  }
  if (!columnExists('products', 'barcode')) {
    db.exec("ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT ''");
    console.log('[migration] Added products.barcode');
  }
  if (!columnExists('product_variants', 'barcode')) {
    db.exec("ALTER TABLE product_variants ADD COLUMN barcode TEXT DEFAULT ''");
    console.log('[migration] Added product_variants.barcode');
  }
}

function seedDefaultCategories() {
  const defaults = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Supplies', 'Repairs', 'Marketing', 'Other'];
  const insert = db.prepare('INSERT OR IGNORE INTO expense_categories (name, is_default) VALUES (?, 1)');
  const tx = db.transaction(() => {
    defaults.forEach(name => insert.run(name));
  });
  tx();
}

function getDb() { if (!db) throw new Error('DB not initialized'); return db; }
module.exports = { initDatabase, getDb };
