import { createPortal } from 'react-dom';
import { useEffect } from 'react';

// bottom sheet on phone, popup in the middle on laptop
export function Sheet({ open, title, onClose, right, children, label }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal((
    <div className="sheet-dim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label || title}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <button className="link-btn" onClick={onClose}>Cancel</button>
          <span className="sheet-title">{title}</span>
          <span className="sheet-right">{right}</span>
        </div>
        {children}
      </div>
    </div>
), document.body  );
}
