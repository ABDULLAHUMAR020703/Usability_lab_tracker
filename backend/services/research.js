const db = require('../database/db');
const { bad, notFound, isDate, str, int, logActivity, paginate } = require('../utils/helpers');

const STATUSES = ['Draft', 'Review Screen', 'Approved', 'Scheduled', 'Completed'];
const RESULTS_STATUSES = ['Not Started', 'In Progress', 'Under Review', 'Completed'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

const SELECT = `
SELECT s.*, c.name AS category_name, c.color AS category_color, sc.name AS subcategory_name, p.name AS product_name,
  (SELECT COALESCE(SUM(required_count),0) FROM research_participant_requirements r WHERE r.study_id = s.id) AS required_total,
  (SELECT COUNT(*) FROM study_participation sp WHERE sp.study_id = s.id AND sp.attendance_status <> 'Cancelled') AS participant_count,
  (SELECT COUNT(*) FROM research_attachments a WHERE a.study_id = s.id) AS attachment_count,
  (SELECT COUNT(*) FROM nda_records n WHERE n.study_id = s.id AND n.status = 'Signed') AS signed_nda_count
FROM research_studies s
JOIN research_categories c ON c.id = s.category_id
LEFT JOIN research_subcategories sc ON sc.id = s.subcategory_id
LEFT JOIN products p ON p.id = s.product_id`;

function buildFilters(q, alias = 's') {
  const where = [], params = [];
  if (q.archived === '1') where.push(`${alias}.archived_at IS NOT NULL`); else where.push(`${alias}.archived_at IS NULL`);
  if (q.q) {
    where.push(`(${alias}.title LIKE ? OR ${alias}.research_code LIKE ? OR ${alias}.screen_topic LIKE ? OR ${alias}.owner LIKE ? OR ${alias}.description LIKE ?)`);
    const l = `%${q.q}%`; params.push(l, l, l, l, l);
  }
  if (q.category_id) { where.push(`${alias}.category_id = ?`); params.push(int(q.category_id)); }
  if (q.product_id) { where.push(`${alias}.product_id = ?`); params.push(int(q.product_id)); }
  if (q.owner) { where.push(`${alias}.owner = ? COLLATE NOCASE`); params.push(q.owner); }
  if (q.status) { where.push(`${alias}.status = ?`); params.push(q.status); }
  if (q.results_status) { where.push(`${alias}.results_status = ?`); params.push(q.results_status); }
  if (q.from) { where.push(`${alias}.end_date >= ?`); params.push(q.from); }
  if (q.to) { where.push(`${alias}.start_date <= ?`); params.push(q.to); }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function list(req) {
  const { page, pageSize, offset } = paginate(req);
  const { where, params } = buildFilters(req.query);
  const sortMap = { start_date: 's.start_date', title: 's.title', status: 's.status', updated_at: 's.updated_at', research_code: 's.research_code', owner: 's.owner' };
  const sort = sortMap[req.query.sort] || 's.start_date';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const total = db.get(`SELECT COUNT(*) c FROM research_studies s ${where}`, params).c;
  const rows = db.all(`${SELECT} ${where} ORDER BY ${sort} ${dir}, s.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { rows, total, page, pageSize };
}

function requirementsFor(studyId) {
  return db.all(`SELECT r.*,
      (SELECT COUNT(*) FROM study_participation sp WHERE sp.requirement_id = r.id AND sp.attendance_status <> 'Cancelled') AS assigned_count,
      (SELECT COUNT(*) FROM study_participation sp WHERE sp.requirement_id = r.id AND sp.attendance_status = 'Attended') AS attended_count
    FROM research_participant_requirements r WHERE r.study_id = ? ORDER BY r.sort_order, r.id`, [studyId]);
}

function get(id) {
  const s = db.get(`${SELECT} WHERE s.id = ?`, [id]);
  if (!s) throw notFound('Research study not found');
  s.team_members = db.all('SELECT name FROM research_team_members WHERE study_id = ? ORDER BY name', [id]).map((r) => r.name);
  s.requirements = requirementsFor(id);
  s.unassigned_count = db.get(`SELECT COUNT(*) c FROM study_participation WHERE study_id = ? AND requirement_id IS NULL AND attendance_status <> 'Cancelled'`, [id]).c;
  return s;
}

function validate(b, partial = false) {
  const errors = {};
  const need = (k, label) => { if (!str(b[k])) errors[k] = `${label} is required`; };
  if (!partial || 'title' in b) need('title', 'Research title');
  if (!partial || 'owner' in b) need('owner', 'Research owner');
  if (!partial || 'category_id' in b) { if (!int(b.category_id)) errors.category_id = 'Category is required'; }
  if (!partial || 'start_date' in b) { if (!isDate(b.start_date)) errors.start_date = 'A valid start date is required'; }
  if (!partial || 'end_date' in b) { if (!isDate(b.end_date)) errors.end_date = 'A valid end date is required'; }
  if (isDate(b.start_date) && isDate(b.end_date) && b.end_date < b.start_date) errors.end_date = 'End date cannot be before the start date';
  if (b.status && !STATUSES.includes(b.status)) errors.status = 'Invalid status';
  if (b.priority && !PRIORITIES.includes(b.priority)) errors.priority = 'Invalid priority';
  if (int(b.category_id) && int(b.subcategory_id)) {
    const sub = db.get('SELECT category_id FROM research_subcategories WHERE id = ?', [int(b.subcategory_id)]);
    if (!sub || sub.category_id !== int(b.category_id)) errors.subcategory_id = 'Subcategory does not belong to the selected category';
  }
  for (const [i, r] of (b.requirements || []).entries()) {
    if (!(int(r.required_count) >= 0)) errors[`requirements.${i}.required_count`] = 'Required count must be 0 or more';
    if (int(r.age_min) !== null && int(r.age_max) !== null && int(r.age_min) > int(r.age_max)) errors[`requirements.${i}.age_max`] = 'Max age must be ≥ min age';
  }
  if (Object.keys(errors).length) throw bad('Please correct the highlighted fields', { errors });
}

function syncTeam(studyId, members) {
  db.run('DELETE FROM research_team_members WHERE study_id = ?', [studyId]);
  const seen = new Set();
  for (const m of members || []) {
    const n = str(m);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); db.run('INSERT INTO research_team_members(study_id,name) VALUES (?,?)', [studyId, n]); }
  }
}

function syncRequirements(studyId, reqs) {
  if (!Array.isArray(reqs)) return;
  const keep = [];
  reqs.forEach((r, i) => {
    const vals = [str(r.label), int(r.required_count) ?? 0, int(r.age_min), int(r.age_max), str(r.customer_type), str(r.digital_behaviour), str(r.gender), str(r.city), str(r.other_criteria), i];
    const existing = int(r.id) && db.get('SELECT id FROM research_participant_requirements WHERE id = ? AND study_id = ?', [int(r.id), studyId]);
    if (existing) {
      db.run(`UPDATE research_participant_requirements SET label=?,required_count=?,age_min=?,age_max=?,customer_type=?,digital_behaviour=?,gender=?,city=?,other_criteria=?,sort_order=? WHERE id=?`, [...vals, existing.id]);
      keep.push(existing.id);
    } else {
      const { lastId } = db.run(`INSERT INTO research_participant_requirements(label,required_count,age_min,age_max,customer_type,digital_behaviour,gender,city,other_criteria,sort_order,study_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [...vals, studyId]);
      keep.push(lastId);
    }
  });
  const existingIds = db.all('SELECT id FROM research_participant_requirements WHERE study_id = ?', [studyId]).map((r) => r.id);
  for (const id of existingIds) if (!keep.includes(id)) db.run('DELETE FROM research_participant_requirements WHERE id = ?', [id]);
}

const FIELDS = ['title', 'description', 'objective', 'category_id', 'subcategory_id', 'product_id', 'screen_topic', 'owner', 'priority', 'location', 'start_date', 'end_date', 'notes'];

function create(b) {
  validate(b);
  return db.tx(() => {
    const code = db.nextId('research', 'CI-', 4);
    const { lastId } = db.run(`INSERT INTO research_studies(research_code,title,description,objective,category_id,subcategory_id,product_id,screen_topic,owner,priority,location,start_date,end_date,status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, str(b.title), str(b.description), str(b.objective), int(b.category_id), int(b.subcategory_id), int(b.product_id), str(b.screen_topic), str(b.owner), b.priority || 'Normal', str(b.location), b.start_date, b.end_date, b.status || 'Draft', str(b.notes)]);
    syncTeam(lastId, b.team_members);
    syncRequirements(lastId, b.requirements);
    logActivity({ studyId: lastId, action: 'Research created', details: `${code} created with status ${b.status || 'Draft'}` });
    return get(lastId);
  });
}

function update(id, b) {
  const before = get(id);
  const merged = { ...before, ...b };
  validate(merged);
  return db.tx(() => {
    db.run(`UPDATE research_studies SET title=?,description=?,objective=?,category_id=?,subcategory_id=?,product_id=?,screen_topic=?,owner=?,priority=?,location=?,start_date=?,end_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
      [str(merged.title), str(merged.description), str(merged.objective), int(merged.category_id), int(merged.subcategory_id), int(merged.product_id), str(merged.screen_topic), str(merged.owner), merged.priority || 'Normal', str(merged.location), merged.start_date, merged.end_date, str(merged.notes), id]);
    if ('team_members' in b) syncTeam(id, b.team_members);
    if ('requirements' in b) syncRequirements(id, b.requirements);
    const changed = FIELDS.filter((f) => String(before[f] ?? '') !== String(merged[f] ?? '')).map((f) => `${f}: "${before[f] ?? ''}" → "${merged[f] ?? ''}"`);
    if ('requirements' in b) changed.push('participant requirements updated');
    if (b.status && b.status !== before.status) setStatus(id, b.status);
    if (changed.length) logActivity({ studyId: id, action: 'Research updated', details: changed.join('; ') });
    return get(id);
  });
}

function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw bad('Invalid status');
  const s = get(id);
  if (s.status === status) return s;
  db.run("UPDATE research_studies SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
  logActivity({ studyId: id, action: 'Status changed', details: `${s.status} → ${status}` });
  return get(id);
}

function setDates(id, start, end) {
  if (!isDate(start) || !isDate(end)) throw bad('Valid start and end dates are required');
  if (end < start) throw bad('End date cannot be before the start date', { errors: { end_date: 'End date cannot be before the start date' } });
  const s = get(id);
  db.run("UPDATE research_studies SET start_date=?, end_date=?, updated_at=datetime('now') WHERE id=?", [start, end, id]);
  logActivity({ studyId: id, action: 'Dates changed', details: `${s.start_date} – ${s.end_date} → ${start} – ${end}` });
  return get(id);
}

function archive(id) {
  const s = get(id);
  db.run("UPDATE research_studies SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
  logActivity({ studyId: id, action: 'Research archived', details: s.research_code });
}
function restore(id) {
  db.run("UPDATE research_studies SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
  logActivity({ studyId: id, action: 'Research restored' });
  return get(id);
}

function updateResults(id, b) {
  const s = get(id);
  const status = b.results_status || s.results_status;
  if (!RESULTS_STATUSES.includes(status)) throw bad('Invalid results status');
  let completedAt = s.results_completed_at;
  if (status === 'Completed') {
    if (b.results_completed_at && !isDate(b.results_completed_at)) throw bad('Invalid completion date');
    completedAt = b.results_completed_at || s.results_completed_at || new Date().toISOString().slice(0, 10);
  } else completedAt = null;
  db.tx(() => {
    db.run(`UPDATE research_studies SET results_status=?, results_description=?, key_insights=?, results_completed_at=?, results_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [status, 'results_description' in b ? str(b.results_description) : s.results_description, 'key_insights' in b ? str(b.key_insights) : s.key_insights, completedAt, id]);
    if (status !== s.results_status) logActivity({ studyId: id, action: 'Results status changed', details: `${s.results_status} → ${status}` });
    else logActivity({ studyId: id, action: 'Results details updated' });
  });
  return get(id);
}

// ---------- Calendar & conflicts ----------
function calendarEvents(q) {
  const { where, params } = buildFilters({ ...q, q: q.q });
  return db.all(`${SELECT} ${where} ORDER BY s.start_date`, params);
}

function detectConflicts({ studyId = null, start, end, owner = null, team = [] }) {
  if (!isDate(start) || !isDate(end)) return [];
  const others = db.all(`SELECT s.id, s.research_code, s.title, s.start_date, s.end_date, s.owner, s.status, c.color AS category_color
    FROM research_studies s JOIN research_categories c ON c.id = s.category_id
    WHERE s.archived_at IS NULL AND s.id <> ? AND s.start_date <= ? AND s.end_date >= ? ORDER BY s.start_date`, [studyId || 0, end, start]);
  const mine = (studyId ? db.all(`SELECT participant_id, participation_date FROM study_participation WHERE study_id = ? AND attendance_status <> 'Cancelled'`, [studyId]) : []);
  const mineByP = new Map(mine.map((m) => [m.participant_id, m.participation_date]));
  const people = new Set([owner, ...team].filter(Boolean).map((n) => n.toLowerCase()));

  return others.map((o) => {
    const kinds = ['date_overlap'];
    const otherTeam = db.all('SELECT name FROM research_team_members WHERE study_id = ?', [o.id]).map((r) => r.name);
    const sharedPeople = [o.owner, ...otherTeam].filter((n) => people.has(String(n).toLowerCase()));
    if (sharedPeople.length) kinds.push('owner');
    const participants = [];
    if (mineByP.size) {
      const theirs = db.all(`SELECT sp.participant_id, sp.participation_date, p.full_name, p.participant_code FROM study_participation sp JOIN participants p ON p.id = sp.participant_id
        WHERE sp.study_id = ? AND sp.attendance_status <> 'Cancelled'`, [o.id]);
      for (const t of theirs) {
        if (!mineByP.has(t.participant_id)) continue;
        const a = mineByP.get(t.participant_id), b = t.participation_date;
        // Same day = real clash. Unknown dates = possible clash (study ranges overlap and same person).
        if (a && b) { if (a === b) participants.push({ id: t.participant_id, code: t.participant_code, name: t.full_name, date: a, certain: true }); }
        else participants.push({ id: t.participant_id, code: t.participant_code, name: t.full_name, date: a || b || null, certain: false });
      }
      if (participants.length) kinds.push('participant');
    }
    return { study: o, kinds, shared_people: [...new Set(sharedPeople)], participants, severity: kinds.length > 1 ? 'conflict' : 'overlap' };
  });
}

module.exports = { STATUSES, RESULTS_STATUSES, PRIORITIES, list, get, create, update, setStatus, setDates, archive, restore, updateResults, calendarEvents, detectConflicts, requirementsFor };
