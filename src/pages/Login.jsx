import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { Icon } from '../components/Icon.jsx';

// login: email + password, then 6 digit code from authenticator app
export default function Login({ session, aal }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [factor, setFactor] = useState(null);   // { id }
  const [enroll, setEnroll] = useState(null);   // { id, qr, secret }

  const step = !session ? 'login' : 'code';

  useEffect(() => {
    if (!session) { setFactor(null); setEnroll(null); return; }
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) { setFactor({ id: verified.id }); return; }
      // first time: clear old unfinished setup and show a new qr code
      for (const f of data?.all || []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Reloved.Market ' + Date.now() });
      if (e) return setError(e.message);
      setEnroll({ id: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
    })();
  }, [session]);

  const signIn = async (e) => {
    e.preventDefault(); setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Enter a valid email address.');
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false); setPw('');
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : err.message);
  };

  const verify = async (e) => {
    e.preventDefault(); setError('');
    const factorId = factor?.id || enroll?.id;
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (err) { setError('That code didn’t work. Check the time on your phone and try again.'); setCode(''); }
    else await supabase.auth.refreshSession();
  };

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand-row"><img src="/logo.webp" alt="Relov3d Market" className="brand-logo" /></div>
        <div className="brand-copy">
          <h2 className="tagline"><span>Reuse.</span><span>Recycle.</span><span className="hl">Reloved.</span></h2>
          <p>Plan your day, price and list items for Carousell and Facebook, and prepare your weekly Threads posts.</p>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <div className="login-mobile-logo"><img src="/logo.webp" alt="Relov3d Market" className="login-logo" /></div>
          <h1>{step === 'login' ? 'Welcome back' : enroll ? 'Set up 2-step verification' : 'Two-step verification'}</h1>
          <p className="muted">{step === 'login' ? 'Sign in to manage your shop' : enroll ? 'Scan this with Google Authenticator, Authy or 1Password, then enter the 6-digit code.' : 'Enter the 6-digit code from your authenticator app.'}</p>

          {step === 'login' && (
            <form onSubmit={signIn} className="stack">
              <label className="field">
                <span>Email</span>
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@reloved.market" />
              </label>
              <label className="field row">
                <span className="grow">
                  <span>Password</span>
                  <input type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
                </span>
                <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={19} color="#8E8E93" stroke={1.9} />
                </button>
              </label>
              {error && <span className="error" role="alert">{error}</span>}
              <button className="btn glass" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verify} className="stack">
              {enroll && (
                <div className="qr-box">
                  <img src={enroll.qr} alt="QR code for your authenticator app" />
                  <span className="muted small">Can’t scan? Enter this key: <code>{enroll.secret}</code></span>
                </div>
              )}
              {!enroll && session && (
                <div className="note"><Icon name="shield" size={20} color="#FF8A5B" stroke={1.7} /><span>Signing in as <b>{session.user.email}</b></span></div>
              )}
              <label className="field">
                <span>Verification code</span>
                <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoFocus />
              </label>
              {error && <span className="error" role="alert">{error}</span>}
              <button className="btn primary" disabled={busy || code.length !== 6 || (!factor && !enroll)}>{busy ? 'Checking…' : 'Verify & continue'}</button>
              <button type="button" className="link-btn center" onClick={() => supabase.auth.signOut()}>Use a different account</button>
            </form>
          )}

          <div className="login-foot"><Icon name="lock" size={14} color="#636366" />Private workspace &amp; only for cool people</div>
        </div>
      </section>
    </div>
  );
}
