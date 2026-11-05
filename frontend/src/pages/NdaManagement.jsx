import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileSignature, PenLine, AlertTriangle } from 'lucide-react';
import { api, qs } from '../services/api';
import { useDebounced, useFetch } from '../hooks/hooks';
import { useState } from 'react';
import { PageHeader, Spinner, ErrorBox, Empty, Pager, SearchInput, NdaBadge, StatCard } from '../components/ui';
import { fmtDateTime } from '../utils/format';

export default function NdaManagement() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const status = sp.get('status') || '';
  const dq = useDebounced(q, 300);
  const tpl = useFetch('/nda/templates');
  const { data, loading, error, reload } = useFetch('/nda' + qs({ q: dq, status, page, pageSize: 15 }));
  const active = tpl.data?.templates.find((t) => t.is_active);
  return (
    <>
      <PageHeader title="NDA Management" subtitle="Every participant signs a new NDA for each study. Signed PDFs are never overwritten."><Link className="btn" to="/settings?tab=nda">Manage template</Link></PageHeader>
      {tpl.data && !active && <div className="alert warn mb"><AlertTriangle size={18} /><div><b>No NDA template uploaded.</b> Upload the company-approved template in <Link to="/settings?tab=nda">Settings → NDA Template</Link> before generating NDAs.</div></div>}
      <div className="grid g3 mb"><StatCard icon={FileSignature} label="Signed NDAs" value={data?.counts.signed ?? '—'} tone="green" /><StatCard icon={PenLine} label="Pending (generated, unsigned)" value={data?.counts.pending ?? '—'} tone="amber" /><StatCard icon={FileSignature} label="Active template" value={active ? `v${active.version}` : 'None'} tone="purple" /></div>
      <div className="toolbar"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search participant, research, NDA ID…" />
        <select className="pill-select" value={status} onChange={(e) => { setSp(e.target.value ? { status: e.target.value } : {}); setPage(1); }} aria-label="Status"><option value="">All statuses</option><option>Signed</option><option>Pending</option></select></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">{loading && !data ? <Spinner /> : data && data.rows.length === 0 ? <Empty icon={FileSignature} title="No NDA records">Generate an NDA from a study’s Participants tab.</Empty> : data && (
        <><div className="table-wrap"><table className="t"><thead><tr><th>NDA</th><th>Participant</th><th>Research</th><th>Template</th><th>Status</th><th>Signed</th><th /></tr></thead><tbody>{data.rows.map((n) => (
          <tr key={n.id}><td className="mono">{n.nda_code}</td><td><Link to={`/participants/${n.participant_id}`}>{n.participant_code} · {n.participant_name}</Link></td><td><Link to={`/research/${n.study_id}`}>{n.research_code} · {n.research_title}</Link></td><td>v{n.template_version}</td><td><NdaBadge status={n.status} /></td>
            <td>{n.signed_at ? <>{fmtDateTime(n.signed_at)}<div className="sub">{n.signing_method === 'drawn' ? 'Drawn' : 'Typed'}</div></> : '—'}</td>
            <td style={{ textAlign: 'right' }}>{n.status === 'Signed' ? <a className="btn sm" href={api.url(`/nda/${n.id}/pdf`)}><Download size={13} /> PDF</a> : <Link className="btn sm primary" to={`/ndas/${n.id}/sign`}>Sign</Link>}</td></tr>))}</tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}</div>
    </>
  );
}
