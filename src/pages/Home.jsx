import { tilt } from '../lib/tilt.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Icon, ICONS } from '../components/Icon.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { PAL } from '../lib/constants.js';
import { fmtTime, fromIso, glass, isoDate, rm, tint, todayIso } from '../lib/util.js';

// phone stack sizes: each file shows its full title row before the next one starts
const STEP = 108, CARD_H = 330;
const PEEK = 80, LIFT = 6; // phone scroll: how much a file opens up, and how high it lifts
const TAB_X = ['6%', '42%', '24%', '60%'];
// how much room a file needs when it pops out (depends on how many lines it has)
const room = (f) => 58 + Math.max(1, f.lines.length) * 48;

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q); const on = () => setWide(m.matches);
    m.addEventListener('change', on); return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function Home() {
  const { profile, avatarUrl, stats, tasks, posts, listings } = useStore();
  const wide = useWide();
  const today = todayIso();

  const folders = useMemo(() => {
    const todays = tasks.filter((t) => t.due_date === today && !t.done);
    const weekEnd = isoDate(new Date(fromIso(today).getTime() + 6 * 864e5));
    const weekPosts = posts.filter((p) => p.scheduled_for && p.scheduled_for >= today && p.scheduled_for <= weekEnd);
    const sold = listings.filter((l) => l.status === 'sold');
    const avg = sold.length ? stats.soldValue / sold.length : 0;
    return [
      { id: 'plan', tab: 'PLANNING', title: "Today's Plan", color: PAL.peach, icon: ICONS.check, img: '/icon-plan.webp', href: '#/planner', cta: 'Open planner',
        sub: todays.length ? `${todays.length} task${todays.length > 1 ? 's' : ''} today` : 'Nothing planned today',
        lines: todays.slice(0, 3).map((t) => ({ a: `${fmtTime(t.due_time) || 'Any time'} · ${t.title}`, b: t.kind.charAt(0) + t.kind.slice(1).toLowerCase() })) },
      { id: 'list', tab: 'LISTINGS', title: 'Product Listing', color: PAL.lilac, icon: ICONS.tag, img: '/icon-listing.webp', imgFull: true, href: '#/listings', cta: 'See listings',
        sub: `${stats.liveCount} for sale · ${stats.soldCount} sold`,
        lines: [{ a: 'For sale', b: `${stats.liveCount} · ${rm(stats.liveValue)}` }, { a: 'Sold all-time', b: `${stats.soldCount} items` }, { a: 'Sold value (listed price)', b: rm(stats.soldValue) }] },
      { id: 'price', tab: 'AI PRICE', title: 'AI Price Check', color: PAL.sage, icon: ICONS.camera, img: '/icon-price.webp', href: '#/listings?new=1', cta: 'Take a photo',
        sub: 'Snap a photo, get a RM price',
        lines: [{ a: 'Average sold price', b: avg ? '≈ ' + rm(avg) : '-' }, { a: 'Caption for FB + Carousell', b: 'Auto' }] },
      { id: 'threads', tab: 'THREADS', title: 'Threads Ideas', color: PAL.rose, icon: ICONS.at, img: '/icon-threads.webp', href: '#/threads', cta: 'See this week',
        sub: `${weekPosts.length} post${weekPosts.length === 1 ? '' : 's'} planned this week`,
        lines: weekPosts.slice(0, 3).map((p) => ({ a: `${fromIso(p.scheduled_for).toLocaleDateString('en-MY', { weekday: 'short' })} · ${p.text.split('\n')[0].slice(0, 34)}`, b: p.status === 'approved' ? 'Ready' : p.status === 'posted' ? 'Posted' : 'Draft' })) },
    ];
  }, [tasks, posts, listings, stats, today]);

  return (
    <main className="page home">
      <header className="home-head">
        <div className="home-hello">
          <a href="#/settings" aria-label="Edit profile"><Avatar url={avatarUrl} size={wide ? 64 : 58} badge /></a>
          <div className="hello-text">
            <span className="hello">Hi, {profile?.display_name || 'there'}</span>
            {wide && <span className="muted small">Reloved.Market</span>}
          </div>
        </div>
        <a href="#/settings" className="round-btn" aria-label="Settings"><Icon name="gear" size={21} stroke={1.9} /></a>
      </header>
      {!wide && <h1 className="big-title">Reloved.Market</h1>}

      <section className="sales" aria-label="Sales overview">
        <span className="sales-main"><b>{rm(stats.soldValue)}</b><span className="muted"> sold · {stats.soldCount} items</span></span>
        <span className="sales-sub"><span className="muted">For sale</span> <b>{rm(stats.liveValue)}</b> <span className="muted">({stats.liveCount})</span></span>
      </section>

      {wide ? <DesktopFolders folders={folders} /> : <PhoneFolders folders={folders} />}
    </main>
  );
}

function FolderHead({ f, onClick, onDouble, expanded }) {
  return (
    <button className="folder-head" onClick={onClick} onDoubleClick={onDouble} aria-expanded={expanded}>
      <span className="folder-icon" style={{ background: f.color }}>{f.img ? <img src={f.img} alt="" className={'folder-img' + (f.imgFull ? ' full' : '')} /> : <Icon path={f.icon} size={26} color="#111" stroke={2.1} />}</span>
      <span className="folder-text"><span className="folder-title">{f.title}</span><span className="folder-sub">{f.sub}</span></span>
    </button>
  );
}

function PhoneFolders({ folders }) {
  const [open, setOpen] = useState(null);
  const [focus, setFocus] = useState(0);
  const offset = useRef(0);
  const els = useRef([]);
  const stackRef = useRef(null);
  const lastTap = useRef(null);
  const openIdx = folders.findIndex((f) => f.id === open);
  const EXPAND = openIdx > -1 ? room(folders[openIdx]) : 0;
  const total = (folders.length - 1) * STEP + CARD_H + (openIdx > -1 && openIdx < folders.length - 1 ? EXPAND : 0);

  // scrolling: each file eases up a little, one after another.
  // this writes the transforms straight to the elements every frame (no react re-render) so it stays smooth
  const paint = () => {
    const t = offset.current / STEP;
    const ease = (x) => x * x * (3 - 2 * x);
    let shift = 0;
    folders.forEach((f, i) => {
      const el = els.current[i];
      const b = openIdx > -1 ? 0 : ease(Math.max(0, 1 - Math.abs(i - t)));
      const d = i - t;
      let rx = 0, sc = 1, fade = 1;
      if (openIdx === -1 && d < -0.3) { const k = Math.min(1, (-d - 0.3) / 1.4); rx = -14 * k; sc = 1 - 0.04 * k; fade = 1 - 0.35 * k; }
      if (el) {
        el.style.transform = `translate3d(0, ${(shift - LIFT * b).toFixed(1)}px, 0) perspective(900px) rotateX(${rx.toFixed(1)}deg) scale(${(sc * (1 + 0.016 * b)).toFixed(4)}, ${sc.toFixed(4)})`;
        el.style.opacity = fade.toFixed(3);
      }
      shift += b * Math.min(room(f), PEEK);
    });
    const next = openIdx > -1 ? -1 : Math.max(0, Math.min(folders.length - 1, Math.round(t)));
    setFocus((cur) => (cur === next ? cur : next));
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  useLayoutEffect(() => { paint(); });

  useEffect(() => {
    let raf = 0, idle = 0;
    const stack = stackRef.current;
    const on = () => {
      stack?.classList.add('scrolling');
      clearTimeout(idle);
      idle = setTimeout(() => stack?.classList.remove('scrolling'), 160);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // spread the files over the whole scroll, so the last one gets its turn right at the bottom of the page
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        offset.current = p * (folders.length - 1) * STEP;
        paintRef.current();
      });
    };
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); clearTimeout(idle); };
  }, []);

  const tap = (f) => {
    const now = Date.now();
    if (lastTap.current && lastTap.current.id === f.id && now - lastTap.current.t < 350) { window.location.hash = f.href.slice(1); return; }
    lastTap.current = { id: f.id, t: now };
    setOpen(open === f.id ? null : f.id);
  };

  return (
    <div className="stack-wrap">
      <div ref={stackRef} className="folder-stack" style={{ height: total }}>
        {folders.map((f, i) => {
          const pop = i === focus;
          const top = i * STEP + (openIdx > -1 && i > openIdx ? EXPAND : 0);
          return (
            <div key={f.id} ref={(el) => { els.current[i] = el; }} className="folder" style={{ top, left: 0, right: 0, zIndex: i + 1, height: CARD_H, animationDelay: `${i * 70}ms` }}>
              <div className="folder-tab" style={{ left: TAB_X[i % TAB_X.length], color: f.color, background: `linear-gradient(${tint(f.color, 0.4)}, ${tint(f.color, 0.4)}), rgba(24,24,26,0.92)` }}>{f.tab}</div>
              <div className="folder-body" style={{ background: glass(f.color), boxShadow: pop ? `0 -14px 34px rgba(0,0,0,.55), 0 0 0 1px ${tint(f.color, 0.6)} inset` : `0 -10px 24px rgba(0,0,0,.38), inset 0 1px 0 ${tint(f.color, 0.55)}`, filter: focus > -1 && i < focus ? 'brightness(0.82)' : 'none' }}>
                <FolderHead f={f} onClick={() => tap(f)} expanded={open === f.id} />
                <div className="folder-lines">
                  {f.lines.length ? f.lines.map((l, k) => <div key={k} className="line"><span>{l.a}</span><b>{l.b}</b></div>) : <div className="line muted">Nothing here yet</div>}
                  <a href={f.href} className="pill-btn" style={{ background: f.color }}>{f.cta}<Icon name="chevron" size={15} color="#111" stroke={2.4} /></a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopFolders({ folders }) {
  const [sel, setSel] = useState('plan');
  const f = folders.find((x) => x.id === sel) || folders[0];
  // open the file when mouse is on it (small delay so it doesn't flicker)
  const hoverTimer = useRef(0);
  const hoverOpen = (id) => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setSel(id), 120); };
  const hoverCancel = () => window.clearTimeout(hoverTimer.current);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  return (
    <div className="home-grid">
      <div className="folder-stack desk" style={{ height: (folders.length - 1) * 96 + 200 }}>
        {folders.map((x, i) => (
          <div key={x.id} className={'folder' + (sel === x.id ? ' is-open' : '')} {...tilt(2.5)} onMouseEnter={() => hoverOpen(x.id)} onMouseLeave={(e) => { hoverCancel(); tilt(2.5).onMouseLeave?.(e); }} style={{ top: i * 96, left: sel === x.id ? -5 : 0, right: sel === x.id ? -5 : 0, zIndex: i + 1, height: 200, animationDelay: `${i * 70}ms` }}>
            <div className="folder-tab" style={{ left: [18, 150, 84, 216][i] + 4, color: x.color, background: `linear-gradient(${tint(x.color, 0.4)}, ${tint(x.color, 0.4)}), rgba(24,24,26,0.92)` }}>{x.tab}</div>
            <div className="folder-body" style={{ background: glass(x.color), boxShadow: `0 -10px 26px rgba(0,0,0,.42), inset 0 1px 0 ${tint(x.color, 0.55)}` + (sel === x.id ? `, inset 0 0 0 2px ${x.color}` : '') }}>
              <FolderHead f={x} onClick={() => setSel(x.id)} onDouble={() => { window.location.hash = x.href.slice(1); }} expanded={sel === x.id} />
            </div>
          </div>
        ))}
      </div>
      <section className="panel fade-in" key={f.id} style={{ background: glass(f.color), boxShadow: `inset 0 1px 0 ${tint(f.color, 0.55)}` }}>
        <div className="panel-head">
          <span className="folder-icon big" style={{ background: f.color }}>{f.img ? <img src={f.img} alt="" className={'folder-img' + (f.imgFull ? ' full' : '')} /> : <Icon path={f.icon} size={32} color="#111" stroke={2} />}</span>
          <div><h2>{f.title}</h2><span className="muted">{f.sub}</span></div>
        </div>
        <div className="panel-grid">
          {f.lines.length ? f.lines.map((l, k) => <div key={k} className="panel-cell"><span className="muted">{l.a}</span><b>{l.b}</b></div>) : <div className="panel-cell"><span className="muted">Nothing here yet</span></div>}
        </div>
        <a href={f.href} className="pill-btn big" style={{ background: f.color }}>{f.cta}<Icon name="chevron" size={16} color="#111" stroke={2.4} /></a>
      </section>
    </div>
  );
}
