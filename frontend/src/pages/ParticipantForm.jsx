import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useFetch, useToast } from '../hooks/hooks';
import { PageHeader, Spinner, ErrorBox, Modal } from '../components/ui';
import { ParticipantFields, EMPTY_PARTICIPANT, savePaticipant } from '../components/ParticipantFields';

export default function ParticipantForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error } = useFetch(id ? `/participants/${id}` : null);
  const [f, setF] = useState(EMPTY_PARTICIPANT);
  const [errors, setErrors] = useState({});
  const [dups, setDups] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ ...EMPTY_PARTICIPANT, ...data, demographics: data.demographics || {} }); }, [data]);
  if (id && loading) return <Spinner />;
  if (id && error) return <ErrorBox error={error} />;

  const submit = async (force = false) => {
    setBusy(true); setErrors({});
    try {
      const saved = await savePaticipant(id, f, force);
      toast(id ? 'Participant updated' : `Participant ${saved.participant_code} registered`);
      nav(`/participants/${saved.id}`);
    } catch (e) {
      if (e.status === 409 && e.data.duplicates) setDups(e.data.duplicates);
      else { setErrors(e.data?.errors || {}); toast(e.message, 'error'); }
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={id ? `Edit ${data.participant_code}` : 'Register participant'} subtitle="Each person has one permanent Participant ID and can join many studies."
        crumbs={[{ label: 'Participants', to: '/participants' }, { label: id ? data.participant_code : 'Register' }]} />
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="card-b"><ParticipantFields f={f} setF={setF} errors={errors} /></div>
        <div className="modal-f" style={{ borderRadius: '0 0 12px 12px' }}><button type="button" className="btn" onClick={() => nav(-1)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Register participant'}</button></div>
      </form>
      {dups && (
        <Modal title="Possible duplicate participant" onClose={() => setDups(null)}
          footer={<><button className="btn" onClick={() => setDups(null)}>Go back</button><button className="btn primary" onClick={() => { setDups(null); submit(true); }}>This is a different person — save anyway</button></>}>
          <div className="alert warn"><AlertTriangle size={18} /><div>Someone with the same phone number or name already exists. Reuse the existing profile if it is the same person, so their study history stays in one place.</div></div>
          <div className="stack mt">{dups.map((d) => <div className="seg-card row spread" key={d.id}><div><b>{d.participant_code} · {d.full_name}</b><div className="small muted">{d.phone}{d.city ? ` · ${d.city}` : ''} — {d.reason}</div></div><Link className="btn sm" to={`/participants/${d.id}`}>Open profile</Link></div>)}</div>
        </Modal>)}
    </>
  );
}
