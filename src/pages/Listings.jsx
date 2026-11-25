import { tilt } from '../lib/tilt.js';
import { useEffect, useState } from 'react';
import { useStore, usePhoto } from '../lib/store.jsx';
import { callFn } from '../lib/supabase.js';
import { Icon } from '../components/Icon.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { CATS, CONDITIONS } from '../lib/constants.js';
import { copyText, rm, shrinkImage, tint } from '../lib/util.js';

// category icon (png mask so it can change colour)
function CatIcon({ c, size, color, stroke }) {
  if (c.img) return <span className="cat-mask" aria-hidden="true" style={{ width: size * 1.25, height: size * 1.25, background: color, WebkitMaskImage: `url(${c.img})`, maskImage: `url(${c.img})` }} />;
  return <Icon path={c.icon} size={size} color={color} stroke={stroke} />;
}

const captionFor = (l) => l.description || `${l.title}\nCondition: ${l.condition || 'Preloved'}. Cleaned, checked and ready to use.\nPrice ${rm(l.price)}, slightly nego.\nMeetup around Klang Valley or postage available.\nDM relov3d.market on Carousell to grab it.`;

export default function Listings() {
  const { listings, importCarousell, showToast } = useStore();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [allSold, setAllSold] = useState(false);
  const [sheet, setSheet] = useState(() => window.location.hash.includes('new=1'));
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (window.location.hash.includes('new=1')) window.history.replaceState(null, '', '#/listings'); }, []);

  const match = (l) => (cat === 'all' || l.category === cat) && (!q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  const live = listings.filter((l) => (l.status === 'listed' || l.status === 'draft') && match(l));
  const soldAll = listings.filter((l) => l.status === 'sold' && match(l));
  const sold = allSold ? soldAll : soldAll.slice(0, 6);
  const sel = listings.find((l) => l.id === selId) || null;
  const deskSel = sel || live[0] || soldAll[0] || null;

  const totalLive = listings.filter((l) => l.status === 'listed').length;
  const totalSold = listings.filter((l) => l.status === 'sold').length;
  const soldValue = listings.filter((l) => l.status === 'sold').reduce((a, l) => a + Number(l.sold_price ?? l.price ?? 0), 0);

  if (!listings.length) {
    return (
      <main className="page listings">
        <PageHead onAdd={() => setSheet(true)} />
        <div className="empty big">
          <Icon name="tag" size={40} color="#FF8A5B" stroke={1.6} />
          <h2>No listings yet</h2>
          <p className="muted">Bring in the 36 listings from your Carousell shop @relov3d.market, or add a new item.</p>
          <button className="btn primary" disabled={importing} onClick={async () => {
            setImporting(true);
            try { await importCarousell(); showToast('Imported your Carousell listings'); } catch (e) { showToast('Import failed: ' + e.message); }
            setImporting(false);
          }}>{importing ? 'Importing…' : 'Import my Carousell listings'}</button>
        </div>
        <ListingForm open={sheet} onClose={() => setSheet(false)} />
      </main>
    );
  }

  return (
    <main className={'page listings' + (sel ? ' has-detail' : '')}>
      <div className="listings-main">
        <PageHead onAdd={() => setSheet(true)} />
        <div className="search-row">
          <label className="search"><Icon name="search" size={19} color="#8E8E93" stroke={2.2} />
            <input type="search" placeholder="Search your listings" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" /></label>
        </div>
        <div className="mini-stats">
          <div><b>{totalLive}</b><span>For sale</span></div>
          <div><b>{totalSold}</b><span>Sold</span></div>
          <div><b>{rm(soldValue)}</b><span>Sold value</span></div>
        </div>
        <div className="cat-row">
          {Object.entries(CATS).map(([k, c]) => (
            <button key={k} className={'cat' + (cat === k ? ' on' : '')} onClick={() => { setCat(k); setAllSold(false); }} aria-pressed={cat === k} aria-label={c.label}>
              <span className="cat-icon" style={{ background: cat === k ? c.color : 'transparent' }}><CatIcon c={c} size={19} color={cat === k ? '#111' : c.color} /></span>
              <span className="cat-label">{c.label}</span>
            </button>
          ))}
        </div>

        <div className="row-between"><h2>For sale</h2><span className="muted small">{live.length} item{live.length === 1 ? '' : 's'}</span></div>
        <div className="card-row">
          {live.map((l, i) => <ProductCard key={l.id} l={l} i={i} active={deskSel?.id === l.id} onOpen={() => setSelId(l.id)} />)}
          {!live.length && <div className="empty">Nothing for sale here.</div>}
        </div>

        <div className="row-between"><h2>Recently sold</h2>
          {soldAll.length > 6 && <button className="link-btn accent" onClick={() => setAllSold(!allSold)}>{allSold ? 'Show less' : `See all ${soldAll.length}`}</button>}</div>
        <div className="sold-list">
          {sold.map((l) => <SoldRow key={l.id} l={l} active={deskSel?.id === l.id} onOpen={() => setSelId(l.id)} />)}
          {!sold.length && <div className="empty">No sold items here.</div>}
        </div>
      </div>

      {sel && <Detail l={sel} onBack={() => setSelId(null)} className="detail phone-only" />}
      {deskSel && <Detail l={deskSel} className="detail desk-only" />}
      <ListingForm open={sheet} onClose={() => setSheet(false)} onSaved={(l) => setSelId(l.id)} />
    </main>
  );
}

function PageHead({ onAdd }) {
  return (
    <header className="page-head">
      <div><h1>Listings</h1><span className="muted small">relov3d.market · Carousell</span></div>
      <button className="add-btn" onClick={onAdd} aria-label="New listing"><Icon name="plus" size={20} color="#111" stroke={2.4} /></button>
    </header>
  );
}

function Photo({ l, size = 46 }) {
  const src = usePhoto(l);
  const c = CATS[l.category] || CATS.furn;
  return src ? <img src={src} alt="" loading="lazy" className="photo" /> : <CatIcon c={c} size={size} color={c.color} stroke={1.5} />;
}

function ProductCard({ l, i, onOpen, active }) {
  const c = CATS[l.category] || CATS.furn;
  return (
    <button className={'product' + (active ? ' active' : '')} {...tilt(4)} onClick={onOpen} style={{ animationDelay: `${i * 80}ms`, '--c': c.color }}>
      <span className="product-img" style={{ background: `linear-gradient(160deg, ${tint(c.color, 0.55)}, ${tint(c.color, 0.14)}), #232325` }}>
        <Photo l={l} />
        {l.likes > 0 && <span className="likes"><Icon name="heart" size={13} fill="#FF6A3D" color="#FF6A3D" />{l.likes}</span>}
        {l.status === 'draft' && <span className="badge">Draft</span>}
      </span>
      <span className="product-info">
        <span className="product-title">{l.title}</span>
        <span className="muted small">{l.condition}</span>
        <span className="price-row"><b>{rm(l.price)}</b>{l.was_price ? <s className="muted small">{rm(l.was_price)}</s> : null}
          <span className="go"><Icon path="M7 17L17 7M9 7h8v8" size={15} color="#111" stroke={2.6} /></span></span>
      </span>
    </button>
  );
}

function SoldRow({ l, onOpen, active }) {
  const c = CATS[l.category] || CATS.furn;
  return (
    <button className={'sold-row' + (active ? ' active' : '')} onClick={onOpen} style={{ '--c': c.color }}>
      <span className="thumb" style={{ background: `linear-gradient(160deg, ${tint(c.color, 0.45)}, ${tint(c.color, 0.12)}), #232325` }}><Photo l={l} size={26} /></span>
      <span className="grow"><span className="sold-title">{l.title}</span><span className="muted small">{l.condition}</span><b>{rm(l.sold_price ?? l.price)}</b></span>
      <span className="sold-badge">SOLD</span>
    </button>
  );
}

function Detail({ l, onBack, className }) {
  const { updateListing, deleteListing, showToast } = useStore();
  const c = CATS[l.category] || CATS.furn;
  const [price, setPrice] = useState(Number(l.price) || 0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setPrice(Number(l.price) || 0), [l.id, l.price]);
  const changed = price !== Number(l.price);
  const caption = captionFor(l);

  const save = async (patch, msg) => {
    setBusy(true);
    try { await updateListing(l.id, patch); showToast(msg); } catch (e) { showToast('Could not save: ' + e.message); }
    setBusy(false);
  };

  return (
    <aside className={className} aria-label="Listing details">
      <div className="detail-top">
        {onBack && <button className="icon-btn" onClick={onBack} aria-label="Back to listings"><Icon name="back" size={22} /></button>}
        <span className="detail-label">Listing</span>
        <span className="row">
          {l.carousell_url && <a className="icon-btn" href={l.carousell_url} target="_blank" rel="noopener noreferrer" aria-label="Open on Carousell"><Icon name="external" size={20} /></a>}
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit listing"><Icon name="edit" size={20} /></button>
        </span>
      </div>
      <div className="hero" style={{ background: `linear-gradient(160deg, ${tint(c.color, 0.6)}, ${tint(c.color, 0.14)}), #232325` }}>
        <Photo l={l} size={96} />
        <span className="likes big"><Icon name="heart" size={14} fill="#FF6A3D" color="#FF6A3D" />{l.likes} {l.likes === 1 ? 'like' : 'likes'}</span>
      </div>
      <div className="detail-card">
        <div className="row-between top">
          <div className="grow"><span className="cat-tag" style={{ color: c.color }}>{c.label.toUpperCase()}</span><h2>{l.title}</h2>
            <button className="link-btn accent edit-link" onClick={() => setEditing(true)}><Icon name="edit" size={14} color="#FF8A5B" />Edit details</button></div>
          <div className="price-tag-wrap"><span className="price-tag">{rm(l.price)}</span>{l.was_price ? <s className="muted small">Was {rm(l.was_price)}</s> : null}</div>
        </div>
        <div className="chips">
          {CONDITIONS.map((k) => <span key={k} className="cond" style={k === l.condition ? { background: c.color, color: '#111' } : undefined}>{k}</span>)}
        </div>
        {l.status === 'sold' && <div className="sold-note">Sold at {rm(l.sold_price ?? l.price)}{l.carousell_id ? ' on Carousell (listed price)' : ''}</div>}
        <div className="desc">
          <span className="ai-label">Caption</span>
          <p>{caption}</p>
        </div>
      </div>
      <div className="action-bar">
        <div className="row-between">
          <div className="stepper">
            <button onClick={() => setPrice(Math.max(0, price - 5))} aria-label="Lower price by RM5">−</button>
            <b>{rm(price)}</b>
            <button onClick={() => setPrice(price + 5)} aria-label="Raise price by RM5">+</button>
          </div>
          {changed ? <button className="chip-btn primary" disabled={busy} onClick={() => save({ price }, 'Price updated')}>Save price</button>
            : <span className="muted small">Current price</span>}
        </div>
        <div className="grid2">
          <button className="btn primary" onClick={async () => showToast((await copyText(`${l.title}\n${rm(l.price)}\n\n${caption}`)) ? 'Caption copied' : 'Copy failed')}>Copy caption</button>
          {l.status === 'sold'
            ? <button className="btn outline" disabled={busy} onClick={() => save({ status: 'listed', sold_at: null }, 'Listed again')}>Relist</button>
            : <button className="btn outline" disabled={busy} onClick={() => save({ status: 'sold', sold_price: l.price, sold_at: new Date().toISOString() }, 'Marked as sold')}>Mark as sold</button>}
        </div>
        {!l.carousell_id && <button className="link-btn danger center" onClick={async () => { await deleteListing(l.id); onBack?.(); showToast('Listing deleted'); }}>Delete listing</button>}
      </div>
      <ListingForm open={editing} onClose={() => setEditing(false)} edit={l} />
    </aside>
  );
}

// add / edit listing. AI help button is optional
function ListingForm({ open, onClose, onSaved, edit }) {
  const { addListing, updateListing, uploadListingPhoto, showToast } = useStore();
  const editPhoto = usePhoto(edit);
  const [img, setImg] = useState(null); // new photo
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [cat, setCat] = useState('furn');
  const [cond, setCond] = useState('Like new');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [gen, setGen] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setImg(null); setGen(null); setErr('');
    setTitle(edit?.title || ''); setPrice(edit?.price != null ? String(Number(edit.price)) : '');
    setCat(edit?.category || 'furn'); setCond(edit?.condition || 'Like new'); setDesc(edit?.description || '');
  }, [open, edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { if (img) URL.revokeObjectURL(img.url); onClose(); };

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type)) return setErr('Use a JPG, PNG or WebP photo.');
    try { const s = await shrinkImage(f); if (img) URL.revokeObjectURL(img.url); setImg({ url: URL.createObjectURL(s.blob), blob: s.blob, base64: s.base64 }); setErr(''); }
    catch { setErr('Could not read that photo.'); }
  };

  const askAI = async () => {
    if (!title.trim() && !img) return setErr('Type the item name or add a photo first.');
    setAiBusy(true); setErr('');
    try {
      const r = await callFn('ai-listing', { name: title.trim(), category: cat, condition: cond, imageBase64: img?.base64, mediaType: 'image/jpeg' });
      setGen(r);
      if (!title.trim()) setTitle(r.title);
      setDesc(r.description);
      if (!price) setPrice(String(r.price || ''));
    } catch (e) { setErr(e.message); }
    setAiBusy(false);
  };

  const ok = title.trim().length > 0;
  const save = async () => {
    if (!ok) return setErr('Add a title.');
    setBusy(true); setErr('');
    try {
      const photo_path = img ? await uploadListingPhoto(img.blob) : undefined;
      const row = { title: title.trim(), description: desc.trim() || null, category: cat, condition: cond, price: price === '' ? null : Number(price) };
      if (photo_path) row.photo_path = photo_path;
      if (edit) { await updateListing(edit.id, row); showToast('Listing updated'); close(); onSaved?.(edit); }
      else { const l = await addListing({ ...row, status: 'listed', photo_path: photo_path || null }); showToast('Added to For sale'); close(); onSaved?.(l); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const shown = img?.url || (edit ? editPhoto : '');
  return (
    <Sheet open={open} onClose={close} title={edit ? 'Edit listing' : 'New listing'}
      right={<button className="chip-btn primary" disabled={!ok || busy} onClick={save}>{busy ? '…' : 'Save'}</button>}>
      <label className="photo-drop small">
        {shown ? <img src={shown} alt="Item" /> : (<><Icon name="camera" size={28} color="#fff" stroke={1.7} /><b>Add photo</b><span className="muted small">Optional</span></>)}
        <input type="file" accept="image/*" onChange={onFile} aria-label="Upload item photo" />
        {shown && <span className="photo-change">Change</span>}
      </label>
      <label className="field-col"><span className="label">TITLE</span>
        <input className="input" placeholder="e.g. IKEA Poäng armchair" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} autoFocus={!edit} /></label>
      <label className="field-col"><span className="label">PRICE (RM)</span>
        <input className="input" inputMode="decimal" placeholder="e.g. 120" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} /></label>
      <span className="label">CATEGORY</span>
      <div className="chips">{Object.entries(CATS).filter(([k]) => k !== 'all').map(([k, c]) => <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)}>{c.label}</button>)}</div>
      <span className="label">CONDITION</span>
      <div className="chips">{CONDITIONS.slice(0, 4).map((c) => <button key={c} className={'chip' + (cond === c ? ' on' : '')} onClick={() => setCond(c)}>{c}</button>)}</div>
      <label className="field-col">
        <span className="row-between"><span className="label">DESCRIPTION</span>
          <button type="button" className="ai-chip" disabled={aiBusy} onClick={askAI}>
            {aiBusy ? <span className="spinner dark" /> : <Icon name="sparkle" size={14} color="#111" />}{aiBusy ? 'Writing…' : 'AI help'}
          </button></span>
        <textarea className="input" rows={6} placeholder="Type it yourself, or tap AI help to write it and suggest a price" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      {gen && (
        <div className="ai-mini fade-in">
          <span><span className="muted">AI price </span><b>{rm(gen.price)}</b></span>
          <span className="muted small">Range {rm(gen.low)}–{Math.round(gen.high)} · quick sale {rm(gen.quick)}</span>
          {String(gen.price) !== price && <button type="button" className="link-btn accent" onClick={() => setPrice(String(gen.price))}>Use this price</button>}
        </div>
      )}
      {err && <span className="error" role="alert">{err}</span>}
      <button className="btn primary" disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Add to For sale'}</button>
    </Sheet>
  );
}
