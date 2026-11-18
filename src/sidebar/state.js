import { glide } from '../lib/bridge';
import { createStore } from '../lib/store';

// One harmonised family: similar lightness and saturation, so any choice sits right on the glass.
export const ACCENTS = {
  mono: 'mono',
  blue: '#3B8CFF', indigo: '#6C6CFF', violet: '#9B6BFF', pink: '#F2559A', coral: '#FF6B57',
  amber: '#F5A524', mint: '#2BC6A0', sky: '#38B6E8', graphite: '#9A9AA6',
};

export const TAB_LABELS = { clipboard: 'Clipboard', captures: 'Captures', shelf: 'Shelf', notes: 'Todo' };

export const app = createStore({
  ready: false,
  settings: null,
  geo: null,
  open: false,
  openSeq: 0,
  reason: null,
  handleY: null,
  fromHandle: false,
  fast: false,
  view: 'home',
  tab: 'clipboard',
  clip: [],
  captures: { items: [], sharpshot: false, source: 'sharpshot' },
  shelf: [],
  todo: { found: false, lists: [], current: 0 },
  media: null,
  hotkeys: {},
  dark: true,
  backdrop: { seq: 0, lum: 0.3 },
  toast: null,
  dragOut: false,
  dragIn: false,
  pinned: false,
  focusSearch: 0,
  version: '',
  packaged: false,
});

if (typeof window !== 'undefined') window.__glide = app;

let toastTimer = null;
export function toast(text, icon = 'check') {
  clearTimeout(toastTimer);
  app.set({ toast: { text, icon, id: Math.random() } });
  toastTimer = setTimeout(() => app.set({ toast: null }), 1700);
}

export function setTab(tab) {
  app.set({ tab });
  glide.send('panel:tab', tab);
}

export async function updateSettings(patch) {
  app.set((s) => ({ settings: { ...s.settings, ...patch } }));
  const next = await glide.invoke('settings:set', patch);
  if (next) app.set({ settings: next });
}

export async function boot() {
  const init = await glide.invoke('init');
  const enabledTabs = (init.settings.tabs || []).filter((t) => t.on).map((t) => t.id);
  app.set({
    ready: true,
    settings: init.settings,
    geo: init.geo,
    clip: init.clip || [],
    captures: init.captures || app.get().captures,
    shelf: init.shelf || [],
    todo: init.todo || app.get().todo,
    media: init.media,
    hotkeys: init.hotkeys || {},
    dark: init.dark,
    tab: enabledTabs.includes(init.tab) ? init.tab : enabledTabs[0] || 'clipboard',
    version: init.version,
    hasBattery: !!init.hasBattery,
    onboarded: init.onboarded !== false,
    packaged: init.packaged,
    backdrop: { seq: init.backdropSeq || 0, lum: 0.3 },
  });

  const onPanel = (p) => {
    if (p.open) {
      const patch = { open: true, openSeq: app.get().openSeq + 1, reason: p.reason, handleY: p.handleY, fromHandle: !!p.fromHandle, fast: false, pinned: false, dragOut: false };
      if (p.tab) patch.tab = p.tab;
      if (p.focusSearch) patch.focusSearch = Date.now();
      if (app.get().open && p.tab) { app.set(patch); return; }
      app.set(patch);
    } else {
      app.set({ open: false, fast: !!p.fast, pinned: false, dragIn: false });
      setTimeout(() => { if (!app.get().open) app.set({ view: 'home' }); }, 500);
    }
  };
  glide.on('panel', onPanel);
  if (init.panel && init.panel.open) onPanel(init.panel);
  glide.on('geometry', (geo) => app.set({ geo }));
  glide.on('settings', (settings) => app.set({ settings }));
  glide.on('clip', (clip) => app.set({ clip }));
  glide.on('captures', (captures) => app.set({ captures }));
  glide.on('shelf', (shelf) => app.set({ shelf }));
  glide.on('todo', (todo) => app.set({ todo }));
  glide.on('media', (media) => app.set({ media }));
  glide.on('hotkeys', (hotkeys) => app.set({ hotkeys }));
  glide.on('theme', (dark) => app.set({ dark }));
  glide.on('backdrop', (b) => app.set({ backdrop: b }));
  glide.on('toast', (t) => toast(t.text, t.icon));
  glide.on('drag-out', (v) => app.set({ dragOut: v }));
  glide.on('open-settings', () => app.set({ view: 'settings' }));
}
