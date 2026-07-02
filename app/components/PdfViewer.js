'use client';
import { useState, useEffect, useRef } from 'react';

// Loaded once on first open, never in Node.js (useEffect is browser-only)
let pdfjsCache = null;
async function loadPdfjs() {
  if (!pdfjsCache) {
    pdfjsCache = await import('pdfjs-dist');
    pdfjsCache.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }
  return pdfjsCache;
}

const zoomBtnStyle = {
  fontSize: 20, fontWeight: 300, color: '#fff',
  background: 'rgba(255,255,255,0.15)', border: 'none',
  borderRadius: 6, cursor: 'pointer', padding: '2px 10px', lineHeight: 1.4,
};

function pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function PdfViewer({ url }) {
  const scrollRef = useRef();
  const pagesRef  = useRef();
  const pdfDocRef = useRef(null);
  const pinchRef  = useRef({ active: false, startDist: 0, scale: 1, originX: 0, originY: 0 });

  const [zoom, setZoom]         = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Load PDF document once
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        loadingTask = pdfjs.getDocument({ url });
        const doc = await loadingTask.promise;
        if (cancelled) { doc.cleanup(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) setError('Could not load PDF — ' + err.message);
      }
    })();
    return () => { cancelled = true; loadingTask?.destroy(); };
  }, [url]);

  // Re-render pages on load or zoom change
  useEffect(() => {
    const doc    = pdfDocRef.current;
    const pages  = pagesRef.current;
    const scroll = scrollRef.current;
    if (!doc || !pages || !scroll || loading) return;

    let cancelled = false;
    const scrollRatio = scroll.scrollTop / (scroll.scrollHeight || 1);

    (async () => {
      try {
        pages.innerHTML = '';
        const dpr   = window.devicePixelRatio || 1;
        const width = scroll.clientWidth;

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) break;
          const page   = await doc.getPage(n);
          const baseVp = page.getViewport({ scale: 1 });
          const scale  = (width / baseVp.width) * zoom * dpr;
          const vp     = page.getViewport({ scale });

          const canvas  = document.createElement('canvas');
          canvas.width  = vp.width;
          canvas.height = vp.height;
          canvas.style.cssText = `
            width:${vp.width / dpr}px; height:${vp.height / dpr}px;
            display:block; margin-bottom:6px; border-radius:3px;
          `;
          pages.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }

        if (!cancelled) scroll.scrollTop = scrollRatio * scroll.scrollHeight;
      } catch (err) {
        if (!cancelled) setError('Render error — ' + err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, zoom]);

  // Cleanup doc on unmount — loadingTask.destroy() in the load effect already handles
  // the worker/transport; cleanup() here releases canvas/font resources on the doc itself
  useEffect(() => () => { pdfDocRef.current?.cleanup(); }, []);

  // Pinch-to-zoom: CSS transform during gesture → re-render on release
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onTouchStart(e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const rect  = pagesRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const midX  = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY  = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchRef.current = {
        active: true, startDist: pinchDist(e.touches), scale: 1,
        originX: midX - rect.left,
        originY: midY - rect.top + el.scrollTop,
      };
    }

    function onTouchMove(e) {
      if (!pinchRef.current.active || e.touches.length !== 2) return;
      e.preventDefault();
      const scale = pinchDist(e.touches) / pinchRef.current.startDist;
      pinchRef.current.scale = scale;
      if (pagesRef.current) {
        const { originX, originY } = pinchRef.current;
        pagesRef.current.style.transformOrigin = `${originX}px ${originY}px`;
        pagesRef.current.style.transform = `scale(${scale})`;
      }
    }

    function onTouchEnd() {
      if (!pinchRef.current.active) return;
      const { scale } = pinchRef.current;
      pinchRef.current.active = false;
      if (pagesRef.current) pagesRef.current.style.transform = '';
      setZoom(z => parseFloat(Math.max(0.5, Math.min(3, z * scale)).toFixed(2)));
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  const changeZoom = d => setZoom(z => parseFloat(Math.max(0.5, Math.min(3, z + d)).toFixed(2)));

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <span style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</span>
    </div>
  );

  return (
    // flex: 1 + width: 100% lets the parent modal dictate the size
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 12px', background: 'rgba(0,0,0,0.5)', flexShrink: 0,
      }}>
        <button onClick={() => changeZoom(-0.25)} style={zoomBtnStyle}>−</button>
        <span style={{ color: '#fff', fontSize: 13, minWidth: 42, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => changeZoom(+0.25)} style={zoomBtnStyle}>+</button>
        {numPages && (
          <span style={{ color: '#aaa', fontSize: 12, marginLeft: 'auto' }}>
            {numPages} page{numPages !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#ccc', fontSize: 14 }}>Loading…</span>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: 'auto',
          background: '#525659', padding: '8px', boxSizing: 'border-box',
          display: loading ? 'none' : 'block',
        }}
      >
        <div ref={pagesRef} />
      </div>
    </div>
  );
}
