import React, { useEffect } from 'react';

export default function ReviewModal({ title, subtitle, onClose, children, footer, narrow = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rv-scrim" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`rv-modal${narrow ? ' narrow' : ''}`}>
        <div className="rv-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button className="rv-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="rv-modal-body">{children}</div>
        {footer && <div className="rv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
