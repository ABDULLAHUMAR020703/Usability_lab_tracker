import { useEffect, useState } from 'react';
import { DatabaseBackup, ShieldCheck, RotateCcw, Trash2, Lock, Unlock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useToast } from '../hooks/hooks';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, Field, useConfirm } from '../components/ui';
import { fmtDateTime, fmtSize } from '../utils/format';

const TYPE_TONE = { auto: 'blue', manual: 'purple', archive: 'green', safety: 'amber' };

export default function BackupsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useFetch('/backups');
  const [busy, setBusy] = useState('');
  const [s, setS] = useState(null);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  const run = async (key, fn, ok) => { setBusy(key); try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } };

  const restore = async (b) => {
    const okc = await confirm({ title: `Restore backup ${b.name}?`, danger: true, confirmLabel: 'Restore', typeToConfirm: 'RESTORE',
      message: <div className="stack"><div className="alert warn"><AlertTriangle size={18} /><div><b>All current data will be replaced</b> by the contents of this backup (database, documents, signed NDAs and templates). Anything created after {fmtDateTime(b.created_at)} will no longer be visible.</div></div>
        <div>A safety backup of the current state is created automatically first, and the selected backup is verified before anything changes.</div></div> });
    if (!okc) return;
    run('restore' + b.id, () => api.post(`/backups/${b.id}/restore`, { confirm: 'RESTORE' }), (r) => `Restored ${r.restored}. Safety backup: ${r.safety_backup}`);
  };

  return (
    <>
      <PageHeader title="Backup Management" subtitle="Daily automatic backups of the database, documents, signed NDAs and templates">
        <button className="btn" disabled={!!busy} onClick={() => run('archive', () => api.post('/backups', { archive: true }), 'Archival backup created')}><Lock size={15} /> Archival backup</button>
        <button className="btn primary" disabled={!!busy} onClick={() => run('manual', () => api.post('/backups', {}), 'Backup created and verified')}><DatabaseBackup size={15} /> {busy === 'manual' ? 'Backing up…' : 'Back up now'}</button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      <div className="alert warn mb"><AlertTriangle size={18} /><div><b>Same-drive backups do not protect against disk failure.</b> Point the backup folder at an encrypted external drive or a network location below.</div></div>
      {s && (
        <div className="card mb"><div className="card-h"><h2>Backup settings</h2></div><div className="card-b stack">
          <div className="grid g3">
            <Field label="Automatic backups"><select value={s.backup_frequency} onChange={(e) => setS({ ...s, backup_frequency: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option></select></Field>
            <Field label="Keep automatic backups for (days)" hint="Archival backups are never deleted automatically"><input type="number" min="1" value={s.backup_retention_days} onChange={(e) => setS({ ...s, backup_retention_days: e.target.value })} /></Field>
            <Field label="Backup folder" hint={`Current: ${s.backup_dir}`}><input value={s.backup_dir_override} placeholder="Default (backups/ in the app folder) — e.g. E:\CIH-Backups" onChange={(e) => setS({ ...s, backup_dir_override: e.target.value })} /></Field>
          </div>
          <div><button className="btn primary" disabled={!!busy} onClick={() => run('settings', () => api.put('/backups/settings', { backup_frequency: s.backup_frequency, backup_retention_days: s.backup_retention_days, backup_dir_override: s.backup_dir_override }), 'Backup settings saved')}>Save settings</button></div>
        </div></div>)}
      <div className="card">
        <div className="card-h"><h2>Backup history</h2></div>
        {loading && !data ? <Spinner /> : data && data.backups.length === 0 ? <Empty icon={DatabaseBackup} title="No backups yet">Automatic backups start shortly after the app launches. You can also create one now.</Empty> : data && (
          <div className="card-b flush table-wrap"><table className="t"><thead><tr><th>Backup</th><th>Type</th><th>Created</th><th>Size</th><th>Verification</th><th /></tr></thead><tbody>{data.backups.map((b) => (
            <tr key={b.id}><td><div className="title">{b.name}</div><div className="sub mono">{b.path}</div></td><td><Badge tone={TYPE_TONE[b.type]}>{b.type}</Badge>{b.keep_forever === 1 && b.type !== 'archive' && <Badge tone="green"> kept</Badge>}</td><td>{fmtDateTime(b.created_at)}</td><td>{fmtSize(b.size_bytes)}<div className="sub">{b.file_count} files</div></td>
              <td>{b.verified ? <span className="badge b-green"><CheckCircle2 size={12} /> Verified</span> : <span className="badge b-red"><XCircle size={12} /> Not verified</span>}<div className="sub" title={b.verification_detail}>{b.verified_at ? fmtDateTime(b.verified_at) : ''}</div></td>
              <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm" disabled={!!busy} onClick={() => run('v' + b.id, () => api.post(`/backups/${b.id}/verify`), (r) => (r.verified ? 'Backup verified — all checksums match' : `Verification failed: ${r.verification_detail}`))}><ShieldCheck size={13} /> Verify</button>
                <button className="btn sm" disabled={!!busy} onClick={() => run('k' + b.id, () => api.patch(`/backups/${b.id}`, { keep_forever: !b.keep_forever }), b.keep_forever ? 'Retention restored' : 'Marked as archival — never auto-deleted')} title="Archival backups are never deleted automatically">{b.keep_forever ? <><Unlock size={13} /> Unkeep</> : <><Lock size={13} /> Keep</>}</button>
                <button className="btn sm primary" disabled={!!busy} onClick={() => restore(b)}><RotateCcw size={13} /> Restore</button>
                <button className="btn sm icon danger" aria-label="Delete backup" disabled={!!busy || b.keep_forever === 1} onClick={async () => { if (await confirm({ title: 'Delete this backup?', message: `${b.name} will be permanently removed from disk.`, confirmLabel: 'Delete', danger: true })) run('d' + b.id, () => api.del(`/backups/${b.id}`), 'Backup deleted'); }}><Trash2 size={13} /></button></div></td></tr>))}</tbody></table></div>)}
      </div>
    </>
  );
}
