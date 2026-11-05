import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, FlaskConical, Users, FileSignature, FileBarChart, Settings, DatabaseBackup, BarChart3, Plus, Search, Circle } from 'lucide-react';
import { api, qs } from '../services/api';
import { useDebounced, useFetch, useMeta } from '../hooks/hooks';
import { ErrorBox } from '../components/ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Research Calendar', icon: CalendarDays },
  { to: '/research', label: 'Research Tracker', icon: FlaskConical },
  { to: '/participants', label: 'Participants', icon: Users },
  { to: '/ndas', label: 'NDA Management', icon: FileSignature, badge: 'pending_ndas' },
  { to: '/results', label: 'Research Results', icon: FileBarChart },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(null);
  const d = useDebounced(q, 250);
  const box = useRef();
  useEffect(() => {
    if (d.trim().length < 2) { setRes(null); return; }
    Promise.all([api.get('/research' + qs({ q: d, pageSize: 5 })), api.get('/participants' + qs({ q: d, pageSize: 5 })), api.get('/attachments' + qs({ q: d }))]).then(([r, p, a]) => setRes({ r: r.rows, p: p.rows, a: a.slice(0, 5) })).catch(() => setRes(null));
  }, [d]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const go = () => { setOpen(false); setQ(''); };
  return (
    <div className="search" ref={box}>
      <Search size={16} />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search research, participants, files…" aria-label="Global search" />
      {open && res && (
        <div className="search-results">
          {!res.r.length && !res.p.length && !res.a.length && <div className="muted" style={{ padding: 12 }}>No matches for “{d}”</div>}
          {res.r.length > 0 && <div className="grp">Research</div>}{res.r.map((x) => <Link key={x.id} to={`/research/${x.id}`} onClick={go}><b>{x.research_code}</b> · {x.title}</Link>)}
          {res.p.length > 0 && <div className="grp">Participants</div>}{res.p.map((x) => <Link key={x.id} to={`/participants/${x.id}`} onClick={go}><b>{x.participant_code}</b> · {x.full_name} <span className="faint">{x.phone}</span></Link>)}
          {res.a.length > 0 && <div className="grp">Files</div>}{res.a.map((x) => <Link key={x.id} to={`/research/${x.study_id}?tab=attachments`} onClick={go}>{x.original_name} <span className="faint">· {x.research_code}</span></Link>)}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const nav = useNavigate();
  const { error } = useMeta();
  const dash = useFetch('/dashboard');
  const pending = dash.data?.stats.pending_ndas;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Circle size={14} fill="#fff" /></div>Consumer Insights Hub</div>
        <button className="btn primary btn-add" onClick={() => nav('/research/new')}><Plus size={16} /> New Research</button>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={18} />{n.label}{n.badge && pending > 0 && <span className="badge-count">{pending}</span>}</NavLink>
          ))}
        </nav>
        <div className="nav-label">System</div>
        <nav className="nav"><NavLink to="/settings"><Settings size={18} />Settings</NavLink><NavLink to="/backups"><DatabaseBackup size={18} />Backups</NavLink></nav>
        <div className="sidebar-foot"><Link className="btn" to="/participants/new"><Users size={15} /> Register participant</Link></div>
      </aside>
      <div className="main">
        <header className="topbar"><GlobalSearch /><div className="grow" /><span className="muted small">JazzCash · Consumer Insights</span></header>
        <main className="content">{error && <ErrorBox error={error} />}<Outlet /></main>
      </div>
    </div>
  );
}
