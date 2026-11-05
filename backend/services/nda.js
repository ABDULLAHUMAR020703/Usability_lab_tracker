const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');
const { PDFDocument: LibPdf, StandardFonts, rgb } = require('pdf-lib');
const db = require('../database/db');
const { docxToPdf } = require('./docConverter');
const { bad, notFound, HttpError, storagePath, rel, abs, sha256, sha256File, safeFilename, logActivity, paginate, int } = require('../utils/helpers');

const CONSENT_TEXT = 'I confirm that I have read the entire document above, that I understand it, and that I intend to sign it electronically.';
const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

// ---------- Templates ----------
function listTemplates() {
  return db.all(`SELECT t.*, (SELECT COUNT(*) FROM nda_records n WHERE n.template_id = t.id) AS usage_count FROM nda_templates t ORDER BY version DESC`);
}
const activeTemplate = () => db.get('SELECT * FROM nda_templates WHERE is_active = 1');

function saveTemplate(file, notes) {
  const buf = fs.readFileSync(file.path);
  fs.unlinkSync(file.path);
  const isPdf = buf.slice(0, 5).toString() === '%PDF-';
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  const ext = path.extname(file.originalname).toLowerCase();
  let type;
  if (isPdf && ext === '.pdf') type = 'pdf';
  else if (isZip && ext === '.docx') type = 'docx';
  else throw bad('NDA template must be a .docx or .pdf file');
  return new Promise((resolve, reject) => {
    (async () => {
      if (type === 'docx') {
        const zip = await JSZip.loadAsync(buf).catch(() => null);
        if (!zip || !zip.file('word/document.xml')) throw bad('This file is not a valid Word (.docx) document');
      } else await LibPdf.load(buf).catch(() => { throw bad('This file is not a valid PDF'); });
      const placeholders = type === 'docx' ? await scanPlaceholders(buf) : [];
      const result = db.tx(() => {
        const version = (db.get('SELECT COALESCE(MAX(version),0) v FROM nda_templates').v) + 1;
        const dir = storagePath('ndas', 'templates');
        fs.mkdirSync(dir, { recursive: true });
        const stored = path.join(dir, `NDA_Template_v${version}.${type}`);
        if (fs.existsSync(stored)) throw new HttpError(409, 'Template file already exists');
        fs.writeFileSync(stored, buf, { flag: 'wx' });
        db.run('UPDATE nda_templates SET is_active = 0 WHERE is_active = 1');
        const { lastId } = db.run('INSERT INTO nda_templates(version,original_filename,stored_path,file_type,sha256,size_bytes,is_active,notes) VALUES (?,?,?,?,?,?,1,?)',
          [version, safeFilename(file.originalname), rel(stored), type, sha256(buf), buf.length, notes || null]);
        logActivity({ action: 'NDA template uploaded', details: `v${version} ${file.originalname}` });
        return { ...db.get('SELECT * FROM nda_templates WHERE id = ?', [lastId]), placeholders };
      });
      resolve(result);
    })().catch(reject);
  });
}

async function scanPlaceholders(buf) {
  const zip = await JSZip.loadAsync(buf);
  const found = new Set();
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    const xml = await zip.file(name).async('string');
    for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
      const text = (p.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
      for (const m of text.matchAll(PLACEHOLDER)) found.add(m[1].toLowerCase());
    }
  }
  return [...found];
}

// ---------- Population ----------
function valuesFor(participation) {
  const p = db.get('SELECT * FROM participants WHERE id = ?', [participation.participant_id]);
  const s = db.get(`SELECT s.*, pr.name AS product_name, c.name AS category_name FROM research_studies s LEFT JOIN products pr ON pr.id = s.product_id JOIN research_categories c ON c.id = s.category_id WHERE s.id = ?`, [participation.study_id]);
  return {
    participant_name: p.full_name, participant_id: p.participant_code, phone: p.phone, email: p.email || '', age: p.age ?? '', city: p.city || '', occupation: p.occupation || '',
    research_title: s.title, research_id: s.research_code, product: s.product_name || '', screen_topic: s.screen_topic || '', category: s.category_name,
    start_date: fmtDate(s.start_date), end_date: fmtDate(s.end_date), research_owner: s.owner,
    date: fmtDate(new Date().toISOString().slice(0, 10)), signing_date: fmtDate(new Date().toISOString().slice(0, 10)),
    _participant: p, _study: s,
  };
}

async function fillDocx(buf, values) {
  const zip = await JSZip.loadAsync(buf);
  const unresolved = new Set();
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    const xml = await zip.file(name).async('string');
    const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
      const tags = p.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [];
      const joined = tags.map((t) => t.replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, '')).join('');
      if (!PLACEHOLDER.test(joined)) { PLACEHOLDER.lastIndex = 0; return p; }
      PLACEHOLDER.lastIndex = 0;
      // Word often splits "{{name}}" across several runs: merge the paragraph text into its first run
      const replaced = joined.replace(PLACEHOLDER, (m, k) => {
        const key = k.toLowerCase();
        if (key in values && !key.startsWith('_')) return esc(values[key]);
        unresolved.add(key); return m;
      });
      let i = 0;
      return p.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => (i++ === 0 ? `<w:t xml:space="preserve">${replaced}</w:t>` : '<w:t></w:t>'));
    });
    zip.file(name, out);
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), unresolved: [...unresolved] };
}

function textToPdfBuffer(text, heading) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    if (heading) doc.font('Helvetica-Bold').fontSize(14).text(heading, { align: 'left' }).moveDown();
    doc.font('Helvetica').fontSize(10.5);
    for (const para of text.split(/\n{1,}/)) doc.text(para.trim() || ' ', { align: 'justify' }).moveDown(0.5);
    doc.end();
  });
}

// A double-click must not create two NDA records: concurrent requests for the same participation share one run.
const inflight = new Map();
function generate(participationId) {
  if (inflight.has(participationId)) return inflight.get(participationId);
  const p = generateOnce(participationId).finally(() => inflight.delete(participationId));
  inflight.set(participationId, p);
  return p;
}

async function generateOnce(participationId) {
  const part = db.get('SELECT * FROM study_participation WHERE id = ?', [participationId]);
  if (!part) throw notFound('Participation record not found');
  const tpl = activeTemplate();
  if (!tpl) throw bad('No NDA template has been uploaded yet. Upload the company-approved NDA template in Settings → NDA Template.');
  const tplFile = abs(tpl.stored_path);
  if (!fs.existsSync(tplFile)) throw new HttpError(500, 'The active NDA template file is missing from storage');
  const values = valuesFor(part);
  const draftDir = storagePath('ndas', 'drafts');
  fs.mkdirSync(draftDir, { recursive: true });

  let pending = db.get("SELECT * FROM nda_records WHERE participation_id = ? AND status = 'Pending' ORDER BY id DESC LIMIT 1", [participationId]);
  const ndaCode = pending ? pending.nda_code : null;
  const code = ndaCode || db.tx(() => db.nextId('nda', 'NDA-', 4));
  values.nda_id = code;

  let pdfBuf, html = null, engine = 'original-pdf', unresolved = [];
  if (tpl.file_type === 'pdf') {
    pdfBuf = fs.readFileSync(tplFile);
  } else {
    const filled = await fillDocx(fs.readFileSync(tplFile), values);
    unresolved = filled.unresolved;
    const docxOut = path.join(draftDir, `${code}.docx`), pdfOut = path.join(draftDir, `${code}_conv.pdf`);
    fs.writeFileSync(docxOut, filled.buffer);
    html = (await mammoth.convertToHtml({ buffer: filled.buffer })).value;
    const conv = await docxToPdf(docxOut, pdfOut);
    if (conv.ok) { pdfBuf = fs.readFileSync(pdfOut); engine = conv.engine; fs.unlinkSync(pdfOut); }
    else {
      const text = (await mammoth.extractRawText({ buffer: filled.buffer })).value;
      pdfBuf = await textToPdfBuffer(text);
      engine = 'text-fallback';
    }
    fs.unlinkSync(docxOut);
  }
  const draftPdf = path.join(draftDir, `${code}.pdf`);
  fs.writeFileSync(draftPdf, pdfBuf);
  const docHash = sha256(pdfBuf);

  db.tx(() => {
    if (pending) {
      db.run('UPDATE nda_records SET template_id=?, template_version=?, draft_pdf_path=?, draft_html=?, document_sha256=? WHERE id=?', [tpl.id, tpl.version, rel(draftPdf), html, docHash, pending.id]);
    } else {
      db.run(`INSERT INTO nda_records(nda_code,participation_id,participant_id,study_id,template_id,template_version,draft_pdf_path,draft_html,document_sha256) VALUES (?,?,?,?,?,?,?,?,?)`,
        [code, participationId, part.participant_id, part.study_id, tpl.id, tpl.version, rel(draftPdf), html, docHash]);
      logActivity({ studyId: part.study_id, participantId: part.participant_id, action: 'NDA generated', details: `${code} (template v${tpl.version})` });
    }
  });
  const rec = getByCode(code);
  return { ...rec, engine, unresolved_placeholders: unresolved };
}

// ---------- Records ----------
const SELECT = `SELECT n.id, n.nda_code, n.participation_id, n.participant_id, n.study_id, n.template_id, n.template_version, n.status, n.document_sha256,
  n.signing_method, n.signed_name, n.signed_at, n.pdf_path IS NOT NULL AS has_pdf, n.created_at,
  p.participant_code, p.full_name AS participant_name, s.research_code, s.title AS research_title, sp.attendance_status
  FROM nda_records n JOIN participants p ON p.id = n.participant_id JOIN research_studies s ON s.id = n.study_id JOIN study_participation sp ON sp.id = n.participation_id`;

const getByCode = (code) => db.get(`${SELECT} WHERE n.nda_code = ?`, [code]);
function get(id) {
  const n = db.get(`${SELECT} WHERE n.id = ?`, [id]);
  if (!n) throw notFound('NDA record not found');
  return n;
}

function list(req) {
  const { page, pageSize, offset } = paginate(req);
  const where = [], params = [];
  if (req.query.status) { where.push('n.status = ?'); params.push(req.query.status); }
  if (req.query.study_id) { where.push('n.study_id = ?'); params.push(int(req.query.study_id)); }
  if (req.query.participant_id) { where.push('n.participant_id = ?'); params.push(int(req.query.participant_id)); }
  if (req.query.q) { where.push('(p.full_name LIKE ? OR p.participant_code LIKE ? OR s.title LIKE ? OR s.research_code LIKE ? OR n.nda_code LIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l, l, l); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get(`SELECT COUNT(*) c FROM nda_records n JOIN participants p ON p.id=n.participant_id JOIN research_studies s ON s.id=n.study_id ${w}`, params).c;
  const rows = db.all(`${SELECT} ${w} ORDER BY n.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  const counts = db.get("SELECT SUM(status='Signed') signed, SUM(status='Pending') pending FROM nda_records");
  return { rows, total, page, pageSize, counts: { signed: counts.signed || 0, pending: counts.pending || 0 } };
}

function draftFile(id) {
  const n = db.get('SELECT * FROM nda_records WHERE id = ?', [id]);
  if (!n) throw notFound('NDA record not found');
  const file = n.status === 'Signed' ? n.pdf_path : n.draft_pdf_path;
  if (!file) throw notFound('Document not available');
  return { file: abs(file), record: n };
}

function signedFile(id) {
  const n = db.get('SELECT * FROM nda_records WHERE id = ?', [id]);
  if (!n || n.status !== 'Signed') throw notFound('Signed document not found');
  return { file: abs(n.pdf_path), name: `${n.nda_code}_${db.get('SELECT research_code FROM research_studies WHERE id=?', [n.study_id]).research_code}_signed.pdf`, record: n };
}

function viewData(id) {
  const n = db.get('SELECT * FROM nda_records WHERE id = ?', [id]);
  if (!n) throw notFound('NDA record not found');
  return { ...get(id), draft_html: n.draft_html, consent_text: CONSENT_TEXT, participant: db.get('SELECT participant_code, full_name, phone FROM participants WHERE id = ?', [n.participant_id]) };
}

// ---------- Signing ----------
async function sign(id, b, meta) {
  const n = db.get('SELECT * FROM nda_records WHERE id = ?', [id]);
  if (!n) throw notFound('NDA record not found');
  if (n.status === 'Signed') throw new HttpError(409, 'This NDA is already signed. Generate a new NDA if another signature is required.');
  if (!['drawn', 'typed'].includes(b.method)) throw bad('Choose a signing method (draw or type)');
  if (b.read_confirmed !== true || b.consent !== true) throw bad('The participant must confirm they have read the document and intend to sign');
  const participant = db.get('SELECT * FROM participants WHERE id = ?', [n.participant_id]);
  const study = db.get('SELECT * FROM research_studies WHERE id = ?', [n.study_id]);
  let sigPng = null, typed = null;
  if (b.method === 'drawn') {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signature_data || '');
    if (!m) throw bad('A drawn signature is required');
    sigPng = Buffer.from(m[1], 'base64');
    if (sigPng.length < 600 || sigPng.length > 2_000_000 || sigPng.slice(1, 4).toString() !== 'PNG') throw bad('The drawn signature is empty or invalid');
  } else {
    typed = String(b.typed_name || '').trim().replace(/\s+/g, ' ');
    if (typed.length < 3) throw bad('Type your full legal name to sign');
  }
  const draftPath = n.draft_pdf_path && abs(n.draft_pdf_path);
  if (!draftPath || !fs.existsSync(draftPath)) throw new HttpError(500, 'Draft NDA document is missing; regenerate the NDA');

  const signedAt = new Date();
  const signedIso = signedAt.toISOString();
  const pdf = await LibPdf.load(fs.readFileSync(draftPath));
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const safe = (t) => String(t ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');
  let y = 790;
  const line = (label, value) => { page.drawText(safe(label), { x: 50, y, size: 9.5, font: bold, color: rgb(0.25, 0.25, 0.3) }); page.drawText(safe(value), { x: 190, y, size: 10, font }); y -= 19; };
  page.drawText('Signature Page', { x: 50, y, size: 18, font: bold }); y -= 30;
  line('NDA ID', n.nda_code); line('Participant', `${participant.full_name} (${participant.participant_code})`); line('Phone', participant.phone);
  line('Research', `${study.title} (${study.research_code})`); line('Template version', `v${n.template_version}`);
  line('Signing method', b.method === 'drawn' ? 'Drawn signature' : 'Typed name (electronic)'); line('Signed at (UTC)', signedIso);
  line('Document SHA-256', (n.document_sha256 || '').slice(0, 32) + '…');
  y -= 14;
  page.drawText('Signature', { x: 50, y, size: 11, font: bold }); y -= 8;
  page.drawRectangle({ x: 50, y: y - 110, width: 330, height: 110, borderColor: rgb(0.7, 0.7, 0.75), borderWidth: 1 });
  if (sigPng) {
    const img = await pdf.embedPng(sigPng);
    const scale = Math.min(310 / img.width, 95 / img.height);
    page.drawImage(img, { x: 60, y: y - 105 + (95 - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
  } else {
    page.drawText(safe(typed), { x: 62, y: y - 62, size: 28, font: italic, maxWidth: 310 });
  }
  y -= 135;
  const wrap = (txt, size = 9, width = 495) => {
    const words = txt.split(' '); let cur = '';
    for (const w of words) { if (font.widthOfTextAtSize(cur + ' ' + w, size) > width) { page.drawText(safe(cur), { x: 50, y, size, font, color: rgb(0.3, 0.3, 0.35) }); y -= 13; cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) { page.drawText(safe(cur), { x: 50, y, size, font, color: rgb(0.3, 0.3, 0.35) }); y -= 13; }
  };
  wrap(`Participant statement: "${CONSENT_TEXT}"`);
  y -= 6;
  wrap('This page records that the signature above was captured electronically on the Consumer Insights Hub laptop. The identifiers and timestamp on this page are preserved as signing evidence. Whether this electronic signature satisfies legal requirements is determined by the company\'s approved electronic signing process, not by this software.');
  pdf.setTitle(`${n.nda_code} - Signed NDA`); pdf.setSubject(`${participant.participant_code} / ${study.research_code}`);
  const out = Buffer.from(await pdf.save());
  const outHash = sha256(out);

  const signedDir = storagePath('ndas', 'signed', participant.participant_code);
  const pdfFile = path.join(signedDir, `${n.nda_code}_${study.research_code}.pdf`);
  const sigDir = storagePath('participants', participant.participant_code, 'signatures');
  const sigFile = sigPng ? path.join(sigDir, `${n.nda_code}.png`) : null;
  if (fs.existsSync(pdfFile) || (sigFile && fs.existsSync(sigFile))) throw new HttpError(409, 'A signed document with this name already exists; refusing to overwrite');
  fs.mkdirSync(signedDir, { recursive: true });
  fs.writeFileSync(pdfFile, out, { flag: 'wx' });
  if (sigFile) { fs.mkdirSync(sigDir, { recursive: true }); fs.writeFileSync(sigFile, sigPng, { flag: 'wx' }); }

  const evidence = JSON.stringify({
    ip: meta.ip, user_agent: meta.userAgent, client_timezone: b.timezone || null, signed_at_utc: signedIso, signing_method: b.method,
    typed_name: typed, read_confirmed: true, consent_text: CONSENT_TEXT, template_version: n.template_version, draft_document_sha256: n.document_sha256, signed_pdf_sha256: outHash,
  });
  try {
    db.tx(() => {
      db.run(`UPDATE nda_records SET status='Signed', signing_method=?, signed_name=?, signature_image_path=?, signed_at=?, pdf_path=?, pdf_sha256=?, evidence=? WHERE id=? AND status='Pending'`,
        [b.method, typed || participant.full_name, sigFile && rel(sigFile), signedIso, rel(pdfFile), outHash, evidence, id]);
      logActivity({ studyId: n.study_id, participantId: n.participant_id, action: 'NDA signed', details: `${n.nda_code} signed (${b.method})` });
    });
  } catch (e) {
    fs.rmSync(pdfFile, { force: true }); if (sigFile) fs.rmSync(sigFile, { force: true });
    throw e;
  }
  return get(id);
}

function deletePending(id) {
  const n = db.get('SELECT * FROM nda_records WHERE id = ?', [id]);
  if (!n) throw notFound('NDA record not found');
  if (n.status === 'Signed') throw new HttpError(409, 'Signed NDAs cannot be deleted');
  db.tx(() => { db.run("DELETE FROM nda_records WHERE id = ? AND status = 'Pending'", [id]); logActivity({ studyId: n.study_id, participantId: n.participant_id, action: 'Pending NDA discarded', details: n.nda_code }); });
  if (n.draft_pdf_path) fs.rmSync(abs(n.draft_pdf_path), { force: true });
}

function evidence(id) {
  const n = db.get('SELECT evidence FROM nda_records WHERE id = ? AND status = ?', [id, 'Signed']);
  if (!n) throw notFound('Signed NDA not found');
  return JSON.parse(n.evidence || '{}');
}

module.exports = { listTemplates, activeTemplate, saveTemplate, generate, list, get, viewData, draftFile, signedFile, sign, deletePending, evidence, scanPlaceholders };
