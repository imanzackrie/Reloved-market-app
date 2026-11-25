// small tilt effect that follows the mouse (laptop only, off on phone)
// sets --rx --ry (tilt) and --mx --my (light) for the css
const fine = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function tilt(max = 6) {
  if (!fine) return {};
  return {
    onMouseMove(e) {
      const el = e.currentTarget, r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${((0.5 - y) * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * max * 1.3).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    },
    onMouseLeave(e) {
      e.currentTarget.style.setProperty('--rx', '0deg');
      e.currentTarget.style.setProperty('--ry', '0deg');
    },
  };
}
