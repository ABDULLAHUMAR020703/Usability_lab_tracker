const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/db');
const { bad, notFound, storagePath, rel, abs, safeFilename, sha256File, logActivity } = require('../utils/helpers');

const ALLOWED_EXT = new Set(['.pptx', '.ppt', '.pdf', '.xlsx', '.xls', '.csv', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.md', '.mp4', '.mov', '.zip', '.key', '.pages', '.numbers']);
const FOLDERS = ['documents', 'findings', 'deliverables'];
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain', '.csv': 'text/csv',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.mp4': 'video/mp4' };

// Magic-byte sanity checks for common types so a renamed executable is not accepted.
function contentMatchesExt(file, ext) {
  const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  const hex = b.toString('hex');
  if (['.pptx', '.xlsx', '.docx', '.zip'].includes(ext)) return hex.startsWith('504b');
  if (ext === '.pdf') return b.slice(0, 4).toString() === '%PDF';
  if (ext === '.png') return hex.startsWith('89504e47');
  if (['.jpg', '.jpeg'].includes(ext)) return hex.startsWith('ffd8ff');
  if (ext === '.gif') return b.slice(0, 3).toString() === 'GIF';
  if (['.doc', '.ppt', '.xls'].includes(ext)) return hex.startsWith('d0cf11e0');
  return true;
}

function list(studyId) {
  return db.all('SELECT id, study_id, original_name, folder, mime_type, size_bytes, description, uploaded_at FROM research_attachments WHERE study_id = ? ORDER BY uploaded_at DESC, id DESC', [studyId]);
}

function add(studyId, files, body) {
  const study = db.get('SELECT id, research_code FROM research_studies WHERE id = ?', [studyId]);
  if (!study) { for (const f of files) fs.rmSync(f.path, { force: true }); throw notFound('Research study not found'); }
  if (!files.length) throw bad('No file received');
  const folder = FOLDERS.includes(body.folder) ? body.folder : 'deliverables';
  const saved = [], created = [];
  try {
    db.tx(() => {
      for (const f of files) {
        const ext = path.extname(f.originalname).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) throw bad(`File type "${ext || 'unknown'}" is not allowed (${f.originalname})`);
        if (!contentMatchesExt(f.path, ext)) throw bad(`"${f.originalname}" does not look like a valid ${ext} file`);
        const dir = storagePath('research', study.research_code, folder);
        fs.mkdirSync(dir, { recursive: true });
        const original = safeFilename(f.originalname);
        const stored = `${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}_${original}`;
        const dest = path.join(dir, stored);
        fs.renameSync(f.path, dest); // multer temp lives in the same storage volume
        saved.push(dest);
        const { lastId } = db.run(`INSERT INTO research_attachments(study_id,original_name,stored_name,stored_path,folder,mime_type,size_bytes,sha256,description) VALUES (?,?,?,?,?,?,?,?,?)`,
          [studyId, original, stored, rel(dest), folder, MIME[ext] || 'application/octet-stream', fs.statSync(dest).size, sha256File(dest), (body.description || '').toString().trim().slice(0, 500) || null]);
        created.push(lastId);
        logActivity({ studyId, action: 'Attachment uploaded', details: original });
      }
    });
  } catch (e) {
    for (const p of saved) fs.rmSync(p, { force: true });
    for (const f of files) fs.rmSync(f.path, { force: true });
    throw e;
  }
  return created.map((id) => db.get('SELECT id, study_id, original_name, folder, mime_type, size_bytes, description, uploaded_at FROM research_attachments WHERE id = ?', [id]));
}

function file(id) {
  const a = db.get('SELECT * FROM research_attachments WHERE id = ?', [id]);
  if (!a) throw notFound('Attachment not found');
  const p = abs(a.stored_path);
  if (!fs.existsSync(p)) throw notFound('The file is missing from storage');
  return { path: p, record: a };
}

function updateDescription(id, description) {
  const a = db.get('SELECT * FROM research_attachments WHERE id = ?', [id]);
  if (!a) throw notFound('Attachment not found');
  db.run('UPDATE research_attachments SET description = ? WHERE id = ?', [String(description || '').trim().slice(0, 500) || null, id]);
  return db.get('SELECT id, study_id, original_name, folder, mime_type, size_bytes, description, uploaded_at FROM research_attachments WHERE id = ?', [id]);
}

function remove(id) {
  const a = db.get('SELECT * FROM research_attachments WHERE id = ?', [id]);
  if (!a) throw notFound('Attachment not found');
  db.tx(() => {
    db.run('DELETE FROM research_attachments WHERE id = ?', [id]);
    logActivity({ studyId: a.study_id, action: 'Attachment removed', details: a.original_name });
  });
  // Move to a trash folder instead of hard-deleting, so accidental removals are recoverable from disk.
  const p = abs(a.stored_path);
  if (fs.existsSync(p)) {
    const trash = storagePath('research', '_removed');
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(p, path.join(trash, `${a.study_id}_${a.stored_name}`));
  }
}

module.exports = { list, add, file, updateDescription, remove, ALLOWED_EXT };
