// Tiny JSON persistence with debounced, atomic writes.
const fs = require('fs');
const path = require('path');

class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    this.timer = null;
    this.loaded = false; // true only when the file was actually read (not the fallback)
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.loaded = true;
    } catch {
      this.data = typeof fallback === 'function' ? fallback() : structuredClone(fallback);
    }
  }
  save(delay = 400) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('[store] write failed', this.file, e.message); }
  }
}

// The defaults press SharpShot Studio's capture shortcuts and QuickTodo's Alt+Q. On a first run
// without those companions, main.js swaps in Windows' own Snipping Tool shortcuts instead.
const DEFAULT_TOOLS = [
  { id: 'shot', name: 'Screenshot', icon: 'camera', tint: 'blue', action: { type: 'keys', keys: 'Win+Shift+D' } },
  { id: 'rec', name: 'Record', icon: 'record', tint: 'red', action: { type: 'keys', keys: 'Win+Shift+A' } },
  { id: 'studio', name: 'Studio', icon: 'clapper', tint: 'purple', action: { type: 'keys', keys: 'Win+Shift+E' } },
  { id: 'altq', name: 'QuickTodo', icon: 'todo', tint: 'orange', action: { type: 'keys', keys: 'Alt+Q' } },
];

const DEFAULT_SETTINGS = {
  version: 1,
  edge: 'right',
  width: 320,
  openOn: 'click', // click (the edge pill) | hover (dwell at the edge)
  hoverDelay: 80,
  triggerZone: 'full', // full | middle
  closeDelay: 320,
  showHandle: true,
  theme: 'dark', // dark | light | auto
  accent: 'mono',
  tone: 'midnight',
  glass: 'live', // live | frozen | solid
  glassTint: 0.5,
  reduceMotion: false,
  hideFromCapture: true,
  launchAtLogin: true,
  dragOpens: true,
  pauseInFullscreen: true,
  clockSeconds: false,
  hour12: false,
  showMedia: true,
  clipboard: { enabled: true, limit: 300, days: 3, pasteOnClick: true, skipSensitive: true }, // days: 0 = keep forever
  tabs: [
    { id: 'clipboard', on: true },
    { id: 'captures', on: true },
    { id: 'shelf', on: true },
    { id: 'notes', on: true },
  ],
  tools: DEFAULT_TOOLS,
  hotkeys: { toggle: 'Super+Shift+X', clipboard: 'Super+Alt+V' },
  captures: {
    source: 'sharpshot', // sharpshot | folder
    folder: '',
    sharpshotExe: '', // optional: path to SharpShot Studio.exe (Settings → Captures)
  },
};

function mergeDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = structuredClone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') mergeDefaults(target[k], v);
  }
  return target;
}

// Built-in fallbacks for a machine without the companion apps (Windows 11 Snipping Tool).
const SNIPPING_TOOLS = [
  { id: 'shot', name: 'Screenshot', icon: 'camera', tint: 'blue', action: { type: 'keys', keys: 'Win+Shift+S' } },
  { id: 'rec', name: 'Record', icon: 'record', tint: 'red', action: { type: 'keys', keys: 'Win+Shift+R' } },
];

module.exports = { JsonFile, DEFAULT_SETTINGS, DEFAULT_TOOLS, SNIPPING_TOOLS, mergeDefaults };
