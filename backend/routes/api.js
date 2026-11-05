const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../database/db');
const { wrap, bad, notFound, HttpError, storagePath, int, str, isDate, getSetting } = require('../utils/helpers');
const research = require('../services/research');
const participants = require('../services/participants');
const nda = require('../services/nda');
const attachments = require('../services/attachments');
const backup = require('../services/backup');
const analytics = require('../services/analytics');
const settings = require('../services/settings');

const router = express.Router();
const tmpDir = () => { const d = storagePath('_tmp'); fs.mkdirSync(d, { recursive: true }); return d; };
const upload = multer({ dest: tmpDir(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 20 } });
const templateUpload = multer({ dest: tmpDir(), limits: { fileSize: config.MAX_TEMPLATE_MB * 1024 * 1024, files: 1 } });
const id = (req) => { const n = int(req.params.id); if (!n) throw bad('Invalid id'); return n; };
const ok = (res, data = {}) => res.json(data);

// ---------- Meta & settings ----------
router.get('/meta', wrap((req, res) => ok(res, settings.meta())));
router.get('/storage', wrap((req, res) => ok(res, settings.storageInfo())));

router.post('/settings/categories', wrap((req, res) => ok(res, settings.addCategory(req.body))));
router.put('/settings/categories/:id', wrap((req, res) => { settings.updateCategory(id(req), req.body); ok(res); }));
router.delete('/settings/categories/:id', wrap((req, res) => { settings.deleteCategory(id(req)); ok(res); }));
router.post('/settings/categories/:id/subcategories', wrap((req, res) => ok(res, settings.addSub(id(req), req.body))));
router.put('/settings/subcategories/:id', wrap((req, res) => { settings.updateSub(id(req), req.body); ok(res); }));
router.delete('/settings/subcategories/:id', wrap((req, res) => { settings.deleteSub(id(req)); ok(res); }));
router.post('/settings/products', wrap((req, res) => ok(res, settings.addProduct(req.body))));
router.put('/settings/products/:id', wrap((req, res) => { settings.updateProduct(id(req), req.body); ok(res); }));
router.delete('/settings/products/:id', wrap((req, res) => { settings.deleteProduct(id(req)); ok(res); }));
router.get('/settings/options/:type', wrap((req, res) => ok(res, settings.listOptions(req.params.type))));
router.post('/settings/options/:type', wrap((req, res) => ok(res, settings.addOption(req.params.type, req.body))));
router.put('/settings/options/:id', wrap((req, res) => { settings.updateOption(id(req), req.body); ok(res); }));
router.delete('/settings/options/:id', wrap((req, res) => { settings.deleteOption(id(req)); ok(res); }));

// ---------- Research ----------
router.get('/research', wrap((req, res) => ok(res, research.list(req))));
router.post('/research', wrap((req, res) => res.status(201).json(research.create(req.body))));
router.post('/research/conflicts/check', wrap((req, res) => {
  const b = req.body;
  ok(res, { conflicts: research.detectConflicts({ studyId: int(b.study_id), start: b.start_date, end: b.end_date, owner: str(b.owner), team: b.team_members || [] }) });
}));
router.get('/research/:id', wrap((req, res) => ok(res, research.get(id(req)))));
router.put('/research/:id', wrap((req, res) => ok(res, research.update(id(req), req.body))));
router.patch('/research/:id/status', wrap((req, res) => ok(res, research.setStatus(id(req), req.body.status))));
router.patch('/research/:id/dates', wrap((req, res) => ok(res, research.setDates(id(req), req.body.start_date, req.body.end_date))));
router.delete('/research/:id', wrap((req, res) => { research.archive(id(req)); ok(res); }));
router.post('/research/:id/restore', wrap((req, res) => ok(res, research.restore(id(req)))));
router.get('/research/:id/conflicts', wrap((req, res) => {
  const s = research.get(id(req));
  ok(res, { conflicts: research.detectConflicts({ studyId: s.id, start: s.start_date, end: s.end_date, owner: s.owner, team: s.team_members }) });
}));
router.get('/research/:id/activity', wrap((req, res) => {
  research.get(id(req));
  ok(res, db.all('SELECT a.*, p.participant_code FROM research_activity_log a LEFT JOIN participants p ON p.id = a.participant_id WHERE a.study_id = ? ORDER BY a.id DESC LIMIT 200', [id(req)]));
}));
router.put('/research/:id/results', wrap((req, res) => ok(res, research.updateResults(id(req), req.body))));

// participants within a study
router.get('/research/:id/participants', wrap((req, res) => ok(res, participants.participationsForStudy(id(req)))));
router.post('/research/:id/participants', wrap((req, res) => res.status(201).json(participants.assign(id(req), req.body))));
router.patch('/participation/:id', wrap((req, res) => ok(res, participants.updateParticipation(id(req), req.body))));
router.delete('/participation/:id', wrap((req, res) => { participants.removeParticipation(id(req)); ok(res); }));

// NDAs within a study / participant
router.get('/research/:id/ndas', wrap((req, res) => { req.query.study_id = id(req); req.query.pageSize = 200; ok(res, nda.list(req)); }));

// ---------- Calendar ----------
router.get('/calendar/events', wrap((req, res) => {
  const rows = research.calendarEvents(req.query);
  ok(res, rows.map((s) => {
    const end = new Date(s.end_date + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
    return { id: String(s.id), title: s.title, start: s.start_date, end: end.toISOString().slice(0, 10), allDay: true, backgroundColor: s.category_color, borderColor: s.category_color,
      extendedProps: { code: s.research_code, product: s.product_name, category: s.category_name, status: s.status, owner: s.owner, screen: s.screen_topic, results_status: s.results_status, end_date: s.end_date } };
  }));
}));

// ---------- Participants ----------
router.get('/participants', wrap((req, res) => ok(res, participants.list(req))));
router.post('/participants', wrap((req, res) => res.status(201).json(participants.create(req.body, { force: req.body.force === true }))));
router.post('/participants/check-duplicates', wrap((req, res) => ok(res, { duplicates: participants.findDuplicates(req.body, int(req.body.id) || 0) })));
router.get('/participants/:id', wrap((req, res) => ok(res, participants.get(id(req)))));
router.put('/participants/:id', wrap((req, res) => ok(res, participants.update(id(req), req.body))));
router.delete('/participants/:id', wrap((req, res) => { participants.archive(id(req)); ok(res); }));
router.post('/participants/:id/restore', wrap((req, res) => ok(res, participants.restore(id(req)))));
router.get('/participants/:id/history', wrap((req, res) => { participants.get(id(req)); ok(res, participants.history(id(req))); }));

// ---------- NDA ----------
router.get('/nda/templates', wrap((req, res) => ok(res, { templates: nda.listTemplates() })));
router.post('/nda/templates', templateUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('Choose a .docx or .pdf template file');
  try { res.status(201).json(await nda.saveTemplate(req.file, req.body.notes)); } finally { if (req.file && fs.existsSync(req.file.path)) fs.rmSync(req.file.path, { force: true }); }
}));
router.get('/nda/templates/:id/download', wrap((req, res) => {
  const t = db.get('SELECT * FROM nda_templates WHERE id = ?', [id(req)]); if (!t) throw notFound();
  res.download(require('../utils/helpers').abs(t.stored_path), t.original_filename);
}));
router.get('/nda', wrap((req, res) => ok(res, nda.list(req))));
router.post('/nda/generate', wrap(async (req, res) => res.status(201).json(await nda.generate(int(req.body.participation_id)))));
router.get('/nda/:id', wrap((req, res) => ok(res, nda.viewData(id(req)))));
router.get('/nda/:id/document', wrap((req, res) => {
  const { file } = nda.draftFile(id(req));
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'inline; filename="nda.pdf"'); res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(file).pipe(res);
}));
router.post('/nda/:id/sign', wrap(async (req, res) => ok(res, await nda.sign(id(req), req.body, { ip: req.ip, userAgent: req.get('user-agent') }))));
router.get('/nda/:id/pdf', wrap((req, res) => {
  const { file, name } = nda.signedFile(id(req));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.query.inline === '1') { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${name}"`); return fs.createReadStream(file).pipe(res); }
  res.download(file, name);
}));
router.get('/nda/:id/evidence', wrap((req, res) => ok(res, nda.evidence(id(req)))));
router.delete('/nda/:id', wrap((req, res) => { nda.deletePending(id(req)); ok(res); }));

// ---------- Attachments ----------
router.get('/research/:id/attachments', wrap((req, res) => { research.get(id(req)); ok(res, attachments.list(id(req))); }));
router.post('/research/:id/attachments', upload.array('files', 20), wrap((req, res) => res.status(201).json(attachments.add(id(req), req.files || [], req.body))));
router.patch('/attachments/:id', wrap((req, res) => ok(res, attachments.updateDescription(id(req), req.body.description))));
router.get('/attachments/:id/download', wrap((req, res) => {
  const { path: p, record } = attachments.file(id(req));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const inlineOk = req.query.inline === '1' && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(record.mime_type || '');
  if (inlineOk) { res.setHeader('Content-Type', record.mime_type); res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.original_name)}"`); res.setHeader('Content-Security-Policy', "sandbox"); return fs.createReadStream(p).pipe(res); }
  res.download(p, record.original_name);
}));
router.delete('/attachments/:id', wrap((req, res) => { attachments.remove(id(req)); ok(res); }));

// ---------- Results overview ----------
router.get('/results', wrap((req, res) => {
  const where = ['s.archived_at IS NULL'], params = [];
  if (req.query.results_status) { where.push('s.results_status = ?'); params.push(req.query.results_status); }
  if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.category_id) { where.push('s.category_id = ?'); params.push(int(req.query.category_id)); }
  if (req.query.product_id) { where.push('s.product_id = ?'); params.push(int(req.query.product_id)); }
  if (req.query.q) { where.push('(s.title LIKE ? OR s.research_code LIKE ? OR s.key_insights LIKE ? OR s.results_description LIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l, l); }
  if (req.query.has_attachments === '1') where.push('EXISTS (SELECT 1 FROM research_attachments a WHERE a.study_id = s.id)');
  const rows = db.all(`SELECT s.id, s.research_code, s.title, s.status, s.owner, s.end_date, s.results_status, s.results_description, s.key_insights, s.results_updated_at, s.results_completed_at,
      c.name category_name, c.color category_color, p.name product_name, (SELECT COUNT(*) FROM research_attachments a WHERE a.study_id = s.id) attachment_count
    FROM research_studies s JOIN research_categories c ON c.id = s.category_id LEFT JOIN products p ON p.id = s.product_id WHERE ${where.join(' AND ')} ORDER BY s.end_date DESC`, params);
  ok(res, rows);
}));
router.get('/attachments', wrap((req, res) => {
  const l = `%${req.query.q || ''}%`;
  ok(res, db.all(`SELECT a.id, a.original_name, a.description, a.size_bytes, a.uploaded_at, a.study_id, s.research_code, s.title FROM research_attachments a JOIN research_studies s ON s.id = a.study_id
    WHERE a.original_name LIKE ? OR a.description LIKE ? OR s.title LIKE ? ORDER BY a.uploaded_at DESC LIMIT 100`, [l, l, l]));
}));

// ---------- Analytics ----------
router.get('/dashboard', wrap((req, res) => ok(res, analytics.dashboard())));
router.get('/analytics', wrap((req, res) => ok(res, analytics.analytics(req.query))));

// ---------- Backups ----------
router.get('/backups', wrap((req, res) => ok(res, { backups: backup.list(), settings: backup.getSettings() })));
router.post('/backups', wrap((req, res) => res.status(201).json(backup.create(req.body.archive ? 'archive' : 'manual', { note: req.body.note }))));
router.put('/backups/settings', wrap((req, res) => { backup.updateSettings(req.body); ok(res, backup.getSettings()); }));
router.post('/backups/:id/verify', wrap((req, res) => ok(res, backup.verify(id(req)))));
router.patch('/backups/:id', wrap((req, res) => ok(res, backup.setArchival(id(req), !!req.body.keep_forever))));
router.post('/backups/:id/restore', wrap((req, res) => {
  if (req.body.confirm !== 'RESTORE') throw bad('Restore must be explicitly confirmed');
  ok(res, backup.restore(id(req)));
}));
router.delete('/backups/:id', wrap((req, res) => { backup.remove(id(req)); ok(res); }));

router.use((req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));

module.exports = router;
