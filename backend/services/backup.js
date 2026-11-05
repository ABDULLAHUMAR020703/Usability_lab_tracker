const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const db = require('../database/db');
const { bad, notFound, HttpError, getSetting, setSetting, logActivity, dirSize } = require('../utils/helpers');

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` };
};

function backupDir() {
  const o = getSetting('backup_dir_override', '').trim();
  return o ? path.resolve(o) : config.BACKUP_DIR;
}

function listFiles(root) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(p); } };
  if (fs.existsSync(root)) walk(root);
  return out;
}
const hashFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function create(type = 'manual', { note } = {}) {
  const base = backupDir();
  fs.mkdirSync(base, { recursive: true });
  const { date, time } = stamp();
  const name = type === 'auto' ? date : `${date}_${time}_${type}`;
  const dest = path.join(base, name);
  if (fs.existsSync(dest)) throw new HttpError(409, `Backup "${name}" already exists`);
  fs.mkdirSync(dest, { recursive: true });
  try {
    db.snapshotTo(path.join(dest, 'consumer_insights.db'));
    if (fs.existsSync(config.STORAGE_DIR)) fs.cpSync(config.STORAGE_DIR, path.join(dest, 'storage'), { recursive: true });
    const settings = db.all('SELECT key, value FROM application_settings');
    const files = listFiles(dest).map((f) => ({ path: path.relative(dest, f).split(path.sep).join('/'), size: fs.statSync(f).size, sha256: hashFile(f) }));
    const meta = {
      app: 'Consumer Insights Hub', created_at: new Date().toISOString(), type, note: note || null, schema_migrations: db.all('SELECT name FROM schema_migrations').map((r) => r.name),
      counts: { research: db.get('SELECT COUNT(*) c FROM research_studies').c, participants: db.get('SELECT COUNT(*) c FROM participants').c, signed_ndas: db.get("SELECT COUNT(*) c FROM nda_records WHERE status='Signed'").c, attachments: db.get('SELECT COUNT(*) c FROM research_attachments').c },
      settings, files,
    };
    fs.writeFileSync(path.join(dest, 'backup_metadata.json'), JSON.stringify(meta, null, 2));
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }
  const size = dirSize(dest);
  const v = verifyFolder(dest);
  db.run(`INSERT INTO backup_history(name,path,type,size_bytes,file_count,verified,verification_detail,verified_at,keep_forever) VALUES (?,?,?,?,?,?,?,datetime('now'),?)`,
    [name, dest, type, size.total, size.count, v.ok ? 1 : 0, v.detail, type === 'archive' ? 1 : 0]);
  logActivity({ action: `Backup created (${type})`, details: name });
  return db.get('SELECT * FROM backup_history WHERE name = ?', [name]);
}

// Verifies manifest hashes and runs SQLite integrity_check on the backed-up database.
function verifyFolder(dir) {
  try {
    const metaFile = path.join(dir, 'backup_metadata.json');
    if (!fs.existsSync(metaFile)) return { ok: false, detail: 'backup_metadata.json is missing' };
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    for (const f of meta.files) {
      const p = path.join(dir, ...f.path.split('/'));
      if (!fs.existsSync(p)) return { ok: false, detail: `Missing file: ${f.path}` };
      if (hashFile(p) !== f.sha256) return { ok: false, detail: `Checksum mismatch: ${f.path}` };
    }
    const dbFile = path.join(dir, 'consumer_insights.db');
    if (!fs.existsSync(dbFile)) return { ok: false, detail: 'Database file missing' };
    const probe = new DatabaseSync(dbFile, { readOnly: true });
    try {
      const r = probe.prepare('PRAGMA integrity_check').get();
      if (Object.values(r)[0] !== 'ok') return { ok: false, detail: `Database integrity check failed: ${Object.values(r)[0]}` };
    } finally { probe.close(); }
    return { ok: true, detail: `${meta.files.length} files verified, database integrity OK` };
  } catch (e) { return { ok: false, detail: `Verification error: ${e.message}` }; }
}

function verify(id) {
  const b = db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
  if (!b) throw notFound('Backup not found');
  if (!fs.existsSync(b.path)) throw new HttpError(404, 'Backup folder no longer exists');
  const v = verifyFolder(b.path);
  db.run("UPDATE backup_history SET verified=?, verification_detail=?, verified_at=datetime('now') WHERE id=?", [v.ok ? 1 : 0, v.detail, id]);
  return db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
}

function list() {
  reconcile();
  return db.all('SELECT * FROM backup_history ORDER BY created_at DESC, id DESC');
}

// Keep history rows consistent with what is on disk (also needed after restoring an older database).
function reconcile() {
  const base = backupDir();
  const onDisk = new Map();
  if (fs.existsSync(base)) {
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      const metaFile = path.join(base, e.name, 'backup_metadata.json');
      if (e.isDirectory() && fs.existsSync(metaFile)) onDisk.set(e.name, metaFile);
    }
  }
  for (const row of db.all('SELECT id, name, path FROM backup_history')) {
    if (!fs.existsSync(row.path)) db.run('DELETE FROM backup_history WHERE id = ?', [row.id]);
  }
  for (const [name, metaFile] of onDisk) {
    if (db.get('SELECT id FROM backup_history WHERE name = ?', [name])) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      const dir = path.dirname(metaFile), size = dirSize(dir);
      db.run('INSERT INTO backup_history(name,path,type,size_bytes,file_count,verified,verification_detail,keep_forever,created_at) VALUES (?,?,?,?,?,0,?,?,?)',
        [name, dir, ['auto', 'manual', 'archive', 'safety'].includes(meta.type) ? meta.type : 'manual', size.total, size.count, 'Re-indexed from disk; run verify', meta.type === 'archive' ? 1 : 0, (meta.created_at || new Date().toISOString()).replace('T', ' ').slice(0, 19)]);
    } catch (_) { /* ignore unreadable folders */ }
  }
}

function setArchival(id, keep) {
  const b = db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
  if (!b) throw notFound('Backup not found');
  db.run('UPDATE backup_history SET keep_forever = ? WHERE id = ?', [keep ? 1 : 0, id]);
  return db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
}

function remove(id) {
  const b = db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
  if (!b) throw notFound('Backup not found');
  if (b.keep_forever) throw new HttpError(409, 'This is an archival backup. Remove the "keep forever" flag first.');
  fs.rmSync(b.path, { recursive: true, force: true });
  db.run('DELETE FROM backup_history WHERE id = ?', [id]);
}

function applyRetention() {
  const days = Math.max(1, parseInt(getSetting('backup_retention_days', '30'), 10) || 30);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const old = db.all("SELECT * FROM backup_history WHERE keep_forever = 0 AND type <> 'archive' AND created_at < ?", [cutoff]);
  for (const b of old) { fs.rmSync(b.path, { recursive: true, force: true }); db.run('DELETE FROM backup_history WHERE id = ?', [b.id]); }
  return old.length;
}

// Restore: verify -> safety backup -> swap database and storage -> reopen.
function restore(id) {
  const b = db.get('SELECT * FROM backup_history WHERE id = ?', [id]);
  if (!b) throw notFound('Backup not found');
  if (!fs.existsSync(b.path)) throw new HttpError(404, 'Backup folder no longer exists');
  const v = verifyFolder(b.path);
  if (!v.ok) throw bad(`Backup failed verification and will not be restored: ${v.detail}`);
  const safety = create('safety', { note: `Automatic safety backup before restoring ${b.name}` });

  const srcDb = path.join(b.path, 'consumer_insights.db'), srcStorage = path.join(b.path, 'storage');
  const tmpDb = config.DB_PATH + '.restoring', oldStorage = config.STORAGE_DIR + '.pre_restore';
  fs.copyFileSync(srcDb, tmpDb);
  db.close();
  try {
    for (const ext of ['-wal', '-shm']) fs.rmSync(config.DB_PATH + ext, { force: true });
    fs.renameSync(tmpDb, config.DB_PATH);
    fs.rmSync(oldStorage, { recursive: true, force: true });
    if (fs.existsSync(config.STORAGE_DIR)) fs.renameSync(config.STORAGE_DIR, oldStorage);
    if (fs.existsSync(srcStorage)) fs.cpSync(srcStorage, config.STORAGE_DIR, { recursive: true });
    else fs.mkdirSync(config.STORAGE_DIR, { recursive: true });
    fs.rmSync(oldStorage, { recursive: true, force: true });
  } catch (e) {
    // Roll back to the safety backup
    try {
      fs.copyFileSync(path.join(safety.path, 'consumer_insights.db'), config.DB_PATH);
      if (fs.existsSync(oldStorage)) { fs.rmSync(config.STORAGE_DIR, { recursive: true, force: true }); fs.renameSync(oldStorage, config.STORAGE_DIR); }
    } catch (_) { /* best effort */ }
    db.open();
    throw new HttpError(500, `Restore failed and was rolled back: ${e.message}`);
  }
  db.open();
  reconcile();
  logActivity({ action: 'Database restored', details: `Restored from ${b.name}; safety backup ${safety.name}` });
  return { restored: b.name, safety_backup: safety.name };
}

// ---------- Scheduler ----------
function runScheduled() {
  try {
    const freq = getSetting('backup_frequency', 'daily');
    if (freq !== 'off') {
      const last = db.get("SELECT created_at FROM backup_history WHERE type IN ('auto') ORDER BY created_at DESC LIMIT 1");
      const needed = !last || (Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime()) >= (freq === 'weekly' ? 7 : 1) * 86400000 - 3600000;
      const todayName = stamp().date;
      if (needed && !fs.existsSync(path.join(backupDir(), todayName))) { create('auto'); console.log('[backup] automatic backup created'); }
    }
    applyRetention();
  } catch (e) { console.error('[backup] scheduled backup failed:', e.message); }
}
let timer = null;
function startScheduler() {
  reconcile();
  setTimeout(runScheduled, 3000);
  timer = setInterval(runScheduled, 60 * 60 * 1000);
  timer.unref();
}

function updateSettings(b) {
  if (b.backup_frequency !== undefined) { if (!['daily', 'weekly', 'off'].includes(b.backup_frequency)) throw bad('Invalid frequency'); setSetting('backup_frequency', b.backup_frequency); }
  if (b.backup_retention_days !== undefined) { const n = parseInt(b.backup_retention_days, 10); if (!(n >= 1 && n <= 3650)) throw bad('Retention must be 1–3650 days'); setSetting('backup_retention_days', n); }
  if (b.backup_dir_override !== undefined) {
    const v = String(b.backup_dir_override || '').trim();
    if (v) {
      try { fs.mkdirSync(v, { recursive: true }); fs.accessSync(v, fs.constants.W_OK); } catch (e) { throw bad(`Backup folder is not writable: ${e.message}`); }
      if (path.resolve(v).startsWith(path.resolve(config.STORAGE_DIR))) throw bad('Backup folder cannot be inside the storage folder');
    }
    setSetting('backup_dir_override', v);
  }
}
const getSettings = () => ({ backup_frequency: getSetting('backup_frequency', 'daily'), backup_retention_days: parseInt(getSetting('backup_retention_days', '30'), 10), backup_dir_override: getSetting('backup_dir_override', ''), backup_dir: backupDir() });

module.exports = { create, verify, list, setArchival, remove, restore, startScheduler, updateSettings, getSettings, applyRetention, backupDir };
