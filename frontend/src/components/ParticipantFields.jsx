import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useMeta, useToast } from '../hooks/hooks';
import { Field } from './ui';

export const EMPTY_PARTICIPANT = { full_name: '', phone: '', email: '', age: '', age_group: '', gender: '', city: '', occupation: '', registration_date: '', notes: '', demographics: {} };

// Shared by the Participant Registration page and the "create new" tab in the assign-participant dialog.
export function ParticipantFields({ f, setF, errors = {} }) {
  const { meta } = useMeta();
  const [custom, setCustom] = useState({ key: '', value: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const demo = (k, v) => setF((x) => ({ ...x, demographics: { ...x.demographics, [k]: v } }));
  const o = (t) => meta?.options[t] || [];
  const known = ['customer_type', 'customer_segment', 'digital_behaviour', 'digitally_native', 'product_usage'];
  const extra = Object.keys(f.demographics || {}).filter((k) => !known.includes(k));
  const sel = (k, opts) => (
    <select value={f.demographics?.[k] || ''} onChange={(e) => demo(k, e.target.value)}><option value="">Not specified</option>{opts.map((x) => <option key={x}>{x}</option>)}
      {f.demographics?.[k] && !opts.includes(f.demographics[k]) && <option>{f.demographics[k]}</option>}</select>);
  return (
    <div className="stack">
      <div className="grid g2">
        <Field label="Full name" required error={errors.full_name}><input className={errors.full_name ? 'err' : ''} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
        <Field label="Phone number" required error={errors.phone}><input type="tel" className={errors.phone ? 'err' : ''} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03xx-xxxxxxx" /></Field>
        <Field label="Email address" error={errors.email} hint="Optional"><input type="email" className={errors.email ? 'err' : ''} value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Age" error={errors.age}><input type="number" min="0" max="120" value={f.age ?? ''} onChange={(e) => set('age', e.target.value)} /></Field>
        <Field label="Age group" hint="Auto-filled from age if left blank"><select value={f.age_group || ''} onChange={(e) => set('age_group', e.target.value)}><option value="">Auto</option>{o('age_group').map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Gender" hint="Optional"><select value={f.gender || ''} onChange={(e) => set('gender', e.target.value)}><option value="">Not specified</option>{o('gender').map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="City"><input list="dl-cities" value={f.city || ''} onChange={(e) => set('city', e.target.value)} /><datalist id="dl-cities">{o('city').map((x) => <option key={x} value={x} />)}</datalist></Field>
        <Field label="Occupation"><input value={f.occupation || ''} onChange={(e) => set('occupation', e.target.value)} /></Field>
        <Field label="Registration date" error={errors.registration_date} hint="Defaults to today"><input type="date" value={f.registration_date || ''} onChange={(e) => set('registration_date', e.target.value)} /></Field>
      </div>
      <h3 style={{ marginTop: 6 }}>Demographics</h3>
      <div className="grid g2">
        <Field label="Customer type">{sel('customer_type', o('customer_type'))}</Field>
        <Field label="Customer segment">{o('customer_segment').length ? sel('customer_segment', o('customer_segment')) : <input value={f.demographics?.customer_segment || ''} onChange={(e) => demo('customer_segment', e.target.value)} placeholder="Free text (or add options in Settings)" />}</Field>
        <Field label="Digital behaviour">{sel('digital_behaviour', o('digital_behaviour'))}</Field>
        <Field label="Digitally native">{sel('digitally_native', o('digital_native'))}</Field>
        <Field label="Product usage" className="span2"><input value={f.demographics?.product_usage || ''} onChange={(e) => demo('product_usage', e.target.value)} placeholder="e.g. Bill payments weekly, money transfer monthly" /></Field>
        {extra.map((k) => <Field key={k} label={k}><input value={f.demographics[k]} onChange={(e) => demo(k, e.target.value)} /></Field>)}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Custom demographic field"><input value={custom.key} onChange={(e) => setCustom({ ...custom, key: e.target.value })} placeholder="Field name" /></Field>
        <Field label=" "><input value={custom.value} onChange={(e) => setCustom({ ...custom, value: e.target.value })} placeholder="Value" /></Field>
        <button type="button" className="btn" disabled={!custom.key.trim() || !custom.value.trim()} onClick={() => { demo(custom.key.trim().toLowerCase().replace(/\s+/g, '_'), custom.value.trim()); setCustom({ key: '', value: '' }); }}><Plus size={14} /> Add</button>
      </div>
      <Field label="Additional notes"><textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
    </div>
  );
}

// Calls the API; resolves { participant } or { duplicates } when the server flags possible duplicates.
export async function savePaticipant(id, f, force) {
  const body = { ...f, force, age: f.age === '' || f.age === null ? null : +f.age };
  return id ? api.put(`/participants/${id}`, body) : api.post('/participants', body);
}
export { useToast };
