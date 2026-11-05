import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, AlertTriangle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { STATUS_TONE, RESULTS_TONE, ATTEND_TONE, NDA_TONE, PRIORITY_TONE } from '../utils/format';

export function Spinner({ label = 'Loading…' }) { return <div className="center-pad"><div className="spinner" /><span>{label}</span></div>; }

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return <div className="alert err"><AlertTriangle size={18} /><div className="grow">{error}</div>{onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}</div>;
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return <div className="empty"><div className="ico"><Icon size={22} /></div><h3>{title}</h3>{children && <div style={{ maxWidth: 420, margin: '0 auto 12px' }}>{children}</div>}{action}</div>;
}

export function Badge({ tone = 'grey', dot, children }) { return <span className={`badge b-${tone} ${dot ? 'dot' : ''}`}>{children}</span>; }
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status]} dot>{status}</Badge>;
export const ResultsBadge = ({ status }) => <Badge tone={RESULTS_TONE[status]} dot>{status}</Badge>;
export const AttendBadge = ({ status }) => <Badge tone={ATTEND_TONE[status]}>{status}</Badge>;
export const NdaBadge = ({ status }) => <Badge tone={NDA_TONE[status] || 'grey'}>{status === 'Signed' ? 'NDA Signed' : status === 'Pending' ? 'NDA Pending' : 'No NDA'}</Badge>;
export const PriorityBadge = ({ priority }) => <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>;
export function CategoryChip({ name, color }) { return <span className="chip" style={{ background: color + '1f', color }}><i style={{ width: 8, height: 8, borderRadius: 3, background: color }} />{name}</span>; }

export function PageHeader({ title, subtitle, crumbs, children }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}{i < crumbs.length - 1 && ' / '}</span>)}</div>}
        <h1>{title}</h1>{subtitle && <p>{subtitle}</p>}
      </div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = '', dismissable = true }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && dismissable) onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose, dismissable]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

// Promise-based confirmation dialog:  const confirm = useConfirm();  if (await confirm({...})) ...
const ConfirmCtx = createContext(async () => true);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback((opts) => new Promise((resolve) => { setTyped(''); setDlg({ ...opts, resolve }); }), []);
  const close = (v) => { dlg.resolve(v); setDlg(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {dlg && (
        <Modal title={dlg.title || 'Are you sure?'} onClose={() => close(false)}
          footer={<><button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${dlg.danger ? 'danger solid' : 'primary'}`} disabled={dlg.typeToConfirm && typed !== dlg.typeToConfirm} onClick={() => close(true)}>{dlg.confirmLabel || 'Confirm'}</button></>}>
          <div className="stack">
            <div>{dlg.message}</div>
            {dlg.typeToConfirm && <div className="field"><label>Type <b>{dlg.typeToConfirm}</b> to continue</label><input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} /></div>}
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function Field({ label, required, error, hint, children, className = '' }) {
  return <div className={`field ${className}`}>{label && <label>{label}{required && <span className="req"> *</span>}</label>}{children}{hint && !error && <span className="hint">{hint}</span>}{error && <span className="error">{error}</span>}</div>;
}

export function Tabs({ tabs, active, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={active === t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.icon}{t.label}{t.count !== undefined && <span className="n">{t.count}</span>}</button>)}</div>;
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>{total ? `${from}–${to} of ${total}` : 'No results'}</span>
      <div className="row"><button className="btn sm icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span>Page {page} / {pages}</span>
        <button className="btn sm icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'purple', to }) {
  const colors = { purple: ['#efecff', '#5b3ff5'], green: ['#e6f7ee', '#12a150'], amber: ['#fff4dc', '#d98a06'], blue: ['#e8f1fd', '#2b7de9'], red: ['#fdebe8', '#e5392a'], grey: ['#eef0f5', '#5d6075'] }[tone];
  const body = (<><div className="ico" style={{ background: colors[0], color: colors[1] }}><Icon size={20} /></div><div><div className="num">{value}</div><div className="lbl">{label}</div></div></>);
  return to ? <Link to={to} className="card stat">{body}</Link> : <div className="card stat">{body}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return <div className="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} /></div>;
}

export function ConflictAlert({ conflicts }) {
  if (!conflicts || !conflicts.length) return null;
  const real = conflicts.filter((c) => c.kinds.length > 1);
  return (
    <div className={`alert ${real.length ? 'warn' : 'info'}`} role="alert">
      <AlertTriangle size={18} style={{ flex: 'none', marginTop: 1 }} />
      <div>
        <b>{real.length ? 'Potential scheduling conflict:' : 'Date overlap:'}</b>{' '}
        {real.length ? 'Another research study overlaps with these dates and shares an owner or participant.' : 'Another research study overlaps with these dates. This is only a study-date overlap — not necessarily an operational clash.'} You can still save.
        <ul>
          {conflicts.map((c) => (
            <li key={c.study.id}>
              <Link to={`/research/${c.study.id}`} target="_blank">{c.study.research_code} · {c.study.title}</Link> ({c.study.start_date} → {c.study.end_date})
              {c.kinds.includes('owner') && <> — <b>same owner/team:</b> {c.shared_people.join(', ')}</>}
              {c.participants.length > 0 && <> — <b>same participant{c.participants.length > 1 ? 's' : ''}:</b> {c.participants.map((p) => `${p.name} (${p.certain ? `both on ${p.date}` : 'dates not set — possible'})`).join(', ')}</>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
