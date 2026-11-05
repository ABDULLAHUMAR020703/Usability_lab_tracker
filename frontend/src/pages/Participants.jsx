import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { useDebounced, useFetch, useMeta, useSavedState } from '../hooks/hooks';
import { qs } from '../services/api';
import { PageHeader, Spinner, ErrorBox, Empty, Pager, SearchInput, Badge } from '../components/ui';
import { fmtDate } from '../utils/format';

const INIT = { q: '', age_group: '', customer_type: '', digital_behaviour: '', gender: '', archived: '', sort: 'code', dir: 'asc', page: 1 };

export default function Participants() {
  const nav = useNavigate();
  const { meta } = useMeta();
  const [f, setF] = useSavedState('cih.participants.filters', INIT);
  const q = useDebounced(f.q, 300);
  const { data, loading, error, reload } = useFetch('/participants' + qs({ ...f, q, pageSize: 15 }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, page: 1 }));
  const filtered = Object.entries(f).some(([k, v]) => v && !['sort', 'dir', 'page'].includes(k));
  const o = (t) => meta?.options[t] || [];
  return (
    <>
      <PageHeader title="Participant Directory" subtitle="One permanent profile per person, with their full research history"><Link className="btn primary" to="/participants/new"><UserPlus size={16} /> Register participant</Link></PageHeader>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v, page: 1 }))} placeholder="Search name, phone, ID, city…" />
        <select className="pill-select" value={f.age_group} onChange={set('age_group')} aria-label="Age group"><option value="">All ages</option>{o('age_group').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="pill-select" value={f.customer_type} onChange={set('customer_type')} aria-label="Customer type"><option value="">All customer types</option>{o('customer_type').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="pill-select" value={f.digital_behaviour} onChange={set('digital_behaviour')} aria-label="Digital behaviour"><option value="">All digital behaviour</option>{o('digital_behaviour').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="pill-select" value={f.gender} onChange={set('gender')} aria-label="Gender"><option value="">Any gender</option>{o('gender').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="pill-select" value={f.archived} onChange={set('archived')} aria-label="Archived"><option value="">Active</option><option value="1">Archived</option></select>
        {filtered && <button className="btn sm ghost" onClick={() => setF(INIT)}>Clear</button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {loading && !data ? <Spinner /> : data && data.rows.length === 0 ? (
          <Empty icon={Users} title={filtered ? 'No participants match' : 'No participants yet'} action={!filtered && <Link className="btn primary" to="/participants/new">Register the first participant</Link>}>{filtered ? 'Try different filters.' : 'Participants supplied by the recruitment agency are registered here once and reused across studies.'}</Empty>
        ) : data && (
          <>
            <div className="table-wrap"><table className="t"><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Age</th><th>City</th><th>Customer type</th><th>Digital behaviour</th><th>Studies</th><th>NDAs</th><th>Registered</th></tr></thead>
              <tbody>{data.rows.map((p) => (
                <tr key={p.id} className="click" onClick={() => nav(`/participants/${p.id}`)}>
                  <td className="mono">{p.participant_code}</td><td className="title">{p.full_name}</td><td>{p.phone}</td><td>{p.age ?? '—'} <span className="faint small">{p.age_group}</span></td><td>{p.city || '—'}</td><td>{p.customer_type || '—'}</td><td>{p.digital_behaviour || '—'}</td>
                  <td>{p.study_count}</td><td>{p.signed_nda_count > 0 && <Badge tone="green">{p.signed_nda_count} signed</Badge>} {p.pending_nda_count > 0 && <Badge tone="amber">{p.pending_nda_count} pending</Badge>}{!p.signed_nda_count && !p.pending_nda_count && '—'}</td><td>{fmtDate(p.registration_date)}</td></tr>))}</tbody></table></div>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
          </>)}
      </div>
    </>
  );
}
