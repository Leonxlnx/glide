import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { app } from '../state';
import { useStore } from '../../lib/store';
import { glide } from '../../lib/bridge';
import { ago, basename, hostOf } from '../../lib/format';
import { Glass, SNAPPY, useAfterClose } from '../ui';
import { Icon } from '../icons';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'pinned', label: 'Pinned', test: (it) => it.pinned },
  { id: 'text', label: 'Text', test: (it) => ['text', 'code', 'email', 'path', 'color'].includes(it.type) },
  { id: 'link', label: 'Links', test: (it) => it.type === 'link' },
  { id: 'image', label: 'Images', test: (it) => it.type === 'image' },
  { id: 'files', label: 'Files', test: (it) => it.type === 'files' },
];

export default function ClipboardTab() {
  const items = useStore(app, (s) => s.clip);
  const enabled = useStore(app, (s) => s.settings.clipboard.enabled);
  const pasteOnClick = useStore(app, (s) => s.settings.clipboard.pasteOnClick);
  const focusSearch = useStore(app, (s) => s.focusSearch);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(-1);
  const [limit, setLimit] = useState(40);
  const input = useRef(null);
  const scroller = useRef(null);

  useEffect(() => { if (focusSearch) { input.current?.focus(); setSel(0); } }, [focusSearch]);
  useAfterClose(() => { setQ(''); setSel(-1); setLimit(40); if (scroller.current) scroller.current.scrollTop = 0; });

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, items.filter(f.test).length])), [items]);
  const chips = FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0);
  const activeFilter = chips.some((c) => c.id === filter) ? filter : 'all';

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.id === activeFilter);
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (!f.test(it)) return false;
      if (!needle) return true;
      const hay = [it.text, ...(it.files || []), it.source?.name].filter(Boolean).join(' ').toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [items, q, activeFilter]);

  const grouped = activeFilter === 'all' && !q.trim();
  const pinned = grouped ? list.filter((x) => x.pinned) : [];
  const recent = (grouped ? list.filter((x) => !x.pinned) : list).slice(0, limit);
  const flat = [...pinned, ...recent];

  const act = (it, copyOnly) => glide.send(copyOnly || !pasteOnClick ? 'clip:copy' : 'clip:paste', it.id);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && flat[Math.max(0, sel)]) { e.preventDefault(); act(flat[Math.max(0, sel)], e.shiftKey); }
    else if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
  };

  useEffect(() => {
    if (sel < 0 || !scroller.current) return;
    scroller.current.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sel]);

  if (!enabled) {
    return (
      <div className="empty">
        <div className="empty-icon gl"><Icon name="clipboard" size={24} /></div>
        <h3>Clipboard history is off</h3>
        <p>Turn it on in Settings to keep everything you copy one hover away.</p>
      </div>
    );
  }

  return (
    <>
      <Glass as="div" className="search" press={1}>
        <Icon name="search" size={14} />
        <input ref={input} value={q} placeholder="Search clipboard" spellCheck={false} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown} />
        <AnimatePresence>
          {q && (
            <motion.button className="x" onClick={() => { setQ(''); input.current?.focus(); }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SNAPPY} aria-label="Clear search">
              <Icon name="close" size={11} />
            </motion.button>
          )}
        </AnimatePresence>
      </Glass>

      <div className="scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 300 && limit < list.length) setLimit((l) => l + 40); }}>
        {flat.length === 0 ? (
          <Empty searching={!!q.trim() || activeFilter !== 'all'} />
        ) : (
          <>
            {pinned.length > 0 && <div className="group-title">Pinned</div>}
            <div className="stack">
              <AnimatePresence initial={false}>
                {pinned.map((it, i) => <Item key={it.id} it={it} idx={i} sel={sel === i} onAct={act} />)}
              </AnimatePresence>
            </div>
            {pinned.length > 0 && recent.length > 0 && <div className="group-title">Recent</div>}
            <div className="stack">
              <AnimatePresence initial={false}>
                {recent.map((it, i) => <Item key={it.id} it={it} idx={pinned.length + i} sel={sel === pinned.length + i} onAct={act} />)}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Empty({ searching }) {
  return (
    <motion.div className="empty" style={{ height: '100%' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SNAPPY}>
      <div className="empty-icon gl"><Icon name={searching ? 'search' : 'clipboard'} size={24} /></div>
      <h3>{searching ? 'No matches' : 'Nothing copied yet'}</h3>
      <p>{searching ? 'Try another word, or clear the filter.' : 'Everything you copy lands here. Click an item to paste it right back where you were.'}</p>
    </motion.div>
  );
}

function Lead({ it }) {
  if (it.type === 'image') return <span className="lead"><img className="thumb" src={`glide://clip/${it.id}`} alt="" /></span>;
  if (it.type === 'color') return <span className="lead swatch" style={{ background: it.text.trim() }} />;
  if (it.type === 'files') return <span className="lead bare"><img className="app" src={`glide://icon/?p=${encodeURIComponent(it.files[0])}`} alt="" /></span>;
  if (it.type === 'link') return <span className="lead"><Icon name="globe" size={17} /></span>;
  if (it.type === 'email') return <span className="lead"><Icon name="mail" size={17} /></span>;
  if (it.type === 'path') return <span className="lead"><Icon name="folder" size={17} /></span>;
  if (it.source?.exe) return <span className="lead bare"><img className="app" src={`glide://icon/?p=${encodeURIComponent(it.source.exe)}`} alt="" onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { textContent: '' })); }} /></span>;
  return <span className="lead"><Icon name={it.type === 'code' ? 'code' : 'text'} size={17} /></span>;
}

function Title({ it }) {
  const t = (it.text || '').trim();
  switch (it.type) {
    case 'link': {
      const host = hostOf(t);
      const rest = t.replace(/^https?:\/\/(www\.)?/i, '').slice(host.length) || '/';
      return <><div className="title one strong">{host}</div><div className="title one" style={{ color: 'var(--text-2)' }}>{rest}</div></>;
    }
    case 'color': return <div className="title one strong">{t}</div>;
    case 'email': return <div className="title one strong">{t}</div>;
    case 'path': return <><div className="title one strong">{basename(t)}</div><div className="title one" style={{ color: 'var(--text-2)' }}>{t}</div></>;
    case 'code': return <div className="title code">{t.split('\n').slice(0, 2).join('\n')}</div>;
    case 'image': return <div className="title one strong">Image</div>;
    case 'files': return <div className="title one strong">{it.files.length === 1 ? basename(it.files[0]) : `${basename(it.files[0])} + ${it.files.length - 1} more`}</div>;
    default: return <div className="title">{it.text}</div>;
  }
}

function Item({ it, idx, sel, onAct }) {
  const draggable = it.type === 'image' || it.type === 'files';
  const detail = it.type === 'image' && it.w ? `${it.w} × ${it.h}` : it.type === 'color' ? 'Color' : it.type === 'text' && it.length > 240 ? `${it.length.toLocaleString('en-US')} characters` : null;
  return (
    <motion.div
      layout="position" data-idx={idx} className={'item' + (sel ? ' sel' : '')}
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      whileTap={{ scale: 0.98 }}
      onClick={(e) => onAct(it, e.shiftKey)}
      draggable={draggable}
      onDragStart={(e) => { e.preventDefault(); glide.send('drag:start', { kind: 'clip', id: it.id }); }}
    >
      <Lead it={it} />
      <div className="body">
        <Title it={it} />
        <div className="meta">
          {it.pinned && <span className="pin"><Icon name="pin" size={11} weight="fill" /></span>}
          {it.source?.name && <><span>{it.source.name}</span><i className="dot" /></>}
          <span style={{ flex: 'none' }}>{ago(it.at)}</span>
          {detail && <><i className="dot" /><span style={{ flex: 'none' }}>{detail}</span></>}
        </div>
      </div>
      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <button className="act" title="Copy" onClick={() => glide.send('clip:copy', it.id)}><Icon name="copy" size={14} /></button>
        {it.type === 'link' && <button className="act" title="Open link" onClick={() => glide.send('open:url', it.text.trim())}><Icon name="external" size={14} /></button>}
        {it.type === 'image' && <button className="act" title="Mark up" onClick={() => glide.send('clip:edit', it.id)}><Icon name="edit" size={14} /></button>}
        {it.type === 'image' && <button className="act" title="Save to Downloads" onClick={() => glide.send('clip:save', it.id)}><Icon name="download" size={14} /></button>}
        <button className={'act' + (it.pinned ? ' on' : '')} title={it.pinned ? 'Unpin' : 'Pin'} onClick={() => glide.send('clip:pin', it.id)}><Icon name={it.pinned ? 'unpin' : 'pin'} size={14} /></button>
        <button className="act danger" title="Delete" onClick={() => glide.send('clip:remove', it.id)}><Icon name="trash" size={14} /></button>
      </div>
    </motion.div>
  );
}
