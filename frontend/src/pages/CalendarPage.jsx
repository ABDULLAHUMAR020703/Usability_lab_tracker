import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { Plus } from 'lucide-react';
import { api, qs } from '../services/api';
import { useDebounced, useMeta, useSavedState, useToast } from '../hooks/hooks';
import { PageHeader, Modal, SearchInput, StatusBadge, CategoryChip, ConflictAlert, ErrorBox, ResultsBadge } from '../components/ui';
import ResearchForm from '../components/ResearchForm';
import { fmtRange } from '../utils/format';

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function CalendarPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { meta } = useMeta();
  const cal = useRef();
  const [filters, setFilters] = useSavedState('cih.calendar.filters', { q: '', category_id: '', product_id: '', owner: '', status: '' });
  const [range, setRange] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [create, setCreate] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selConflicts, setSelConflicts] = useState([]);
  const q = useDebounced(filters.q, 250);

  const load = useCallback(() => {
    if (!range) return;
    api.get('/calendar/events' + qs({ from: range.start, to: range.end, ...filters, q })).then((e) => { setEvents(e); setError(null); }).catch((x) => setError(x.message));
  }, [range, filters, q]);
  useEffect(() => { load(); }, [load]);

  const open = async (info) => {
    const id = info.event.id;
    const s = await api.get(`/research/${id}`);
    setSelected(s);
    api.get(`/research/${id}/conflicts`).then((r) => setSelConflicts(r.conflicts)).catch(() => setSelConflicts([]));
  };

  const moved = async (info) => {
    const start = info.event.startStr.slice(0, 10);
    const end = info.event.end ? addDays(info.event.endStr.slice(0, 10), -1) : start;
    try {
      await api.patch(`/research/${info.event.id}/dates`, { start_date: start, end_date: end < start ? start : end });
      const c = await api.get(`/research/${info.event.id}/conflicts`);
      const real = c.conflicts.filter((x) => x.kinds.length > 1).length;
      if (real) toast(`Rescheduled — potential conflict with ${real} other ${real === 1 ? 'study' : 'studies'} (same owner or participant)`, 'error');
      else if (c.conflicts.length) toast(`Rescheduled — dates overlap with ${c.conflicts.length} other ${c.conflicts.length === 1 ? 'study' : 'studies'}`);
      else toast('Research rescheduled');
    } catch (e) { toast(e.message, 'error'); info.revert(); }
    load();
  };

  const f = (k) => (e) => setFilters((x) => ({ ...x, [k]: e.target.value }));
  const active = Object.entries(filters).some(([, v]) => v);

  return (
    <>
      <PageHeader title="Research Calendar" subtitle="Every study appears once, spanning its overall start and end date. Drag to reschedule; click a date to add research.">
        <button className="btn primary" onClick={() => setCreate({ start_date: '', end_date: '' })}><Plus size={16} /> Add research</button>
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={filters.q} onChange={(v) => setFilters((x) => ({ ...x, q: v }))} placeholder="Search title, ID, owner…" />
        <select className="pill-select" value={filters.category_id} onChange={f('category_id')} aria-label="Category"><option value="">All categories</option>{meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="pill-select" value={filters.product_id} onChange={f('product_id')} aria-label="Product"><option value="">All products</option>{meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="pill-select" value={filters.owner} onChange={f('owner')} aria-label="Owner"><option value="">All owners</option>{meta?.options.owner.map((o) => <option key={o}>{o}</option>)}</select>
        <select className="pill-select" value={filters.status} onChange={f('status')} aria-label="Status"><option value="">All statuses</option>{meta?.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        {active && <button className="btn sm ghost" onClick={() => setFilters({ q: '', category_id: '', product_id: '', owner: '', status: '' })}>Clear filters</button>}
        <div className="grow" />
        <label className="row small muted">Jump to <input type="month" style={{ width: 150 }} onChange={(e) => e.target.value && cal.current.getApi().gotoDate(e.target.value + '-01')} aria-label="Jump to month" /></label>
      </div>
      <ErrorBox error={error} onRetry={load} />
      <div className="legend mb">{meta?.categories.filter((c) => c.active).map((c) => <span key={c.id}><i style={{ background: c.color }} />{c.name}</span>)}</div>
      <div className="card"><div className="card-b">
        <FullCalendar ref={cal} plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]} initialView="dayGridMonth" height="auto" contentHeight={640}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day', list: 'Agenda' }}
          events={events} editable selectable selectMirror dayMaxEvents={4} firstDay={1} nowIndicator
          datesSet={(a) => setRange((r) => (r && r.start === a.startStr.slice(0, 10) && r.end === a.endStr.slice(0, 10) ? r : { start: a.startStr.slice(0, 10), end: a.endStr.slice(0, 10) }))}
          select={(s) => setCreate({ start_date: s.startStr.slice(0, 10), end_date: addDays(s.endStr.slice(0, 10), -1) })}
          eventClick={open} eventDrop={moved} eventResize={moved}
          eventContent={(a) => (
            <div style={{ overflow: 'hidden', padding: '1px 2px' }}>
              <div style={{ fontWeight: 650, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{a.event.title}</div>
              {a.view.type !== 'dayGridMonth' || true ? <div style={{ fontSize: 10.5, opacity: .9, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{[a.event.extendedProps.product, a.event.extendedProps.status].filter(Boolean).join(' · ')}</div> : null}
            </div>)}
          eventDidMount={(a) => { a.el.title = `${a.event.extendedProps.code} · ${a.event.title}\n${a.event.extendedProps.category} · ${a.event.extendedProps.product || 'No product'}\n${a.event.extendedProps.status} · Owner: ${a.event.extendedProps.owner}`; }}
        />
        {events.length === 0 && range && <div className="muted small" style={{ marginTop: 12 }}>{active ? 'No studies match these filters in this period.' : 'No research is scheduled in this period. Click a date to add a study.'}</div>}
      </div></div>

      {create && (
        <Modal title="New research study" size="xl" onClose={() => setCreate(null)} dismissable={false}>
          <ResearchForm initial={create} onCancel={() => setCreate(null)} onSaved={(s) => { setCreate(null); load(); nav(`/research/${s.id}`); }} />
        </Modal>)}

      {selected && (
        <Modal title={`${selected.research_code} · ${selected.title}`} onClose={() => setSelected(null)}
          footer={<><button className="btn" onClick={() => nav(`/research/${selected.id}/edit`)}>Edit research</button><button className="btn primary" onClick={() => nav(`/research/${selected.id}`)}>Open details</button></>}>
          <div className="stack">
            <div className="row wrap"><CategoryChip name={selected.category_name} color={selected.category_color} /><StatusBadge status={selected.status} /><ResultsBadge status={selected.results_status} /></div>
            <dl className="kv">
              <dt>Dates</dt><dd>{fmtRange(selected.start_date, selected.end_date)}</dd>
              <dt>Product</dt><dd>{selected.product_name || '—'}{selected.screen_topic ? ` · ${selected.screen_topic}` : ''}</dd>
              <dt>Owner</dt><dd>{selected.owner}</dd>
              <dt>Participants</dt><dd>{selected.participant_count} assigned / {selected.required_total} required</dd>
            </dl>
            <div className="field"><label>Change dates</label>
              <div className="row"><input type="date" value={selected.start_date} onChange={(e) => setSelected({ ...selected, start_date: e.target.value })} /><span>→</span><input type="date" min={selected.start_date} value={selected.end_date} onChange={(e) => setSelected({ ...selected, end_date: e.target.value })} />
                <button className="btn sm" onClick={async () => { try { await api.patch(`/research/${selected.id}/dates`, { start_date: selected.start_date, end_date: selected.end_date }); toast('Dates updated'); load(); const c = await api.get(`/research/${selected.id}/conflicts`); setSelConflicts(c.conflicts); } catch (e) { toast(e.message, 'error'); } }}>Update</button></div></div>
            <ConflictAlert conflicts={selConflicts} />
          </div>
        </Modal>)}
    </>
  );
}
