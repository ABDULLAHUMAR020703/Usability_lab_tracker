import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pencil, Archive, ArchiveRestore, UserPlus, FileSignature, Download, Trash2, Users, Info, ListChecks, ClipboardList, FileBarChart, Paperclip, History, LayoutGrid, PenLine } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useMeta, useToast } from '../hooks/hooks';
import { Spinner, ErrorBox, Empty, Tabs, StatusBadge, ResultsBadge, CategoryChip, PriorityBadge, AttendBadge, NdaBadge, ConflictAlert, useConfirm, Field, Badge } from '../components/ui';
import Attachments from '../components/Attachments';
import AssignParticipant from '../components/AssignParticipant';
import { fmtDate, fmtDateTime, fmtRange } from '../utils/format';

export default function ResearchDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const setTab = (t) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { meta } = useMeta();
  const study = useFetch(`/research/${id}`);
  const parts = useFetch(`/research/${id}/participants`);
  const conflicts = useFetch(`/research/${id}/conflicts`, [study.data?.start_date, study.data?.end_date]);
  const ndas = useFetch(`/research/${id}/ndas`);
  const activity = useFetch(`/research/${id}/activity`);
  const [assign, setAssign] = useState(false);
  const [genBusy, setGenBusy] = useState(null);

  if (study.loading && !study.data) return <Spinner />;
  if (study.error) return <ErrorBox error={study.error} onRetry={study.reload} />;
  const s = study.data;
  const refreshAll = () => { study.reload(); parts.reload(); ndas.reload(); activity.reload(); conflicts.reload(); };
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); refreshAll(); } catch (e) { toast(e.message, 'error'); } };

  const setStatus = (status) => run(() => api.patch(`/research/${id}/status`, { status }), `Status set to ${status}`);
  const archive = async () => {
    if (!(await confirm({ title: 'Archive this research?', message: <>“{s.title}” will be hidden from lists and the calendar. All records, participants, NDAs and files are kept, and you can restore it at any time.</>, confirmLabel: 'Archive', danger: true }))) return;
    await run(() => api.del(`/research/${id}`), 'Research archived'); nav('/research');
  };
  const genNda = async (p) => {
    if (genBusy) return;
    setGenBusy(p.id);
    try { const n = await api.post('/nda/generate', { participation_id: p.id }); if (n.unresolved_placeholders?.length) toast(`NDA generated — template placeholders not recognised: ${n.unresolved_placeholders.join(', ')}`, 'error'); nav(`/ndas/${n.id}/sign`); } catch (e) { toast(e.message, 'error'); } finally { setGenBusy(null); }
  };
  const pendingTotal = parts.data ? parts.data.filter((p) => p.attendance_status !== 'Cancelled' && p.nda_status !== 'Signed').length : 0;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} /> }, { id: 'info', label: 'Research Information', icon: <Info size={15} /> },
    { id: 'requirements', label: 'Participant Requirements', icon: <ListChecks size={15} />, count: s.requirements.length },
    { id: 'participants', label: 'Participants', icon: <Users size={15} />, count: s.participant_count }, { id: 'ndas', label: 'NDA Documents', icon: <FileSignature size={15} />, count: ndas.data?.rows.length },
    { id: 'results', label: 'Results & Insights', icon: <FileBarChart size={15} /> }, { id: 'attachments', label: 'Attachments', icon: <Paperclip size={15} />, count: s.attachment_count },
    { id: 'activity', label: 'Activity History', icon: <History size={15} /> }];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/research">Research Tracker</Link> / {s.research_code}</div>
          <h1>{s.title} {s.archived_at && <Badge tone="red">Archived</Badge>}</h1>
          <div className="row wrap mt" style={{ marginTop: 8 }}><span className="mono muted">{s.research_code}</span><CategoryChip name={s.category_name} color={s.category_color} /><StatusBadge status={s.status} /><ResultsBadge status={s.results_status} /><PriorityBadge priority={s.priority} /><span className="muted">{fmtRange(s.start_date, s.end_date)}</span></div>
        </div>
        <div className="row"><Link className="btn" to={`/research/${id}/edit`}><Pencil size={15} /> Edit</Link>
          {s.archived_at ? <button className="btn" onClick={() => run(() => api.post(`/research/${id}/restore`), 'Research restored')}><ArchiveRestore size={15} /> Restore</button> : <button className="btn danger" onClick={archive}><Archive size={15} /> Archive</button>}</div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="stack">
          <div className="card"><div className="card-h"><h2>Research lifecycle</h2><span className="muted small">Click a stage to move this research to it</span></div><div className="card-b">
            <div className="stepper">{meta.statuses.map((st, i) => { const cur = meta.statuses.indexOf(s.status); return <button key={st} className={`step ${i < cur ? 'done' : ''} ${i === cur ? 'current' : ''}`} onClick={() => i !== cur && setStatus(st)} aria-current={i === cur}>{st}</button>; })}</div>
            <div className="muted small mt" style={{ marginTop: 12 }}>
              {{ Draft: 'Research information is being entered.', 'Review Screen': 'Review the complete information, check for gaps and correct anything.', Approved: 'Information is finalised.', Scheduled: 'Dates are confirmed.', Completed: 'The research activity has concluded. Results production is tracked separately.' }[s.status]}</div></div></div>
          <ConflictAlert conflicts={conflicts.data?.conflicts} />
          {s.status === 'Completed' && s.results_status !== 'Completed' && <div className="alert info"><FileBarChart size={18} /><div>Research is completed but results are <b>{s.results_status}</b>. <a href="#results" onClick={(e) => { e.preventDefault(); setTab('results'); }}>Update results & insights →</a></div></div>}
          {pendingTotal > 0 && s.participant_count > 0 && <div className="alert warn"><FileSignature size={18} /><div>{pendingTotal} participant{pendingTotal > 1 ? 's have' : ' has'} not signed an NDA yet. <a href="#p" onClick={(e) => { e.preventDefault(); setTab('participants'); }}>Open participants →</a></div></div>}
          <div className="grid g3">
            <div className="card"><div className="card-b"><div className="muted small">Participants</div><div style={{ fontSize: 24, fontWeight: 700 }}>{s.participant_count} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ {s.required_total} required</span></div><div className="progress mt" style={{ marginTop: 8 }}><i style={{ width: `${s.required_total ? Math.min(100, (s.participant_count / s.required_total) * 100) : 0}%` }} /></div></div></div>
            <div className="card"><div className="card-b"><div className="muted small">Signed NDAs</div><div style={{ fontSize: 24, fontWeight: 700 }}>{s.signed_nda_count}</div></div></div>
            <div className="card"><div className="card-b"><div className="muted small">Attachments</div><div style={{ fontSize: 24, fontWeight: 700 }}>{s.attachment_count}</div></div></div>
          </div>
          <div className="cols even">
            <div className="card"><div className="card-h"><h2>Summary</h2></div><div className="card-b"><dl className="kv">
              <dt>Product / Screen</dt><dd>{s.product_name || '—'}{s.screen_topic ? ` · ${s.screen_topic}` : ''}</dd><dt>Subcategory</dt><dd>{s.subcategory_name || '—'}</dd><dt>Owner</dt><dd>{s.owner}{s.team_members.length ? ` (+ ${s.team_members.join(', ')})` : ''}</dd>
              <dt>Location</dt><dd>{s.location || '—'}</dd><dt>Objective</dt><dd>{s.objective || '—'}</dd></dl></div></div>
            <div className="card"><div className="card-h"><h2>Results</h2><ResultsBadge status={s.results_status} /></div><div className="card-b"><dl className="kv"><dt>Description</dt><dd>{s.results_description || '—'}</dd><dt>Key insights</dt><dd>{s.key_insights || '—'}</dd><dt>Last updated</dt><dd>{fmtDateTime(s.results_updated_at)}</dd></dl></div></div>
          </div>
        </div>)}

      {tab === 'info' && (
        <div className="card"><div className="card-b"><dl className="kv">
          <dt>Research ID</dt><dd className="mono">{s.research_code}</dd><dt>Title</dt><dd>{s.title}</dd><dt>Description</dt><dd>{s.description || '—'}</dd><dt>Objective</dt><dd>{s.objective || '—'}</dd>
          <dt>Category</dt><dd>{s.category_name}</dd><dt>Subcategory</dt><dd>{s.subcategory_name || '—'}</dd><dt>Product</dt><dd>{s.product_name || '—'}</dd><dt>Screen / Topic</dt><dd>{s.screen_topic || '—'}</dd>
          <dt>Research owner</dt><dd>{s.owner}</dd><dt>Team members</dt><dd>{s.team_members.join(', ') || '—'}</dd><dt>Priority</dt><dd>{s.priority}</dd><dt>Location</dt><dd>{s.location || '—'}</dd>
          <dt>Start date</dt><dd>{fmtDate(s.start_date)}</dd><dt>End date</dt><dd>{fmtDate(s.end_date)}</dd><dt>Status</dt><dd>{s.status}</dd><dt>Notes</dt><dd>{s.notes || '—'}</dd>
          <dt>Created</dt><dd>{fmtDateTime(s.created_at)}</dd><dt>Last updated</dt><dd>{fmtDateTime(s.updated_at)}</dd></dl></div></div>)}

      {tab === 'requirements' && (
        <div className="card"><div className="card-h"><div><h2>Required sample: {s.required_total} participants</h2><div className="muted small">Agency supplies participants; segments define who is needed.</div></div><Link className="btn sm" to={`/research/${id}/edit`}><Pencil size={13} /> Edit segments</Link></div>
          <div className="card-b flush">{s.requirements.length === 0 ? <Empty icon={ClipboardList} title="No segments defined">Add segments with counts and demographics in the research editor.</Empty> : (
            <table className="t"><thead><tr><th>Segment</th><th>Criteria</th><th>Required</th><th>Assigned</th><th>Attended</th><th style={{ width: 160 }}>Progress</th></tr></thead><tbody>
              {s.requirements.map((r) => <tr key={r.id}><td className="title">{r.label || `Segment ${r.id}`}</td>
                <td className="small">{[r.age_min || r.age_max ? `Age ${r.age_min ?? '?'}–${r.age_max ?? '?'}` : null, r.customer_type, r.digital_behaviour, r.gender, r.city, r.other_criteria].filter(Boolean).join(' · ') || 'Any'}</td>
                <td>{r.required_count}</td><td>{r.assigned_count}</td><td>{r.attended_count}</td><td><div className="progress"><i style={{ width: `${r.required_count ? Math.min(100, (r.assigned_count / r.required_count) * 100) : 0}%` }} /></div></td></tr>)}
              <tr><td><b>Total</b></td><td /><td><b>{s.required_total}</b></td><td><b>{s.requirements.reduce((a, r) => a + r.assigned_count, 0)}</b>{s.unassigned_count > 0 && <span className="muted small"> (+{s.unassigned_count} no segment)</span>}</td><td><b>{s.requirements.reduce((a, r) => a + r.attended_count, 0)}</b></td><td /></tr></tbody></table>)}</div></div>)}

      {tab === 'participants' && (
        <div className="card"><div className="card-h"><h2>Participants ({parts.data?.length ?? 0})</h2><button className="btn primary sm" onClick={() => setAssign(true)}><UserPlus size={14} /> Add participant</button></div>
          <div className="card-b flush table-wrap">{!parts.data ? <Spinner /> : parts.data.length === 0 ? <Empty icon={Users} title="No participants assigned">Select an existing participant or register one supplied by the agency.</Empty> : (
            <table className="t"><thead><tr><th>Participant</th><th>Segment</th><th>Date</th><th>Attendance</th><th>NDA</th><th /></tr></thead><tbody>
              {parts.data.map((p) => <tr key={p.id}>
                <td><Link to={`/participants/${p.participant_id}`}><b>{p.participant_code}</b> · {p.full_name}</Link><div className="sub">{p.phone}{p.age_group ? ` · ${p.age_group}` : ''}</div></td>
                <td><select className="pill-select" value={p.requirement_id || ''} onChange={(e) => run(() => api.patch(`/participation/${p.id}`, { requirement_id: e.target.value || null }))} aria-label="Segment"><option value="">—</option>{s.requirements.map((r) => <option key={r.id} value={r.id}>{r.label || r.id}</option>)}</select></td>
                <td><input type="date" style={{ width: 140 }} value={p.participation_date || ''} min={s.start_date} max={s.end_date} onChange={(e) => run(() => api.patch(`/participation/${p.id}`, { participation_date: e.target.value || null }))} aria-label="Participation date" /></td>
                <td><select className="pill-select" value={p.attendance_status} onChange={(e) => run(() => api.patch(`/participation/${p.id}`, { attendance_status: e.target.value }))} aria-label="Attendance">{meta.attendance_statuses.map((a) => <option key={a}>{a}</option>)}</select></td>
                <td><NdaBadge status={p.nda_status} /></td>
                <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                  {p.signed_nda_id && <a className="btn sm" href={api.url(`/nda/${p.signed_nda_id}/pdf`)}><Download size={13} /> Signed PDF</a>}
                  {p.pending_nda_id ? <Link className="btn sm primary" to={`/ndas/${p.pending_nda_id}/sign`}><PenLine size={13} /> Continue signing</Link> : <button className="btn sm" disabled={!!genBusy} onClick={() => genNda(p)}><FileSignature size={13} /> {genBusy === p.id ? 'Generating…' : p.signed_nda_id ? 'New NDA' : 'Generate NDA'}</button>}
                  <button className="btn sm icon danger" aria-label="Remove from study" onClick={async () => { if (await confirm({ title: 'Remove from study?', message: `Remove ${p.full_name} from this research? Their participant profile is kept.`, confirmLabel: 'Remove', danger: true })) run(() => api.del(`/participation/${p.id}`), 'Participant removed'); }}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table>)}</div></div>)}

      {tab === 'ndas' && (
        <div className="card"><div className="card-b flush table-wrap">{!ndas.data ? <Spinner /> : ndas.data.rows.length === 0 ? <Empty icon={FileSignature} title="No NDAs yet">Generate an NDA from the Participants tab.</Empty> : (
          <table className="t"><thead><tr><th>NDA</th><th>Participant</th><th>Template</th><th>Status</th><th>Signed</th><th /></tr></thead><tbody>{ndas.data.rows.map((n) => <tr key={n.id}>
            <td className="mono">{n.nda_code}</td><td><Link to={`/participants/${n.participant_id}`}>{n.participant_code} · {n.participant_name}</Link></td><td>v{n.template_version}</td><td><NdaBadge status={n.status} /></td><td>{n.signed_at ? `${fmtDateTime(n.signed_at)} (${n.signing_method})` : '—'}</td>
            <td style={{ textAlign: 'right' }}>{n.status === 'Signed' ? <a className="btn sm" href={api.url(`/nda/${n.id}/pdf`)}><Download size={13} /> Download PDF</a> : <Link className="btn sm primary" to={`/ndas/${n.id}/sign`}>Sign</Link>}</td></tr>)}</tbody></table>)}</div></div>)}

      {tab === 'results' && <ResultsPanel study={s} onSaved={refreshAll} />}
      {tab === 'attachments' && <Attachments studyId={s.id} />}

      {tab === 'activity' && (
        <div className="card"><div className="card-b">{!activity.data ? <Spinner /> : activity.data.length === 0 ? <div className="muted">No activity recorded.</div> : <div className="timeline">{activity.data.map((a) => (
          <div className="tl" key={a.id}><div className="dotc" /><div className="grow"><b>{a.action}</b>{a.details && <div className="muted small" style={{ wordBreak: 'break-word' }}>{a.details}</div>}</div><div className="small faint" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</div></div>))}</div>}</div></div>)}

      {assign && <AssignParticipant study={s} existingIds={(parts.data || []).map((p) => p.participant_id)} onClose={() => setAssign(false)} onDone={() => { setAssign(false); refreshAll(); }} />}
    </>
  );
}

function ResultsPanel({ study, onSaved }) {
  const { meta } = useMeta();
  const toast = useToast();
  const [f, setF] = useState({ results_status: study.results_status, results_description: study.results_description || '', key_insights: study.key_insights || '', results_completed_at: study.results_completed_at || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.put(`/research/${study.id}/results`, { ...f, results_completed_at: f.results_status === 'Completed' ? f.results_completed_at || undefined : undefined }); toast('Results updated'); onSaved(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="card"><div className="card-h"><div><h2>Results production</h2><div className="muted small">Tracked separately from the research lifecycle — completing the research does not complete the results.</div></div><ResultsBadge status={study.results_status} /></div>
        <div className="card-b"><div className="grid g2">
          <Field label="Results production status"><select value={f.results_status} onChange={(e) => setF({ ...f, results_status: e.target.value })}>{meta.results_statuses.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Results completion date" hint={f.results_status === 'Completed' ? 'Defaults to today' : 'Set when status is Completed'}><input type="date" disabled={f.results_status !== 'Completed'} value={f.results_completed_at} onChange={(e) => setF({ ...f, results_completed_at: e.target.value })} /></Field>
          <Field label="Results description" className="span-all"><textarea value={f.results_description} onChange={(e) => setF({ ...f, results_description: e.target.value })} placeholder="Where do the results stand? What has been delivered?" /></Field>
          <Field label="Key insights summary" className="span-all" hint="Optional"><textarea style={{ minHeight: 110 }} value={f.key_insights} onChange={(e) => setF({ ...f, key_insights: e.target.value })} /></Field>
        </div><div className="row spread mt" style={{ marginTop: 14 }}><span className="small muted">Last updated: {fmtDateTime(study.results_updated_at)}</span><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save results'}</button></div></div></div>
      <h2>Attachments</h2>
      <Attachments studyId={study.id} />
    </div>
  );
}
