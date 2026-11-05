// Central configuration. All runtime data lives OUTSIDE the source folders and is configurable via .env / env vars.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader (no dependency)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const resolveDir = (v, fallback) => path.resolve(ROOT, v || fallback);

const DATA_DIR = resolveDir(process.env.DATA_DIR, 'data');
const config = {
  ROOT,
  PORT: parseInt(process.env.PORT || '4000', 10),
  HOST: process.env.HOST || '127.0.0.1',
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'consumer_insights.db'),
  STORAGE_DIR: resolveDir(process.env.STORAGE_DIR, 'storage'),
  BACKUP_DIR: resolveDir(process.env.BACKUP_DIR, 'backups'),
  FRONTEND_DIST: path.join(ROOT, 'frontend', 'dist'),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '100', 10),
  MAX_TEMPLATE_MB: 15,
};

for (const d of [config.DATA_DIR, config.STORAGE_DIR, config.BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

module.exports = config;
