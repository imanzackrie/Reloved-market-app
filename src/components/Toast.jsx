import { Icon } from './Icon.jsx';
export function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast" role="status"><Icon name="ok" size={16} color="#7EE2A4" stroke={2.6} />{msg}</div>;
}
