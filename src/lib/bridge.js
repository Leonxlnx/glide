// Bridge to the main process. Falls back to a mock so the UI can be designed in a browser.
const real = typeof window !== 'undefined' && window.glide;

function mock() {
  const listeners = new Map();
  const emit = (ch, p) => (listeners.get(ch) || []).forEach((cb) => cb(p));
  const now = Date.now();
  const settings = {
    edge: 'right', width: 368, hoverDelay: 120, triggerZone: 'full', closeDelay: 320, showHandle: true,
    theme: 'dark', accent: 'blue', glass: 'live', glassTint: 0.5, reduceMotion: false, hideFromCapture: true,
    launchAtLogin: true, dragOpens: true, pauseInFullscreen: true, clockSeconds: false, hour12: false, showMedia: true,
    clipboard: { enabled: true, limit: 300, pasteOnClick: true, skipSensitive: true },
    tabs: [{ id: 'clipboard', on: true }, { id: 'captures', on: true }, { id: 'shelf', on: true }, { id: 'notes', on: true }],
    tools: [
      { id: 'shot', name: 'Screenshot', icon: 'scan', tint: 'blue', action: { type: 'keys', keys: 'Win+Shift+D' } },
      { id: 'rec', name: 'Record', icon: 'record', tint: 'red', action: { type: 'keys', keys: 'Win+Shift+A' } },
      { id: 'studio', name: 'Studio', icon: 'clapper', tint: 'purple', action: { type: 'keys', keys: 'Win+Shift+E' } },
      { id: 'altq', name: 'QuickTodo', icon: 'todo', tint: 'orange', action: { type: 'keys', keys: 'Alt+Q' } },
    ],
    hotkeys: { toggle: 'Super+Shift+X', clipboard: 'Super+Alt+V' },
    captures: { source: 'sharpshot', folder: '', sharpshotExe: '' },
  };
  const src = (name) => ({ name, exe: '' });
  const clip = [
    { id: 'a', type: 'text', at: now - 40e3, text: 'Ship the sidebar tonight — fluid, glassy, and gone when you don’t need it.', source: src('Codex') },
    { id: 'b', type: 'link', at: now - 4 * 60e3, text: 'https://developer.apple.com/design/human-interface-guidelines/materials', source: src('Google Chrome') },
    { id: 'c', type: 'color', at: now - 12 * 60e3, text: '#0A84FF', source: src('Figma') },
    { id: 'd', type: 'code', at: now - 50 * 60e3, text: "const spring = { type: 'spring', stiffness: 420, damping: 34 };\nanimate(width, 368, spring);", source: src('Visual Studio Code'), pinned: true },
    { id: 'e', type: 'text', at: now - 3 * 3600e3, text: 'Meeting moved to Thursday 14:30. Bring the prototype + the motion study.', source: src('Discord') },
    { id: 'f', type: 'email', at: now - 26 * 3600e3, text: 'hello@example.com', source: src('Mail') },
    { id: 'g', type: 'files', at: now - 30 * 3600e3, files: ['C:\\Users\\you\\Desktop\\keynote-final.pdf', 'C:\\Users\\you\\Desktop\\hero.png'], source: src('File Explorer') },
  ];
  const captures = {
    sharpshot: true, source: 'sharpshot',
    items: Array.from({ length: 14 }, (_, i) => ({ id: 'cap' + i, kind: i % 4 === 1 ? 'video' : 'image', name: `Screenshot ${i}.png`, path: 'C:\\x\\' + i, at: now - i * 3.7 * 3600e3, w: 1920, h: 1080 })),
  };
  return {
    mock: true,
    invoke: async (ch, arg) => {
      if (ch === 'init') return {
        settings, clip, captures, shelf: [], tab: 'clipboard', todo: { found: true, current: 0, lists: [{ name: 'Main', items: [{ text: 'Ship the sidebar', done: false }, { text: 'Review designs', done: false }, { text: 'Inbox zero', done: true }] }, { name: 'Ideas', items: [{ text: 'Shader animation', done: false }] }] }, hotkeys: { toggle: 'ok', clipboard: 'ok' }, dark: true, version: 'dev', packaged: false,
        media: { app: 'Spotify', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', playing: true, position: 74, duration: 243, updated: Date.now(), canPrev: true, canNext: true, hasArt: false },
        geo: { edge: 'right', win: { x: 0, y: 0, width: 430, height: window.innerHeight }, panel: { x: 52, y: 10, w: 368, h: window.innerHeight - 20 }, bounds: { x: 0, y: 0, width: 1536, height: 960 } },
      };
      if (ch === 'settings:set') { Object.assign(settings, arg); setTimeout(() => emit('settings', { ...settings })); return settings; }
      return null;
    },
    send: (ch, ...a) => { if (ch === 'clip:copy' || ch === 'cap:copy') emit('toast', { text: 'Copied', icon: 'check' }); console.debug('[mock send]', ch, ...a); },
    on: (ch, cb) => { if (!listeners.has(ch)) listeners.set(ch, []); listeners.get(ch).push(cb); return () => {}; },
    pathForFile: () => null,
    emit,
  };
}

export const glide = real || mock();
export const isMock = !real;
