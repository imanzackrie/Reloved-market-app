import { useEffect, useState } from 'react';
import { callFn, supabase } from '../lib/supabase.js';
import { useStore } from '../lib/store.jsx';
import { Icon } from '../components/Icon.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { Toggle } from '../components/Toggle.jsx';
import { PAL } from '../lib/constants.js';
import { shrinkImage } from '../lib/util.js';

export default function Settings() {
  const { user, profile, avatarUrl, saveProfile, uploadAvatar, removeAvatar, importCarousell, listings, showToast,
    google, refreshGoogle, connectGoogle, disconnectGoogle, tasks, syncTask } = useStore();
  const [gBusy, setGBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [name, setName] = useState(profile?.display_name || '');
  const [shop, setShop] = useState(profile?.shop_name || 'Reloved.Market');
  const [email, setEmail] = useState(profile?.business_email || '');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [factors, setFactors] = useState(0);

  // after google login it comes back here with ?google=...
  useEffect(() => {
    const r = new URLSearchParams(window.location.hash.split('?')[1] || '').get('google');
    if (!r) return;
    const msg = { connected: 'Google Calendar connected', cancelled: 'Google sign-in cancelled', noscope: 'Please tick the calendar permission and try again', error: 'Could not connect Google. Try again.' }[r];
    if (msg) showToast(msg);
    if (r === 'connected') refreshGoogle();
    window.history.replaceState(null, '', '#/settings');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onGoogle = async () => {
    setGBusy(true);
    try {
      if (google.connected) { await disconnectGoogle(); showToast('Google Calendar disconnected'); }
      else await connectGoogle();
    } catch (e) { showToast(e.message); }
    setGBusy(false);
  };
  const reconnectGoogle = async () => { setGBusy(true); try { await connectGoogle(); } catch (e) { showToast(e.message); setGBusy(false); } };
  const unsynced = tasks.filter((t) => t.in_google_calendar && !t.google_event_id && t.due_date >= new Date().toISOString().slice(0, 10));
  const syncOld = async () => { setGBusy(true); for (const t of unsynced) await syncTask(t); setGBusy(false); showToast('Tasks added to Google Calendar'); };

  useEffect(() => { supabase.auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp || []).filter((f) => f.status === 'verified').length)); }, []);

  const save = async (patch, msg = 'Saved') => { try { await saveProfile(patch); showToast(msg); } catch (e) { showToast('Could not save: ' + e.message); } };

  const onPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !/^image\//.test(f.type)) return;
    if (f.size > 15 * 1024 * 1024) return showToast('Photo is too large');
    setBusy(true);
    try { const s = await shrinkImage(f, 512, 0.85); await uploadAvatar(s.blob); showToast('Photo updated'); } catch (err) { showToast('Upload failed: ' + err.message); }
    setBusy(false);
  };

  const fromCarousell = listings.filter((l) => l.carousell_id).length;

  return (
    <main className="page settings">
      <header className="page-head">
        <div className="row"><a href="#/" className="icon-btn" aria-label="Back to home"><Icon name="back" size={22} /></a><h1>Settings</h1></div>
      </header>

      <div className="settings-grid">
        <div className="settings-side">
          <section className="card profile-card">
            <label className="avatar-upload" title="Change profile photo">
              <Avatar url={avatarUrl} size={96} badge />
              <input type="file" accept="image/*" onChange={onPhoto} aria-label="Upload profile photo" />
            </label>
            <b className="profile-name">{profile?.display_name}</b>
            <span className="muted small">Owner · {profile?.shop_name}</span>
            <div className="row gap">
              <label className="chip-btn soft file">{busy ? 'Uploading…' : 'Upload photo'}<input type="file" accept="image/*" onChange={onPhoto} /></label>
              {avatarUrl && <button className="link-btn accent" onClick={async () => { await removeAvatar(); showToast('Photo removed'); }}>Remove</button>}
            </div>
          </section>
          <button className="btn logout desk-only" onClick={() => setConfirm(true)}><Icon name="logout" size={20} color="#FF8A5B" />Log out</button>
        </div>

        <div className="settings-main">
          <Group title="PROFILE">
            <label className="setting-row"><span className="setting-label">Name</span>
              <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== profile?.display_name && save({ display_name: name.trim() }, 'Name updated')} aria-label="Display name" /></label>
            <label className="setting-row"><span className="setting-label">Shop name</span>
              <input value={shop} maxLength={40} onChange={(e) => setShop(e.target.value)} onBlur={() => shop.trim() && shop.trim() !== profile?.shop_name && save({ shop_name: shop.trim() })} aria-label="Shop name" /></label>
          </Group>

          <Group title="ACCOUNT & SECURITY">
            <div className="setting-row"><span className="grow">Login email</span><span className="muted">{user.email}</span></div>
            <div className="setting-row"><span className="grow"><span>2-step verification</span><span className="muted small">Code from your authenticator app</span></span><span className={'state' + (factors ? ' on' : '')}>{factors ? 'On' : 'Off'}</span></div>
            <div className="setting-row"><span className="grow"><span>Password</span><span className="muted small">Changed only by the owner in Supabase</span></span><Icon name="lock" size={17} color="#636366" /></div>
            <button className="setting-row btn-row" onClick={async () => { await supabase.auth.signOut({ scope: 'others' }); showToast('Signed out of other devices'); }}>
              <span className="grow">Sign out other devices</span><Icon name="chevron" size={16} color="#636366" stroke={2.4} /></button>
          </Group>

          <Group title="CONNECTED">
            <Linked color={PAL.peach} icon="tag" name="Carousell" sub={fromCarousell ? `@relov3d.market · ${fromCarousell} listings` : 'Import your listings'}
              action={<button className="chip-btn outline" onClick={async () => { try { await importCarousell(); showToast('Carousell listings up to date'); } catch (e) { showToast(e.message); } }}>{fromCarousell ? 'Re-import' : 'Import'}</button>} />
            <Linked color={PAL.blue} icon="calendar" name="Google Calendar"
              sub={google.connected ? (google.email ? `Synced · ${google.email}` : 'Synced') : google.configured ? 'Not connected' : 'Needs Google keys in Supabase (see README)'}
              action={<button className={'chip-btn ' + (google.connected ? 'outline' : 'primary')} disabled={gBusy || !google.loaded || (!google.connected && !google.configured)} onClick={onGoogle}>
                {gBusy ? <span className="spinner dark" /> : google.connected ? 'Disconnect' : 'Connect'}</button>} />
            {google.connected && unsynced.length > 0 && (
              <button className="setting-row btn-row" onClick={syncOld} disabled={gBusy}><span className="grow"><span>Add {unsynced.length} upcoming task{unsynced.length > 1 ? 's' : ''} to Google Calendar</span><span className="muted small">Tasks you saved before connecting</span></span><Icon name="chevron" size={18} color="#636366" /></button>
            )}
            <Linked color={PAL.rose} icon="at" name="Threads" sub="Posts open in the Threads app" action={<span className="state on">On</span>} />
            <Linked color={PAL.sage} icon="send" name="Gmail" sub="Needed for the daily email" action={<span className="state">Soon</span>} />
          </Group>

          <Group title="NOTIFICATIONS">
            <div className="setting-row"><span className="grow"><span>Daily plan email</span><span className="muted small">{profile?.daily_email ? 'Every morning at 7:40am · sent from your Gmail' : 'Off. Add an email to turn on'}</span></span>
              <Toggle on={!!profile?.daily_email} onChange={(v) => {
                if (v && !email.trim()) return showToast('Add your business email first');
                if (v && !google.connected) return showToast('Connect Google first (Connected → Google Calendar)');
                save({ daily_email: v }, v ? 'Daily email on' : 'Daily email off');
              }} label="Daily plan email" /></div>
            <label className="setting-row"><span className="setting-label">Send to</span>
              <input type="email" placeholder="Add business email" value={email} onChange={(e) => setEmail(e.target.value.trim())}
                onBlur={() => { if (email === (profile?.business_email || '')) return; if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showToast('That email doesn’t look right'); save({ business_email: email || null }); }} aria-label="Business email" /></label>
            {google.connected && !google.canEmail && (
              <button className="setting-row btn-row" onClick={reconnectGoogle} disabled={gBusy}>
                <span className="grow"><span>Allow Gmail to send the email</span><span className="muted small">Reconnect Google and tick “Send email on your behalf”</span></span>
                <span className="chip-btn primary">Reconnect</span></button>
            )}
            {google.canEmail && (
              <button className="setting-row btn-row" disabled={mailBusy || !profile?.business_email} onClick={async () => {
                setMailBusy(true);
                try { const r = await callFn('daily-email', {}); showToast(`Test email sent to ${r.to}`); } catch (e) { showToast(e.message); }
                setMailBusy(false);
              }}>
                <span className="grow"><span>Send a test email now</span><span className="muted small">{profile?.business_email ? 'See what tomorrow’s email will look like' : 'Add a business email first'}</span></span>
                {mailBusy ? <span className="spinner" /> : <Icon name="send" size={18} color="#FF8A5B" />}</button>
            )}
          </Group>

          <button className="btn logout phone-only" onClick={() => setConfirm(true)}><Icon name="logout" size={20} color="#FF8A5B" />Log out</button>
          <span className="muted tiny center">Reloved.Market · version 1.0</span>
        </div>
      </div>

      {confirm && (
        <div className="sheet-dim" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="action-sheet" role="dialog" aria-label="Log out">
            <div className="as-box"><div className="as-msg"><b>Log out of Reloved.Market?</b><span className="muted small">You’ll need your password and verification code to sign back in.</span></div>
              <button className="as-btn danger" onClick={() => supabase.auth.signOut()}>Log out</button></div>
            <button className="as-box as-btn" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Group({ title, children }) {
  return <section className="group"><span className="group-title">{title}</span><div className="group-box">{children}</div></section>;
}

function Linked({ color, icon, name, sub, action }) {
  return (
    <div className="setting-row tall">
      <span className="setting-icon" style={{ background: color }}><Icon name={icon} size={17} color="#111" stroke={2.1} /></span>
      <span className="grow"><span>{name}</span><span className="muted small">{sub}</span></span>
      {action}
    </div>
  );
}
