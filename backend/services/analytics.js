const db = require('../database/db');
const { today, int } = require('../utils/helpers');

// Definitions (documented in README):
//  Planned   = Draft / Review Screen / Approved (not yet scheduled)     Upcoming = not completed and starts after today
//  Ongoing   = not completed and today is within start..end             Pending NDAs = active participations without a signed NDA
const NOT_COMPLETED = "s.status <> 'Completed'";

function dashboard() {
  const t = today();
  const one = (sql, p = []) => db.get(sql, p).c;
  const live = 's.archived_at IS NULL';
  const stats = {
    total: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live}`),
    planned: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live} AND s.status IN ('Draft','Review Screen','Approved')`),
    ongoing: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live} AND ${NOT_COMPLETED} AND s.start_date <= ? AND s.end_date >= ?`, [t, t]),
    upcoming: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live} AND ${NOT_COMPLETED} AND s.start_date > ?`, [t]),
    completed: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live} AND s.status = 'Completed'`),
    participants: one('SELECT COUNT(*) c FROM participants WHERE archived_at IS NULL'),
    pending_ndas: one(`SELECT COUNT(*) c FROM study_participation sp JOIN research_studies s ON s.id = sp.study_id WHERE ${live} AND sp.attendance_status <> 'Cancelled'
        AND NOT EXISTS (SELECT 1 FROM nda_records n WHERE n.participation_id = sp.id AND n.status = 'Signed')`),
    results_in_progress: one(`SELECT COUNT(*) c FROM research_studies s WHERE ${live} AND s.results_status = 'In Progress'`),
  };
  const base = `SELECT s.id, s.research_code, s.title, s.start_date, s.end_date, s.status, s.owner, s.results_status, s.screen_topic, c.name category_name, c.color category_color, p.name product_name
    FROM research_studies s JOIN research_categories c ON c.id = s.category_id LEFT JOIN products p ON p.id = s.product_id`;
  return {
    stats,
    upcoming: db.all(`${base} WHERE ${live} AND ${NOT_COMPLETED} AND s.end_date >= ? ORDER BY s.start_date LIMIT 8`, [t]),
    status_distribution: distribution('status', ['Draft', 'Review Screen', 'Approved', 'Scheduled', 'Completed']),
    results_distribution: distribution('results_status', ['Not Started', 'In Progress', 'Under Review', 'Completed']),
    recent_activity: db.all(`SELECT a.id, a.action, a.details, a.created_at, a.study_id, a.participant_id, s.research_code, s.title, p.participant_code, p.full_name
      FROM research_activity_log a LEFT JOIN research_studies s ON s.id = a.study_id LEFT JOIN participants p ON p.id = a.participant_id ORDER BY a.id DESC LIMIT 10`),
    calendar: db.all(`${base} WHERE ${live} AND s.end_date >= date(?, '-7 days') AND s.start_date <= date(?, '+60 days') ORDER BY s.start_date LIMIT 60`, [t, t]),
  };
}

function distribution(col, order) {
  const rows = db.all(`SELECT ${col} AS name, COUNT(*) AS value FROM research_studies s WHERE s.archived_at IS NULL GROUP BY ${col}`);
  return order.map((n) => ({ name: n, value: (rows.find((r) => r.name === n) || { value: 0 }).value }));
}

function analytics(q) {
  const where = ['s.archived_at IS NULL'], params = [];
  if (q.from) { where.push('s.end_date >= ?'); params.push(q.from); }
  if (q.to) { where.push('s.start_date <= ?'); params.push(q.to); }
  if (int(q.category_id)) { where.push('s.category_id = ?'); params.push(int(q.category_id)); }
  if (int(q.product_id)) { where.push('s.product_id = ?'); params.push(int(q.product_id)); }
  const W = where.join(' AND ');
  const ids = `(SELECT s.id FROM research_studies s WHERE ${W})`;
  const all = (sql, extra = []) => db.all(sql, [...params, ...extra]);
  const t = today();

  const byCategory = all(`SELECT c.name, c.color, COUNT(*) value FROM research_studies s JOIN research_categories c ON c.id = s.category_id WHERE ${W} GROUP BY c.id ORDER BY value DESC`);
  const byProduct = all(`SELECT COALESCE(p.name,'(none)') name, COUNT(*) value FROM research_studies s LEFT JOIN products p ON p.id = s.product_id WHERE ${W} GROUP BY p.id ORDER BY value DESC`);
  const byStatus = ['Draft', 'Review Screen', 'Approved', 'Scheduled', 'Completed'].map((n) => ({ name: n, value: all(`SELECT COUNT(*) c FROM research_studies s WHERE ${W} AND s.status = ?`, [n])[0].c }));
  const completedPerMonth = all(`SELECT substr(s.end_date,1,7) month, COUNT(*) completed FROM research_studies s WHERE ${W} AND s.status='Completed' GROUP BY month ORDER BY month`);
  const plannedPerMonth = all(`SELECT substr(s.start_date,1,7) month, COUNT(*) planned FROM research_studies s WHERE ${W} GROUP BY month ORDER BY month`);
  const months = [...new Set([...completedPerMonth.map((r) => r.month), ...plannedPerMonth.map((r) => r.month)])].sort();
  const plannedVsCompleted = months.map((m) => ({ month: m, planned: (plannedPerMonth.find((r) => r.month === m) || {}).planned || 0, completed: (completedPerMonth.find((r) => r.month === m) || {}).completed || 0 }));

  const partWhere = `sp.study_id IN ${ids} AND sp.attendance_status <> 'Cancelled'`;
  const demo = (key) => all(`SELECT COALESCE(d.value,'Unspecified') name, COUNT(DISTINCT sp.participant_id) value FROM study_participation sp
      LEFT JOIN participant_demographics d ON d.participant_id = sp.participant_id AND d.key = '${key}' WHERE ${partWhere} GROUP BY name ORDER BY value DESC`);
  const participantMetrics = {
    unique_participants: all(`SELECT COUNT(DISTINCT sp.participant_id) c FROM study_participation sp WHERE ${partWhere}`)[0].c,
    per_study: all(`SELECT s.research_code, s.title, COUNT(sp.id) value FROM research_studies s LEFT JOIN study_participation sp ON sp.study_id = s.id AND sp.attendance_status <> 'Cancelled' WHERE ${W} GROUP BY s.id ORDER BY s.start_date DESC LIMIT 25`),
    by_age_group: all(`SELECT COALESCE(p.age_group,'Unspecified') name, COUNT(DISTINCT sp.participant_id) value FROM study_participation sp JOIN participants p ON p.id = sp.participant_id WHERE ${partWhere} GROUP BY name ORDER BY value DESC`),
    by_customer_type: demo('customer_type'),
    by_segment: demo('customer_segment'),
    by_digital_behaviour: demo('digital_behaviour'),
    nda: all(`SELECT SUM(signed) signed, SUM(1 - signed) pending FROM (SELECT sp.id, EXISTS (SELECT 1 FROM nda_records n WHERE n.participation_id = sp.id AND n.status='Signed') AS signed FROM study_participation sp WHERE ${partWhere})`)[0],
    attendance: ['Expected', 'Confirmed', 'Attended', 'Did Not Attend', 'Cancelled'].map((n) => ({ name: n, value: all(`SELECT COUNT(*) c FROM study_participation sp WHERE sp.study_id IN ${ids} AND sp.attendance_status = ?`, [n])[0].c })),
    required_vs_actual: all(`SELECT s.research_code, (SELECT COALESCE(SUM(required_count),0) FROM research_participant_requirements r WHERE r.study_id=s.id) required,
        (SELECT COUNT(*) FROM study_participation sp WHERE sp.study_id=s.id AND sp.attendance_status IN ('Attended')) attended FROM research_studies s WHERE ${W} ORDER BY s.start_date DESC LIMIT 15`),
  };
  participantMetrics.nda = { signed: participantMetrics.nda.signed || 0, pending: participantMetrics.nda.pending || 0 };

  const resultsMetrics = {
    by_status: ['Not Started', 'In Progress', 'Under Review', 'Completed'].map((n) => ({ name: n, value: all(`SELECT COUNT(*) c FROM research_studies s WHERE ${W} AND s.results_status = ?`, [n])[0].c })),
    completed_with_pending_results: all(`SELECT s.id, s.research_code, s.title, s.end_date, s.owner, s.results_status FROM research_studies s WHERE ${W} AND s.status='Completed' AND s.results_status <> 'Completed' ORDER BY s.end_date DESC`),
  };
  const total = all(`SELECT COUNT(*) c FROM research_studies s WHERE ${W}`)[0].c;
  const upcoming = all(`SELECT s.id, s.research_code, s.title, s.start_date, s.end_date, s.status, s.owner FROM research_studies s WHERE ${W} AND ${NOT_COMPLETED} AND s.start_date > ? ORDER BY s.start_date LIMIT 10`, [t]);
  return { total, by_category: byCategory, by_product: byProduct, by_status: byStatus, completed_per_month: completedPerMonth, planned_vs_completed: plannedVsCompleted, upcoming, participants: participantMetrics, results: resultsMetrics };
}

module.exports = { dashboard, analytics };
