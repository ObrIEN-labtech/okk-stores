const path = require('path');
const Database = require('better-sqlite3');
let db = null;

function initDatabase(userDataPath) {
  db = new Database(path.join(userDataPath, 'okk-stores.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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

  // ---- MIGRATIONS ----
  runMigrations();

  return db;
}

function runMigrations() {
  // Add customer_id column to invoices if it's missing (from older versions)
  try {
    const cols = db.prepare("PRAGMA table_info(invoices)").all();
    const hasCustomerId = cols.some(c => c.name === 'customer_id');
    if (!hasCustomerId) {
      db.exec("ALTER TABLE invoices ADD COLUMN customer_id INTEGER");
      console.log('[migration] Added customer_id column to invoices');
    }
  } catch (e) {
    console.error('[migration] Failed to check invoices schema:', e.message);
  }

  // Ensure settings table exists (older versions may not have it)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  } catch (e) {
    console.error('[migration] Failed to ensure settings table:', e.message);
  }
}

function getDb() { if (!db) throw new Error('DB not initialized'); return db; }
module.exports = { initDatabase, getDb };
