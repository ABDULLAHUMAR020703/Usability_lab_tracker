const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./database/db');
const { seed } = require('./database/seed');

db.open();
seed();
fs.mkdirSync(path.join(config.STORAGE_DIR, '_tmp'), { recursive: true });
// Clean orphaned multer temp files from interrupted uploads
for (const f of fs.readdirSync(path.join(config.STORAGE_DIR, '_tmp'))) fs.rmSync(path.join(config.STORAGE_DIR, '_tmp', f), { force: true });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use((req, res, next) => { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'consumer-insights-hub' }));
app.use('/api', require('./routes/api'));

if (fs.existsSync(config.FRONTEND_DIST)) {
  app.use(express.static(config.FRONTEND_DIST));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.FRONTEND_DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Frontend not built yet. Run "npm run build" (or "npm run dev" for development).'));
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File is too large (limit ${config.MAX_UPLOAD_MB} MB)` });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const msg = status >= 500 && !err.status ? 'Unexpected server error' : err.message;
  if (/constraint/i.test(String(err.message)) && !err.status) return res.status(400).json({ error: `Database constraint: ${err.message}` });
  res.status(status).json({ error: msg, ...(err.extra || {}) });
});

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`\n  Consumer Insights Hub running at http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}`);
  console.log(`  Database : ${config.DB_PATH}\n  Storage  : ${config.STORAGE_DIR}\n  Backups  : ${require('./services/backup').backupDir()}\n`);
});
require('./services/backup').startScheduler();

const shutdown = () => { server.close(); db.close(); process.exit(0); };
// Only enabled when started by the Windows launcher (ConsumerInsightsHub.exe), which asks for a clean stop from its tray menu.
if (process.env.CIH_LAUNCHER === '1') {
  app.post('/__shutdown', (req, res) => { res.json({ ok: true }); setTimeout(shutdown, 100); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
