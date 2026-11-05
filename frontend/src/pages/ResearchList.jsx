import { useNavigate, Link } from 'react-router-dom';
import { Plus, FlaskConical, ArrowUpDown } from 'lucide-react';
import { useDebounced, useFetch, useMeta, useSavedState } from '../hooks/hooks';
import { qs } from '../services/api';
import { PageHeader, Spinner, ErrorBox, Empty, StatusBadge, ResultsBadge, CategoryChip, Pager, SearchInput, PriorityBadge } from '../components/ui';
import { fmtRange } from '../utils/format';

const INIT = { q: '', category_id: '', product_id: '', owner: '', status: '', results_status: '', archived: '', sort: 'start_date', dir: 'desc', page: 1 };

export default function ResearchList() {
  const nav = useNavigate();
  const { meta } = useMeta();
  const [f, setF] = useSavedState('cih.research.filters', INIT);
  const q = useDebounced(f.q, 300);
  const { data, loading, error, reload } = useFetch('/research' + qs({ ...f, q, pageSize: 15 }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, page: 1 }));
  const sort = (col) => setF((x) => ({ ...x, sort: col, dir: x.sort === col && x.dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  const th = (col, label) => <th className="sortable" onClick={() => sort(col)}>{label} <ArrowUpDown size={11} style={{ verticalAlign: -1, opacity: f.sort === col ? 1 : .3 }} /></th>;
  const filtered = Object.entries(f).some(([k, v]) => v && !['sort', 'dir', 'page'].includes(k));

  return (
    <>
      <PageHeader title="Research Tracker" subtitle="The complete database of research studies"><Link to="/research/new" className="btn primary"><Plus size={16} /> New research</Link></PageHeader>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v, page: 1 }))} placeholder="Search title, ID, screen, owner…" />
        <select className="pill-select" value={f.category_id} onChange={set('category_id')} aria-label="Category"><option value="">All categories</option>{meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="pill-select" value={f.product_id} onChange={set('product_id')} aria-label="Product"><option value="">All products</option>{meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="pill-select" value={f.owner} onChange={set('owner')} aria-label="Owner"><option value="">All owners</option>{meta?.options.owner.map((o) => <option key={o}>{o}</option>)}</select>
        <select className="pill-select" value={f.status} onChange={set('status')} aria-label="Status"><option value="">All statuses</option>{meta?.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="pill-select" value={f.results_status} onChange={set('results_status')} aria-label="Results status"><option value="">Any results status</option>{meta?.results_statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="pill-select" value={f.archived} onChange={set('archived')} aria-label="Archived"><option value="">Active</option><option value="1">Archived</option></select>
        {filtered && <button className="btn sm ghost" onClick={() => setF(INIT)}>Clear</button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {loading && !data ? <Spinner /> : data && data.rows.length === 0 ? (
          <Empty icon={FlaskConical} title={filtered ? 'No research matches these filters' : 'No research studies yet'} action={!filtered && <Link className="btn primary" to="/research/new">Create research</Link>}>{filtered ? 'Try clearing a filter or searching for something else.' : 'Create your first study to start tracking research.'}</Empty>
        ) : data && (
          <>
            <div className="table-wrap"><table className="t"><thead><tr>{th('research_code', 'ID')}{th('title', 'Research')}<th>Category</th><th>Product</th>{th('owner', 'Owner')}{th('start_date', 'Dates')}{th('status', 'Status')}<th>Results</th><th>Sample</th></tr></thead>
              <tbody>{data.rows.map((s) => (
                <tr key={s.id} className="click" onClick={() => nav(`/research/${s.id}`)} style={s.archived_at ? { opacity: .6 } : null}>
                  <td className="mono">{s.research_code}</td>
                  <td><div className="title">{s.title} {s.priority !== 'Normal' && <PriorityBadge priority={s.priority} />}</div><div className="sub">{s.screen_topic || s.subcategory_name || ''}</div></td>
                  <td><CategoryChip name={s.category_name} color={s.category_color} /></td><td>{s.product_name || '—'}</td><td>{s.owner}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(s.start_date, s.end_date)}</td><td><StatusBadge status={s.status} /></td><td><ResultsBadge status={s.results_status} /></td>
                  <td>{s.participant_count}/{s.required_total}</td>
                </tr>))}</tbody></table></div>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
          </>)}
      </div>
    </>
  );
}
