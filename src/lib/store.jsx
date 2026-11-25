import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { callFn, supabase } from './supabase.js';
import { CAROUSELL_SEED } from './seed.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

// loads all my data once + save functions for each page
export function StoreProvider({ user, children }) {
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [listings, setListings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToastMsg] = useState('');
  // shop owner id (me, or the owner if I'm added as a partner). listing photos go in their folder
  const [shopId, setShopId] = useState(null);
  useEffect(() => { supabase.rpc('shop_owner').then(({ data }) => setShopId(data || user.id)); }, [user.id]);
  const [google, setGoogle] = useState({ configured: false, connected: false, email: null, loaded: false });

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    window.clearTimeout(showToast.t);
    showToast.t = window.setTimeout(() => setToastMsg(''), 2600);
  }, []);

  const loadAvatar = useCallback(async (path) => {
    if (!path) return setAvatarUrl('');
    const { data } = await supabase.storage.from('photos').createSignedUrl(path, 60 * 60);
    setAvatarUrl(data?.signedUrl || '');
  }, []);

  const reload = useCallback(async () => {
    setError('');
    const [p, l, t, s] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('listings').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('due_date').order('due_time', { nullsFirst: false }),
      supabase.from('posts').select('*').order('scheduled_for', { nullsFirst: false }),
    ]);
    const firstErr = [p, l, t, s].find((r) => r.error)?.error;
    if (firstErr) setError(firstErr.message);
    setProfile(p.data);
    setListings(l.data || []);
    setTasks(t.data || []);
    setPosts(s.data || []);
    loadAvatar(p.data?.avatar_path);
    setLoading(false);
  }, [user.id, loadAvatar]);

  useEffect(() => { reload(); }, [reload]);

  // old carousell photos are inside /public, move them to supabase storage (runs once)
  const moving = useRef(false);
  useEffect(() => {
    const todo = listings.filter((l) => !l.photo_path && l.photo_url?.startsWith('/carousell/'));
    if (!todo.length || moving.current || !shopId) return;
    moving.current = true;
    (async () => {
      let done = 0;
      for (const l of todo) {
        try {
          const res = await fetch(l.photo_url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const path = `${shopId}/carousell-${l.carousell_id || l.id}.webp`;
          const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/webp', upsert: true });
          if (upErr) continue;
          const { data, error: e } = await supabase.from('listings').update({ photo_path: path, photo_url: null }).eq('id', l.id).select().single();
          if (e) continue;
          setListings((xs) => xs.map((x) => (x.id === l.id ? data : x)));
          done++;
        } catch { /* try again next time */ }
      }
      if (done) showToast(`${done} photo${done > 1 ? 's' : ''} saved to your database`);
      moving.current = false;
    })();
  }, [listings, shopId, showToast]);

  // profile
  const saveProfile = async (patch) => {
    const { data, error: e } = await supabase.from('profiles').update(patch).eq('id', user.id).select().single();
    if (e) throw e;
    setProfile(data);
    return data;
  };
  const uploadAvatar = async (file) => {
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    const { error: e } = await supabase.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: true });
    if (e) throw e;
    if (profile?.avatar_path) await supabase.storage.from('photos').remove([profile.avatar_path]);
    await saveProfile({ avatar_path: path });
    loadAvatar(path);
  };
  const removeAvatar = async () => {
    if (profile?.avatar_path) await supabase.storage.from('photos').remove([profile.avatar_path]);
    await saveProfile({ avatar_path: null });
    setAvatarUrl('');
  };

  // listings
  const addListing = async (row) => {
    const { data, error: e } = await supabase.from('listings').insert(row).select().single();
    if (e) throw e;
    setListings((xs) => [data, ...xs]);
    return data;
  };
  const updateListing = async (id, patch) => {
    const { data, error: e } = await supabase.from('listings').update(patch).eq('id', id).select().single();
    if (e) throw e;
    setListings((xs) => xs.map((x) => (x.id === id ? data : x)));
    return data;
  };
  const deleteListing = async (id) => {
    const { error: e } = await supabase.from('listings').delete().eq('id', id);
    if (e) throw e;
    setListings((xs) => xs.filter((x) => x.id !== id));
  };
  const importCarousell = async () => {
    const { error: e } = await supabase.from('listings').upsert(CAROUSELL_SEED, { onConflict: 'owner,carousell_id', ignoreDuplicates: true });
    if (e) throw e;
    await reload();
  };
  const uploadListingPhoto = async (blob) => {
    const path = `${shopId || user.id}/listing-${Date.now()}.jpg`;
    const { error: e } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (e) throw e;
    return path;
  };

  // google calendar
  const refreshGoogle = useCallback(async () => {
    try { const g = await callFn('gcal', { action: 'status' }); setGoogle({ ...g, loaded: true }); return g; }
    catch { setGoogle((g) => ({ ...g, loaded: true })); return null; }
  }, []);
  useEffect(() => { refreshGoogle(); }, [refreshGoogle]);
  const connectGoogle = async () => {
    const { url } = await callFn('gcal', { action: 'connect', returnTo: window.location.origin + window.location.pathname });
    window.location.assign(url);
  };
  const disconnectGoogle = async () => { await callFn('gcal', { action: 'disconnect' }); await refreshGoogle(); };
  const listGoogleEvents = (from, to) => callFn('gcal', { action: 'list', from, to }).then((r) => r.events || []);
  const syncTask = async (task) => {
    if (!google.connected) return null;
    try {
      const { eventId } = await callFn('gcal', { action: 'upsert', task });
      setTasks((xs) => xs.map((x) => (x.id === task.id ? { ...x, google_event_id: eventId, in_google_calendar: true } : x)));
      return eventId;
    } catch (e) { showToast('Google Calendar: ' + e.message); refreshGoogle(); return null; }
  };

  // tasks
  const addTask = async (row) => {
    const { data, error: e } = await supabase.from('tasks').insert(row).select().single();
    if (e) throw e;
    setTasks((xs) => [...xs, data]);
    if (row.in_google_calendar) await syncTask(data);
    return data;
  };
  const updateTask = async (id, patch) => {
    const before = tasks.find((x) => x.id === id);
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error: e } = await supabase.from('tasks').update(patch).eq('id', id);
    if (e) { showToast('Could not save: ' + e.message); reload(); return; }
    if (before?.google_event_id) syncTask({ ...before, ...patch });
  };
  // save task edits and update the google calendar event too
  const editTask = async (id, patch) => {
    const before = tasks.find((x) => x.id === id);
    const extra = {};
    if (!patch.in_google_calendar && before?.google_event_id) {
      if (google.connected) callFn('gcal', { action: 'delete', eventId: before.google_event_id }).catch(() => {});
      extra.google_event_id = null;
    }
    const { data, error: e } = await supabase.from('tasks').update({ ...patch, ...extra }).eq('id', id).select().single();
    if (e) throw e;
    setTasks((xs) => xs.map((x) => (x.id === id ? data : x)));
    if (patch.in_google_calendar && google.connected) await syncTask(data);
    return data;
  };
  const deleteTask = async (id) => {
    const before = tasks.find((x) => x.id === id);
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((xs) => xs.filter((x) => x.id !== id));
    if (before?.google_event_id && google.connected) callFn('gcal', { action: 'delete', eventId: before.google_event_id }).catch(() => {});
  };

  // threads posts
  const addPost = async (row) => {
    const { data, error: e } = await supabase.from('posts').insert(row).select().single();
    if (e) throw e;
    setPosts((xs) => [...xs, data]);
    return data;
  };
  const updatePost = async (id, patch) => {
    setPosts((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error: e } = await supabase.from('posts').update(patch).eq('id', id);
    if (e) { showToast('Could not save: ' + e.message); reload(); }
  };
  const deletePost = async (id) => {
    await supabase.from('posts').delete().eq('id', id);
    setPosts((xs) => xs.filter((x) => x.id !== id));
  };

  const stats = useMemo(() => {
    const sold = listings.filter((l) => l.status === 'sold');
    const live = listings.filter((l) => l.status === 'listed');
    const sum = (xs, f) => xs.reduce((a, x) => a + Number(f(x) || 0), 0);
    return {
      soldCount: sold.length,
      soldValue: sum(sold, (l) => l.sold_price ?? l.price),
      liveCount: live.length,
      liveValue: sum(live, (l) => l.price),
      drafts: listings.filter((l) => l.status === 'draft').length,
    };
  }, [listings]);

  const value = {
    user, profile, avatarUrl, listings, tasks, posts, loading, error, stats, toast, showToast, reload,
    saveProfile, uploadAvatar, removeAvatar,
    addListing, updateListing, deleteListing, importCarousell, uploadListingPhoto,
    addTask, updateTask, editTask, deleteTask, addPost, updatePost, deletePost,
    google, refreshGoogle, connectGoogle, disconnectGoogle, listGoogleEvents, syncTask,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// photo url for a listing (signed url if it's in storage)
export function usePhoto(listing) {
  const [src, setSrc] = useState(listing?.photo_url || '');
  useEffect(() => {
    let alive = true;
    if (listing?.photo_path) {
      supabase.storage.from('photos').createSignedUrl(listing.photo_path, 60 * 60).then(({ data }) => { if (alive) setSrc(data?.signedUrl || ''); });
    } else setSrc(listing?.photo_url || '');
    return () => { alive = false; };
  }, [listing?.photo_path, listing?.photo_url]);
  return src;
}
