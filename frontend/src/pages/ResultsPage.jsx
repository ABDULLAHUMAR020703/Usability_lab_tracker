import { useNavigate, Link } from 'react-router-dom';
import { FileBarChart, Paperclip } from 'lucide-react';
import { useDebounced, useFetch, useMeta, useSavedState } from '../hooks/hooks';
import { qs } from '../services/api';
import { PageHeader, Spinner, ErrorBox, Empty, SearchInput, StatusBadge, ResultsBadge, CategoryChip } from '../components/ui';
import { fmtDate } from '../utils/format';

const INIT = { q: '', results_status: '', status: '', category_id: '', product_id: '', has_attachments: '' };

export default function ResultsPage() {
  const nav = useNavigate();
  const { meta } = useMeta();
  const [f, setF] = useSavedState('cih.results.filters', INIT);
  const q = useDebounced(f.q, 300);
  const { data, loading, error, reload } = useFetch('/results' + qs({ ...f, q }));
  const all = useFetch('/results');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const counts = (s) => (all.data || []).filter((r) => r.results_status === s).length;
  const filtered = Object.values(f).some(Boolean);
  return (
    <>
      <PageHeader title="Research Results" subtitle="Results production is tracked separately from research completion. Open any study to reach its insights and files." />
      <div className="grid g4 mb">
        {meta?.results_statuses.map((s) => (
          <button key={s} className="card stat" style={{ cursor: 'pointer', textAlign: 'left', borderColor: f.results_status === s ? 'var(--primary)' : undefined }} onClick={() => setF((x) => ({ ...x, results_status: x.results_status === s ? '' : s }))}>
            <div><div className="num">{counts(s)}</div><div className="lbl">{s}</div></div></button>))}
      </div>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} placeholder="Search studies, insights…" />
        <select className="pill-select" value={f.results_status} onChange={set('results_status')} aria-label="Results status"><option value="">Any results status</option>{meta?.results_statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="pill-select" value={f.status} onChange={set('status')} aria-label="Research status"><option value="">Any research status</option>{meta?.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="pill-select" value={f.category_id} onChange={set('category_id')} aria-label="Category"><option value="">All categories</option>{meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="pill-select" value={f.product_id} onChange={set('product_id')} aria-label="Product"><option value="">All products</option>{meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="pill-select" value={f.has_attachments} onChange={set('has_attachments')} aria-label="Files"><option value="">With or without files</option><option value="1">Has files</option></select>
        {filtered && <button className="btn sm ghost" onClick={() => setF(INIT)}>Clear</button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">{loading && !data ? <Spinner /> : data && data.length === 0 ? <Empty icon={FileBarChart} title="No results to show">{filtered ? 'No studies match these filters.' : 'Studies will appear here once created.'}</Empty> : data && (
        <div className="table-wrap"><table className="t"><thead><tr><th>Research</th><th>Category</th><th>Research status</th><th>Results status</th><th>Key insights</th><th>Files</th><th>Updated</th></tr></thead><tbody>{data.map((r) => (
          <tr key={r.id} className="click" onClick={() => nav(`/research/${r.id}?tab=results`)}>
            <td><div className="title">{r.title}</div><div className="sub">{r.research_code} · {r.product_name || ''} · {r.owner}</div></td><td><CategoryChip name={r.category_name} color={r.category_color} /></td>
            <td><StatusBadge status={r.status} /></td><td><ResultsBadge status={r.results_status} /></td>
            <td style={{ maxWidth: 300 }}><div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.key_insights || r.results_description || '—'}</div></td>
            <td>{r.attachment_count > 0 ? <span className="badge b-purple"><Paperclip size={12} /> {r.attachment_count}</span> : '—'}</td><td className="small">{fmtDate(r.results_updated_at?.slice(0, 10))}</td></tr>))}</tbody></table></div>)}</div>
    </>
  );
}
