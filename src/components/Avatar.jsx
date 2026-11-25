import { Icon } from './Icon.jsx';
export function Avatar({ url, size = 60, ring = true, badge = false }) {
  return (
    <span className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size }}>
      {url ? <img src={url} alt="Profile" /> : <Icon name="user" size={size * 0.5} color="#C7C7CC" stroke={1.7} />}
      {badge && <span className="avatar-badge" aria-hidden="true"><Icon name="camera" size={12} color="#111" stroke={2.6} /></span>}
    </span>
  );
}
