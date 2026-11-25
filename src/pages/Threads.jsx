import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { callFn } from '../lib/supabase.js';
import { Icon } from '../components/Icon.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { TRENDS } from '../lib/constants.js';
import { fromIso, isoDate, todayIso } from '../lib/util.js';

const threadsIntent = (text) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text);
const dayLabel = (iso) => (iso ? fromIso(iso).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date');

export default function Threads() {
  const { posts, updatePost, deletePost, showToast } = useStore();
  const [tab, setTab] = useState('feed');
  const [sheet, setSheet] = useState(null); // null | { text }
  const today = todayIso();
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDate(new Date(fromIso(today).getTime() + i * 864e5))), [today]);
  const feed = posts.filter((p) => p.status !== 'posted' || (p.scheduled_for && p.scheduled_for >= today));

  const postNow = (p) => {
    const tags = (p.hashtags || []).filter((t) => t !== p.topic_tag).join(' ');
    window.open(threadsIntent(p.text + (tags ? '\n' + tags : '')), '_blank', 'noopener');
    updatePost(p.id, { status: 'posted' });
    showToast('Opened in Threads');
  };

  const Feed = (
    <section className="feed" aria-label="Posts">
      <button className="composer" onClick={() => setSheet({ text: '' })}>
        <span className="t-avatar">R</span>
        <span className="grow"><b>relov3d.market</b><span className="muted">What’s new?</span></span>
        <span className="chip-btn outline">Post</span>
      </button>
      {feed.map((p, i) => {
        const ok = p.status === 'approved';
        return (
          <article key={p.id} className="t-post" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="t-rail"><span className="t-avatar">R</span><span className="t-line" /></div>
            <div className="grow">
              <div className="t-meta"><b>relov3d.market</b><span className="muted">· {dayLabel(p.scheduled_for)}</span><span className="grow" />{p.topic_tag && <span className="t-badge">{p.topic_tag}</span>}</div>
              <div className="t-text">{p.text}</div>
              {(p.hashtags || []).length > 1 && <div className="t-tags">{p.hashtags.filter((t) => t !== p.topic_tag).join(' ')}</div>}
              <div className="t-actions">
                <button className={'t-act' + (ok ? ' on' : '')} onClick={() => updatePost(p.id, { status: ok ? 'draft' : 'approved' })} aria-pressed={ok}>
                  <Icon name="heart" size={19} fill={ok ? '#FF6A3D' : 'none'} color={ok ? '#FF6A3D' : '#B0B0B0'} stroke={1.9} />{p.status === 'posted' ? 'Posted' : ok ? 'Approved' : 'Approve'}</button>
                <button className="t-act" onClick={() => setSheet({ text: p.text, replace: p.id, date: p.scheduled_for })}><Icon name="refresh" size={19} color="#B0B0B0" stroke={1.9} />Rewrite</button>
                <button className="t-act" onClick={() => { deletePost(p.id); showToast('Post deleted'); }} aria-label="Delete post"><Icon name="trash" size={18} color="#B0B0B0" stroke={1.9} /></button>
                <span className="grow" />
                <button className="t-act" onClick={() => postNow(p)} aria-label="Post now on Threads"><Icon name="send" size={19} color="#B0B0B0" stroke={1.9} /></button>
              </div>
            </div>
          </article>
        );
      })}
      {!feed.length && <div className="empty">No posts planned yet. Tap + to write one.</div>}
    </section>
  );

  const Trending = (
    <section className="t-card" aria-label="Trending in Malaysia">
      <div className="t-card-head"><b>Trending in Malaysia</b><span className="muted small">Sample topics until the Threads API is connected</span></div>
      {TRENDS.map((t, i) => (
        <div key={t.topic} className="trend">
          <span className="muted">{i + 1}</span>
          <span className="grow"><b>{t.topic}</b><span className="muted small">{t.why}</span></span>
          <button className="chip-btn outline" onClick={() => setSheet({ text: `${t.topic}: ` })}>Use</button>
        </div>
      ))}
    </section>
  );

  const Week = (
    <section className="t-card pad" aria-label="This week">
      <b className="t-card-title">This week</b>
      {week.map((d) => {
        const p = posts.find((x) => x.scheduled_for === d);
        return (
          <div key={d} className="week-row">
            <span className="muted week-dow">{fromIso(d).toLocaleDateString('en-MY', { weekday: 'short' }).toUpperCase()}</span>
            <span className="grow ellipsis">{p ? p.text.split('\n')[0] : <span className="muted">-</span>}</span>
            {p && <span className={'state' + (p.status !== 'draft' ? ' on' : '')}>{p.status === 'posted' ? 'Posted' : p.status === 'approved' ? 'Approved' : 'Draft'}</span>}
          </div>
        );
      })}
    </section>
  );

  return (
    <main className="page threads">
      <header className="t-head">
        <a href="#/" className="icon-btn" aria-label="Back to home"><Icon name="back" size={22} /></a>
        <Icon name="at" size={30} stroke={2.1} />
        <button className="add-btn" onClick={() => setSheet({ text: '' })} aria-label="New post"><Icon name="plus" size={20} color="#111" stroke={2.4} /></button>
      </header>
      <div className="t-tabs phone-only">
        {[['feed', 'For you'], ['trend', 'Trending MY'], ['sched', 'Scheduled']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}>{l}</button>
        ))}
      </div>
      <div className="phone-only">{tab === 'feed' ? Feed : tab === 'trend' ? Trending : Week}</div>
      <div className="threads-grid desk-only">{Feed}<aside className="t-side">{Trending}{Week}</aside></div>
      <NewPost open={!!sheet} seed={sheet} week={week} onClose={() => setSheet(null)} />
    </main>
  );
}

function NewPost({ open, seed, week, onClose }) {
  const { addPost, updatePost, showToast } = useStore();
  const [idea, setIdea] = useState('');
  const [out, setOut] = useState('');
  const [tags, setTags] = useState([]);
  const [picked, setPicked] = useState([]);
  const [day, setDay] = useState(week[1]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastSeed, setLastSeed] = useState(null);
  if (open && seed !== lastSeed) {
    setLastSeed(seed); setIdea(seed?.text || ''); setOut(''); setTags([]); setPicked([]); setErr(''); setDay(seed?.date && week.includes(seed.date) ? seed.date : week[1]);
  }

  const paraphrase = async () => {
    if (!idea.trim()) return;
    setBusy(true); setErr('');
    try { const r = await callFn('ai-threads', { text: idea }); setOut(r.post); setTags(r.hashtags); setPicked(r.hashtags.slice(0, 2)); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const extra = picked.slice(1).join(' ');
  const finalLen = [...(out + (extra ? '\n' + extra : ''))].length;
  const save = async () => {
    const row = { text: out.trim(), topic_tag: picked[0] || null, hashtags: picked, scheduled_for: day, status: 'draft' };
    try {
      if (seed?.replace) await updatePost(seed.replace, row); else await addPost(row);
      showToast('Saved to ' + fromIso(day).toLocaleDateString('en-MY', { weekday: 'long' }) + '’s plan'); onClose();
    } catch (e) { setErr(e.message); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={seed?.replace ? 'Rewrite post' : 'New post'} right={<button className="chip-btn primary" disabled={!out.trim()} onClick={save}>Save</button>}>
      <div className="t-compose">
        <span className="t-avatar">R</span>
        <div className="grow"><b>relov3d.market</b>
          <textarea rows={4} placeholder="Write your idea in any words…" value={idea} onChange={(e) => setIdea(e.target.value.slice(0, 800))} aria-label="Your idea" /></div>
      </div>
      <button className="btn soft" disabled={busy || !idea.trim()} onClick={paraphrase}>
        {busy ? <span className="spinner dark" /> : <Icon name="sparkle" size={17} color="#111" />}{busy ? 'Rewriting…' : out ? 'Paraphrase again' : 'Paraphrase with AI'}
      </button>
      {err && <span className="error" role="alert">{err}</span>}
      {out && (
        <div className="stack fade-in">
          <label className="field-col"><span className="label row-between"><span>AI VERSION</span><span style={{ color: finalLen > 500 ? '#FF6A3D' : undefined }}>{finalLen} / 500</span></span>
            <textarea className="input" rows={7} value={out} onChange={(e) => setOut(e.target.value)} /></label>
          <span className="label">SUGGESTED HASHTAGS</span>
          <div className="chips">{tags.map((t) => { const on = picked.includes(t); return <button key={t} className={'chip tag' + (on ? ' on' : '')} onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}>{t}</button>; })}</div>
          <span className="muted tiny">Threads shows one topic tag per post. The first one you pick becomes the topic; the rest go at the end of your text.</span>
          <span className="label">POST ON</span>
          <div className="day-pick">{week.map((d) => { const dd = fromIso(d); return (
            <button key={d} className={day === d ? 'on' : ''} onClick={() => setDay(d)}><span>{dd.toLocaleDateString('en-MY', { weekday: 'short' }).toUpperCase()}</span><b>{dd.getDate()}</b></button>); })}</div>
        </div>
      )}
    </Sheet>
  );
}
