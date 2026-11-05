import { useNavigate, Link } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { Layers, ClipboardList, PlayCircle, CalendarClock, CheckCircle2, Users, FileWarning, Hourglass, FlaskConical } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useFetch } from '../hooks/hooks';
import { Spinner, ErrorBox, StatCard, PageHeader, StatusBadge, ResultsBadge, CategoryChip, Empty } from '../components/ui';
import { fmtRange, fmtDateTime, CHART_COLORS } from '../utils/format';

const STATUS_COLORS = { Draft: '#94a3b8', 'Review Screen': '#f59e0b', Approved: '#2b7de9', Scheduled: '#5b3ff5', Completed: '#12a150' };
const RESULT_COLORS = { 'Not Started': '#94a3b8', 'In Progress': '#f59e0b', 'Under Review': '#2b7de9', Completed: '#12a150' };

export default function Dashboard() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useFetch('/dashboard');
  const an = useFetch('/analytics');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { stats } = data;
  const a = an.data;
  const hasAny = stats.total > 0;
  const events = data.calendar.map((s) => ({ id: s.id, title: s.title, start: s.start_date, end: new Date(new Date(s.end_date + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10), allDay: true, backgroundColor: s.category_color, borderColor: s.category_color }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of Consumer Insights research operations" />
      <div className="stats">
        <StatCard icon={Layers} label="Total Research Studies" value={stats.total} to="/research" />
        <StatCard icon={ClipboardList} label="Planned Research" value={stats.planned} tone="blue" to="/research" />
        <StatCard icon={PlayCircle} label="Ongoing Research" value={stats.ongoing} tone="amber" to="/calendar" />
        <StatCard icon={CalendarClock} label="Upcoming Research" value={stats.upcoming} tone="purple" to="/calendar" />
        <StatCard icon={CheckCircle2} label="Completed Research" value={stats.completed} tone="green" to="/research" />
        <StatCard icon={Users} label="Total Participants" value={stats.participants} tone="grey" to="/participants" />
        <StatCard icon={FileWarning} label="Pending NDAs" value={stats.pending_ndas} tone="red" to="/ndas?status=Pending" />
        <StatCard icon={Hourglass} label="Results In Progress" value={stats.results_in_progress} tone="amber" to="/results" />
      </div>

      {!hasAny && (
        <div className="card mb"><Empty icon={FlaskConical} title="No research studies yet" action={<Link className="btn primary" to="/research/new">Create your first research study</Link>}>
          Everything on this dashboard is calculated from your stored records. Create a study to get started — the numbers and charts will fill in automatically.</Empty></div>
      )}

      <div className="cols">
        <div className="card">
          <div className="card-h"><h2>Upcoming research</h2><Link to="/research" className="small">View all</Link></div>
          <div className="card-b flush table-wrap">
            {data.upcoming.length === 0 ? <Empty title="Nothing upcoming">Studies that start in the future or are currently running will appear here.</Empty> : (
              <table className="t"><thead><tr><th>Research</th><th>Product</th><th>Category</th><th>Owner</th><th>Dates</th><th>Status</th></tr></thead>
                <tbody>{data.upcoming.map((s) => (
                  <tr key={s.id} className="click" onClick={() => nav(`/research/${s.id}`)}>
                    <td><div className="title">{s.title}</div><div className="sub">{s.research_code}{s.screen_topic ? ` · ${s.screen_topic}` : ''}</div></td>
                    <td>{s.product_name || '—'}</td><td><CategoryChip name={s.category_name} color={s.category_color} /></td><td>{s.owner}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(s.start_date, s.end_date)}</td><td><StatusBadge status={s.status} /></td>
                  </tr>))}</tbody></table>)}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Research calendar</h2><Link to="/calendar" className="small">Open calendar</Link></div>
          <div className="card-b">
            <FullCalendar plugins={[dayGridPlugin]} initialView="dayGridMonth" headerToolbar={{ left: 'prev', center: 'title', right: 'next' }} height="auto" events={events} dayMaxEvents={2} fixedWeekCount={false}
              eventClick={(i) => nav(`/research/${i.event.id}`)} />
          </div>
        </div>
      </div>

      <div className="cols three">
        <div className="card"><div className="card-h"><h2>Research status</h2></div><div className="card-b">
          <ResponsiveContainer width="100%" height={220}><BarChart data={data.status_distribution} layout="vertical" margin={{ left: 20 }}><CartesianGrid horizontal={false} stroke="#eef0f5" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12 }} /><Tooltip />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>{data.status_distribution.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        <div className="card"><div className="card-h"><h2>Results production</h2></div><div className="card-b">
          <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={data.results_distribution.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>{data.results_distribution.map((d) => <Cell key={d.name} fill={RESULT_COLORS[d.name]} />)}</Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer>
          <div className="legend">{data.results_distribution.map((d) => <span key={d.name}><i style={{ background: RESULT_COLORS[d.name] }} />{d.name}: <b>{d.value}</b></span>)}</div></div></div>
        <div className="card"><div className="card-h"><h2>Recent activity</h2></div><div className="card-b">
          {data.recent_activity.length === 0 ? <div className="muted">No activity yet.</div> : <div className="timeline">{data.recent_activity.slice(0, 7).map((x) => (
            <div className="tl" key={x.id}><div className="dotc" /><div className="grow"><div><b>{x.action}</b></div><div className="small muted">{x.research_code ? <Link to={`/research/${x.study_id}`}>{x.research_code} {x.title}</Link> : x.participant_code ? <Link to={`/participants/${x.participant_id}`}>{x.participant_code} {x.full_name}</Link> : x.details}</div><div className="small faint">{fmtDateTime(x.created_at)}</div></div></div>))}</div>}</div></div>
      </div>

      <h2 style={{ margin: '24px 0 12px' }}>Research insights</h2>
      {a && hasAny ? (
        <>
          <div className="cols even">
            <div className="card"><div className="card-h"><h2>Planned vs completed per month</h2></div><div className="card-b">
              <ResponsiveContainer width="100%" height={240}><BarChart data={a.planned_vs_completed}><CartesianGrid vertical={false} stroke="#eef0f5" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="planned" fill="#5b3ff5" radius={[6, 6, 0, 0]} name="Planned (start month)" /><Bar dataKey="completed" fill="#12a150" radius={[6, 6, 0, 0]} name="Completed (end month)" /></BarChart></ResponsiveContainer></div></div>
            <div className="card"><div className="card-h"><h2>Research by category</h2></div><div className="card-b">
              <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={a.by_category} dataKey="value" nameKey="name" outerRadius={85} label={(e) => `${e.name} (${e.value})`}>{a.by_category.map((c) => <Cell key={c.name} fill={c.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
          </div>
          <div className="cols three">
            <div className="card"><div className="card-h"><h2>Research by product</h2></div><div className="card-b">
              <ResponsiveContainer width="100%" height={210}><BarChart data={a.by_product} layout="vertical" margin={{ left: 24 }}><CartesianGrid horizontal={false} stroke="#eef0f5" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="value" fill="#2b7de9" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></div>
            <div className="card"><div className="card-h"><h2>Participants</h2></div><div className="card-b stack">
              <div className="row spread"><span className="muted">Unique participants in studies</span><b style={{ fontSize: 20 }}>{a.participants.unique_participants}</b></div>
              <div className="row spread"><span className="muted">NDAs signed</span><span className="badge b-green">{a.participants.nda.signed}</span></div>
              <div className="row spread"><span className="muted">NDAs pending</span><span className="badge b-amber">{a.participants.nda.pending}</span></div>
              <div className="row spread"><span className="muted">Attended sessions</span><b>{a.participants.attendance.find((x) => x.name === 'Attended')?.value || 0}</b></div></div></div>
            <div className="card"><div className="card-h"><h2>Results completed vs pending</h2></div><div className="card-b">
              <ResponsiveContainer width="100%" height={210}><PieChart><Pie data={[{ name: 'Completed', value: a.results.by_status.find((x) => x.name === 'Completed').value }, { name: 'Pending', value: a.results.by_status.filter((x) => x.name !== 'Completed').reduce((s, x) => s + x.value, 0) }]} dataKey="value" innerRadius={45} outerRadius={75}><Cell fill="#12a150" /><Cell fill="#f59e0b" /></Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div></div>
          </div>
          {a.results.completed_with_pending_results.length > 0 && (
            <div className="alert warn"><Hourglass size={18} /><div><b>{a.results.completed_with_pending_results.length} completed {a.results.completed_with_pending_results.length === 1 ? 'study has' : 'studies have'} results still pending: </b>
              {a.results.completed_with_pending_results.slice(0, 6).map((s) => <Link key={s.id} to={`/research/${s.id}?tab=results`} style={{ marginRight: 10 }}>{s.research_code}</Link>)}</div></div>)}
        </>
      ) : <div className="card"><div className="card-b muted">Insights appear here once research studies exist.</div></div>}
    </>
  );
}
