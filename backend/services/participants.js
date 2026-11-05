const db = require('../database/db');
const { bad, notFound, HttpError, isDate, today, str, int, logActivity, paginate } = require('../utils/helpers');

const ATTENDANCE = ['Expected', 'Confirmed', 'Attended', 'Did Not Attend', 'Cancelled'];
const normPhone = (p) => String(p || '').replace(/\D+/g, '').replace(/^(0092|92)/, '0');
const normName = (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();

function demographicsOf(id) {
  const out = {};
  for (const r of db.all('SELECT key, value FROM participant_demographics WHERE participant_id = ?', [id])) out[r.key] = r.value;
  return out;
}

function ageGroupFor(age) {
  if (age === null) return null;
  const opts = db.all("SELECT value FROM lookup_options WHERE type='age_group' AND active=1");
  for (const { value } of opts) {
    const m = value.match(/^(\d+)\s*[-–]\s*(\d+)$/), p = value.match(/^(\d+)\+$/);
    if (m && age >= +m[1] && age <= +m[2]) return value;
    if (p && age >= +p[1]) return value;
  }
  return null;
}

const SELECT = `SELECT p.*, (SELECT COUNT(*) FROM study_participation sp WHERE sp.participant_id = p.id) AS study_count,
  (SELECT COUNT(*) FROM nda_records n WHERE n.participant_id = p.id AND n.status = 'Signed') AS signed_nda_count,
  (SELECT COUNT(*) FROM nda_records n WHERE n.participant_id = p.id AND n.status = 'Pending') AS pending_nda_count,
  (SELECT value FROM participant_demographics d WHERE d.participant_id = p.id AND d.key = 'customer_type') AS customer_type,
  (SELECT value FROM participant_demographics d WHERE d.participant_id = p.id AND d.key = 'digital_behaviour') AS digital_behaviour
  FROM participants p`;

function list(req) {
  const { page, pageSize, offset } = paginate(req);
  const where = [], params = [];
  where.push(req.query.archived === '1' ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL');
  if (req.query.q) {
    where.push('(p.full_name LIKE ? OR p.participant_code LIKE ? OR p.phone LIKE ? OR p.email LIKE ? OR p.city LIKE ?)');
    const l = `%${req.query.q}%`; params.push(l, l, l, l, l);
  }
  if (req.query.age_group) { where.push('p.age_group = ?'); params.push(req.query.age_group); }
  if (req.query.city) { where.push('p.city = ? COLLATE NOCASE'); params.push(req.query.city); }
  if (req.query.gender) { where.push('p.gender = ?'); params.push(req.query.gender); }
  for (const key of ['customer_type', 'digital_behaviour', 'customer_segment']) {
    if (req.query[key]) { where.push('EXISTS (SELECT 1 FROM participant_demographics d WHERE d.participant_id = p.id AND d.key = ? AND d.value = ?)'); params.push(key, req.query[key]); }
  }
  if (req.query.study_id) { where.push('EXISTS (SELECT 1 FROM study_participation sp WHERE sp.participant_id = p.id AND sp.study_id = ?)'); params.push(int(req.query.study_id)); }
  const w = 'WHERE ' + where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) c FROM participants p ${w}`, params).c;
  const sorts = { name: 'p.full_name COLLATE NOCASE', code: 'p.participant_code', registered: 'p.registration_date', studies: 'study_count' };
  const sort = sorts[req.query.sort] || 'p.participant_code';
  const rows = db.all(`${SELECT} ${w} ORDER BY ${sort} ${req.query.dir === 'desc' ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { rows, total, page, pageSize };
}

function get(id) {
  const p = db.get(`${SELECT} WHERE p.id = ?`, [id]);
  if (!p) throw notFound('Participant not found');
  p.demographics = demographicsOf(id);
  return p;
}

function history(id) {
  const rows = db.all(`SELECT sp.id AS participation_id, sp.participation_date, sp.attendance_status, sp.notes, sp.requirement_id,
      r.label AS segment_label, s.id AS study_id, s.research_code, s.title, s.start_date, s.end_date, s.status AS study_status,
      s.screen_topic, c.name AS category_name, c.color AS category_color, pr.name AS product_name
    FROM study_participation sp
    JOIN research_studies s ON s.id = sp.study_id
    JOIN research_categories c ON c.id = s.category_id
    LEFT JOIN products pr ON pr.id = s.product_id
    LEFT JOIN research_participant_requirements r ON r.id = sp.requirement_id
    WHERE sp.participant_id = ? ORDER BY COALESCE(sp.participation_date, s.start_date) DESC`, [id]);
  const ndas = db.all('SELECT id, nda_code, participation_id, status, signing_method, signed_at, template_version, created_at FROM nda_records WHERE participant_id = ? ORDER BY id DESC', [id]);
  return rows.map((r) => ({ ...r, ndas: ndas.filter((n) => n.participation_id === r.participation_id) }));
}

function validate(b) {
  const errors = {};
  if (!str(b.full_name)) errors.full_name = 'Full name is required';
  if (!str(b.phone)) errors.phone = 'Phone number is required';
  else if (normPhone(b.phone).length < 7) errors.phone = 'Enter a valid phone number';
  if (str(b.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.email = 'Enter a valid email address';
  if (b.age !== undefined && b.age !== null && b.age !== '' && !(int(b.age) >= 0 && int(b.age) < 130)) errors.age = 'Enter a valid age';
  if (str(b.registration_date) && !isDate(b.registration_date)) errors.registration_date = 'Invalid date';
  if (Object.keys(errors).length) throw bad('Please correct the highlighted fields', { errors });
}

function findDuplicates(b, excludeId = 0) {
  const phone = normPhone(b.phone), name = normName(b.full_name);
  const out = [];
  if (phone.length >= 7) {
    for (const r of db.all('SELECT id, participant_code, full_name, phone, city FROM participants WHERE phone_normalized = ? AND id <> ? AND archived_at IS NULL', [phone, excludeId])) out.push({ ...r, reason: 'Same phone number' });
  }
  if (name) {
    for (const r of db.all('SELECT id, participant_code, full_name, phone, city FROM participants WHERE lower(full_name) = ? AND id <> ? AND archived_at IS NULL', [name, excludeId])) {
      if (!out.find((o) => o.id === r.id)) out.push({ ...r, reason: 'Same name' });
    }
  }
  return out;
}

function saveDemographics(id, d) {
  if (!d || typeof d !== 'object') return;
  for (const [k, v] of Object.entries(d)) {
    const key = String(k).trim().slice(0, 60);
    if (!key) continue;
    if (v === null || v === undefined || String(v).trim() === '') db.run('DELETE FROM participant_demographics WHERE participant_id = ? AND key = ?', [id, key]);
    else db.run(`INSERT INTO participant_demographics(participant_id,key,value) VALUES (?,?,?) ON CONFLICT(participant_id,key) DO UPDATE SET value=excluded.value`, [id, key, String(v).trim().slice(0, 200)]);
  }
}

function create(b, { force = false } = {}) {
  validate(b);
  if (!force) {
    const dups = findDuplicates(b);
    if (dups.length) throw new HttpError(409, 'Possible duplicate participant found', { duplicates: dups });
  }
  return db.tx(() => {
    const code = db.nextId('participant', 'P-', 4);
    const age = int(b.age);
    const { lastId } = db.run(`INSERT INTO participants(participant_code,full_name,phone,phone_normalized,email,age,age_group,gender,city,occupation,registration_date,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, str(b.full_name), str(b.phone), normPhone(b.phone), str(b.email), age, str(b.age_group) || ageGroupFor(age), str(b.gender), str(b.city), str(b.occupation), str(b.registration_date) || today(), str(b.notes)]);
    saveDemographics(lastId, b.demographics);
    logActivity({ participantId: lastId, action: 'Participant registered', details: `${code} – ${b.full_name}` });
    return get(lastId);
  });
}

function update(id, b) {
  const before = get(id);
  const m = { ...before, ...b };
  validate(m);
  const dups = b.force ? [] : findDuplicates(m, id);
  if (dups.length && (normPhone(m.phone) !== before.phone_normalized || normName(m.full_name) !== normName(before.full_name))) {
    throw new HttpError(409, 'Possible duplicate participant found', { duplicates: dups });
  }
  return db.tx(() => {
    const age = int(m.age);
    db.run(`UPDATE participants SET full_name=?,phone=?,phone_normalized=?,email=?,age=?,age_group=?,gender=?,city=?,occupation=?,registration_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
      [str(m.full_name), str(m.phone), normPhone(m.phone), str(m.email), age, str(m.age_group) || ageGroupFor(age), str(m.gender), str(m.city), str(m.occupation), str(m.registration_date) || before.registration_date, str(m.notes), id]);
    if ('demographics' in b) saveDemographics(id, b.demographics);
    logActivity({ participantId: id, action: 'Participant updated', details: before.participant_code });
    return get(id);
  });
}

function archive(id) {
  const p = get(id);
  db.run("UPDATE participants SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
  logActivity({ participantId: id, action: 'Participant archived', details: p.participant_code });
}
function restore(id) {
  db.run("UPDATE participants SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
  logActivity({ participantId: id, action: 'Participant restored' });
  return get(id);
}

// ---------- Study participation ----------
function participationsForStudy(studyId) {
  return db.all(`SELECT sp.*, p.participant_code, p.full_name, p.phone, p.age, p.age_group, p.city, r.label AS segment_label,
      (SELECT n.status FROM nda_records n WHERE n.participation_id = sp.id ORDER BY (n.status='Signed') DESC, n.id DESC LIMIT 1) AS nda_status,
      (SELECT n.id FROM nda_records n WHERE n.participation_id = sp.id AND n.status='Signed' ORDER BY n.id DESC LIMIT 1) AS signed_nda_id,
      (SELECT n.id FROM nda_records n WHERE n.participation_id = sp.id AND n.status='Pending' ORDER BY n.id DESC LIMIT 1) AS pending_nda_id
    FROM study_participation sp JOIN participants p ON p.id = sp.participant_id
    LEFT JOIN research_participant_requirements r ON r.id = sp.requirement_id
    WHERE sp.study_id = ? ORDER BY sp.id`, [studyId]).map((r) => ({ ...r, nda_status: r.nda_status || 'Not Generated' }));
}

function assign(studyId, b) {
  const study = db.get('SELECT id, start_date, end_date, research_code FROM research_studies WHERE id = ?', [studyId]);
  if (!study) throw notFound('Research study not found');
  const status = b.attendance_status || 'Expected';
  if (!ATTENDANCE.includes(status)) throw bad('Invalid attendance status');
  if (b.participation_date && !isDate(b.participation_date)) throw bad('Invalid participation date');
  if (b.requirement_id && !db.get('SELECT id FROM research_participant_requirements WHERE id = ? AND study_id = ?', [int(b.requirement_id), studyId])) throw bad('Segment does not belong to this study');
  return db.tx(() => {
    let pid = int(b.participant_id);
    if (!pid) {
      if (!b.new_participant) throw bad('Select an existing participant or provide new participant details');
      pid = create(b.new_participant, { force: !!b.force }).id;
    } else get(pid);
    if (db.get('SELECT id FROM study_participation WHERE study_id = ? AND participant_id = ?', [studyId, pid])) throw new HttpError(409, 'This participant is already assigned to this study');
    const { lastId } = db.run('INSERT INTO study_participation(study_id,participant_id,requirement_id,participation_date,attendance_status,notes) VALUES (?,?,?,?,?,?)',
      [studyId, pid, int(b.requirement_id), str(b.participation_date) || null, status, str(b.notes)]);
    const p = get(pid);
    logActivity({ studyId, participantId: pid, action: 'Participant assigned', details: `${p.participant_code} ${p.full_name}` });
    return db.get('SELECT * FROM study_participation WHERE id = ?', [lastId]);
  });
}

function updateParticipation(id, b) {
  const sp = db.get('SELECT * FROM study_participation WHERE id = ?', [id]);
  if (!sp) throw notFound('Participation not found');
  const status = b.attendance_status || sp.attendance_status;
  if (!ATTENDANCE.includes(status)) throw bad('Invalid attendance status');
  const pdate = 'participation_date' in b ? str(b.participation_date) : sp.participation_date;
  if (pdate && !isDate(pdate)) throw bad('Invalid participation date');
  const reqId = 'requirement_id' in b ? int(b.requirement_id) : sp.requirement_id;
  if (reqId && !db.get('SELECT id FROM research_participant_requirements WHERE id = ? AND study_id = ?', [reqId, sp.study_id])) throw bad('Segment does not belong to this study');
  db.run("UPDATE study_participation SET attendance_status=?, participation_date=?, requirement_id=?, notes=?, updated_at=datetime('now') WHERE id=?",
    [status, pdate, reqId, 'notes' in b ? str(b.notes) : sp.notes, id]);
  logActivity({ studyId: sp.study_id, participantId: sp.participant_id, action: 'Participation updated', details: `Attendance: ${status}${pdate ? `, date ${pdate}` : ''}` });
  return db.get('SELECT * FROM study_participation WHERE id = ?', [id]);
}

function removeParticipation(id) {
  const sp = db.get('SELECT * FROM study_participation WHERE id = ?', [id]);
  if (!sp) throw notFound('Participation not found');
  if (db.get("SELECT id FROM nda_records WHERE participation_id = ? AND status = 'Signed'", [id])) {
    throw new HttpError(409, 'This participation has a signed NDA and cannot be removed. Set attendance to "Cancelled" instead.');
  }
  db.tx(() => {
    db.run("DELETE FROM nda_records WHERE participation_id = ? AND status = 'Pending'", [id]);
    db.run('DELETE FROM study_participation WHERE id = ?', [id]);
    logActivity({ studyId: sp.study_id, participantId: sp.participant_id, action: 'Participant removed from study' });
  });
}

module.exports = { ATTENDANCE, list, get, history, create, update, archive, restore, findDuplicates, participationsForStudy, assign, updateParticipation, removeParticipation, ageGroupFor };
