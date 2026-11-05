const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const db = require('../database/db');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const notFound = (m = 'Not found') => new HttpError(404, m);

const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const today = () => new Date().toISOString().slice(0, 10);
const str = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
const int = (v) => (v === undefined || v === null || v === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

function safeFilename(name) {
  const base = path.basename(String(name || 'file')).normalize('NFKC');
  const cleaned = base.replace(/[^\w.\- ()]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'file';
}

// Resolves a path relative to STORAGE_DIR and guarantees it stays inside it (prevents path traversal).
function storagePath(...parts) {
  const full = path.resolve(config.STORAGE_DIR, ...parts);
  const root = path.resolve(config.STORAGE_DIR) + path.sep;
  if (!(full + path.sep).startsWith(root) && full !== path.resolve(config.STORAGE_DIR)) throw new HttpError(400, 'Invalid path');
  return full;
}
// DB stores storage-relative paths with forward slashes so the storage dir can move / be restored.
const rel = (abs) => path.relative(config.STORAGE_DIR, abs).split(path.sep).join('/');
const abs = (relPath) => storagePath(...String(relPath).split('/'));

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function logActivity({ studyId = null, participantId = null, action, details = null }) {
  db.run('INSERT INTO research_activity_log(study_id,participant_id,action,details) VALUES (?,?,?,?)',
    [studyId, participantId, action, details && typeof details !== 'string' ? JSON.stringify(details) : details]);
}

function getSetting(key, fallback = '') {
  const r = db.get('SELECT value FROM application_settings WHERE key = ?', [key]);
  return r && r.value !== null ? r.value : fallback;
}
function setSetting(key, value) {
  db.run(`INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`, [key, String(value)]);
}

function dirSize(dir) {
  let total = 0, count = 0;
  if (!fs.existsSync(dir)) return { total, count };
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else { total += fs.statSync(p).size; count++; }
    }
  }
  return { total, count };
}

function paginate(req, defaultSize = 20) {
  const page = Math.max(1, int(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, int(req.query.pageSize) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { HttpError, bad, notFound, wrap, isDate, today, str, int, safeFilename, storagePath, rel, abs, sha256, sha256File, logActivity, getSetting, setSetting, dirSize, paginate };
