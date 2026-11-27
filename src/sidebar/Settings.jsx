import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { app, ACCENTS, TAB_LABELS, updateSettings } from './state';
import { useStore } from '../lib/store';
import { glide } from '../lib/bridge';
import { Switch, Slider, Segmented, Recorder, Keys, Glass, SNAPPY, BOUNCE } from './ui';
import { Icon, ToolIcon, TOOL_ICONS } from './icons';

export default memo(function Settings() {
  const s = useStore(app, (x) => x.settings);
  const hotkeys = useStore(app, (x) => x.hotkeys);
  const displays = useStore(app, (x) => x.displays) || [];
  const version = useStore(app, (x) => x.version);
  const packaged = useStore(app, (x) => x.packaged);
  const set = (patch) => updateSettings(patch);
  const hover = s.openOn === 'hover';
  const multi = displays.length > 1;
  const pinned = displays.find((d) => d.id === String(s.display));
  const edgeName = s.edge === 'left' ? 'left' : 'right';
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <>
      <div className="nav">
        <motion.button className="back" whileTap={{ scale: 0.94 }} transition={SNAPPY} onClick={() => app.set({ view: 'home' })}>
          <Icon name="back" size={15} />Back
        </motion.button>
        <div className="nav-title">Settings</div>
        <span style={{ width: 62 }} />
      </div>
      <div className="scroll">

        <Label first>Sidebar</Label>
        <Group>
          <Row label="Screen edge">
            <Segmented small value={s.edge} onChange={(v) => set({ edge: v })} options={[{ id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }]} />
          </Row>
          {multi && (
            <Row col label="Screen">
              <Segmented
                small value={pinned ? pinned.id : 'auto'} onChange={(v) => set({ display: v })}
                options={[{ id: 'auto', label: 'Auto' }, ...displays.map((d) => ({ id: d.id, label: displays.length > 3 ? String(d.n) : `Screen ${d.n}` }))]}
              />
              <div className="row-sub">
                {!pinned ? `Follows your cursor to the ${edgeName} edge of any screen`
                  : `${pinned.label || `Screen ${pinned.n}`}${pinned.primary ? ' · main screen' : ''}${hover && !pinned.outer ? `. Its ${edgeName} edge touches another screen, so Click is easier to hit` : ''}`}
              </div>
            </Row>
          )}
          <Row col label="Width" value={`${s.width} pt`}>
            <Slider value={s.width} min={280} max={420} step={4} onCommit={(v) => set({ width: v })} />
          </Row>
          <Row label="Open with" sub={hover ? 'Resting at the edge opens Glide' : 'Click the pill at the edge'}>
            <Segmented small value={hover ? 'hover' : 'click'} onChange={(v) => set({ openOn: v })} options={[{ id: 'click', label: 'Click' }, { id: 'hover', label: 'Hover' }]} />
          </Row>
          {hover && (
            <>
              <Row col label="Reveal delay" value={s.hoverDelay ? `${s.hoverDelay} ms` : 'Instant'}>
                <Slider value={s.hoverDelay} min={0} max={500} step={10} onCommit={(v) => set({ hoverDelay: v })} />
              </Row>
              <Row label="Trigger area" sub="Middle avoids scrollbar corners">
                <Segmented small value={s.triggerZone} onChange={(v) => set({ triggerZone: v })} options={[{ id: 'full', label: 'Whole edge' }, { id: 'middle', label: 'Middle' }]} />
              </Row>
              <Row label="Edge handle" sub="A soft pill marks the spot"><Switch on={s.showHandle} onChange={(v) => set({ showHandle: v })} /></Row>
            </>
          )}
          <Row label="Open while dragging files" sub={hover ? 'Drag to the edge to drop on the Shelf' : 'Drag onto the pill to drop on the Shelf'}><Switch on={s.dragOpens} onChange={(v) => set({ dragOpens: v })} /></Row>
          <Row label="Pause in fullscreen apps" sub="Games, videos and presentations"><Switch on={s.pauseInFullscreen} onChange={(v) => set({ pauseInFullscreen: v })} /></Row>
          {multi && s.pauseInFullscreen && (
            <Row label="Pause on" sub={s.fullscreenScope === 'all' ? 'A fullscreen app hides Glide on every screen' : 'Only the screen with the fullscreen app'}>
              <Segmented small value={s.fullscreenScope === 'all' ? 'all' : 'display'} onChange={(v) => set({ fullscreenScope: v })} options={[{ id: 'display', label: 'That screen' }, { id: 'all', label: 'All screens' }]} />
            </Row>
          )}
        </Group>

        <Label>Appearance</Label>
        <Group>
          <Row label="Theme">
            <Segmented small value={s.theme} onChange={(v) => set({ theme: v })} options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'auto', label: 'Auto' }]} />
          </Row>
          {s.theme !== 'light' && (
            <Row label="Tone" sub={(s.tone || 'midnight') === 'midnight' ? 'Neutral graphite that floats over any app' : 'Lighter, see-through grey glass'}>
              <Segmented small value={s.tone || 'midnight'} onChange={(v) => set({ tone: v })} options={[{ id: 'midnight', label: 'Graphite' }, { id: 'smoke', label: 'Smoke' }]} />
            </Row>
          )}
          <Row col label="Accent">
            <div className="swatches">
              {Object.entries(ACCENTS).map(([k, c]) => (
                <motion.button
                  key={k} className={'sw' + ((s.accent || 'mono') === k ? ' on' : '')}
                  style={{ background: k === 'mono' ? 'linear-gradient(135deg, #f2f2f4 50%, #1c1c1e 50%)' : c }}
                  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={BOUNCE}
                  onClick={() => set({ accent: k })} aria-label={k === 'mono' ? 'Monochrome' : k} title={k === 'mono' ? 'Monochrome' : k}
                />
              ))}
            </div>
          </Row>
          <Row label="Material" sub={s.glass === 'live' ? 'Frosted glass that follows what’s behind it' : s.glass === 'frozen' ? 'Glass captured once each time it opens' : 'Opaque, lightest on resources'}>
            <Segmented small value={s.glass} onChange={(v) => set({ glass: v })} options={[{ id: 'live', label: 'Live' }, { id: 'frozen', label: 'Frozen' }, { id: 'solid', label: 'Solid' }]} />
          </Row>
          {s.glass !== 'solid' && (
            <Row col label="Glass density" value={`${Math.round(s.glassTint * 100)}%`}>
              <Slider value={s.glassTint} min={0.15} max={0.85} step={0.01} onChange={(v) => app.set((x) => ({ settings: { ...x.settings, glassTint: v } }))} onCommit={(v) => set({ glassTint: v })} />
            </Row>
          )}
          <Row label="24-hour clock"><Switch on={!s.hour12} onChange={(v) => set({ hour12: !v })} /></Row>
          <Row label="Show seconds"><Switch on={s.clockSeconds} onChange={(v) => set({ clockSeconds: v })} /></Row>
          <Row label="Reduce motion" sub="Simple fades instead of springs"><Switch on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></Row>
        </Group>

        <Label>Tools</Label>
        <ToolsEditor tools={s.tools} set={set} />
        <Foot>Each tool presses a shortcut (like a screenshot tool's hotkey), opens an app or file, or opens a website.</Foot>

        <Label>Shortcuts</Label>
        <Group>
          <HotkeyRow label="Show or hide Glide" k="toggle" s={s} status={hotkeys.toggle} set={set} />
          <HotkeyRow label="Search clipboard" k="clipboard" s={s} status={hotkeys.clipboard} set={set} />
        </Group>
        <Foot>Click a shortcut, then press the new keys. Backspace clears it.</Foot>

        <Label>Clipboard</Label>
        <Group>
          <Row label="Keep clipboard history"><Switch on={s.clipboard.enabled} onChange={(v) => set({ clipboard: { ...s.clipboard, enabled: v } })} /></Row>
          <Row label="Click pastes into your app" sub="Shift-click always just copies"><Switch on={s.clipboard.pasteOnClick} onChange={(v) => set({ clipboard: { ...s.clipboard, pasteOnClick: v } })} /></Row>
          <Row label="Skip passwords" sub="Ignore copies marked private by password managers"><Switch on={s.clipboard.skipSensitive} onChange={(v) => set({ clipboard: { ...s.clipboard, skipSensitive: v } })} /></Row>
          <Row label="Remember">
            <Segmented small value={String(s.clipboard.limit)} onChange={(v) => set({ clipboard: { ...s.clipboard, limit: Number(v) } })} options={[{ id: '100', label: '100' }, { id: '300', label: '300' }, { id: '1000', label: '1000' }]} />
          </Row>
          <Row label="Keep for" sub="Older items delete themselves. Pinned items stay">
            <Segmented small value={String(s.clipboard.days ?? 3)} onChange={(v) => set({ clipboard: { ...s.clipboard, days: Number(v) } })} options={[{ id: '1', label: '1d' }, { id: '3', label: '3d' }, { id: '7', label: '7d' }, { id: '0', label: 'All' }]} />
          </Row>
          <Row label="Clear history" sub="Pinned items stay">
            <AnimatePresence mode="popLayout" initial={false}>
              {confirmClear ? (
                <motion.div key="c" style={{ display: 'flex' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SNAPPY}>
                  <button className="pill-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
                  <button className="pill-btn danger" style={{ color: '#ff6b5e' }} onClick={() => { glide.send('clip:clear'); setConfirmClear(false); }}>Clear</button>
                </motion.div>
              ) : (
                <motion.button key="b" className="pill-btn danger" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SNAPPY} onClick={() => setConfirmClear(true)}>Clear…</motion.button>
              )}
            </AnimatePresence>
          </Row>
        </Group>

        <Label>Sections</Label>
        <Group>
          {s.tabs.map((t, i) => (
            <Row key={t.id} label={TAB_LABELS[t.id]}>
              <div style={{ display: 'flex', gap: 2 }}>
                <button className="act" disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} onClick={() => set({ tabs: move(s.tabs, i, -1) })} aria-label="Move up"><Icon name="chevUp" size={14} /></button>
                <button className="act" disabled={i === s.tabs.length - 1} style={{ opacity: i === s.tabs.length - 1 ? 0.3 : 1 }} onClick={() => set({ tabs: move(s.tabs, i, 1) })} aria-label="Move down"><Icon name="chevDown" size={14} /></button>
              </div>
              <Switch on={t.on} onChange={(v) => set({ tabs: s.tabs.map((x) => (x.id === t.id ? { ...x, on: v } : x)) })} />
            </Row>
          ))}
          <Row label="Now Playing" sub="Whatever’s playing — Spotify, browser, anything"><Switch on={s.showMedia} onChange={(v) => set({ showMedia: v })} /></Row>
        </Group>

        <Label>Captures</Label>
        <Group>
          <Row label="Source">
            <Segmented small value={s.captures.source} onChange={(v) => set({ captures: { ...s.captures, source: v } })} options={[{ id: 'sharpshot', label: 'SharpShot' }, { id: 'folder', label: 'Folder' }]} />
          </Row>
          {s.captures.source === 'folder' && (
            <Row col label="Folder"><PathField value={s.captures.folder} placeholder="Choose a folder" pick="pick:folder" onChange={(v) => set({ captures: { ...s.captures, folder: v } })} /></Row>
          )}
          <Row col label="SharpShot Studio app">
            <PathField value={s.captures.sharpshotExe} placeholder="Path to SharpShot Studio.exe" pick="pick:file" onChange={(v) => set({ captures: { ...s.captures, sharpshotExe: v } })} />
          </Row>
        </Group>

        <Label>System</Label>
        <Group>
          <Row label="Launch at login" sub={packaged ? 'Glide starts quietly with Windows' : 'Available in the installed app'}><Switch on={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} /></Row>
          <Row label="Hide from screen captures" sub="Keeps Glide out of screenshots and recordings"><Switch on={s.hideFromCapture} onChange={(v) => set({ hideFromCapture: v })} /></Row>
          <Row label="Restart Glide" click onClick={() => glide.send('app:relaunch')}><Icon name="restart" size={16} className="chev" /></Row>
          <Row label="Quit Glide" click onClick={() => glide.send('app:quit')}><Icon name="power" size={16} style={{ color: '#ff6b5e' }} /></Row>
        </Group>

        <div className="sgroup" style={{ marginTop: 22 }}>
          <div className="about">
            <img className="app-mark" src="./icon.png" alt="" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.015em' }}>Glide</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>Version {version}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

function move(arr, i, d) {
  const a = arr.slice(); const j = i + d;
  if (j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

const Label = ({ children, first }) => <div className="sgroup-label" style={first ? { marginTop: 8 } : undefined}>{children}</div>;
const Group = ({ children }) => <div className="sgroup">{children}</div>;
const Foot = ({ children }) => <div className="sgroup-foot">{children}</div>;

function Row({ label, sub, value, children, col, click, onClick }) {
  if (col) {
    return (
      <div className="row col">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="row-label">{label}</div>
          {value && <div className="row-val">{value}</div>}
        </div>
        {children}
      </div>
    );
  }
  const Tag = click ? 'button' : 'div';
  return (
    <Tag className={'row' + (click ? ' click' : '')} onClick={onClick}>
      <div className="row-main">
        <div className="row-label">{label}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {children}
    </Tag>
  );
}

function HotkeyRow({ label, k, s, status, set }) {
  const sub = status === 'taken' ? <span className="status taken"><i />In use by another app</span> : status === 'ok' ? <span className="status ok"><i />Active</span> : status === 'off' ? 'Off' : null;
  return <Row label={label} sub={sub}><Recorder value={s.hotkeys[k]} onChange={(v) => set({ hotkeys: { ...s.hotkeys, [k]: v } })} /></Row>;
}

function PathField({ value, placeholder, pick, onChange }) {
  const [v, setV] = useState(value || '');
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input className="field" value={v} placeholder={placeholder} spellCheck={false} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onChange(v)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <Glass className="pill-btn" style={{ height: 34, flex: 'none', borderRadius: 10 }} onClick={async () => { const p = await glide.invoke(pick); if (p) { setV(p); onChange(p); } }}>Choose…</Glass>
    </div>
  );
}

// ───────────────────────── Tools editor ─────────────────────────
const ICON_CHOICES = ['todo', 'scan', 'selection', 'crop', 'camera', 'record', 'video', 'clapper', 'monitor', 'mic', 'sparkles', 'wand', 'bot', 'brain', 'message', 'terminal', 'code', 'globe', 'folder', 'app', 'zap', 'rocket', 'music', 'palette', 'timer', 'search', 'languages', 'calculator', 'image', 'command', 'star', 'heart', 'gamepad'];

function ToolsEditor({ tools, set }) {
  const [open, setOpen] = useState(null);
  const update = (id, patch) => set({ tools: tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const add = () => {
    const id = 't' + Math.random().toString(36).slice(2, 8);
    set({ tools: [...tools, { id, name: 'New tool', icon: 'zap', action: { type: 'keys', keys: '' } }] });
    setOpen(id);
  };
  return (
    <div className="sgroup">
      {tools.map((t, i) => {
        const isOpen = open === t.id;
        return (
          <div key={t.id} className="row col" style={{ padding: 0, gap: 0 }}>
            <button className="row click" onClick={() => setOpen(isOpen ? null : t.id)}>
              <span className="lead gl" style={{ borderRadius: '50%', color: 'var(--text)' }}><ToolIcon name={t.icon} size={17} /></span>
              <div className="row-main">
                <div className="row-label">{t.name}</div>
                <div className="row-sub">{describe(t.action)}</div>
              </div>
              <motion.span className="chev" style={{ display: 'grid' }} animate={{ rotate: isOpen ? 90 : 0 }} transition={BOUNCE}><Icon name="chevRight" size={14} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div style={{ overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
                  <ToolForm t={t} i={i} count={tools.length} update={(p) => update(t.id, p)} moveBy={(d) => set({ tools: move(tools, i, d) })} remove={() => { set({ tools: tools.filter((x) => x.id !== t.id) }); setOpen(null); }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {tools.length < 8 && (
        <button className="row click" onClick={add} style={{ color: 'var(--accent)' }}>
          <span className="lead" style={{ borderRadius: '50%', color: 'var(--accent)', background: 'rgba(var(--accent-rgb), .14)', boxShadow: 'none' }}><Icon name="plus" size={16} /></span>
          <div className="row-main"><div className="row-label">Add tool</div></div>
        </button>
      )}
    </div>
  );
}

function describe(a = {}) {
  if (a.type === 'keys') return a.keys ? `Presses ${a.keys.replace(/\+/g, ' + ')}` : 'No shortcut yet';
  if (a.type === 'open') return a.target ? `Opens ${a.target.split(/[\\/]/).pop()}` : 'Nothing to open yet';
  if (a.type === 'url') return a.target ? `Opens ${a.target.replace(/^https?:\/\//, '')}` : 'No website yet';
  return '';
}

function ToolForm({ t, i, count, update, moveBy, remove }) {
  const a = t.action || { type: 'keys' };
  const [name, setName] = useState(t.name);
  const [keys, setKeys] = useState(a.keys || '');
  const [target, setTarget] = useState(a.target || '');
  return (
    <div style={{ padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input className="field" value={name} maxLength={18} placeholder="Name" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== t.name && update({ name: name.trim() })} />
      <Segmented small value={a.type} onChange={(type) => update({ action: { ...a, type } })} options={[{ id: 'keys', label: 'Shortcut' }, { id: 'open', label: 'App or file' }, { id: 'url', label: 'Website' }]} />
      {a.type === 'keys' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="field" value={keys} placeholder="e.g. Win+Shift+D" spellCheck={false} onChange={(e) => setKeys(e.target.value)} onBlur={() => keys !== a.keys && update({ action: { ...a, keys: keys.trim() } })} />
          <Recorder forSend value="" placeholder="Record" allowClear={false} onChange={(v) => { setKeys(v); update({ action: { ...a, keys: v } }); }} />
        </div>
      )}
      {a.type === 'open' && <PathField value={a.target} placeholder="C:\\Path\\To\\App.exe" pick="pick:file" onChange={(v) => update({ action: { ...a, target: v } })} />}
      {a.type === 'url' && <input className="field" value={target} placeholder="https://…" spellCheck={false} onChange={(e) => setTarget(e.target.value)} onBlur={() => target !== a.target && update({ action: { ...a, target: target.trim() } })} />}
      <div className="icon-grid">
        {ICON_CHOICES.filter((k) => TOOL_ICONS[k]).map((k) => (
          <button key={k} className={t.icon === k ? 'on' : ''} onClick={() => update({ icon: k })} aria-label={k}><ToolIcon name={k} size={17} /></button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex' }}>
          <button className="pill-btn" disabled={i === 0} style={{ opacity: i === 0 ? 0.35 : 1 }} onClick={() => moveBy(-1)}><Icon name="chevUp" size={13} /> Up</button>
          <button className="pill-btn" disabled={i === count - 1} style={{ opacity: i === count - 1 ? 0.35 : 1 }} onClick={() => moveBy(1)}><Icon name="chevDown" size={13} /> Down</button>
        </div>
        <button className="pill-btn danger" onClick={remove}><Icon name="trash" size={13} /> Remove</button>
      </div>
    </div>
  );
}
