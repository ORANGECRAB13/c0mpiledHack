import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PAGE_W = 470;   // rendered page width (css px)
const GAP = 22;

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// does this text-layer item belong to the quote?
function itemMatches(str, quote) {
  const it = norm(str), q = norm(quote);
  if (it.length < 6) return false;
  if (q.includes(it) || it.includes(q)) return true;
  // shingle fallback: any 24-char window of the item appears in the quote
  for (let i = 0; i + 24 <= it.length; i += 8) {
    if (q.includes(it.slice(i, i + 24))) return true;
  }
  return false;
}

// Real PDF viewer: virtualized page rendering, agent-driven scroll,
// text-layer highlight + reasoning bubble.
export default function PdfViewer({ url, target, onMeta }) {
  const [doc, setDoc] = useState(null);
  const [pageSize, setPageSize] = useState(null); // {w,h,scale}
  const [rects, setRects] = useState([]);         // highlight boxes
  const [bubble, setBubble] = useState(null);     // {top, reason, n}
  const scrollRef = useRef(null);
  const canvases = useRef({});                    // pageNo -> canvas el
  const rendered = useRef(new Set());
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // load document
  useEffect(() => {
    let dead = false;
    rendered.current = new Set();
    canvases.current = {};
    setDoc(null); setPageSize(null); setRects([]); setBubble(null);
    pdfjsLib.getDocument({ url: new URL(url, window.location.origin).href }).promise.then(async (d) => {
      if (dead) return;
      const p1 = await d.getPage(1);
      const [, , w, h] = p1.view;
      const scale = PAGE_W / w;
      setPageSize({ w: PAGE_W, h: h * scale, scale });
      setDoc(d);
      onMeta?.({ numPages: d.numPages });
    });
    return () => { dead = true; timers.current.forEach(clearTimeout); };
  }, [url]);

  const renderPage = async (n) => {
    if (!doc || rendered.current.has(n) || n < 1 || n > doc.numPages) return;
    rendered.current.add(n);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: pageSize.scale * 2 }); // retina
    const canvas = canvases.current[n];
    if (!canvas) { rendered.current.delete(n); return; }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
  };

  const visiblePages = () => {
    const box = scrollRef.current;
    if (!box || !pageSize) return [];
    const per = pageSize.h + GAP;
    const first = Math.max(1, Math.floor(box.scrollTop / per));
    const last = Math.min(doc?.numPages || 1, Math.ceil((box.scrollTop + box.clientHeight) / per) + 1);
    const out = [];
    for (let i = first; i <= last; i++) out.push(i);
    return out;
  };

  const onScroll = () => visiblePages().forEach(renderPage);

  // initial render + react to target changes: scroll → highlight → bubble
  useEffect(() => {
    if (!doc || !pageSize) return;
    visiblePages().forEach(renderPage);
    if (!target) return;
    setRects([]); setBubble(null);
    const per = pageSize.h + GAP;
    const top = (target.page - 1) * per - 40;
    // pre-render destination so it's crisp when we arrive
    renderPage(target.page); renderPage(target.page + 1);
    later(() => {
      const box = scrollRef.current;
      if (!box) return;
      const dist = Math.abs(top - box.scrollTop);
      if (dist > 3000) {
        // long jump: leap near the target, then glide in
        box.scrollTop = Math.max(0, top - 1600);
        visiblePages().forEach(renderPage);
        requestAnimationFrame(() => box.scrollTo({ top, behavior: 'smooth' }));
      } else {
        box.scrollTo({ top, behavior: 'smooth' });
      }
    }, 150);
    later(async () => {
      const page = await doc.getPage(target.page);
      const viewport = page.getViewport({ scale: pageSize.scale });
      const tc = await page.getTextContent();
      const quotes = Array.isArray(target.quote) ? target.quote : [target.quote];
      const boxes = [];
      for (const item of tc.items) {
        if (!item.str || !quotes.some((q) => itemMatches(item.str, q))) continue;
        const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fh = Math.hypot(m[2], m[3]);
        boxes.push({
          left: m[4] - 2,
          top: (target.page - 1) * per + (m[5] - fh) - 2,
          width: item.width * pageSize.scale + 4,
          height: fh + 5,
        });
      }
      setRects(boxes);
      if (boxes.length) {
        const first = boxes.reduce((a, b) => (b.top < a.top ? b : a));
        later(() => setBubble({ top: first.top - 6, reason: target.reason, n: target.n }), 550);
        // keep the highlight centred
        later(() => scrollRef.current?.scrollTo({ top: first.top - scrollRef.current.clientHeight / 2 + 60, behavior: 'smooth' }), 350);
      } else {
        later(() => setBubble({ top: top + 120, reason: target.reason, n: target.n }), 550);
      }
    }, 1050);
  }, [doc, pageSize, target?.key]);

  if (!doc || !pageSize) {
    return (
      <div className="viewer-empty">
        <span className="spinner" style={{ width: 18, height: 18 }} />
        <span>Opening {url.split('/').pop()}…</span>
      </div>
    );
  }

  const per = pageSize.h + GAP;
  return (
    <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="pdf-inner" style={{ height: doc.numPages * per, width: PAGE_W }}>
        {Array.from({ length: doc.numPages }, (_, i) => (
          <div className="pdf-pagebox" key={i} style={{ top: i * per, height: pageSize.h, width: PAGE_W }}>
            <canvas
              ref={(el) => { if (el) canvases.current[i + 1] = el; }}
              style={{ width: PAGE_W, height: pageSize.h }}
            />
            <span className="pdf-pageno">{i + 1}</span>
          </div>
        ))}
        {rects.map((r, i) => (
          <div className="pdf-hl" key={i} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
        ))}
        {bubble && (
          <div className="whybubble" style={{ position: 'absolute', left: PAGE_W + 26, top: bubble.top, width: 240 }}>
            <div className="wb-h"><span className="cn">{bubble.n}</span> Why this matters</div>
            <div className="wb-b">{bubble.reason}</div>
          </div>
        )}
      </div>
    </div>
  );
}
