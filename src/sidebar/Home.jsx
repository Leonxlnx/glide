import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { app, TAB_LABELS, setTab } from './state';
import { useStore } from '../lib/store';
import { glide, isMock } from '../lib/bridge';
import { clock } from '../lib/format';
import { Segmented, Tip, Keys, useNow, Glass, SNAPPY, BOUNCE, HEIGHT } from './ui';
import { Icon, ToolIcon, BatteryGlyph } from './icons';
import ClipboardTab from './tabs/Clipboard';
import CapturesTab from './tabs/Captures';
import ShelfTab from './tabs/Shelf';
import TodoTab from './tabs/Todo';

// Rows rise into place one after another as the glass opens (transform + opacity only).
const reveal = {
  hidden: { opacity: 0, y: 6, transition: { duration: 0 } },
  shown: (i) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 520, damping: 34, delay: 0.01 + i * 0.02, opacity: { duration: 0.14, delay: 0.01 + i * 0.02 } },
  }),
};

function Reveal({ i, children }) {
  const open = useStore(app, (s) => s.open);
  const reduce = useStore(app, (s) => s.settings.reduceMotion);
  return (
    <motion.div className="rv" custom={i} variants={reduce ? undefined : reveal} initial={isMock ? 'shown' : 'hidden'} animate={open || isMock ? 'shown' : 'hidden'}>
      {children}
    </motion.div>
  );
}

// memo: the panel re-renders on every open; Home only follows its own store slices
export default memo(function Home() {
  const settings = useStore(app, (s) => s.settings);
  const media = useStore(app, (s) => s.media);
  const showMedia = settings.showMedia && media && media.title;
  return (
    <>
      <Reveal i={0}><Header /></Reveal>
      {settings.tools.length > 0 && <Reveal i={1}><Tools tools={settings.tools} /></Reveal>}
      <AnimatePresence initial={false}>
        {showMedia && (
          <motion.div
            key="np" style={{ overflow: 'hidden' }}
            initial={{ height: 0, opacity: 0, marginTop: -12 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
            exit={{ height: 0, opacity: 0, marginTop: -12 }}
            transition={HEIGHT}
          >
            <Reveal i={2}><NowPlaying media={media} /></Reveal>
          </motion.div>
        )}
      </AnimatePresence>
      <Reveal i={3}><Tabs /></Reveal>
    </>
  );
});

// ───────────────────────── Header: one quiet line ─────────────────────────
function Header() {
  const settings = useStore(app, (s) => s.settings);
  const pinned = useStore(app, (s) => s.pinned);
  const now = useNow(settings.clockSeconds ? 1000 : 5000);
  const bat = useBattery();
  const h = now.getHours();
  const hh = settings.hour12 ? String(((h + 11) % 12) + 1) : String(h).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = settings.clockSeconds ? ':' + String(now.getSeconds()).padStart(2, '0') : '';
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="header">
      <span className="hd-time">{hh}:{mm}{ss}{settings.hour12 ? (h < 12 ? ' am' : ' pm') : ''}</span>
      <span className="hd-date">{date}</span>
      <span className="hd-space" />
      {bat && (
        <span className={'bat' + (!bat.charging && bat.level < 0.2 ? ' low' : '')}>
          <BatteryGlyph level={bat.level} charging={bat.charging} size={15} />{Math.round(bat.level * 100)}%
        </span>
      )}
      <Tip content={pinned ? 'Unpin' : 'Keep open'}>
        <Glass className="icon-btn" on={pinned} onClick={() => { const v = !pinned; app.set({ pinned: v }); glide.send('panel:pin', v); }} aria-label="Pin">
          <motion.span style={{ display: 'grid' }} animate={{ rotate: pinned ? -40 : 0 }} transition={BOUNCE}>
            <Icon name="pin" size={14} weight={pinned ? 'fill' : 'bold'} />
          </motion.span>
        </Glass>
      </Tip>
      <Tip content="Settings">
        <Glass className="icon-btn" onClick={() => app.set({ view: 'settings' })} aria-label="Settings">
          <Icon name="settings" size={14} />
        </Glass>
      </Tip>
    </div>
  );
}

function useBattery() {
  const hasBattery = useStore(app, (s) => s.hasBattery);
  const [b, setB] = useState(null);
  useEffect(() => {
    let bat; let alive = true;
    const upd = () => alive && setB({ level: bat.level, charging: bat.charging });
    if (hasBattery && navigator.getBattery) {
      navigator.getBattery().then((x) => { bat = x; upd(); x.addEventListener('levelchange', upd); x.addEventListener('chargingchange', upd); }).catch(() => {});
    }
    return () => { alive = false; if (bat) { bat.removeEventListener('levelchange', upd); bat.removeEventListener('chargingchange', upd); } };
  }, [hasBattery]);
  return b;
}

// ───────────────────────── Tools: one row of equal glass keys ─────────────────────────
function Tools({ tools }) {
  return (
    <div className="tools" style={{ gridTemplateColumns: `repeat(${Math.min(4, tools.length)}, 1fr)` }}>
      {tools.map((t) => {
        const hint = t.action?.type === 'keys' && t.action.keys ? <><span>{t.name}</span><Keys accel={t.action.keys} /></> : <span>{t.name}</span>;
        return (
          <Tip key={t.id} content={hint} delay={260}>
            <Glass className="tool" press={0.9} hover={1.05} onClick={() => glide.send('tool:run', t.id)} aria-label={t.name}>
              <ToolIcon name={t.icon} size={20} />
            </Glass>
          </Tip>
        );
      })}
    </div>
  );
}

// ───────────────────────── Now playing: one slim row ─────────────────────────
function NowPlaying({ media }) {
  const now = useNow(1000);
  const pos = media.playing ? media.position + (now.getTime() - media.updated) / 1000 : media.position;
  const pct = media.duration > 0 ? Math.min(100, (pos / media.duration) * 100) : 0;
  const art = media.hasArt ? `glide://art/${encodeURIComponent(media.artKey)}` : null;
  return (
    <Glass as="div" className="np" press={1}>
      <div className="np-art" style={art ? { backgroundImage: `url(${art})` } : undefined}>{!art && <Icon name="music" size={15} weight="fill" />}</div>
      <div className="np-meta">
        <div className="np-title">{media.title}</div>
        <div className="np-sub">{[media.artist, media.app].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="np-ctl">
        <motion.button className="np-btn" whileTap={{ scale: 0.84 }} transition={SNAPPY} aria-label="Play or pause"
          onClick={() => { glide.send('media:cmd', 'toggle'); app.set((s) => ({ media: s.media && { ...s.media, playing: !s.media.playing, position: pos, updated: Date.now() } })); }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={media.playing ? 'pause' : 'play'} style={{ display: 'grid' }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={BOUNCE}>
              <Icon name={media.playing ? 'pause' : 'play'} size={17} weight="fill" />
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <motion.button className="np-btn" whileTap={{ scale: 0.84 }} transition={SNAPPY} onClick={() => glide.send('media:cmd', 'next')} aria-label="Next"><Icon name="next" size={15} weight="fill" /></motion.button>
      </div>
      {media.duration > 0 && <div className="np-bar" title={`${clock(pos)} / ${clock(media.duration)}`}><i style={{ width: pct + '%' }} /></div>}
    </Glass>
  );
}

// ───────────────────────── Tabs ─────────────────────────
const PANE_MIN = 96;
const PANE_MAX = 312;
function Tabs() {
  const settings = useStore(app, (s) => s.settings);
  const tab = useStore(app, (s) => s.tab);
  const shelfCount = useStore(app, (s) => s.shelf.length);
  const tabs = settings.tabs.filter((t) => t.on).map((t) => t.id);
  const active = tabs.includes(tab) ? tab : tabs[0];
  const prev = useRef(active);
  const dir = tabs.indexOf(active) >= tabs.indexOf(prev.current) ? 1 : -1;
  useEffect(() => { prev.current = active; }, [active]);
  // each tab is as tall as its content (capped), so the panel springs to fit — no dead space
  const paneRef = useRef(null);
  const [paneH, setPaneH] = useState(PANE_MAX);
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneH(Math.max(PANE_MIN, Math.min(PANE_MAX, Math.ceil(el.offsetHeight)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  if (!tabs.length) return null;
  const opts = tabs.map((id) => ({ id, label: TAB_LABELS[id], badge: id === 'shelf' && shelfCount ? shelfCount : null }));
  const Body = { clipboard: ClipboardTab, captures: CapturesTab, shelf: ShelfTab, notes: TodoTab }[active];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tabs.length > 1 && <Segmented options={opts} value={active} onChange={setTab} />}
      <motion.div className="tabbody" initial={false} animate={{ height: paneH }} transition={HEIGHT}>
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div
            ref={paneRef} key={active} className="tabpane" custom={dir}
            variants={{ enter: (d) => ({ opacity: 0, x: 24 * d }), center: { opacity: 1, x: 0 }, exit: (d) => ({ opacity: 0, x: -24 * d }) }}
            initial="enter" animate="center" exit="exit"
            transition={{ type: 'spring', stiffness: 420, damping: 34, opacity: { duration: 0.14 } }}
          >
            <Body />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
