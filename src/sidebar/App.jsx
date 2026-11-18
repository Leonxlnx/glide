import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { app, ACCENTS } from './state';
import { useStore } from '../lib/store';
import { glide, isMock } from '../lib/bridge';
import { blurSnapshot } from '../lib/blur';
import { Icon } from './icons';
import { BOUNCE, HEIGHT } from './ui';
import Home from './Home';
import Settings from './Settings';

const RADIUS = 26;
// the entrance: quick, a whisper of overshoot (settles in ~170 ms)
const ENTER = { type: 'spring', stiffness: 560, damping: 34, mass: 0.7 };

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export default function App() {
  const s = useStore(app);
  if (!s.ready || !s.settings || !s.geo) return null;
  return <Panel />;
}

function Panel() {
  const open = useStore(app, (s) => s.open);
  const openSeq = useStore(app, (s) => s.openSeq);
  const fast = useStore(app, (s) => s.fast);
  const geo = useStore(app, (s) => s.geo);
  const settings = useStore(app, (s) => s.settings);
  const dark = useStore(app, (s) => s.dark);
  const view = useStore(app, (s) => s.view);
  const dragOut = useStore(app, (s) => s.dragOut);
  const dragIn = useStore(app, (s) => s.dragIn);
  const toastState = useStore(app, (s) => s.toast);

  const isDark = settings.theme === 'auto' ? dark : settings.theme !== 'light';
  // "mono" is the quiet default: white highlights in dark, ink in light
  const mono = (settings.accent || 'mono') === 'mono' || !ACCENTS[settings.accent];
  const accent = mono ? (isDark ? '#F2F2F4' : '#1C1C1E') : ACCENTS[settings.accent];
  const tone = settings.tone || 'midnight';
  const reduce = !!settings.reduceMotion;
  const right = geo.edge === 'right';
  const COL = geo.panel; // the column the panel may occupy (x, width, top, max height)
  const winW = geo.win.width;
  const winH = geo.win.height;

  // ── Panel geometry: as tall as its content, centred where you touched the edge ──
  const [contentH, setContentH] = useState(520);
  const [anchor, setAnchor] = useState(COL.y + COL.h / 2);
  const PH = Math.round(Math.min(COL.h, Math.max(180, contentH)));
  const PY = Math.round(Math.min(COL.y + COL.h - PH, Math.max(COL.y, anchor - PH / 2)));
  const P = { x: COL.x, y: PY, w: COL.w, h: PH };
  // live box of the glass (follows content-driven resizes exactly)
  const L = useMotionValue(P.x);
  const T = useMotionValue(P.y);
  const W = useMotionValue(P.w);
  const H = useMotionValue(P.h);
  const pRef = useRef(P);
  pRef.current = P;
  const negL = useTransform(L, (v) => -v);
  const negT = useTransform(T, (v) => -v);
  const shX = useTransform(L, (v) => v - pRef.current.x);
  const shY = useTransform(T, (v) => v - pRef.current.y);
  const shSX = useTransform(W, (v) => Math.max(0.01, v / pRef.current.w));
  const shSY = useTransform(H, (v) => Math.max(0.01, v / pRef.current.h));

  // entrance: a compositor-only spring (scale + slide from the edge + fade), anchored where you
  // touched. Nothing changes size or clip per frame, so it stays smooth even on a busy GPU.
  const O = useMotionValue(isMock ? 1 : 0);
  const S = useMotionValue(isMock ? 1 : 0.9);
  const X = useMotionValue(0);
  if (!isMock) window.__mv = { L, T, W, H, O, S, X, P };

  // where the panel emerges from
  useLayoutEffect(() => {
    if (!open) return;
    const st = app.get();
    setAnchor(st.fromHandle && st.handleY != null ? st.handleY : COL.y + COL.h * 0.45);
  }, [openSeq]);

  useLayoutEffect(() => {
    if (isMock) return;
    const anims = [];
    const go = (mv, to, t) => anims.push(animate(mv, to, t));
    const p = pRef.current;
    const side = right ? 1 : -1;
    if (open) {
      if (O.get() < 0.05) { S.set(reduce ? 1 : 0.94); X.set(reduce ? 0 : 14 * side); }
      L.set(p.x); W.set(p.w); T.set(p.y); H.set(p.h);
      go(O, 1, { duration: reduce ? 0.12 : 0.1, ease: [0.2, 0.8, 0.3, 1] });
      if (!reduce) { go(S, 1, ENTER); go(X, 0, ENTER); }
    } else {
      go(O, 0, { duration: fast ? 0.09 : 0.13, ease: [0.4, 0, 1, 1] });
      if (!reduce) {
        go(S, 0.95, { duration: fast ? 0.09 : 0.14, ease: [0.4, 0, 1, 1] });
        go(X, 10 * side, { duration: fast ? 0.09 : 0.14, ease: [0.4, 0, 1, 1] });
      }
    }
    return () => anims.forEach((x) => x.stop());
  }, [open, openSeq, anchor]);

  // content-driven resizes (tabs, settings, now playing) are already spring-animated in layout,
  // so the glass simply follows them frame by frame
  useLayoutEffect(() => {
    if (isMock) return;
    L.set(P.x); W.set(P.w); T.set(P.y); H.set(P.h);
  }, [P.x, P.y, P.w, P.h]);

  // tell main where the panel is (leave detection)
  useEffect(() => { if (!isMock) glide.send('panel:rect', P); }, [P.x, P.y, P.w, P.h]);

  // measure the active page; the pages box springs to it (content + glass move as one)
  const pageRef = useRef(null);
  const [pageH, setPageH] = useState(null);
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPageH(Math.ceil(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // measure natural content height
  const contentRef = useRef(null);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContentH(Math.ceil(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Live glass: pre-blurred snapshots, double-buffered crossfade ──
  const backdrop = useStore(app, (s) => s.backdrop);
  const [layers, setLayers] = useState([{ url: null, on: false }, { url: null, on: false }]);
  const front = useRef(0);
  useEffect(() => {
    if (!backdrop.seq || settings.glass === 'solid' || isMock) return;
    let cancelled = false;
    const saturate = !isDark ? 1.25 : tone === 'midnight' ? 0.8 : 0.9;
    blurSnapshot(`glide://backdrop/${backdrop.seq}`, { saturate, brightness: 1 }).then((url) => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      const next = 1 - front.current;
      front.current = next;
      setLayers((ls) => ls.map((l, i) => {
        if (i === next) return { url, on: true };
        if (l.url) setTimeout(() => URL.revokeObjectURL(l.url), 1200);
        return { ...l, on: false };
      }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [backdrop.seq, settings.glass, tone, isDark]);
  const hasSnap = settings.glass !== 'solid' && layers.some((l) => l.on && l.url);
  if (!isMock) window.__testBackdrop = async (url, lum = 0.5) => {
    const u = await blurSnapshot(url);
    setLayers([{ url: u, on: true }, { url: null, on: false }]);
    app.set((s) => ({ backdrop: { ...s.backdrop, lum } }));
  };
  const lum = backdrop.lum ?? 0.3;
  const base = settings.glassTint ?? 0.5;
  let tintRgb = null; let tintAlpha;
  if (!isDark) tintAlpha = Math.min(0.9, Math.max(0.32, base + 0.06 + (0.62 - lum) * 0.45));
  else if (tone === 'midnight') {
    // graphite sheet: a touch lighter than dark apps behind it (so it floats, not a hole),
    // deepening over bright content so text keeps its contrast
    const t = Math.max(0, Math.min(1, (lum - 0.12) / 0.5));
    const v = Math.round(30 - 12 * t);
    tintRgb = `${v}, ${v}, ${v + 3}`;
    tintAlpha = Math.min(0.92, Math.max(0.72, base + 0.26 + t * 0.16));
  }
  else {
    // smoke: over dark content, lift toward neutral graphite so it still reads as glass
    const lift = Math.max(0, Math.min(1, (0.3 - lum) / 0.3));
    const v = Math.round(20 + 26 * lift);
    tintRgb = `${v}, ${v}, ${v + 2}`;
    tintAlpha = Math.min(0.88, Math.max(0.3, base - 0.04 + (lum - 0.3) * 0.55)) + lift * 0.14;
  }

  // ── Pointer: click-through outside the panel ──
  const lastInside = useRef(null);
  useEffect(() => {
    lastInside.current = null;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const inside = !!(el && el.closest('.content'));
      if (inside !== lastInside.current) { lastInside.current = inside; glide.send('ignore-mouse', !inside); }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [openSeq]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (app.get().view !== 'home') app.set({ view: 'home' }); else glide.send('panel:close');
    };
    const onFocusIn = (e) => { if (e.target.matches('input, textarea')) glide.send('panel:typing', true); };
    const onFocusOut = (e) => { if (e.target.matches('input, textarea')) glide.send('panel:typing', false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('focusin', onFocusIn); window.removeEventListener('focusout', onFocusOut); };
  }, []);

  // ── Files dragged in → Shelf ──
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e) => { if (!hasFiles(e) || app.get().dragOut) return; depth++; app.set({ dragIn: true }); glide.send('drag-in', true); };
    const over = (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) { app.set({ dragIn: false }); glide.send('drag-in', false); } };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0;
      const paths = [...e.dataTransfer.files].map((f) => glide.pathForFile(f)).filter(Boolean);
      app.set({ dragIn: false, tab: 'shelf', view: 'home' });
      glide.send('drag-in', false);
      if (paths.length) glide.send('shelf:add', paths);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, []);

  const contentVisible = open && !dragOut;
  const style = useMemo(() => ({
    '--accent': accent, '--accent-rgb': hexToRgb(accent), '--col-h': `${COL.h}px`,
    '--on-accent': mono ? (isDark ? '#0B0B0D' : '#FFFFFF') : '#FFFFFF',
    '--knob-on': mono && isDark ? '#1C1C1E' : '#FFFFFF',
  }), [accent, COL.h, mono, isDark]);

  return (
    <div className={'stage ' + (isDark ? 'theme-dark tone-' + tone : 'theme-light')} style={style}>
      <motion.div className="panel-wrap" style={{ scale: S, x: X, transformOrigin: `${right ? P.x + P.w : P.x}px ${Math.round(anchor)}px` }}>
      <motion.div className="shadow" style={{ left: P.x, top: P.y, width: P.w, height: P.h, x: shX, y: shY, scaleX: shSX, scaleY: shSY, opacity: O }} />
      <motion.div className="aperture" style={{ left: L, top: T, width: W, height: H, borderRadius: RADIUS, opacity: O }}>
        {/* one static, flattened picture of what's behind — only ever translated */}
        <motion.div className="glass" style={{ x: negL, y: negT, width: winW, height: winH }}>
          <div className="glass-base" style={{ opacity: hasSnap ? 0 : 1 }} />
          {layers.map((l, i) => (
            <div key={i} className="glass-snap" style={{ left: 0, top: 0, width: winW, height: winH, backgroundImage: l.url ? `url(${l.url})` : 'none', opacity: l.on && settings.glass !== 'solid' ? 1 : 0 }} />
          ))}
          <div className="glass-tint" style={{ background: settings.glass === 'solid' ? 'transparent' : `rgba(${tintRgb || 'var(--tint-rgb)'}, ${tintAlpha.toFixed(3)})` }} />
          <div className="glass-grain" />
        </motion.div>

        {/* A closed panel is click-through at the window level already (main), so no
            pointer-events toggle on open: it's inherited and would restyle every node. */}
        <motion.div
          ref={contentRef}
          className="content"
          style={{ width: P.w, pointerEvents: dragOut ? 'none' : 'auto' }}
          initial={false}
          animate={{ opacity: contentVisible ? 1 : 0 }}
          transition={contentVisible ? { duration: 0 } : { duration: fast || dragOut ? 0.07 : 0.1, ease: [0.4, 0, 1, 1] }}
        >
          <motion.div className="pages" initial={false} animate={{ height: pageH ?? 'auto' }} transition={HEIGHT}>
          <AnimatePresence initial={false}>
            {view === 'home' ? (
              <motion.div ref={pageRef} key="home" className="page" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
                <Home />
              </motion.div>
            ) : (
              <motion.div ref={pageRef} key="settings" className="page settings-page" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
                <Settings />
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {dragIn && (
              <motion.div className="drop-overlay" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15 } }} transition={BOUNCE}>
                <motion.div className="orb" initial={{ y: 10, scale: 0.7 }} animate={{ y: [0, -5, 0], scale: 1 }} transition={{ y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' }, scale: BOUNCE }}>
                  <Icon name="shelf" size={24} weight="fill" />
                </motion.div>
                <h3>Drop to keep on Shelf</h3>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {toastState && (
              <motion.div
                key={toastState.id} className="toast"
                initial={{ opacity: 0, y: 14, x: '-50%', scale: 0.88 }}
                animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
                exit={{ opacity: 0, y: 8, x: '-50%', scale: 0.94, transition: { duration: 0.16 } }}
                transition={BOUNCE}
              >
                <span className="ic"><Icon name={toastState.icon === 'tray' ? 'shelf' : 'check'} size={12} weight="bold" /></span>
                {toastState.text}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
      {/* hairline edge: a fixed-size layer that only scales with the aperture (never repainted) */}
      <motion.div className="rim" style={{ left: P.x, top: P.y, width: P.w, height: P.h, x: shX, y: shY, scaleX: shSX, scaleY: shSY, opacity: O }} />
      </motion.div>
    </div>
  );
}
