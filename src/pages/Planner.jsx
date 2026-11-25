import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Icon } from '../components/Icon.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Toggle } from '../components/Toggle.jsx';
import { KINDS, PAL } from '../lib/constants.js';
import { fmtTime, fromIso, glass, isoDate, pad, tint, todayIso } from '../lib/util.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// backup when google is not connected: open google calendar with the event filled in
function googleCalendarUrl(task) {
  const d = task.due_date.replace(/-/g, '');
  let dates;
  if (task.due_time) {
    const [h, m] = task.due_time.split(':').map(Number);
    const end = new Date(2000, 0, 1, h + 1, m);
    dates = `${d}T${pad(h)}${pad(m)}00/${d}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  } else {
    const next = isoDate(new Date(fromIso(task.due_date).getTime() + 864e5)).replace(/-/g, '');
    dates = `${d}/${next}`;
  }
  const q = new URLSearchParams({ action: 'TEMPLATE', text: task.title, dates, ctz: 'Asia/Kuala_Lumpur', details: `${KINDS[task.kind].label} · Reloved.Market${task.notes ? '\n' + task.notes : ''}` });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

export default function Planner() {
  const { tasks, addTask, updateTask, editTask, deleteTask, showToast, google, listGoogleEvents } = useStore();
  const [editing, setEditing] = useState(null);
  const [gEvents, setGEvents] = useState([]);
  const today = todayIso();
  const [sel, setSel] = useState(today);
  const [month, setMonth] = useState(() => { const d = fromIso(today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [folded, setFolded] = useState(false);
  const [sheet, setSheet] = useState(false);

  // phone: swipe up at the top closes the calendar (page doesn't move, so the list stays in view),
  // swipe down at the top opens it again. after it's closed, swiping scrolls the list like normal.
  const foldedRef = useRef(false);
  useEffect(() => { foldedRef.current = folded; }, [folded]);
  useEffect(() => {
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    let startY = 0, done = false;
    const atTop = () => window.scrollY <= 2;
    const decide = (dy, e) => {
      if (done || !atTop()) return;
      if (dy > 14 && !foldedRef.current) { done = true; setFolded(true); e.cancelable && e.preventDefault(); }
      else if (dy < -14 && foldedRef.current) { done = true; setFolded(false); e.cancelable && e.preventDefault(); }
    };
    const start = (e) => { startY = e.touches[0].clientY; done = false; };
    const move = (e) => { if (done) { if (atTop() && e.cancelable) e.preventDefault(); return; } decide(startY - e.touches[0].clientY, e); };
    let wheelLock = 0;
    const wheel = (e) => { if (Date.now() < wheelLock) return; done = false; decide(e.deltaY, e); if (done) wheelLock = Date.now() + 450; };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('wheel', wheel); };
  }, []);

  const byDate = useMemo(() => { const m = {}; tasks.forEach((t) => { (m[t.due_date] ||= []).push(t); }); return m; }, [tasks]);
  const gByDate = useMemo(() => { const m = {}; gEvents.forEach((e) => { (m[e.date] ||= []).push(e); }); return m; }, [gEvents]);

  const cells = useMemo(() => {
    const first = new Date(month); const lead = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const out = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); out.push({ iso: isoDate(d), num: d.getDate(), out: d.getMonth() !== month.getMonth() }); }
    while (out.length > 35 && out.slice(-7).every((c) => c.out)) out.splice(-7);
    return out;
  }, [month]);

  const rangeFrom = cells[0].iso, rangeTo = cells[cells.length - 1].iso;
  useEffect(() => {
    if (!google.connected) { setGEvents([]); return; }
    let live = true;
    listGoogleEvents(rangeFrom, rangeTo).then((ev) => { if (live) setGEvents(ev); }).catch(() => {});
    return () => { live = false; };
  }, [google.connected, rangeFrom, rangeTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const gList = (gByDate[sel] || []).slice().sort((a, b) => String(a.time || '00').localeCompare(String(b.time || '00')));
  const list = (byDate[sel] || []).slice().sort((a, b) => String(a.due_time || '99').localeCompare(String(b.due_time || '99')));
  const count = (...k) => list.filter((t) => k.includes(t.kind)).length;
  const left = list.filter((t) => !t.done).length;

  // fold the month into the selected week as you scroll (phone)
  const rows = cells.length / 7, CELL = 36, GAP = 6, FULL = rows * CELL + (rows - 1) * GAP;
  const p = folded ? 1 : 0;
  const selRow = Math.max(0, Math.floor(cells.findIndex((c) => c.iso === sel) / 7));
  const toggleFold = () => { setFolded(!folded); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const selDate = fromIso(sel);
  const dayTitle = (sel === today ? 'Today' : selDate.toLocaleDateString('en-MY', { weekday: 'long' })) + ', ' + selDate.getDate() + ' ' + MONTHS[selDate.getMonth()].slice(0, 3);
  const shiftMonth = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <main className="page planner">
      <div className="planner-head">
      <section className="cal" aria-label="Calendar" style={{ '--p': p, '--cal-h': `${Math.round(FULL - (FULL - CELL) * p)}px`, '--cal-shift': `-${Math.round(selRow * (CELL + GAP) * p)}px` }}>
        <div className="cal-top">
          <a href="#/" className="icon-btn dark" aria-label="Back to home"><Icon name="back" size={22} color="#303236" stroke={2.2} /></a>
          {google.connected ? <span className="sync-chip"><span className="dot" />Synced with Google</span> : <a href="#/settings" className="sync-chip"><span className="dot off" />Connect Google</a>}
        </div>
        <div className="cal-title-row">
          <div>
            <span className="cal-year" style={{ opacity: 0.75 * (1 - p) }}>{month.getFullYear()}</span>
            <div className="cal-month-row">
              <button className="month-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month"><Icon name="back" size={18} color="#303236" stroke={2.4} /></button>
              <button className="cal-month" onClick={toggleFold} aria-expanded={p < 1} style={{ fontSize: 30 - 8 * p }}>
                {MONTHS[month.getMonth()]}<Icon name="down" size={18} color="#303236" stroke={2.4} style={{ transform: `rotate(${p >= 1 ? 0 : 180}deg)`, transition: 'transform .3s' }} />
              </button>
              <button className="month-btn" onClick={() => shiftMonth(1)} aria-label="Next month"><Icon name="chevron" size={18} color="#303236" stroke={2.4} /></button>
            </div>
          </div>
          <button className="add-btn dark" onClick={() => setSheet(true)} aria-label="Add task"><Icon name="plus" size={20} color="#F5F5F5" stroke={2.4} /></button>
        </div>
        <div className="cal-dows"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div>
        <div className="cal-grid-wrap">
          <div className="cal-grid">
            {cells.map((c) => {
              const isToday = c.iso === today, on = c.iso === sel, has = !!byDate[c.iso]?.length || !!gByDate[c.iso]?.length, past = !c.out && c.iso < today;
              const cls = ['day', c.out && 'out', past && 'past', isToday && 'today', on && 'on'].filter(Boolean).join(' ');
              return (
                <button key={c.iso} className={cls} onClick={() => { setSel(c.iso); if (c.out) setMonth(new Date(fromIso(c.iso).getFullYear(), fromIso(c.iso).getMonth(), 1)); }}
                  aria-pressed={on} aria-label={`${c.num} ${MONTHS[fromIso(c.iso).getMonth()]}${has ? ', has tasks' : ''}`}>
                  {c.num}{has && <span className="day-dot" />}
                </button>
              );
            })}
          </div>
        </div>
        <button className="cal-handle" onClick={toggleFold} aria-label={p < 1 ? 'Hide the month' : 'Show the whole month'}><span /></button>
      </section>
        <div className="tiles phone-only planner-tiles">
          {[{ n: list.length, label: 'Tasks', c: PAL.peach }, { n: count('MEETUP', 'CALENDAR'), label: 'Meetups & events', c: PAL.lilac }, { n: count('LISTING', 'THREADS'), label: 'To post', c: PAL.sage }].map((t) => (
            <div key={t.label} className="tile" style={{ background: glass(t.c), border: `1px solid ${tint(t.c, 0.22)}`, boxShadow: `inset 0 1px 0 ${tint(t.c, 0.55)}` }}>
              <b style={{ color: t.c }}>{t.n}</b><span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="planner-body">
        <div className="desk-only">
        <div className="tiles">
          {[{ n: list.length, label: 'Tasks', c: PAL.peach }, { n: count('MEETUP', 'CALENDAR'), label: 'Meetups & events', c: PAL.lilac }, { n: count('LISTING', 'THREADS'), label: 'To post', c: PAL.sage }].map((t) => (
            <div key={t.label} className="tile" style={{ background: glass(t.c), border: `1px solid ${tint(t.c, 0.22)}`, boxShadow: `inset 0 1px 0 ${tint(t.c, 0.55)}` }}>
              <b style={{ color: t.c }}>{t.n}</b><span>{t.label}</span>
            </div>
          ))}
        </div>
        </div>
        <div className="row-between"><h2>{dayTitle}</h2><span className="muted small">{list.length ? `${left} of ${list.length} left` : ''}</span></div>
        <div className="timeline">
          {list.length + gList.length > 0 && <span className="timeline-line" aria-hidden="true" />}
          {list.map((t, i) => (
            <div key={t.id} className="tl-item" style={{ animationDelay: `${i * 60}ms` }}>
              <button className="tl-check" onClick={() => updateTask(t.id, { done: !t.done })} aria-pressed={t.done} aria-label={t.done ? 'Mark not done' : 'Mark done'}>
                <span className="tl-dot" style={{ background: t.done ? '#000' : KINDS[t.kind].color, borderColor: KINDS[t.kind].color }}>{t.done && <Icon name="check" size={9} color={KINDS[t.kind].color} stroke={3.5} />}</span>
              </button>
              <button className="tl-main" onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`}>
                <span className="tl-text"><span className={'tl-title' + (t.done ? ' done' : '')}>{t.title}</span>
                  <span className="muted small">{KINDS[t.kind].label}{t.notes ? ' · ' + t.notes : ''}{t.in_google_calendar ? ' · Google Calendar' : ''}</span></span>
                <span className="tl-time">{fmtTime(t.due_time)}</span>
              </button>
            </div>
          ))}
          {gList.map((e, i) => (
            <div key={'g' + e.id} className="tl-item" style={{ animationDelay: `${(list.length + i) * 60}ms` }}>
              <span className="tl-check"><span className="tl-dot" style={{ background: PAL.blue, borderColor: PAL.blue }} /></span>
              <a className="tl-main" href={e.link} target="_blank" rel="noopener noreferrer">
                <span className="tl-text"><span className="tl-title">{e.title}</span><span className="muted small">Google Calendar</span></span>
                <span className="tl-time">{e.allDay ? 'All day' : fmtTime(e.time)}</span>
              </a>
            </div>
          ))}
          {!list.length && !gList.length && <div className="empty">Nothing planned. Tap + to add a task.</div>}
        </div>
      </div>

      <TaskForm open={sheet} onClose={() => setSheet(false)} date={sel} synced={google.connected} onSave={async (t) => {
        const viaLink = t.in_google_calendar && !google.connected;
        if (viaLink) window.open(googleCalendarUrl(t), '_blank', 'noopener');
        try { await addTask(t); setSheet(false); showToast(!t.in_google_calendar ? 'Task added' : viaLink ? 'Saved · confirm it in Google Calendar' : 'Added to Google Calendar'); }
        catch (e) { showToast('Could not save: ' + e.message); }
      }} />
      <TaskForm open={!!editing} edit={editing} onClose={() => setEditing(null)} date={editing?.due_date || sel} synced={google.connected}
        onDelete={async () => { const t = editing; setEditing(null); await deleteTask(t.id); showToast(t.google_event_id ? 'Task deleted · removed from Google Calendar' : 'Task deleted'); }}
        onSave={async (patch) => {
          try { await editTask(editing.id, patch); setEditing(null); showToast('Task updated'); }
          catch (e) { showToast('Could not save: ' + e.message); }
        }} />
    </main>
  );
}

function TaskForm({ open, onClose, date, onSave, onDelete, synced, edit }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(date);
  const [time, setTime] = useState('10:00');
  const [kind, setKind] = useState('LISTING');
  const [gcal, setGcal] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(edit?.title || ''); setNotes(edit?.notes || ''); setDay(edit?.due_date || date);
    setTime(edit ? (edit.due_time || '').slice(0, 5) : '10:00'); setKind(edit?.kind || 'LISTING');
    setGcal(edit ? !!edit.in_google_calendar : true); setBusy(false);
  }, [open, edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day);
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    await onSave({ title: title.trim(), due_date: day, due_time: time || null, kind, notes: notes.trim() || null, in_google_calendar: gcal });
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit task' : 'New task'}
      right={<button className="chip-btn primary" disabled={!ok || busy} onClick={save}>{busy ? '…' : edit ? 'Save' : 'Add'}</button>}>
      <input className="input" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} autoFocus={!edit} />
      <div className="grid2">
        <label className="input faux"><Icon name="calendar" size={18} color="#E8845A" /><input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" /></label>
        <label className="input faux"><Icon name="clock" size={18} color="#E8845A" /><input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" /></label>
      </div>
      <div className="chips">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)} style={kind === k ? { borderColor: v.color } : undefined}>
            <span className="chip-dot" style={{ background: v.color }} />{v.label}
          </button>
        ))}
      </div>
      <input className="input" placeholder="Notes (optional): buyer, place, price…" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} />
      <div className="setting-row boxed">
        <span className="setting-icon" style={{ background: PAL.blue }}><Icon name="calendar" size={17} color="#111" stroke={2.1} /></span>
        <span className="grow"><span>{edit && edit.google_event_id ? 'In Google Calendar' : 'Add to Google Calendar'}</span>
          <span className="muted small">{synced ? (edit && edit.google_event_id && !gcal ? 'Will be removed from your calendar' : 'Saved straight to your calendar') : 'Opens Google Calendar with the event filled in'}</span></span>
        <Toggle on={gcal} onChange={setGcal} label="Add to Google Calendar" />
      </div>
      {edit && <button className="link-btn danger center" onClick={onDelete}>Delete task</button>}
    </Sheet>
  );
}
