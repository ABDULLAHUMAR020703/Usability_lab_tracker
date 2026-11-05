import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { api, qs } from '../services/api';
import { useDebounced, useFetch, useMeta, useToast } from '../hooks/hooks';
import { Modal, Field, Spinner } from './ui';
import { ParticipantFields, EMPTY_PARTICIPANT } from './ParticipantFields';

export default function AssignParticipant({ study, onClose, onDone, existingIds }) {
  const { meta } = useMeta();
  const toast = useToast();
  const [mode, setMode] = useState('existing');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, loading } = useFetch('/participants' + qs({ q: dq, pageSize: 8 }));
  const [pick, setPick] = useState(null);
  const [np, setNp] = useState(EMPTY_PARTICIPANT);
  const [npErrors, setNpErrors] = useState({});
  const [dups, setDups] = useState(null);
  const [opts, setOpts] = useState({ requirement_id: '', participation_date: '', attendance_status: 'Expected' });
  const [busy, setBusy] = useState(false);

  const save = async (force = false) => {
    setBusy(true); setNpErrors({});
    const base = { ...opts, requirement_id: opts.requirement_id || null, participation_date: opts.participation_date || null };
    try {
      if (mode === 'existing') { if (!pick) { toast('Select a participant first', 'error'); setBusy(false); return; } await api.post(`/research/${study.id}/participants`, { ...base, participant_id: pick.id }); }
      else await api.post(`/research/${study.id}/participants`, { ...base, new_participant: { ...np, age: np.age === '' ? null : +np.age }, force });
      toast('Participant assigned to this study'); onDone();
    } catch (e) {
      if (e.status === 409 && e.data.duplicates) setDups(e.data.duplicates);
      else { setNpErrors(e.data?.errors || {}); toast(e.message, 'error'); }
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Add participant to ${study.research_code}`} size="wide" onClose={onClose} dismissable={false}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Assign to study'}</button></>}>
      <div className="stack">
        <div className="seg-toggle" style={{ alignSelf: 'flex-start' }}><button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>Existing participant</button><button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Register new participant</button></div>

        {mode === 'existing' ? (
          <div className="stack">
            <div className="search" style={{ maxWidth: 'none' }}><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, ID or city…" autoFocus /></div>
            {loading && !data ? <Spinner /> : (
              <div className="card"><table className="t"><tbody>
                {data?.rows.length === 0 && <tr><td className="muted">No participants found. Use “Register new participant”.</td></tr>}
                {data?.rows.map((p) => {
                  const already = existingIds.includes(p.id);
                  return <tr key={p.id} className={already ? '' : 'click'} onClick={() => !already && setPick(p)} style={pick?.id === p.id ? { background: 'var(--primary-50)' } : already ? { opacity: .5 } : null}>
                    <td><input type="radio" readOnly checked={pick?.id === p.id} disabled={already} /></td><td className="mono">{p.participant_code}</td><td><div className="title">{p.full_name}</div><div className="sub">{p.phone}{p.city ? ` · ${p.city}` : ''}</div></td>
                    <td>{p.age_group || '—'}</td><td>{p.customer_type || '—'}</td><td className="small muted">{already ? 'Already in this study' : `${p.study_count} past ${p.study_count === 1 ? 'study' : 'studies'}`}</td></tr>;
                })}</tbody></table></div>)}
          </div>
        ) : (
          <>
            {dups && <div className="alert warn"><AlertTriangle size={18} /><div className="grow"><b>Possible duplicate:</b> {dups.map((d) => <div key={d.id}>{d.participant_code} {d.full_name} ({d.phone}) — {d.reason} · <Link to={`/participants/${d.id}`} target="_blank">view</Link></div>)}
              <div className="row mt"><button className="btn sm" onClick={() => { setPick(dups[0]); setMode('existing'); setDups(null); }}>Use existing {dups[0].participant_code}</button><button className="btn sm primary" onClick={() => { setDups(null); save(true); }}>Different person — create anyway</button></div></div></div>}
            <ParticipantFields f={np} setF={setNp} errors={npErrors} />
          </>)}

        <h3>Participation details</h3>
        <div className="grid g3">
          <Field label="Sample segment"><select value={opts.requirement_id} onChange={(e) => setOpts({ ...opts, requirement_id: e.target.value })}><option value="">Not assigned to a segment</option>
            {study.requirements.map((r) => <option key={r.id} value={r.id}>{r.label || `Segment ${r.id}`} ({r.assigned_count}/{r.required_count})</option>)}</select></Field>
          <Field label="Participation date" hint="Optional — used to detect participant clashes"><input type="date" value={opts.participation_date} min={study.start_date} max={study.end_date} onChange={(e) => setOpts({ ...opts, participation_date: e.target.value })} /></Field>
          <Field label="Attendance"><select value={opts.attendance_status} onChange={(e) => setOpts({ ...opts, attendance_status: e.target.value })}>{meta.attendance_statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
      </div>
    </Modal>
  );
}
