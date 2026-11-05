import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Check, Upload, Download, HardDrive, FileSignature, FlaskConical, Users, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useMeta, useToast } from '../hooks/hooks';
import { PageHeader, Tabs, Spinner, ErrorBox, Badge, useConfirm, Field, Empty } from '../components/ui';
import { fmtDateTime, fmtSize } from '../utils/format';

function InlineName({ value, onSave }) {
  const [v, setV] = useState(value);
  const dirty = v !== value && v.trim();
  return <div className="row grow"><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dirty && onSave(v.trim())} aria-label="Name" />{dirty && <button className="btn sm primary icon" onClick={() => onSave(v.trim())} aria-label="Save name"><Check size={14} /></button>}</div>;
}
function AddRow({ placeholder, onAdd }) {
  const [v, setV] = useState('');
  const go = async () => { if (v.trim() && (await onAdd(v.trim())) !== false) setV(''); };
  return <div className="row"><input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === 'Enter' && go()} /><button className="btn" disabled={!v.trim()} onClick={go}><Plus size={14} /> Add</button></div>;
}

function useAct(reload) {
  const toast = useToast();
  return async (fn, ok) => { try { await fn(); if (ok) toast(ok); reload(); return true; } catch (e) { toast(e.message, 'error'); return false; } };
}

function ResearchConfig() {
  const { meta, reload } = useMeta();
  const confirm = useConfirm();
  const act = useAct(reload);
  const del = async (label, url) => { if (await confirm({ title: `Delete ${label}?`, message: 'This cannot be undone. Items already used by research cannot be deleted — deactivate them instead.', confirmLabel: 'Delete', danger: true })) act(() => api.del(url), 'Deleted'); };
  return (
    <div className="stack">
      <div className="card"><div className="card-h"><div><h2>Research categories & subcategories</h2><div className="muted small">Category colours are used on the calendar and charts. Inactive items are hidden from new forms.</div></div></div><div className="card-b stack">
        {meta.categories.map((c) => (
          <div className="seg-card stack" key={c.id} style={{ opacity: c.active ? 1 : .6 }}>
            <div className="row"><input type="color" value={c.color} onChange={(e) => act(() => api.put(`/settings/categories/${c.id}`, { color: e.target.value }))} aria-label={`${c.name} colour`} /><InlineName value={c.name} onSave={(name) => act(() => api.put(`/settings/categories/${c.id}`, { name }), 'Category renamed')} />
              <button className="btn sm" onClick={() => act(() => api.put(`/settings/categories/${c.id}`, { active: !c.active }))}>{c.active ? <><EyeOff size={13} /> Deactivate</> : <><Eye size={13} /> Activate</>}</button><button className="btn sm icon danger" aria-label="Delete category" onClick={() => del(`category “${c.name}”`, `/settings/categories/${c.id}`)}><Trash2 size={13} /></button></div>
            <div style={{ paddingLeft: 64 }} className="stack">
              {c.subcategories.map((s) => <div className="row" key={s.id} style={{ opacity: s.active ? 1 : .6 }}><InlineName value={s.name} onSave={(name) => act(() => api.put(`/settings/subcategories/${s.id}`, { name }), 'Renamed')} />
                <button className="btn sm ghost" onClick={() => act(() => api.put(`/settings/subcategories/${s.id}`, { active: !s.active }))}>{s.active ? 'Deactivate' : 'Activate'}</button><button className="btn sm icon danger" aria-label="Delete subcategory" onClick={() => del(`subcategory “${s.name}”`, `/settings/subcategories/${s.id}`)}><Trash2 size={13} /></button></div>)}
              <AddRow placeholder="New subcategory…" onAdd={(name) => act(() => api.post(`/settings/categories/${c.id}/subcategories`, { name }), 'Subcategory added')} />
            </div>
          </div>))}
        <AddRow placeholder="New category…" onAdd={(name) => act(() => api.post('/settings/categories', { name }), 'Category added')} />
      </div></div>
      <div className="card"><div className="card-h"><h2>Products</h2></div><div className="card-b stack">
        {meta.products.map((p) => <div className="row" key={p.id} style={{ opacity: p.active ? 1 : .6 }}><InlineName value={p.name} onSave={(name) => act(() => api.put(`/settings/products/${p.id}`, { name }), 'Product renamed')} />
          <button className="btn sm ghost" onClick={() => act(() => api.put(`/settings/products/${p.id}`, { active: !p.active }))}>{p.active ? 'Deactivate' : 'Activate'}</button><button className="btn sm icon danger" aria-label="Delete product" onClick={() => del(`product “${p.name}”`, `/settings/products/${p.id}`)}><Trash2 size={13} /></button></div>)}
        <AddRow placeholder="New product…" onAdd={(name) => act(() => api.post('/settings/products', { name }), 'Product added')} />
      </div></div>
      <OptionList type="screen_suggestion" title="Screen / topic suggestions" help="Suggestions shown in the Screen / Topic field. Free text is always allowed." />
      <OptionList type="owner" title="Research owner suggestions" help="Names suggested in the owner field (existing owners are suggested automatically)." />
    </div>
  );
}

function OptionList({ type, title, help }) {
  const { reload: reloadMeta } = useMeta();
  const { data, reload } = useFetch(`/settings/options/${type}`);
  const confirm = useConfirm();
  const toast = useToast();
  const refresh = () => { reload(); reloadMeta(); };
  const act = async (fn) => { try { await fn(); refresh(); return true; } catch (e) { toast(e.message, 'error'); return false; } };
  return (
    <div className="card"><div className="card-h"><div><h2>{title}</h2>{help && <div className="muted small">{help}</div>}</div></div><div className="card-b stack">
      {data?.map((o) => <div className="row" key={o.id} style={{ opacity: o.active ? 1 : .6 }}><InlineName value={o.value} onSave={(value) => act(() => api.put(`/settings/options/${o.id}`, { value }))} />
        <button className="btn sm ghost" onClick={() => act(() => api.put(`/settings/options/${o.id}`, { active: !o.active }))}>{o.active ? 'Deactivate' : 'Activate'}</button>
        <button className="btn sm icon danger" aria-label="Delete option" onClick={async () => { if (await confirm({ title: 'Delete option?', message: `Remove “${o.value}” from this list? Existing participant records keep their stored value.`, confirmLabel: 'Delete', danger: true })) act(() => api.del(`/settings/options/${o.id}`)); }}><Trash2 size={13} /></button></div>)}
      {data?.length === 0 && <div className="muted small">No options yet.</div>}
      <AddRow placeholder="Add option…" onAdd={(value) => act(() => api.post(`/settings/options/${type}`, { value }))} />
    </div></div>
  );
}

function ParticipantConfig() {
  return <div className="stack">
    <div className="alert info"><Users size={18} /><div>These lists feed participant registration and the participant requirements of each study. Participants are never forced into fixed categories — you can also add custom demographic fields on any profile.</div></div>
    <OptionList type="customer_type" title="Customer types" /><OptionList type="digital_behaviour" title="Digital behaviour categories" /><OptionList type="digital_native" title="Digitally native status" />
    <OptionList type="age_group" title="Age groups" help="Format “18-25” or “56+”. Used to auto-fill a participant's age group from their age." /><OptionList type="customer_segment" title="Customer segments" help="Optional. When empty, segment is entered as free text." />
    <OptionList type="gender" title="Gender options" /><OptionList type="city" title="City suggestions" />
  </div>;
}

function NdaConfig() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/nda/templates');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const confirm = useConfirm();
  const active = data?.templates.find((t) => t.is_active);
  const upload = async () => {
    if (active && !(await confirm({ title: 'Replace the active NDA template?', message: <>This creates <b>version {active.version + 1}</b> and makes it active for new NDAs. Version {active.version} and every NDA already signed with it are preserved.</>, confirmLabel: 'Upload & activate' }))) return;
    const fd = new FormData(); fd.append('file', file); fd.append('notes', notes);
    setBusy(true);
    try { const t = await api.upload('/nda/templates', fd); setResult(t); toast(`Template v${t.version} is now active`); setFile(null); setNotes(''); reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>Active template</h2></div><div className="card-b">
        {loading && !data ? <Spinner /> : active ? <dl className="kv"><dt>Version</dt><dd><Badge tone="green">v{active.version}</Badge></dd><dt>File</dt><dd>{active.original_filename} ({active.file_type.toUpperCase()}, {fmtSize(active.size_bytes)})</dd><dt>Uploaded</dt><dd>{fmtDateTime(active.uploaded_at)}</dd><dt>SHA-256</dt><dd className="mono">{active.sha256}</dd></dl>
          : <Empty icon={FileSignature} title="No template uploaded">Upload the company-approved NDA (.docx or .pdf). The wording is never modified by this application.</Empty>}
        <ErrorBox error={error} />
      </div></div>
      <div className="card"><div className="card-h"><h2>{active ? 'Replace template' : 'Upload template'}</h2></div><div className="card-b stack">
        <input type="file" accept=".docx,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
        <Field label="Version notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Legal-approved wording, Nov 2026" /></Field>
        <div><button className="btn primary" disabled={!file || busy} onClick={upload}><Upload size={15} /> {busy ? 'Uploading…' : 'Upload template'}</button></div>
        {result && <div className="alert ok"><Check size={18} /><div>Template v{result.version} uploaded. {result.file_type === 'docx' ? (result.placeholders.length ? <>Detected placeholders: {result.placeholders.map((p) => <code key={p} style={{ marginRight: 6 }}>{`{{${p}}}`}</code>)}</> : <b>No {'{{placeholders}}'} found — the document will be shown as-is and participant details will appear on the signature page.</b>) : 'PDF templates are used unchanged; participant and study details are added on the signature page.'}</div></div>}
        <div className="alert info"><FileSignature size={18} /><div><b>How participant details are inserted</b><br />
          <b>DOCX (recommended):</b> type placeholders in the document, e.g. <code>{'{{participant_name}}'}</code>. Available: {['participant_name', 'participant_id', 'phone', 'email', 'age', 'city', 'occupation', 'research_title', 'research_id', 'product', 'screen_topic', 'category', 'research_owner', 'start_date', 'end_date', 'date', 'nda_id'].map((p) => <code key={p} style={{ marginRight: 6 }}>{`{{${p}}}`}</code>)}. Original formatting is kept; the document is converted to PDF with Microsoft Word or LibreOffice when installed.<br />
          <b>PDF:</b> the original pages are kept untouched and a signature page with the participant and study details is appended.</div></div>
      </div></div>
      <div className="card"><div className="card-h"><h2>Version history</h2></div><div className="card-b flush"><table className="t"><thead><tr><th>Version</th><th>File</th><th>Uploaded</th><th>Used by</th><th /></tr></thead><tbody>
        {data?.templates.map((t) => <tr key={t.id}><td>v{t.version} {t.is_active && <Badge tone="green">Active</Badge>}</td><td>{t.original_filename}<div className="sub">{t.notes}</div></td><td>{fmtDateTime(t.uploaded_at)}</td><td>{t.usage_count} NDA{t.usage_count === 1 ? '' : 's'}</td><td style={{ textAlign: 'right' }}><a className="btn sm" href={api.url(`/nda/templates/${t.id}/download`)}><Download size={13} /> Download</a></td></tr>)}
        {data?.templates.length === 0 && <tr><td colSpan={5} className="muted">No versions yet.</td></tr>}</tbody></table></div></div>
    </div>
  );
}

function StorageConfig() {
  const { data, loading, error } = useFetch('/storage');
  const b = useFetch('/backups');
  return (
    <div className="stack">
      <ErrorBox error={error} />
      <div className="card"><div className="card-h"><h2>Storage locations</h2></div><div className="card-b">{loading && !data ? <Spinner /> : data && <dl className="kv">
        <dt>Database</dt><dd className="mono">{data.database_path}<div className="muted">{fmtSize(data.database_size)}</div></dd>
        <dt>Document storage</dt><dd className="mono">{data.storage_dir}<div className="muted">{fmtSize(data.storage_size)} in {data.storage_files} files</div></dd>
        <dt>Backups</dt><dd className="mono">{data.backup_dir}<div className="muted">{fmtSize(data.backup_size)} used</div></dd></dl>}
        <div className="muted small mt" style={{ marginTop: 14 }}>Locations are set with environment variables (<code>DATA_DIR</code>, <code>STORAGE_DIR</code>, <code>BACKUP_DIR</code>) in the <code>.env</code> file — see the README. The backup folder can also be changed under Backups.</div></div></div>
      <div className="card"><div className="card-b row spread"><div><b>Backups</b><div className="muted small">{b.data ? `${b.data.backups.length} backups · ${b.data.settings.backup_frequency} automatic · keep ${b.data.settings.backup_retention_days} days` : ''}</div></div><Link className="btn primary" to="/backups"><HardDrive size={15} /> Open backup management</Link></div></div>
    </div>
  );
}

export default function SettingsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'research';
  const { meta } = useMeta();
  return (
    <>
      <PageHeader title="Settings" subtitle="Configure research lists, participant options, the NDA template and storage" />
      <Tabs active={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ id: 'research', label: 'Research', icon: <FlaskConical size={15} /> }, { id: 'participants', label: 'Participants', icon: <Users size={15} /> }, { id: 'nda', label: 'NDA Template', icon: <FileSignature size={15} /> }, { id: 'storage', label: 'Storage & Backups', icon: <HardDrive size={15} /> }]} />
      {!meta ? <Spinner /> : tab === 'research' ? <ResearchConfig /> : tab === 'participants' ? <ParticipantConfig /> : tab === 'nda' ? <NdaConfig /> : <StorageConfig />}
    </>
  );
}
