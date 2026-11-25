export function Toggle({ on, onChange, label }) {
  return (
    <button type="button" className={'toggle' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
