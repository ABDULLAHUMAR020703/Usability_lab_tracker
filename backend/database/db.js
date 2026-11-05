// Thin database abstraction over node:sqlite. All SQL goes through this module so the engine
// can later be swapped (e.g. PostgreSQL) by providing the same small interface:
//   all(sql, params) / get(sql, params) / run(sql, params) / tx(fn) / exec(sql)
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

let handle = null;
let txDepth = 0;

function open() {
  handle = new DatabaseSync(config.DB_PATH);
  handle.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate();
  return handle;
}

function close() {
  if (handle) {
    try { handle.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }
    handle.close();
    handle = null;
  }
}

function migrate() {
  handle.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const dir = path.join(__dirname, 'migrations');
  const applied = new Set(handle.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    handle.exec('BEGIN');
    try {
      handle.exec(sql);
      handle.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(f);
      handle.exec('COMMIT');
      console.log(`[db] applied migration ${f}`);
    } catch (e) {
      handle.exec('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
}

const clean = (params) => (params || []).map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

const db = {
  open,
  close,
  get raw() { return handle; },
  all: (sql, params) => handle.prepare(sql).all(...clean(params)),
  get: (sql, params) => handle.prepare(sql).get(...clean(params)) || null,
  run: (sql, params) => {
    const r = handle.prepare(sql).run(...clean(params));
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  },
  exec: (sql) => handle.exec(sql),
  // Nested calls join the outer transaction.
  tx(fn) {
    if (txDepth > 0) return fn();
    handle.exec('BEGIN IMMEDIATE');
    txDepth++;
    try {
      const out = fn();
      handle.exec('COMMIT');
      return out;
    } catch (e) {
      handle.exec('ROLLBACK');
      throw e;
    } finally {
      txDepth--;
    }
  },
  // Consistent snapshot of the live database (safe while the app is running).
  snapshotTo(destFile) {
    if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
    handle.exec(`VACUUM INTO '${destFile.replace(/'/g, "''")}'`);
  },
  // Sequential, never-reused IDs.
  nextId(name, prefix, pad) {
    const row = db.get('SELECT next_value FROM id_sequences WHERE name = ?', [name]);
    db.run('UPDATE id_sequences SET next_value = next_value + 1 WHERE name = ?', [name]);
    return `${prefix}${String(row.next_value).padStart(pad, '0')}`;
  },
};

module.exports = db;
