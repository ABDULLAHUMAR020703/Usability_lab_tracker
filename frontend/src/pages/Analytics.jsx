import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useFetch, useMeta } from '../hooks/hooks';
import { qs } from '../services/api';
import { PageHeader, Spinner, ErrorBox, StatCard, Empty } from '../components/ui';
import { Layers, Users, FileCheck2, Hourglass, BarChart3 } from 'lucide-react';
import { CHART_COLORS, fmtDate } from '../utils/format';

const Chart = ({ title, children, empty }) => <div className="card"><div className="card-h"><h2>{title}</h2></div><div className="card-b">{empty ? <div className="muted" style={{ padding: '30px 0', textAlign: 'center' }}>No data for these filters</div> : children}</div></div>;
const hbar = (data, color = '#5b3ff5', width = 110) => (
  <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 40)}><BarChart data={data} layout="vertical" margin={{ left: 20 }}><CartesianGrid horizontal={false} stroke="#eef0f5" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={width} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>);
const pie = (data, colors) => (
  <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>{data.filter((d) => d.value > 0).map((d, i) => <Cell key={d.name} fill={colors?.[d.name] || CHART_COLORS[i % 8]} />)}</Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer>);

export default function Analytics() {
  const { meta } = useMeta();
  const [f, setF] = useState({ from: '', to: '', category_id: '', product_id: '' });
  const { data: a, loading, error, reload } = useFetch('/analytics' + qs(f));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const p = a?.participants;
  return (
    <>
      <PageHeader title="Research Analytics" subtitle="Calculated live from stored records" />
      <div className="toolbar">
        <label className="row small muted">From <input type="date" style={{ width: 150 }} value={f.from} onChange={set('from')} /></label>
        <label className="row small muted">To <input type="date" style={{ width: 150 }} value={f.to} onChange={set('to')} /></label>
        <select className="pill-select" value={f.category_id} onChange={set('category_id')} aria-label="Category"><option value="">All categories</option>{meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="pill-select" value={f.product_id} onChange={set('product_id')} aria-label="Product"><option value="">All products</option>{meta?.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {Object.values(f).some(Boolean) && <button className="btn sm ghost" onClick={() => setF({ from: '', to: '', category_id: '', product_id: '' })}>Clear</button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !a ? <Spinner /> : a && a.total === 0 ? <div className="card"><Empty icon={BarChart3} title="No research in this selection">Adjust the filters, or create research studies to see analytics.</Empty></div> : a && (
        <>
          <div className="stats">
            <StatCard icon={Layers} label="Research studies" value={a.total} /><StatCard icon={Users} label="Unique participants" value={p.unique_participants} tone="blue" />
            <StatCard icon={FileCheck2} label="NDAs signed / pending" value={`${p.nda.signed} / ${p.nda.pending}`} tone="green" /><StatCard icon={Hourglass} label="Completed, results pending" value={a.results.completed_with_pending_results.length} tone="amber" />
          </div>
          <h2 className="mb">Research</h2>
          <div className="cols even">
            <Chart title="Studies by category" empty={!a.by_category.length}>{pie(a.by_category.map((c) => ({ name: c.name, value: c.value })), Object.fromEntries(a.by_category.map((c) => [c.name, c.color])))}</Chart>
            <Chart title="Studies by status">{hbar(a.by_status, '#5b3ff5', 100)}</Chart>
            <Chart title="Studies by product" empty={!a.by_product.length}>{hbar(a.by_product, '#2b7de9')}</Chart>
            <Chart title="Planned vs completed per month" empty={!a.planned_vs_completed.length}><ResponsiveContainer width="100%" height={250}><BarChart data={a.planned_vs_completed}><CartesianGrid vertical={false} stroke="#eef0f5" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="planned" fill="#5b3ff5" radius={[6, 6, 0, 0]} /><Bar dataKey="completed" fill="#12a150" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Chart>
          </div>
          <div className="card mb"><div className="card-h"><h2>Upcoming research</h2></div><div className="card-b">{a.upcoming.length === 0 ? <span className="muted">Nothing upcoming in this selection.</span> : a.upcoming.map((s) => <div className="row spread" key={s.id} style={{ padding: '6px 0' }}><Link to={`/research/${s.id}`}>{s.research_code} · {s.title}</Link><span className="muted small">{fmtDate(s.start_date)} → {fmtDate(s.end_date)} · {s.owner}</span></div>)}</div></div>

          <h2 className="mb">Participants</h2>
          <div className="cols even">
            <Chart title="By age group" empty={!p.by_age_group.length}>{hbar(p.by_age_group, '#14b8a6')}</Chart>
            <Chart title="By customer type" empty={!p.by_customer_type.length}>{hbar(p.by_customer_type, '#a855f7', 130)}</Chart>
            <Chart title="By digital behaviour" empty={!p.by_digital_behaviour.length}>{hbar(p.by_digital_behaviour, '#2b7de9', 150)}</Chart>
            <Chart title="By customer segment" empty={!p.by_segment.length}>{hbar(p.by_segment, '#f59e0b', 130)}</Chart>
            <Chart title="Signed vs pending NDAs" empty={!p.nda.signed && !p.nda.pending}>{pie([{ name: 'Signed', value: p.nda.signed }, { name: 'Pending', value: p.nda.pending }], { Signed: '#12a150', Pending: '#f59e0b' })}</Chart>
            <Chart title="Attendance" empty={!p.attendance.some((x) => x.value)}>{pie(p.attendance, { Expected: '#94a3b8', Confirmed: '#2b7de9', Attended: '#12a150', 'Did Not Attend': '#e5392a', Cancelled: '#f59e0b' })}</Chart>
            <Chart title="Participants per study" empty={!p.per_study.length}><ResponsiveContainer width="100%" height={250}><BarChart data={p.per_study}><CartesianGrid vertical={false} stroke="#eef0f5" /><XAxis dataKey="research_code" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Participants" fill="#5b3ff5" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Chart>
            <Chart title="Required vs attended" empty={!p.required_vs_actual.length}><ResponsiveContainer width="100%" height={250}><BarChart data={p.required_vs_actual}><CartesianGrid vertical={false} stroke="#eef0f5" /><XAxis dataKey="research_code" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="required" fill="#cbd5e1" radius={[6, 6, 0, 0]} /><Bar dataKey="attended" fill="#12a150" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Chart>
          </div>

          <h2 className="mb">Results</h2>
          <div className="cols even">
            <Chart title="Results production status">{pie(a.results.by_status, { 'Not Started': '#94a3b8', 'In Progress': '#f59e0b', 'Under Review': '#2b7de9', Completed: '#12a150' })}</Chart>
            <div className="card"><div className="card-h"><h2>Completed research with pending results</h2></div><div className="card-b">{a.results.completed_with_pending_results.length === 0 ? <span className="muted">None — all completed studies have delivered results.</span> : a.results.completed_with_pending_results.map((s) => <div className="row spread" key={s.id} style={{ padding: '6px 0' }}><Link to={`/research/${s.id}?tab=results`}>{s.research_code} · {s.title}</Link><span className="badge b-amber">{s.results_status}</span></div>)}</div></div>
          </div>
        </>)}
    </>
  );
}
