import { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, Eye, Pencil, FileSpreadsheet, FileImage, Presentation } from 'lucide-react';
import { api } from '../services/api';
import { useFetch, useToast } from '../hooks/hooks';
import { Spinner, ErrorBox, Empty, useConfirm, Modal, Field } from './ui';
import { fmtDateTime, fmtSize } from '../utils/format';

const iconFor = (n) => { const e = n.split('.').pop().toLowerCase(); if (['xlsx', 'xls', 'csv'].includes(e)) return FileSpreadsheet; if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return FileImage; if (['pptx', 'ppt', 'key'].includes(e)) return Presentation; return FileText; };
const viewable = (n) => /\.(pdf|png|jpe?g|gif|webp)$/i.test(n);
const FOLDERS = [['deliverables', 'Deliverables (presentations, reports)'], ['findings', 'Findings & analysis'], ['documents', 'Research documents']];

export default function Attachments({ studyId }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useFetch(`/research/${studyId}/attachments`);
  const [files, setFiles] = useState([]);
  const [desc, setDesc] = useState('');
  const [folder, setFolder] = useState('deliverables');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [edit, setEdit] = useState(null);
  const input = useRef();

  const upload = async () => {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('description', desc); fd.append('folder', folder);
    setBusy(true);
    try { await api.upload(`/research/${studyId}/attachments`, fd); toast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`); setFiles([]); setDesc(''); reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!(await confirm({ title: 'Remove attachment?', message: <>Remove <b>{a.original_name}</b> from this research? The file is moved to the storage “_removed” folder, not permanently erased.</>, confirmLabel: 'Remove', danger: true }))) return;
    try { await api.del(`/attachments/${a.id}`); toast('Attachment removed'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <div className="card"><div className="card-b stack">
        <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); setFiles([...e.dataTransfer.files]); }}>
          <Upload size={22} /><div><b>Click to choose files</b> or drag them here</div><div className="small">PowerPoint, PDF, Excel, Word, images and more · max 100 MB each</div>
          <input ref={input} type="file" multiple hidden onChange={(e) => setFiles([...e.target.files])} />
        </div>
        {files.length > 0 && (
          <div className="stack">
            <div>{files.map((f) => <div key={f.name} className="row small"><FileText size={14} /> {f.name} <span className="faint">{fmtSize(f.size)}</span></div>)}</div>
            <div className="grid g2"><Field label="Type"><select value={folder} onChange={(e) => setFolder(e.target.value)}>{FOLDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Description (optional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Final executive insights deck" /></Field></div>
            <div className="row"><button className="btn primary" disabled={busy} onClick={upload}><Upload size={15} /> {busy ? 'Uploading…' : 'Upload'}</button><button className="btn" onClick={() => setFiles([])}>Cancel</button></div>
          </div>)}
      </div></div>
      <div className="card">
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Spinner /> : data && data.length === 0 ? <Empty icon={FileText} title="No attachments yet">Upload presentations, reports and findings so they stay with this research.</Empty> : data && data.map((a) => {
          const Icon = iconFor(a.original_name);
          return (
            <div className="file-row" key={a.id}>
              <div className="file-ico"><Icon size={18} /></div>
              <div className="grow"><div style={{ fontWeight: 600 }}>{a.original_name}</div><div className="small muted">{a.description || <span className="faint">No description</span>}</div><div className="small faint">{fmtSize(a.size_bytes)} · uploaded {fmtDateTime(a.uploaded_at)} · {a.folder}</div></div>
              {viewable(a.original_name) && <a className="btn sm" target="_blank" rel="noreferrer" href={api.url(`/attachments/${a.id}/download?inline=1`)}><Eye size={14} /> View</a>}
              <a className="btn sm" href={api.url(`/attachments/${a.id}/download`)}><Download size={14} /> Download</a>
              <button className="btn sm icon" onClick={() => setEdit({ ...a })} aria-label="Edit description"><Pencil size={14} /></button>
              <button className="btn sm icon danger" onClick={() => remove(a)} aria-label="Remove"><Trash2 size={14} /></button>
            </div>);
        })}
      </div>
      {edit && (
        <Modal title="Edit description" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={async () => { try { await api.patch(`/attachments/${edit.id}`, { description: edit.description }); setEdit(null); toast('Description saved'); reload(); } catch (e) { toast(e.message, 'error'); } }}>Save</button></>}>
          <Field label={edit.original_name}><textarea value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        </Modal>)}
    </div>
  );
}
