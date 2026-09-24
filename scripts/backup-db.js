// scripts/backup-db.js
// Copies the OKK Stores database to a backup folder, keeps the last 30 days.
const fs = require('fs');
const path = require('path');
const os = require('os');

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const DB_SRC  = path.join(APPDATA, 'okk-stores', 'okk-stores.db');
const BACKUP_DIR = path.join(os.homedir(), 'Documents', 'OKK-Backups');

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function stamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function pruneOldBackups(maxAgeDays) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  fs.readdirSync(BACKUP_DIR).forEach(f => {
    const p = path.join(BACKUP_DIR, f);
    const st = fs.statSync(p);
    if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(p);
  });
}

function run() {
  if (!fs.existsSync(DB_SRC)) {
    console.error(`[backup] Source DB not found: ${DB_SRC}`);
    process.exit(1);
  }
  ensureDir(BACKUP_DIR);

  // Copy the DB plus its WAL/SHM siblings for consistency
  const base = path.basename(DB_SRC);
  ['', '-wal', '-shm'].forEach(suffix => {
    const src = DB_SRC + suffix;
    if (fs.existsSync(src)) {
      const dest = path.join(BACKUP_DIR, `${stamp()}_${base}${suffix}`);
      fs.copyFileSync(src, dest);
    }
  });

  pruneOldBackups(30);
  console.log(`[backup] OK → ${BACKUP_DIR}`);
}

run();
