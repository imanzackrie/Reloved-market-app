import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

const TABS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/planner', label: 'Planner', icon: 'calendar' },
  { to: '/listings', label: 'Listings', icon: 'tag' },
  { to: '/threads', label: 'Threads', icon: 'at' },
];

export function TabBar({ route }) {
  const navRef = useRef(null);
  const [pill, setPill] = useState(null);
  const active = TABS.findIndex((t) => t.to === route);

  // move the orange pill under whichever tab is open
  useLayoutEffect(() => {
    const place = () => {
      const el = navRef.current?.children[active + 1]; // +1 skips the pill itself
      if (!el || active < 0) return setPill(null);
      setPill({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight, y: el.offsetTop });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);

  return (
    <nav className="tabbar" aria-label="Main" ref={navRef}>
      <span
        className={'tab-pill' + (pill ? '' : ' hidden')}
        style={pill ? { width: pill.w, height: pill.h, transform: `translate(${pill.x}px, ${pill.y}px)` } : undefined}
      />
      {TABS.map((t) => {
        const on = route === t.to;
        return (
          <a key={t.to} href={'#' + t.to} className={'tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} size={20} stroke={1.9} fill={on ? 'rgba(255,106,61,0.22)' : 'none'} />
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
