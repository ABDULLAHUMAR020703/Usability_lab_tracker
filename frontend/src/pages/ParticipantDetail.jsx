import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Archive, ArchiveRestore, Download, FileSignature, History, UserRound, FileText } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useToast } from '../hooks/hooks';
import { Spinner, ErrorBox, Empty, Tabs, AttendBadge, StatusBadge, NdaBadge, CategoryChip, useConfirm, Badge } from '../components/ui';
import { fmtDate, fmtDateTime } from '../utils/format';

export default function ParticipantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('profile');
  const p = useFetch(`/participants/${id}`);
  const hist = useFetch(`/participants/${id}/history`);
  if (p.loading && !p.data) return <Spinner />;
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  const x = p.data;
  const ndas = (hist.data || []).flatMap((h) => h.ndas.map((n) => ({ ...n, research_code: h.research_code, title: h.title, study_id: h.study_id })));
  const signed = ndas.filter((n) => n.status === 'Signed');
  const demoLabels = { customer_type: 'Customer type', customer_segment: 'Customer segment', digital_behaviour: 'Digital behaviour', digitally_native: 'Digitally native', product_usage: 'Product usage' };

  const archive = async () => {
    if (!(await confirm({ title: 'Archive participant?', message: `${x.full_name} will be hidden from the directory. Their study history and signed NDAs are kept.`, confirmLabel: 'Archive', danger: true }))) return;
    try { await api.del(`/participants/${id}`); toast('Participant archived'); nav('/participants'); } catch (e) { toast(e.message, 'error'); }
  };
  const restore = async () => { try { await api.post(`/participants/${id}/restore`); toast('Participant restored'); p.reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <>
      <div className="page-head">
        <div><div className="crumbs"><Link to="/participants">Participants</Link> / {x.participant_code}</div>
          <h1>{x.full_name} {x.archived_at && <Badge tone="red">Archived</Badge>}</h1>
          <div className="row wrap" style={{ marginTop: 8 }}><span className="mono muted">{x.participant_code}</span><span className="muted">{x.phone}</span>{x.customer_type && <Badge tone="purple">{x.customer_type}</Badge>}<Badge tone="blue">{x.study_count} {x.study_count === 1 ? 'study' : 'studies'}</Badge><Badge tone="green">{x.signed_nda_count} NDA{x.signed_nda_count === 1 ? '' : 's'} signed</Badge></div></div>
        <div className="row"><Link className="btn" to={`/participants/${id}/edit`}><Pencil size={15} /> Edit</Link>{x.archived_at ? <button className="btn" onClick={restore}><ArchiveRestore size={15} /> Restore</button> : <button className="btn danger" onClick={archive}><Archive size={15} /> Archive</button>}</div>
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'Profile & Demographics', icon: <UserRound size={15} /> }, { id: 'history', label: 'Research History', icon: <History size={15} />, count: hist.data?.length }, { id: 'ndas', label: 'NDA History', icon: <FileSignature size={15} />, count: ndas.length }]} />

      {tab === 'profile' && (
        <div className="cols even">
          <div className="card"><div className="card-h"><h2>Personal details</h2></div><div className="card-b"><dl className="kv">
            <dt>Participant ID</dt><dd className="mono">{x.participant_code}</dd><dt>Full name</dt><dd>{x.full_name}</dd><dt>Phone</dt><dd>{x.phone}</dd><dt>Email</dt><dd>{x.email || '—'}</dd><dt>Age</dt><dd>{x.age ?? '—'}{x.age_group ? ` (${x.age_group})` : ''}</dd><dt>Gender</dt><dd>{x.gender || '—'}</dd>
            <dt>City</dt><dd>{x.city || '—'}</dd><dt>Occupation</dt><dd>{x.occupation || '—'}</dd><dt>Registered</dt><dd>{fmtDate(x.registration_date)}</dd><dt>Notes</dt><dd>{x.notes || '—'}</dd></dl></div></div>
          <div className="card"><div className="card-h"><h2>Demographics</h2></div><div className="card-b">{Object.keys(x.demographics).length === 0 ? <div className="muted">No demographic details recorded. <Link to={`/participants/${id}/edit`}>Add some</Link></div> : <dl className="kv">
            {Object.entries(x.demographics).map(([k, v]) => <Fragment key={k}><dt>{demoLabels[k] || k.replace(/_/g, ' ')}</dt><dd>{v}</dd></Fragment>)}</dl>}</div></div>
        </div>)}

      {tab === 'history' && (
        <div className="card"><div className="card-b flush table-wrap">{!hist.data ? <Spinner /> : hist.data.length === 0 ? <Empty icon={History} title="No research participation yet">Add this participant to a study from the research page.</Empty> : (
          <table className="t"><thead><tr><th>Participation date</th><th>Research</th><th>Category</th><th>Segment</th><th>Attendance</th><th>NDA</th><th /></tr></thead><tbody>
            {hist.data.map((h) => { const signedN = h.ndas.find((n) => n.status === 'Signed'); const any = h.ndas[0]; return (
              <tr key={h.participation_id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(h.participation_date || h.start_date)}</td>
                <td><Link to={`/research/${h.study_id}`}><b>{h.title}</b></Link><div className="sub">{h.research_code} · {h.product_name || ''}{h.screen_topic ? ` · ${h.screen_topic}` : ''} · <StatusBadge status={h.study_status} /></div></td>
                <td><CategoryChip name={h.category_name} color={h.category_color} /></td><td>{h.segment_label || '—'}</td><td><AttendBadge status={h.attendance_status} /></td><td><NdaBadge status={signedN ? 'Signed' : any ? 'Pending' : 'Not Generated'} /></td>
                <td style={{ textAlign: 'right' }}>{signedN && <a className="btn sm" href={api.url(`/nda/${signedN.id}/pdf`)}><Download size={13} /> NDA</a>}</td></tr>); })}</tbody></table>)}</div></div>)}

      {tab === 'ndas' && (
        <div className="card"><div className="card-b flush table-wrap">{ndas.length === 0 ? <Empty icon={FileText} title="No NDAs">NDAs are generated per study from the research page.</Empty> : (
          <table className="t"><thead><tr><th>NDA</th><th>Research</th><th>Template</th><th>Status</th><th>Signed</th><th /></tr></thead><tbody>{ndas.map((n) => (
            <tr key={n.id}><td className="mono">{n.nda_code}</td><td><Link to={`/research/${n.study_id}`}>{n.research_code} · {n.title}</Link></td><td>v{n.template_version}</td><td><NdaBadge status={n.status} /></td><td>{n.signed_at ? `${fmtDateTime(n.signed_at)} (${n.signing_method})` : '—'}</td>
              <td style={{ textAlign: 'right' }}>{n.status === 'Signed' ? <a className="btn sm" href={api.url(`/nda/${n.id}/pdf`)}><Download size={13} /> Download PDF</a> : <Link className="btn sm primary" to={`/ndas/${n.id}/sign`}>Sign</Link>}</td></tr>))}</tbody></table>)}
          {signed.length > 0 && <div className="pager"><span>{signed.length} signed document{signed.length > 1 ? 's' : ''} stored permanently and never overwritten.</span></div>}</div></div>)}
    </>
  );
}
