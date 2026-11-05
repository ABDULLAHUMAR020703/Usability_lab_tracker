import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { api } from '../services/api';
import { useMeta, useToast, useDebounced } from '../hooks/hooks';
import { Field, ConflictAlert } from './ui';

const EMPTY = { title: '', description: '', objective: '', category_id: '', subcategory_id: '', product_id: '', screen_topic: '', owner: '', team_text: '', priority: 'Normal', location: '', start_date: '', end_date: '', status: 'Draft', notes: '', requirements: [] };
const EMPTY_REQ = { label: '', required_count: 5, age_min: '', age_max: '', customer_type: '', digital_behaviour: '', gender: '', city: '', other_criteria: '' };

export default function ResearchForm({ initial, onSaved, onCancel, saveLabel = 'Save research' }) {
  const { meta } = useMeta();
  const toast = useToast();
  const [f, setF] = useState(() => ({ ...EMPTY, ...initial, team_text: (initial?.team_members || []).join(', '), requirements: (initial?.requirements || []).map((r) => ({ ...r })) }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const editingId = initial?.id;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const err = (k) => errors[k];

  const category = meta?.categories.find((c) => String(c.id) === String(f.category_id));
  const subs = (category?.subcategories || []).filter((s) => s.active || s.id === f.subcategory_id);
  const team = useMemo(() => f.team_text.split(',').map((s) => s.trim()).filter(Boolean), [f.team_text]);
  const total = f.requirements.reduce((a, r) => a + (parseInt(r.required_count, 10) || 0), 0);

  const probe = useDebounced(JSON.stringify([f.start_date, f.end_date, f.owner, team]), 400);
  useEffect(() => {
    if (!f.start_date || !f.end_date || f.end_date < f.start_date) { setConflicts([]); return; }
    api.post('/research/conflicts/check', { study_id: editingId, start_date: f.start_date, end_date: f.end_date, owner: f.owner, team_members: team }).then((r) => setConflicts(r.conflicts)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, editingId]);

  const setReq = (i, k, v) => setF((x) => ({ ...x, requirements: x.requirements.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  const validate = () => {
    const e = {};
    if (!f.title.trim()) e.title = 'Research title is required';
    if (!f.category_id) e.category_id = 'Select a category';
    if (!f.owner.trim()) e.owner = 'Research owner is required';
    if (!f.start_date) e.start_date = 'Start date is required';
    if (!f.end_date) e.end_date = 'End date is required';
    if (f.start_date && f.end_date && f.end_date < f.start_date) e.end_date = 'End date cannot be before the start date';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast('Please fix the highlighted fields', 'error'); return; }
    setBusy(true);
    const body = { ...f, team_members: team, category_id: +f.category_id, subcategory_id: f.subcategory_id ? +f.subcategory_id : null, product_id: f.product_id ? +f.product_id : null,
      requirements: f.requirements.map((r) => ({ ...r, required_count: parseInt(r.required_count, 10) || 0, age_min: r.age_min === '' ? null : +r.age_min, age_max: r.age_max === '' ? null : +r.age_max })) };
    delete body.team_text;
    try {
      const saved = editingId ? await api.put(`/research/${editingId}`, body) : await api.post('/research', body);
      toast(editingId ? 'Research updated' : `Research ${saved.research_code} created`);
      onSaved(saved);
    } catch (x) {
      setErrors(x.data?.errors || {});
      toast(x.message, 'error');
    } finally { setBusy(false); }
  };

  if (!meta) return null;
  const opt = (type) => (meta.options[type] || []);

  return (
    <form onSubmit={submit} noValidate className="stack">
      <div className="card"><div className="card-h"><h2>Basic information</h2></div><div className="card-b">
        <div className="grid g2">
          <Field label="Research title" required error={err('title')} className="span2"><input className={err('title') ? 'err' : ''} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Home Screen Eye Tracking" autoFocus /></Field>
          <Field label="Research category" required error={err('category_id')}>
            <select className={err('category_id') ? 'err' : ''} value={f.category_id} onChange={(e) => setF((x) => ({ ...x, category_id: e.target.value, subcategory_id: '' }))}>
              <option value="">Select category…</option>{meta.categories.filter((c) => c.active || String(c.id) === String(f.category_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></Field>
          <Field label="Research subcategory" error={err('subcategory_id')}>
            <select value={f.subcategory_id || ''} onChange={(e) => set('subcategory_id', e.target.value)} disabled={!category}><option value="">{category ? 'Select subcategory…' : 'Choose a category first'}</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Product">
            <select value={f.product_id || ''} onChange={(e) => set('product_id', e.target.value)}><option value="">Select product…</option>{meta.products.filter((p) => p.active || String(p.id) === String(f.product_id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Screen / Topic" hint="What is actually being researched — type freely or pick a suggestion"><input list="dl-screens" value={f.screen_topic || ''} onChange={(e) => set('screen_topic', e.target.value)} placeholder="e.g. Home Screen" /><datalist id="dl-screens">{opt('screen_suggestion').map((s) => <option key={s} value={s} />)}</datalist></Field>
          <Field label="Research owner" required error={err('owner')}><input list="dl-owners" className={err('owner') ? 'err' : ''} value={f.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Name of the person responsible" /><datalist id="dl-owners">{opt('owner').map((s) => <option key={s} value={s} />)}</datalist></Field>
          <Field label="Team members" hint="Optional — separate names with commas"><input value={f.team_text} onChange={(e) => set('team_text', e.target.value)} /></Field>
          <Field label="Priority"><select value={f.priority} onChange={(e) => set('priority', e.target.value)}>{meta.priorities.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Research location"><input value={f.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Usability Lab, Lahore" /></Field>
          <Field label="Start date" required error={err('start_date')}><input type="date" className={err('start_date') ? 'err' : ''} value={f.start_date} onChange={(e) => setF((x) => ({ ...x, start_date: e.target.value, end_date: x.end_date && x.end_date >= e.target.value ? x.end_date : e.target.value }))} /></Field>
          <Field label="End date" required error={err('end_date')} hint="One study = one overall date range"><input type="date" className={err('end_date') ? 'err' : ''} value={f.end_date} min={f.start_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
          <Field label="Research status"><select value={f.status} onChange={(e) => set('status', e.target.value)}>{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <div className="span-all"><ConflictAlert conflicts={conflicts} /></div>
          <Field label="Research description" className="span-all"><textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Research objective" className="span-all"><textarea value={f.objective || ''} onChange={(e) => set('objective', e.target.value)} /></Field>
          <Field label="Additional notes" className="span-all"><textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      </div></div>

      <div className="card"><div className="card-h"><div><h2>Participant requirements</h2><div className="muted small">Recruitment is handled by the agency — record the sample you need, by segment.</div></div>
        <div className="row"><span className="badge b-purple"><Users size={13} /> Total required: {total}</span><button type="button" className="btn sm" onClick={() => setF((x) => ({ ...x, requirements: [...x.requirements, { ...EMPTY_REQ, label: `Segment ${x.requirements.length + 1}` }] }))}><Plus size={14} /> Add segment</button></div></div>
        <div className="card-b stack">
          {f.requirements.length === 0 && <div className="muted">No segments yet. Add one or more segments to define the required sample.</div>}
          {f.requirements.map((r, i) => (
            <div key={i} className="seg-card">
              <div className="row spread mb" style={{ marginBottom: 10 }}><b>Segment {i + 1}</b><button type="button" className="btn sm danger" onClick={() => setF((x) => ({ ...x, requirements: x.requirements.filter((_, j) => j !== i) }))}><Trash2 size={13} /> Remove</button></div>
              <div className="grid g4">
                <Field label="Segment name"><input value={r.label || ''} onChange={(e) => setReq(i, 'label', e.target.value)} /></Field>
                <Field label="Required count" error={err(`requirements.${i}.required_count`)}><input type="number" min="0" value={r.required_count} onChange={(e) => setReq(i, 'required_count', e.target.value)} /></Field>
                <Field label="Age from"><input type="number" min="0" value={r.age_min ?? ''} onChange={(e) => setReq(i, 'age_min', e.target.value)} /></Field>
                <Field label="Age to" error={err(`requirements.${i}.age_max`)}><input type="number" min="0" value={r.age_max ?? ''} onChange={(e) => setReq(i, 'age_max', e.target.value)} /></Field>
                <Field label="Customer type"><select value={r.customer_type || ''} onChange={(e) => setReq(i, 'customer_type', e.target.value)}><option value="">Any</option>{opt('customer_type').map((o) => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Digital behaviour"><select value={r.digital_behaviour || ''} onChange={(e) => setReq(i, 'digital_behaviour', e.target.value)}><option value="">Any</option>{opt('digital_behaviour').map((o) => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Gender"><select value={r.gender || ''} onChange={(e) => setReq(i, 'gender', e.target.value)}><option value="">Any</option>{opt('gender').map((o) => <option key={o}>{o}</option>)}</select></Field>
                <Field label="City"><input value={r.city || ''} onChange={(e) => setReq(i, 'city', e.target.value)} placeholder="Any" /></Field>
                <Field label="Other criteria" className="span-all"><input value={r.other_criteria || ''} onChange={(e) => setReq(i, 'other_criteria', e.target.value)} placeholder="e.g. uses bill payments at least weekly" /></Field>
              </div>
            </div>
          ))}
        </div></div>

      <div className="row spread"><span className="muted small">Fields marked <span style={{ color: 'var(--red)' }}>*</span> are required. Overlaps are flagged but never block saving.</span>
        <div className="row"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button></div></div>
    </form>
  );
}
