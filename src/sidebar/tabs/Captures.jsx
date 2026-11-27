import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { app, updateSettings } from '../state';
import { useStore } from '../../lib/store';
import { glide, isMock } from '../../lib/bridge';
import { ago, dayLabel } from '../../lib/format';
import { SNAPPY, useAfterClose } from '../ui';
import { Icon } from '../icons';

export default function CapturesTab() {
  const caps = useStore(app, (s) => s.captures);
  const [limit, setLimit] = useState(24);
  const scroller = useRef(null);

  useAfterClose(() => { setLimit(24); if (scroller.current) scroller.current.scrollTop = 0; });

  const items = caps.items;
  const groups = useMemo(() => {
    const out = [];
    for (const it of items.slice(0, limit)) {
      const label = dayLabel(it.at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items, limit]);

  if (caps.source === 'sharpshot' && !caps.sharpshot) {
    return (
      <div className="empty">
        <div className="empty-icon gl"><Icon name="aperture" size={24} /></div>
        <h3>SharpShot library not found</h3>
        <p>Glide shows SharpShot Studio captures here. You can point it at any folder instead.</p>
        <motion.button className="pill-btn primary" style={{ marginTop: 8 }} whileTap={{ scale: 0.92 }} transition={SNAPPY} onClick={async () => {
          const folder = await glide.invoke('pick:folder');
          if (folder) updateSettings({ captures: { ...app.get().settings.captures, source: 'folder', folder } });
        }}>Choose folder</motion.button>
      </div>
    );
  }

  return (
    <>
      <div className="scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && limit < items.length) setLimit((l) => l + 24); }}>
        {items.length === 0 ? (
          <div className="empty" style={{ height: '100%' }}>
            <div className="empty-icon gl"><Icon name="imageBroken" size={24} /></div>
            <h3>No captures yet</h3>
            <p>Use Screenshot or Record above. New captures show up here instantly.</p>
          </div>
        ) : groups.map((g) => (
          <div key={g.label}>
            <div className="group-title">{g.label}</div>
            <div className="caps">{g.items.map((it, i) => <Cap key={it.id} it={it} i={i} />)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Cap({ it, i }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dur, setDur] = useState(null);
  const t = useRef(null);
  const clickT = useRef(null);
  const src = isMock ? null : `glide://thumb/${it.id}`;
  useEffect(() => () => { clearTimeout(t.current); clearTimeout(clickT.current); }, []);
  const mockBg = isMock ? { background: `linear-gradient(${(i * 47) % 360}deg, hsl(${(i * 53) % 360} 60% 55%), hsl(${(i * 53 + 60) % 360} 60% 32%))` } : undefined;
  return (
    <motion.div
      className="cap" style={mockBg}
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.04, zIndex: 2 }} whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26, delay: Math.min(i, 8) * 0.02 }}
      onPointerEnter={() => { if (it.kind === 'video') t.current = setTimeout(() => setPreview(true), 350); }}
      onPointerLeave={() => { clearTimeout(t.current); setPreview(false); }}
      onClick={() => { clearTimeout(clickT.current); clickT.current = setTimeout(() => glide.send(it.kind === 'image' ? 'cap:edit' : 'cap:copy', it.id), 220); }}
      onDoubleClick={() => { clearTimeout(clickT.current); glide.send('cap:open', it.id); }}
      draggable
      onDragStart={(e) => { e.preventDefault(); clearTimeout(clickT.current); glide.send('drag:start', { kind: 'capture', id: it.id }); }}
      title={`${it.name}\n${ago(it.at)} · ${it.kind === 'image' ? 'click to mark up' : 'click to copy'} · double-click to open · drag into any app`}
    >
      {!loaded && !failed && !isMock && <div className="cap-skel" />}
      {src && !failed && <img src={src} alt="" loading="lazy" decoding="async" style={{ opacity: loaded ? 1 : 0, transition: 'opacity .35s' }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      {failed && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Icon name="imageBroken" size={18} /></div>}
      {preview && <video src={`glide://file/?p=${encodeURIComponent(it.path)}`} muted autoPlay loop playsInline onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} />}
      {it.kind === 'video' && <span className="cap-badge"><Icon name="play" size={9} weight="fill" />{dur ? fmtDur(dur) : 'Video'}</span>}
      <div className="acts" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button className="act" title="Copy" onClick={() => glide.send('cap:copy', it.id)}><Icon name="copy" size={13} /></button>
        <button className="act" title="Show in folder" onClick={() => glide.send('cap:reveal', it.id)}><Icon name="folderOpen" size={13} /></button>
      </div>
    </motion.div>
  );
}

function fmtDur(s) { const m = Math.floor(s / 60); const r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }
