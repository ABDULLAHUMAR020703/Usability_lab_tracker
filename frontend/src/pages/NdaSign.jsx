import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import { CheckCircle2, Download, Eraser, Maximize2, PenLine, Type, ShieldCheck, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useToast } from '../hooks/hooks';
import { Spinner, ErrorBox, PageHeader, Field, useConfirm } from '../components/ui';
import { fmtDateTime } from '../utils/format';

export default function NdaSign() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: nda, loading, error, reload } = useFetch(`/nda/${id}`);
  const [method, setMethod] = useState('drawn');
  const [view, setView] = useState('pdf');
  const [read, setRead] = useState(false);
  const [consent, setConsent] = useState(false);
  const [typed, setTyped] = useState('');
  const [confirmedImg, setConfirmedImg] = useState(null);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const canvas = useRef();
  const pad = useRef();

  useEffect(() => {
    if (!canvas.current || method !== 'drawn' || confirmedImg || nda?.status === 'Signed') return;
    const c = canvas.current;
    const resize = () => {
      const data = pad.current && !pad.current.isEmpty() ? pad.current.toData() : null;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
      c.getContext('2d').scale(ratio, ratio);
      pad.current?.clear();
      if (data) pad.current.fromData(data);
    };
    pad.current = new SignaturePad(c, { penColor: '#111827', minWidth: 0.8, maxWidth: 2.6 });
    pad.current.addEventListener('endStroke', () => setEmpty(pad.current.isEmpty()));
    resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); pad.current?.off(); };
  }, [method, confirmedImg, nda?.status]);

  if (loading && !nda) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  if (nda.status === 'Signed') {
    return (
      <>
        <PageHeader title={`${nda.nda_code} — signed`} crumbs={[{ label: 'NDA Management', to: '/ndas' }, { label: nda.nda_code }]} />
        <div className="card"><div className="card-b stack">
          <div className="alert ok"><CheckCircle2 size={18} /><div>Signed by <b>{nda.signed_name}</b> ({nda.signing_method === 'drawn' ? 'drawn signature' : 'typed name'}) on {fmtDateTime(nda.signed_at)}. The signed PDF is stored permanently and cannot be overwritten.</div></div>
          <div className="row wrap"><a className="btn primary" href={api.url(`/nda/${id}/pdf`)}><Download size={15} /> Download signed PDF</a><Link className="btn" to={`/research/${nda.study_id}?tab=participants`}>Back to research</Link><Link className="btn" to={`/participants/${nda.participant_id}`}>Participant profile</Link></div>
          <iframe className="doc-frame" title="Signed NDA" src={api.url(`/nda/${id}/pdf?inline=1`)} />
        </div></div>
      </>
    );
  }

  const confirmDrawn = () => {
    if (!pad.current || pad.current.isEmpty()) { toast('Please draw a signature first', 'error'); return; }
    setConfirmedImg(pad.current.toDataURL('image/png'));
  };
  const ready = read && consent && ((method === 'drawn' && confirmedImg) || (method === 'typed' && typed.trim().length >= 3));

  const submit = async () => {
    if (!(await confirm({ title: 'Sign this NDA?', message: <>You are signing <b>{nda.nda_code}</b> for <b>{nda.participant.full_name}</b>. A signed PDF will be created and stored permanently; it cannot be changed afterwards.</>, confirmLabel: 'Sign document' }))) return;
    setBusy(true);
    try {
      await api.post(`/nda/${id}/sign`, { method, signature_data: method === 'drawn' ? confirmedImg : undefined, typed_name: method === 'typed' ? typed : undefined, read_confirmed: read, consent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast('NDA signed and stored'); reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="NDA signing" subtitle={`${nda.participant.full_name} (${nda.participant_code}) · ${nda.research_code} ${nda.research_title} · template v${nda.template_version}`}
        crumbs={[{ label: 'NDA Management', to: '/ndas' }, { label: nda.nda_code }]}>
        <a className="btn" target="_blank" rel="noreferrer" href={api.url(`/nda/${id}/document`)}><Maximize2 size={15} /> Open full screen</a>
        <button className="btn danger" onClick={async () => { if (await confirm({ title: 'Discard this pending NDA?', message: 'The unsigned draft is deleted. You can generate a new one at any time.', confirmLabel: 'Discard', danger: true })) { await api.del(`/nda/${id}`); toast('Pending NDA discarded'); nav(`/research/${nda.study_id}?tab=participants`); } }}>Discard draft</button>
      </PageHeader>
      <div className="sign-wrap">
        <div>
          <div className="row spread" style={{ marginBottom: 8 }}><span className="muted small">Step 1 — The participant reads the whole document below.</span>
            {nda.draft_html && <div className="seg-toggle"><button className={view === 'pdf' ? 'on' : ''} onClick={() => setView('pdf')}>Document (PDF)</button><button className={view === 'text' ? 'on' : ''} onClick={() => setView('text')}>Reading view</button></div>}</div>
          {view === 'text' && nda.draft_html
            ? <div className="doc-html" dangerouslySetInnerHTML={{ __html: nda.draft_html }} />
            : <iframe className="doc-frame" title="NDA document" src={api.url(`/nda/${id}/document`) + '#view=FitH'} />}
        </div>
        <div className="card" style={{ position: 'sticky', top: 0 }}><div className="card-b stack">
          <label className="check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /><span><b>I have read the entire document</b><div className="small muted">Scroll through every page before ticking this box.</div></span></label>

          <div><div className="muted small" style={{ marginBottom: 8 }}>Step 2 — Choose how to sign.</div>
            <div className="seg-toggle"><button className={method === 'drawn' ? 'on' : ''} onClick={() => setMethod('drawn')}><PenLine size={14} style={{ verticalAlign: -2 }} /> Draw signature</button><button className={method === 'typed' ? 'on' : ''} onClick={() => setMethod('typed')}><Type size={14} style={{ verticalAlign: -2 }} /> Type name</button></div></div>

          {method === 'drawn' ? (
            confirmedImg ? (
              <div className="stack"><div style={{ border: '2px solid var(--green)', borderRadius: 12, padding: 8, background: '#fff' }}><img src={confirmedImg} alt="Confirmed signature" style={{ width: '100%', maxHeight: 170, objectFit: 'contain' }} /></div>
                <div className="row spread"><span className="badge b-green"><CheckCircle2 size={13} /> Signature confirmed</span><button className="btn sm" onClick={() => { setConfirmedImg(null); setEmpty(true); }}><RotateCcw size={13} /> Redo</button></div></div>
            ) : (
              <div className="stack"><canvas ref={canvas} className="sig-pad" aria-label="Signature pad — draw with mouse or finger" />
                <div className="row spread"><button className="btn sm" onClick={() => { pad.current?.clear(); setEmpty(true); }}><Eraser size={13} /> Clear</button><button className="btn sm primary" disabled={empty} onClick={confirmDrawn}>Preview & confirm signature</button></div>
                <div className="small muted">Sign inside the box using a mouse, pen or touchscreen.</div></div>)
          ) : (
            <div className="stack"><Field label="Full legal name" hint="Type your full name exactly as it should appear on the document."><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={nda.participant.full_name} autoComplete="off" /></Field>
              <div className="sig-typed" aria-label="Typed signature preview">{typed || <span className="faint" style={{ fontFamily: 'var(--font)', fontSize: 14 }}>Preview appears here</span>}</div></div>)}

          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><b>I intend to sign this document electronically</b><div className="small muted">{nda.consent_text}</div></span></label>
          <button className="btn primary" style={{ justifyContent: 'center', padding: 12 }} disabled={!ready || busy} onClick={submit}><ShieldCheck size={16} /> {busy ? 'Generating signed PDF…' : 'Sign & generate PDF'}</button>
          <div className="small muted">The signed PDF stores the signing time, method, document fingerprint and consent statement. Legal validity is determined by the company’s approved e-signing process, not by this software.</div>
        </div></div>
      </div>
    </>
  );
}
