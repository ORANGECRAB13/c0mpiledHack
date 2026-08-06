import React from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function Icon({ name, size = 17, ...rest }) {
  const d = {
    home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.5V20h12V9.5" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" /></>,
    grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    org: <><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M9 8h2m2 0h2M9 12h2m2 0h2M9 16h2m2 0h2" /></>,
    shield: <><path d="M12 3.5 5.5 6v5c0 4.3 2.8 7.5 6.5 9.3 3.7-1.8 6.5-5 6.5-9.3V6L12 3.5Z" /><path d="m9.2 11.7 2 2 3.8-4.2" /></>,
    exchange: <><path d="M7 8h12l-3-3m3 3-3 3" /><path d="M17 16H5l3-3m-3 3 3 3" /></>,
    plug: <><path d="M9 4v5m6-5v5" /><path d="M6.5 9h11v3.5a5.5 5.5 0 0 1-11 0V9Z" /><path d="M12 18v3" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.6 1.6" /></>,
    warn: <><path d="M12 4.5 3.5 19.5h17L12 4.5Z" /><path d="M12 10.5v4" /><circle cx="12" cy="17" r="0.4" fill="currentColor" /></>,
    help: <><circle cx="12" cy="12" r="8" /><path d="M9.8 9.5A2.3 2.3 0 0 1 12 8c1.3 0 2.3.9 2.3 2 0 1.4-1.5 1.6-2.3 2.6v.6" /><circle cx="12" cy="16.2" r="0.4" fill="currentColor" /></>,
    user: <><circle cx="12" cy="9" r="3.4" /><path d="M5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" /></>,
    bell: <><path d="M12 4a5 5 0 0 0-5 5c0 4-1.5 5.5-2 6.5h14c-.5-1-2-2.5-2-6.5a5 5 0 0 0-5-5Z" /><path d="M10.3 18.5a1.8 1.8 0 0 0 3.4 0" /></>,
    chevL: <path d="m14 6-6 6 6 6" />,
    chevR: <path d="m10 6 6 6-6 6" />,
    chevD: <path d="m6 10 6 6 6-6" />,
    chevU: <path d="m6 14 6-6 6 6" />,
    upload: <><path d="M12 15V5m0 0-3.5 3.5M12 5l3.5 3.5" /><path d="M5 15v3.5h14V15" /></>,
    mic: <><rect x="9.5" y="4" width="5" height="10" rx="2.5" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    dots: <><circle cx="6" cy="12" r="0.8" fill="currentColor" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /><circle cx="18" cy="12" r="0.8" fill="currentColor" /></>,
    doc: <><path d="M7 3.5h7l4 4v13H7v-17Z" /><path d="M14 3.5v4h4" /></>,
    layers: <><path d="M12 4 20 8.5 12 13 4 8.5 12 4Z" /><path d="m4 13 8 4.5 8-4.5" /></>,
    star: <path d="m12 4.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7L12 4.5Z" />,
    play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></>,
    trash: <><path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13" /></>,
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
    refresh: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5V9H9" /></>,
    file: <><path d="M7 3.5h7l4 4v13H7v-17Z" /><path d="M10 12h5m-5 3.5h5" /></>,
    phone: <path d="M7 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5L16 12.5l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 5 6.2 2 2 0 0 1 7 4Z" />,
    mail: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 7.5 7 5.5 7-5.5" /></>,
    brain: <><path d="M9.5 5A2.8 2.8 0 0 0 6 8a3 3 0 0 0-1.3 5.3A3 3 0 0 0 7 18.5c.5 1.4 2 2 3.5 1.5" /><path d="M14.5 5A2.8 2.8 0 0 1 18 8a3 3 0 0 1 1.3 5.3A3 3 0 0 1 17 18.5c-.5 1.4-2 2-3.5 1.5" /><path d="M12 4.5v15" /></>,
    activity: <path d="M3.5 12h4l2.5-6.5 4 13 2.5-6.5h4" />,
    findings: <><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /><path d="M11 8.5v3l2 1.2" /></>,
    people: <><circle cx="9" cy="9.5" r="2.8" /><path d="M4 18.5c1-2.4 2.9-3.6 5-3.6s4 1.2 5 3.6" /><circle cx="16.5" cy="9" r="2.3" /><path d="M15.5 14.7c2 .1 3.6 1.3 4.5 3.3" /></>,
    key: <><circle cx="8.5" cy="12" r="3.5" /><path d="M12 12h8m-3 0v3m-2.5-3v2" /></>,
    back: <path d="M10 6 4 12l6 6M4 12h16" />,
    img: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" /></>,
    table: <><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M4 14.5h16M10 5v14M15 5v14" /></>,
    link: <><path d="M10 14a4 4 0 0 1 0-5.6l2.2-2.2a4 4 0 0 1 5.6 5.6l-1.3 1.3" /><path d="M14 10a4 4 0 0 1 0 5.6l-2.2 2.2a4 4 0 0 1-5.6-5.6l1.3-1.3" /></>,
    comment: <path d="M4.5 5.5h15v10.5H12l-4 3.5v-3.5H4.5V5.5Z" />,
    signature: <><path d="M4 18c3-1 4.5-6 5.5-10.5.3-1.4 2-1.4 2.2 0 .6 4 1 7.5 2.8 7.5 1.3 0 1.5-2 3-2 1 0 1.5 1 2.5 1" /></>,
    undo: <><path d="M8 6 4 10l4 4" /><path d="M4 10h10a5 5 0 0 1 0 10h-3" /></>,
    redo: <><path d="m16 6 4 4-4 4" /><path d="M20 10H10a5 5 0 0 0 0 10h3" /></>,
    save: <><path d="M5 4h11l3 3v13H5V4Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
    quote: <><path d="M5 7h6v6H8a3 3 0 0 1-3-3V7Z" /><path d="M13 7h6v6h-3a3 3 0 0 1-3-3V7Z" /></>,
    expand: <><path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" /></>,
    minus: <path d="M6 12h12" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    edit: <><path d="m14 5.5 4.5 4.5L9 19.5H4.5V15L14 5.5Z" /></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 4v4m8-4v4M4 11h16" /></>,
    zap: <path d="M13 3 5 13.5h5L10.5 21 19 10.5h-5.5L13 3Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" {...P} {...rest}>{d[name] || d.doc}</svg>;
}

// Alloovium flame-ish mark
export function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5c1 3.5 5.5 5 5.5 10a5.5 5.5 0 0 1-11 0c0-2 .8-3.5 2-5 .3 1.2 1 2 2 2.5-.4-2.6.3-5.5 1.5-7.5Z" fill="#E8622C" />
      <path d="M4 20.5h16" stroke="#E8622C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
