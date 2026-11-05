export const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : String(d).replace(' ', 'T') + 'Z');
  return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const x = new Date(String(d).includes('T') ? d : String(d).replace(' ', 'T') + 'Z');
  return isNaN(x) ? d : x.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const fmtRange = (s, e) => (s === e ? fmtDate(s) : `${fmtDate(s)} – ${fmtDate(e)}`);
export const fmtSize = (n) => {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`; return `${(n / 1073741824).toFixed(2)} GB`;
};
export const todayStr = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export const STATUS_TONE = { Draft: 'grey', 'Review Screen': 'amber', Approved: 'blue', Scheduled: 'purple', Completed: 'green' };
export const RESULTS_TONE = { 'Not Started': 'grey', 'In Progress': 'amber', 'Under Review': 'blue', Completed: 'green' };
export const ATTEND_TONE = { Expected: 'grey', Confirmed: 'blue', Attended: 'green', 'Did Not Attend': 'red', Cancelled: 'red' };
export const NDA_TONE = { Signed: 'green', Pending: 'amber', 'Not Generated': 'grey' };
export const PRIORITY_TONE = { Low: 'grey', Normal: 'blue', High: 'amber', Critical: 'red' };
export const CHART_COLORS = ['#5b3ff5', '#12a150', '#f59e0b', '#2b7de9', '#e5392a', '#14b8a6', '#a855f7', '#64748b'];
