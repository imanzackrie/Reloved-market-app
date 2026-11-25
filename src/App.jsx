import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { StoreProvider, useStore } from './lib/store.jsx';
import { TabBar } from './components/TabBar.jsx';
import { Toast } from './components/Toast.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Planner from './pages/Planner.jsx';
import Listings from './pages/Listings.jsx';
import Threads from './pages/Threads.jsx';
import Settings from './pages/Settings.jsx';

function useRoute() {
  const get = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// logged in = password + 2-step code (aal2)
function useAuth() {
  const [state, setState] = useState({ loading: true, session: null, aal: null });
  useEffect(() => {
    const check = async (session) => {
      if (!session) return setState({ loading: false, session: null, aal: null });
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setState({ loading: false, session, aal: data });
    };
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => check(session), 0); });
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}

function Shell({ route }) {
  const { toast, loading, error } = useStore();
  const page = { '/': <Home />, '/planner': <Planner />, '/listings': <Listings />, '/threads': <Threads />, '/settings': <Settings /> }[route] || <Home />;
  return (
    <div className="app">
      {error && <div className="banner">Couldn’t load your data: {error}</div>}
      {loading ? <div className="loading"><span className="spinner" />Loading your shop…</div> : page}
      <TabBar route={route} />
      <Toast msg={toast} />
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const { loading, session, aal } = useAuth();
  if (loading) return <div className="loading full"><span className="spinner" /></div>;
  const verified = session && aal?.currentLevel === 'aal2';
  if (!verified) return <Login session={session} aal={aal} />;
  return <StoreProvider user={session.user}><Shell route={route} /></StoreProvider>;
}
