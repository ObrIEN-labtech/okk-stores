const path = require('path');
const Database = require('better-sqlite3');
let db = null;

function initDatabase(userDataPath) {
  db = new Database(path.join(userDataPath, 'okk-stores.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ---- Base tables (v1) ----
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
    variant_label TEXT DEFAULT '',
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

  // ---- New tables (v2.9) ----
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

  // ---- Migrations ----
  runMigrations();

  return db;
}

function columnExists(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
  } catch (e) { return false; }
}

function runMigrations() {
  // 1. customers.cash_balance
  if (!columnExists('customers', 'cash_balance')) {
    db.exec('ALTER TABLE customers ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added customers.cash_balance');
  }

  // 2. invoices.previous_balance
  if (!columnExists('invoices', 'previous_balance')) {
    db.exec('ALTER TABLE invoices ADD COLUMN previous_balance REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.previous_balance');
  }

  // 3. invoices.opening_total_due
  if (!columnExists('invoices', 'opening_total_due')) {
    db.exec('ALTER TABLE invoices ADD COLUMN opening_total_due REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.opening_total_due');
  }

  // 4. invoices.paid_on_previous (amount applied to previous_balance at checkout)
  if (!columnExists('invoices', 'paid_on_previous')) {
    db.exec('ALTER TABLE invoices ADD COLUMN paid_on_previous REAL NOT NULL DEFAULT 0');
    console.log('[migration] Added invoices.paid_on_previous');
  }

  // 5. invoice_items.variant_label
  if (!columnExists('invoice_items', 'variant_label')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN variant_label TEXT DEFAULT ''");
    console.log('[migration] Added invoice_items.variant_label');
  }

  // 6. invoice_items.variant_id
  if (!columnExists('invoice_items', 'variant_id')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN variant_id INTEGER');
    console.log('[migration] Added invoice_items.variant_id');
  }
}

function getDb() { if (!db) throw new Error('DB not initialized'); return db; }
module.exports = { initDatabase, getDb };
