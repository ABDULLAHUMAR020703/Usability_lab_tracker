// End-to-end smoke test against a THROWAWAY data directory (never touches your real data).
// Run with: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const JSZip = require('../backend/node_modules/jszip');
const { PDFDocument } = require('../backend/node_modules/pdf-lib');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cih-test-'));
const env = { ...process.env, PORT: '4017', DATA_DIR: path.join(root, 'data'), STORAGE_DIR: path.join(root, 'storage'), BACKUP_DIR: path.join(root, 'backups') };
const base = 'http://127.0.0.1:4017/api';
let server;
let passed = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'backend', 'server.js')], { env });
    let out = '';
    server.stdout.on('data', (d) => { out += d; if (out.includes('running at')) resolve(); });
    server.stderr.on('data', (d) => process.stderr.write(d));
    server.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
}
const stopServer = () => new Promise((r) => { server.removeAllListeners('exit'); server.on('exit', r); server.kill(); });

async function api(method, url, body, expect = 200) {
  const res = await fetch(base + url, { method, headers: body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : undefined, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (res.status !== expect) throw new Error(`${method} ${url} -> ${res.status} (expected ${expect}): ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const check = (name, cond, extra = '') => { if (!cond) throw new Error(`FAILED: ${name} ${extra}`); passed++; console.log('  ✓', name); };

function noisyPng(w = 160, h = 60) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; const v = (x * 7 + y * 13) % 255; raw[o] = v; raw[o + 1] = 40; raw[o + 2] = 90; raw[o + 3] = 255; }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function makeDocx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const p = (...runs) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join('')}</w:p>`;
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('TEST TEMPLATE (not a legal document)')}${p('Participant: {{par', 'ticipant_name}} (', '{{participant_id}})')}${p('Study: {{research_title}} / {{research_id}} on {{start_date}}')}${p('Unknown: {{not_a_field}}')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

(async () => {
  console.log('Using throwaway data dir', root);
  await startServer();
  const meta = await api('GET', '/meta');
  check('seeded categories and products', meta.categories.length === 4 && meta.products.length >= 8);
  const dash0 = await api('GET', '/dashboard');
  check('dashboard starts empty (no mock data)', dash0.stats.total === 0 && dash0.stats.participants === 0);

  // Research + validation
  const cat = meta.categories[0], sub = cat.subcategories[0], prod = meta.products[0];
  await api('POST', '/research', { title: 'x', owner: 'A', category_id: cat.id, start_date: '2026-11-13', end_date: '2026-11-10' }, 400);
  check('end date before start date rejected', true);
  const r1 = await api('POST', '/research', { title: 'Home Screen Eye Tracking', owner: 'Ayesha', category_id: cat.id, subcategory_id: sub.id, product_id: prod.id, screen_topic: 'Home Screen', start_date: '2026-11-10', end_date: '2026-11-13',
    requirements: [{ label: 'Segment 1', required_count: 10, age_min: 18, age_max: 25, customer_type: 'JazzCash User' }, { label: 'Segment 2', required_count: 5, customer_type: 'Easypaisa User' }] }, 201);
  check('research created with CI-0001 and total sample 15', r1.research_code === 'CI-0001' && r1.required_total === 15);
  const r2 = await api('POST', '/research', { title: 'Receipt Usability', owner: 'ayesha', category_id: meta.categories[2].id, start_date: '2026-11-12', end_date: '2026-11-14' }, 201);
  const c = await api('GET', `/research/${r2.id}/conflicts`);
  check('overlap + same owner flagged but saving allowed', c.conflicts.length === 1 && c.conflicts[0].kinds.includes('owner'));
  const r3 = await api('POST', '/research', { title: 'Far away', owner: 'Bilal', category_id: cat.id, start_date: '2026-12-20', end_date: '2026-12-21' }, 201);
  const c3 = await api('GET', `/research/${r3.id}/conflicts`);
  check('no false conflict for non-overlapping dates', c3.conflicts.length === 0);
  await api('PATCH', `/research/${r1.id}/dates`, { start_date: '2026-11-01', end_date: '2026-11-02' });
  const ev = await api('GET', '/calendar/events?from=2026-11-01&to=2026-11-30');
  check('calendar reflects date change', ev.find((e) => e.id === String(r1.id)).start === '2026-11-01');
  await api('PATCH', `/research/${r1.id}/dates`, { start_date: '2026-11-10', end_date: '2026-11-13' });
  for (const s of ['Review Screen', 'Approved', 'Scheduled', 'Completed']) await api('PATCH', `/research/${r1.id}/status`, { status: s });
  check('lifecycle reaches Completed', (await api('GET', `/research/${r1.id}`)).status === 'Completed');
  await api('PATCH', `/research/${r1.id}/status`, { status: 'Bogus' }, 400);

  // Participants
  const pdata = { full_name: 'Sana Malik', phone: '0300-1234567', age: 22, city: 'Lahore', demographics: { customer_type: 'JazzCash User', digital_behaviour: 'Digitally Native' } };
  const p1 = await api('POST', '/participants', pdata, 201);
  check('participant P-0001 with age group', p1.participant_code === 'P-0001' && p1.age_group === '18-25');
  const dup = await api('POST', '/participants', { ...pdata, full_name: 'Another Name', phone: '+92 300 1234567' }, 409);
  check('duplicate phone detected', dup.duplicates.length === 1);
  const reqs = (await api('GET', `/research/${r1.id}`)).requirements;
  const sp1 = await api('POST', `/research/${r1.id}/participants`, { participant_id: p1.id, requirement_id: reqs[0].id, participation_date: '2026-11-10' }, 201);
  const sp2 = await api('POST', `/research/${r2.id}/participants`, { new_participant: { full_name: 'Omar Khan', phone: '0321 7654321' }, participation_date: '2026-11-13' }, 201);
  await api('POST', `/research/${r2.id}/participants`, { participant_id: p1.id, participation_date: '2026-11-13' }, 201);
  await api('POST', `/research/${r2.id}/participants`, { participant_id: p1.id }, 409);
  const hist = await api('GET', `/participants/${p1.id}/history`);
  check('participant history lists both studies', hist.length === 2 && hist.some((h) => h.research_code === 'CI-0001'));
  check('segment counts update', (await api('GET', `/research/${r1.id}`)).requirements[0].assigned_count === 1);

  // NDA
  await api('POST', '/nda/generate', { participation_id: sp1.id }, 400);
  check('NDA blocked until template uploaded', true);
  const fd = new FormData(); fd.append('file', new Blob([await makeDocx()]), 'Company_NDA.docx');
  const tpl = await api('POST', '/nda/templates', fd, 201);
  check('template uploaded as v1 with detected placeholders', tpl.version === 1 && tpl.placeholders.includes('participant_name'));
  const bad = new FormData(); bad.append('file', new Blob(['MZ not a docx']), 'evil.docx');
  await api('POST', '/nda/templates', bad, 400);
  const n1 = await api('POST', '/nda/generate', { participation_id: sp1.id }, 201);
  check('NDA generated (' + n1.engine + ') with unresolved placeholder reported', n1.nda_code === 'NDA-0001' && n1.unresolved_placeholders.includes('not_a_field'));
  const doc = await api('GET', `/nda/${n1.id}/document`);
  check('draft NDA PDF served', doc.slice(0, 4).toString() === '%PDF');
  const view = await api('GET', `/nda/${n1.id}`);
  check('placeholders populated incl. split runs', view.draft_html.includes('Sana Malik') && view.draft_html.includes('P-0001') && view.draft_html.includes('CI-0001'));
  await api('POST', `/nda/${n1.id}/sign`, { method: 'typed', typed_name: 'Sana Malik', read_confirmed: true, consent: false }, 400);
  const signed = await api('POST', `/nda/${n1.id}/sign`, { method: 'drawn', signature_data: 'data:image/png;base64,' + noisyPng().toString('base64'), read_confirmed: true, consent: true });
  check('NDA signed (drawn)', signed.status === 'Signed' && signed.signing_method === 'drawn');
  await api('POST', `/nda/${n1.id}/sign`, { method: 'typed', typed_name: 'Sana Malik', read_confirmed: true, consent: true }, 409);
  const pdf = await api('GET', `/nda/${n1.id}/pdf`);
  const pdfDoc = await PDFDocument.load(pdf);
  check('signed PDF stored with signature page', pdfDoc.getPageCount() >= 2);
  await api('DELETE', `/nda/${n1.id}`, null, 409);
  check('signed NDA cannot be deleted', true);
  const n2 = await api('POST', '/nda/generate', { participation_id: sp2.id }, 201);
  await api('POST', `/nda/${n2.id}/sign`, { method: 'typed', typed_name: 'Omar Khan', read_confirmed: true, consent: true });
  check('typed NDA signed', (await api('GET', `/nda/${n2.id}`)).signing_method === 'typed');
  const n3 = await api('POST', '/nda/generate', { participation_id: sp1.id }, 201);
  check('re-generating after signing creates a separate record', n3.nda_code === 'NDA-0003' && n3.status === 'Pending');
  await api('DELETE', `/participation/${sp1.id}`, null, 409);
  check('participation with signed NDA protected', true);

  // Attachments & results
  const pdfBuf = Buffer.from(await (await PDFDocument.create()).save());
  const af = new FormData(); af.append('files', new Blob([pdfBuf]), 'Eye_Tracking_Findings.pdf'); af.append('description', 'Final findings'); af.append('folder', 'findings');
  const att = await api('POST', `/research/${r1.id}/attachments`, af, 201);
  const bf = new FormData(); bf.append('files', new Blob(['MZ\u0090 fake']), 'malware.pdf');
  await api('POST', `/research/${r1.id}/attachments`, bf, 400);
  const dl = await api('GET', `/attachments/${att[0].id}/download`);
  check('attachment uploaded, validated and downloadable', dl.slice(0, 4).toString() === '%PDF');
  await api('PUT', `/research/${r1.id}/results`, { results_status: 'In Progress', results_description: 'Analysis underway' });
  const afterRes = await api('GET', `/research/${r1.id}`);
  check('research Completed while results In Progress', afterRes.status === 'Completed' && afterRes.results_status === 'In Progress');

  // Dashboard & analytics
  const dash = await api('GET', '/dashboard');
  check('dashboard stats from DB', dash.stats.total === 3 && dash.stats.completed === 1 && dash.stats.participants === 2 && dash.stats.results_in_progress === 1);
  const an = await api('GET', '/analytics');
  check('analytics computed', an.participants.unique_participants === 2 && an.participants.nda.signed === 2 && an.results.completed_with_pending_results.length === 1);

  // Backup / restore
  const b = await api('POST', '/backups', {}, 201);
  check('manual backup created and verified', b.verified === 1 && b.file_count > 3);
  await api('PUT', `/research/${r3.id}`, { title: 'Changed after backup' });
  await api('DELETE', `/attachments/${att[0].id}`);
  await api('POST', `/backups/${b.id}/restore`, {}, 400);
  const rr = await api('POST', `/backups/${b.id}/restore`, { confirm: 'RESTORE' });
  check('restore made a safety backup', !!rr.safety_backup);
  check('restored data returned', (await api('GET', `/research/${r3.id}`)).title === 'Far away');
  const dl2 = await api('GET', `/attachments/${att[0].id}/download`);
  check('restored attachment file accessible', dl2.slice(0, 4).toString() === '%PDF');
  const signedAgain = await api('GET', `/nda/${n1.id}/pdf`);
  check('restored signed NDA accessible', signedAgain.length === pdf.length);
  const list = await api('GET', '/backups');
  check('backup history keeps both backups after restore', list.backups.length >= 2);

  // Persistence across restart
  await stopServer(); await startServer();
  const after = await api('GET', '/research?pageSize=50');
  check('research persists after restart', after.total === 3);
  check('participants persist after restart', (await api('GET', '/participants')).total === 2);
  check('signed NDA persists after restart', (await api('GET', `/nda/${n2.id}`)).status === 'Signed');
  await stopServer();
  console.log(`\nAll ${passed} checks passed.`);
  fs.rmSync(root, { recursive: true, force: true });
})().catch(async (e) => { console.error('\n' + e.message); try { await stopServer(); } catch (_) {} console.error('Test data kept at', root); process.exit(1); });
