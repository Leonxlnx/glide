import { useEffect, useLayoutEffect, useRef, useState, forwardRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { prettyKeys } from '../lib/format';
import { glide } from '../lib/bridge';
import { useStore } from '../lib/store';
import { app } from './state';

// One motion language for the whole app.
export const SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 };
export const SOFT = { type: 'spring', stiffness: 300, damping: 28 };
export const SNAPPY = { type: 'spring', stiffness: 700, damping: 38 };
export const BOUNCE = { type: 'spring', stiffness: 420, damping: 22 };
// every size change (tabs, pages, rows) uses this one spring, so content and glass move as one
export const HEIGHT = { type: 'spring', stiffness: 300, damping: 31, mass: 0.9 };

/** A glass control: even translucent fill, springy press. */
export const Glass = forwardRef(function Glass({ as = 'button', className = '', children, press = 0.94, hover = 1, on, ...rest }, ref) {
  const C = as === 'div' ? motion.div : motion.button;
  return (
    <C
      ref={ref}
      className={'gl ' + (on ? 'on ' : '') + className}
      whileHover={hover !== 1 ? { scale: hover } : undefined}
      whileTap={{ scale: press }}
      transition={SNAPPY}
      {...rest}
    >
      {children}
    </C>
  );
});

export function Pressable({ className, children, scale = 0.94, ...rest }) {
  return <motion.button className={className} whileTap={{ scale }} transition={SNAPPY} {...rest}>{children}</motion.button>;
}

export function Switch({ on, onChange, label }) {
  const [press, setPress] = useState(false);
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      onClick={() => onChange(!on)}
    >
      <motion.span
        className="knob" initial={false}
        animate={{ x: on ? (press ? 11 : 16) : 0, width: press ? 27 : 22 }}
        transition={{ type: 'spring', stiffness: 640, damping: 32 }}
      />
    </button>
  );
}

export function Slider({ value, min, max, step = 1, onChange, onCommit }) {
  const ref = useRef(null);
  const [v, setV] = useState(value);
  const [drag, setDrag] = useState(false);
  useEffect(() => { if (!drag) setV(value); }, [value, drag]);
  const pct = ((v - min) / (max - min)) * 100;
  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return Math.round((min + t * (max - min)) / step) * step;
  };
  return (
    <div
      className="slider" ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); const n = at(e); setV(n); onChange && onChange(n); }}
      onPointerMove={(e) => { if (!drag) return; const n = at(e); if (n !== v) { setV(n); onChange && onChange(n); } }}
      onPointerUp={() => { setDrag(false); onCommit && onCommit(v); }}
    >
      <div className="track"><div className="fill" style={{ width: pct + '%' }} /></div>
      <motion.div className="thumb" style={{ left: pct + '%' }} animate={{ scale: drag ? 1.18 : 1 }} transition={BOUNCE} />
    </div>
  );
}

/**
 * Segmented control with a liquid pill: the leading edge springs ahead, the trailing edge
 * follows softer, so the pill stretches like a droplet on its way and settles with a wobble.
 */
export function Segmented({ options, value, onChange, small, className = '' }) {
  const wrap = useRef(null);
  const btns = useRef({});
  const L = useMotionValue(0);
  const R = useMotionValue(0);
  const width = useTransform([L, R], ([l, r]) => Math.max(0, r - l));
  const first = useRef(true);
  const measure = () => {
    const el = btns.current[value];
    if (!el) return null;
    return { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth };
  };
  useLayoutEffect(() => {
    const m = measure();
    if (!m) return;
    if (first.current) { L.set(m.l); R.set(m.r); first.current = false; return; }
    const right = m.l > L.get();
    const lead = { type: 'spring', stiffness: 640, damping: 40 };
    const trail = { type: 'spring', stiffness: 300, damping: 24, mass: 0.9 };
    const a = animate(L, m.l, right ? trail : lead);
    const b = animate(R, m.r, right ? lead : trail);
    return () => { a.stop(); b.stop(); };
  }, [value, options.length]);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(() => { const m = measure(); if (m) { L.set(m.l); R.set(m.r); } });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value]);
  return (
    <div ref={wrap} className={'seg' + (small ? ' small' : '') + ' ' + className} role="tablist">
      <motion.div className="seg-pill" style={{ left: L, width }} />
      {options.map((o) => (
        <button
          key={o.id} ref={(el) => { btns.current[o.id] = el; }}
          role="tab" aria-selected={value === o.id}
          className={'seg-btn' + (value === o.id ? ' on' : '')}
          onClick={() => onChange(o.id)}
        >
          {o.icon}{o.label}{o.badge ? <i className="badge">{o.badge}</i> : null}
        </button>
      ))}
    </div>
  );
}

export function Keys({ accel }) {
  const parts = prettyKeys(accel);
  if (!parts.length) return null;
  return <span className="keys">{parts.map((k, i) => <span key={i} className="kbd">{k}</span>)}</span>;
}

/** Hover tooltip that springs in. */
export function Tip({ children, content, delay = 420, place = 'bottom' }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState(null);
  const t = useRef(null);
  const ref = useRef(null);
  const enter = () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const el = ref.current && (ref.current.firstElementChild || ref.current);
      const stage = el && el.closest('.content');
      if (!el || !stage) return;
      const r = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2 - s.left, y: place === 'bottom' ? r.bottom - s.top + 8 : r.top - s.top - 8, w: s.width });
      setShow(true);
    }, delay);
  };
  const leave = () => { clearTimeout(t.current); setShow(false); };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <div ref={ref} onPointerEnter={enter} onPointerLeave={leave} onPointerDown={leave} style={{ display: 'contents' }}>
      {children}
      <AnimatePresence>{show && content && pos && <TipBody pos={pos} place={place}>{content}</TipBody>}</AnimatePresence>
    </div>
  );
}

function TipBody({ pos, place, children }) {
  const ref = useRef(null);
  const [x, setX] = useState(pos.x);
  useLayoutEffect(() => {
    const w = ref.current ? ref.current.offsetWidth : 0;
    setX(Math.max(8, Math.min(pos.w - w - 8, pos.x - w / 2)));
  }, [pos]);
  return (
    <motion.div
      ref={ref} className="tip"
      style={{ left: x, top: pos.y, position: 'fixed', translateY: place === 'bottom' ? 0 : '-100%', transformOrigin: place === 'bottom' ? '50% 0%' : '50% 100%' }}
      initial={{ opacity: 0, scale: 0.86, y: place === 'bottom' ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      transition={BOUNCE}
    >
      {children}
    </motion.div>
  );
}

const CODE_NAMES = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down',
  ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Insert: 'Insert', Delete: 'Delete', PrintScreen: 'PrintScreen',
};

export function accelFromEvent(e, { forSend = false } = {}) {
  const code = e.code || '';
  let key = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^Numpad\d$/.test(code)) key = 'num' + code.slice(6);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (CODE_NAMES[code]) key = CODE_NAMES[code];
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push(forSend ? 'Ctrl' : 'Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push(forSend ? 'Win' : 'Super');
  if (!mods.length && !/^F\d/.test(key) && !forSend) return null;
  return [...mods, key].join('+');
}

/** Click, then press a combo. Esc cancels, Backspace clears. */
export function Recorder({ value, onChange, forSend = false, placeholder = 'Record shortcut', allowClear = true }) {
  const [rec, setRec] = useState(false);
  const [held, setHeld] = useState('');
  useEffect(() => {
    if (!rec) return;
    glide.send('hotkeys:suspend');
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { setRec(false); return; }
      if ((e.code === 'Backspace' || e.code === 'Delete') && allowClear && !e.ctrlKey && !e.altKey && !e.metaKey) { onChange(''); setRec(false); return; }
      const acc = accelFromEvent(e, { forSend });
      if (acc) { onChange(acc); setRec(false); return; }
      const m = [];
      if (e.ctrlKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (e.metaKey) m.push('Win');
      setHeld(m.join('+'));
    };
    const up = (e) => { e.preventDefault(); setHeld(''); };
    const blur = () => setRec(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      glide.send('hotkeys:resume');
      setHeld('');
    };
  }, [rec]);
  return (
    <Glass className={'recorder' + (rec ? ' rec' : '')} onClick={() => setRec((r) => !r)} press={0.97}>
      {rec ? (held ? <Keys accel={held} /> : <span className="ph">Press keys…</span>) : value ? <Keys accel={value} /> : <span className="ph">{placeholder}</span>}
    </Glass>
  );
}

// Runs fn a moment after the panel closes (reset a tab's search, scroll, picks) without making
// the component re-render on open or close. Opening must not re-render the tabs: their rows are
// motion layout nodes, and every re-render makes Motion measure each one.
export function useAfterClose(fn, ms = 450) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let was = app.get().open;
    let t;
    const unsub = app.subscribe(() => {
      const open = app.get().open;
      if (open === was) return;
      was = open;
      clearTimeout(t);
      if (!open) t = setTimeout(() => ref.current(), ms);
    });
    return () => { unsub(); clearTimeout(t); };
  }, [ms]);
}

// Ticks only while the panel is open, so nothing re-renders or repaints behind a closed panel.
// On open it catches up before the first frame is painted.
export function useNow(intervalMs) {
  const open = useStore(app, (s) => s.open);
  const [now, setNow] = useState(() => new Date());
  useLayoutEffect(() => {
    if (!open) return;
    let t;
    const tick = () => { setNow(new Date()); t = setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5); };
    setNow(new Date());
    t = setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5);
    return () => clearTimeout(t);
  }, [intervalMs, open]);
  return now;
}
