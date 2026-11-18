'use strict';
const {
  app, BrowserWindow, screen, ipcMain, globalShortcut, desktopCapturer, protocol, net, shell, Tray, Menu,
  nativeImage, nativeTheme, clipboard, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const native = require('./native');
const { JsonFile, DEFAULT_SETTINGS, SNIPPING_TOOLS, mergeDefaults } = require('./store');
const { ClipboardHistory, writeImageFile } = require('./clipboard');
const { Captures } = require('./captures');
const { Media } = require('./media');
const { QuickTodo } = require('./quicktodo');

const GAP = 10; // panel ↔ screen edge
const PAD = 64; // shadow room on the inner side
const VM = 10; // panel ↔ work-area top/bottom
const HANDLE_W = 30;
// Click mode: the pill stays put and is a button. Its hit area hugs the edge, so scrollbars of
// maximized windows keep working everywhere else along it.
const HIT_W = 14; // from the screen edge inward
const HIT_H = 132; // centred on the pill (covers its grown height plus the magnet lean)
const PILL_REACH = 46; // pill half-height: proximity is measured from its ends

app.setAppUserModelId('app.glide.sidebar');
app.setName('Glide');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
protocol.registerSchemesAsPrivileged([{
  scheme: 'glide',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

if (!app.requestSingleInstanceLock()) app.quit();
else boot();

function boot() {
  const ROOT = path.join(__dirname, '..');
  const DIST = path.join(ROOT, 'dist');
  const USER = app.getPath('userData');
  const logFile = path.join(USER, 'glide.log');
  const log = (...a) => {
    const line = `[${new Date().toISOString()}] ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
    try { fs.appendFileSync(logFile, line); } catch { /* */ }
    if (!app.isPackaged) process.stdout.write(line);
  };
  process.on('uncaughtException', (e) => log('uncaught', e));
  process.on('unhandledRejection', (e) => log('unhandled', e));

  const settings = new JsonFile(path.join(USER, 'settings.json'), DEFAULT_SETTINGS);
  mergeDefaults(settings.data, DEFAULT_SETTINGS);
  // First run: the companion apps are optional. Without SharpShot Studio, the tools row uses the
  // Snipping Tool and Captures watches Pictures\Screenshots (if it exists); without QuickTodo, its
  // tool and the Todo section start hidden. Everything can be changed in Settings afterwards.
  if (!settings.loaded) {
    const appData = app.getPath('appData');
    const s = settings.data;
    if (!fs.existsSync(path.join(appData, 'sharpshot-studio'))) {
      s.tools = s.tools.filter((t) => t.id !== 'studio').map((t) => structuredClone(SNIPPING_TOOLS.find((x) => x.id === t.id) || t));
      let shots = '';
      try { shots = path.join(app.getPath('pictures'), 'Screenshots'); } catch { /* no Pictures folder */ }
      if (shots && fs.existsSync(shots)) s.captures = { ...s.captures, source: 'folder', folder: shots };
    }
    if (!fs.existsSync(path.join(appData, 'QuickTodo'))) {
      s.tools = s.tools.filter((t) => t.id !== 'altq');
      s.tabs = s.tabs.map((t) => (t.id === 'notes' ? { ...t, on: false } : t));
    }
    settings.save();
  }
  // the Alt+Q tool is QuickTodo: give the untouched default its real name and glyph
  for (const t of settings.data.tools || []) {
    if (t.id === 'altq' && t.name === 'Alt Q' && t.icon === 'sparkles') { t.name = 'QuickTodo'; t.icon = 'todo'; settings.save(); }
  }
  const S = () => settings.data;
  const data = new JsonFile(path.join(USER, 'data.json'), { shelf: [], tab: 'clipboard' });

  let win = null; // the sidebar
  let handle = null; // the edge handle
  let tray = null;
  let geo = null;
  let displays = [];

  // panel state
  let state = 'closed'; // closed | open
  let reason = null;
  let pinned = false;
  let typing = false;
  let focused = false;
  let dragIn = false;
  let dragOut = false;
  let dialogOpen = false;
  let dwellStart = 0;
  let rearmBlocked = false;
  let lastInside = 0;
  let hideTimer = null;
  let prevForeground = 0n;
  let fullscreenBusy = false;
  let hoverPaused = false;
  let hotkeyStatus = {};
  let handleNear = -1;
  let handleRest = 0; // pill centre, y within the handle's display
  let handleHot = false; // click mode: handle window takes clicks while the cursor is on the pill
  let prewarmed = false;
  let pillPressed = false; // a press on the pill already opened the panel
  let lastOpen = null;
  const clickMode = () => S().openOn !== 'hover';

  const broadcast = (ch, payload) => {
    for (const w of [win, handle]) if (w && !w.isDestroyed()) w.webContents.send(ch, payload);
  };
  const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ─────────────────────────── geometry ───────────────────────────
  function refreshDisplays() { displays = screen.getAllDisplays(); }

  function computeGeo(display) {
    const s = S();
    const b = display.bounds;
    const wa = display.workArea;
    const pw = Math.max(280, Math.min(440, Math.round(s.width)));
    const winW = pw + GAP + PAD;
    const right = s.edge !== 'left';
    return {
      displayId: display.id,
      edge: right ? 'right' : 'left',
      bounds: b,
      win: { x: right ? wa.x + wa.width - winW : wa.x, y: b.y, width: winW, height: b.height },
      panel: { x: right ? PAD : GAP, y: wa.y - b.y + VM, w: pw, h: wa.height - VM * 2 },
      scale: display.scaleFactor,
    };
  }

  function placeOn(display) {
    const g = computeGeo(display);
    const changed = !geo || JSON.stringify(g) !== JSON.stringify(geo);
    geo = g;
    if (changed && win) {
      win.setBounds(g.win);
      send('geometry', g);
    }
    return changed;
  }

  function outerEdge(pt, d) {
    const b = d.bounds;
    const right = S().edge !== 'left';
    const atEdge = right ? pt.x >= b.x + b.width - 1 : pt.x <= b.x;
    if (!atEdge) return false;
    return !displays.some((o) => o.id !== d.id
      && (right ? o.bounds.x === b.x + b.width : o.bounds.x + o.bounds.width === b.x)
      && pt.y >= o.bounds.y && pt.y < o.bounds.y + o.bounds.height);
  }

  function edgeDisplays() {
    const right = S().edge !== 'left';
    return displays.filter((d) => !displays.some((o) => o.id !== d.id
      && (right ? o.bounds.x === d.bounds.x + d.bounds.width : o.bounds.x + o.bounds.width === d.bounds.x)));
  }

  // ─────────────────────────── windows ───────────────────────────
  const baseWindow = {
    show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
    backgroundColor: '#00000000', thickFrame: false, roundedCorners: false,
  };
  const webPrefs = {
    preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true,
    backgroundThrottling: false, spellcheck: false,
  };

  function createSidebar() {
    const display = screen.getPrimaryDisplay();
    geo = computeGeo(display);
    win = new BrowserWindow({ ...baseWindow, ...geo.win, focusable: true, webPreferences: webPrefs, title: 'Glide' });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    native.makeToolWindow(win);
    applyCaptureExclusion();
    win.loadURL('glide://app/sidebar.html');
    win.on('focus', () => { focused = true; });
    win.on('blur', () => {
      focused = false;
      if (state === 'open' && !pinned && !dragOut && !dialogOpen) close('blur');
    });
    // Transparent windows can stop repainting regions after their very first show on Windows.
    // So: show once at launch (fully transparent + click-through), nudge to force a full repaint,
    // and then keep the window shown for good. Opening never pays a first-show penalty.
    win.webContents.once('did-finish-load', () => { if (!sidebarShouldHide()) showSidebarWindow(); });
    win.webContents.on('render-process-gone', (e, d) => { log('sidebar renderer gone', d); setTimeout(() => win && !win.isDestroyed() && win.reload(), 500); });
    win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) log('[sidebar]', e.message); });
  }

  function nudge(w) {
    if (!w || w.isDestroyed()) return;
    const b = w.getBounds();
    w.setBounds({ ...b, width: b.width + 1 });
    w.setBounds(b);
  }

  function showSidebarWindow() {
    if (win.isVisible()) return;
    win.setIgnoreMouseEvents(true);
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    native.makeToolWindow(win);
    applyCaptureExclusion();
    setTimeout(() => nudge(win), 120);
    setTimeout(() => nudge(win), 600);
  }

  const sidebarShouldHide = () => S().pauseInFullscreen && fullscreenBusy && state === 'closed';

  function createHandle() {
    handle = new BrowserWindow({ ...baseWindow, x: 0, y: 0, width: HANDLE_W, height: 200, focusable: false, webPreferences: webPrefs, title: 'Glide Handle' });
    handle.setAlwaysOnTop(true, 'screen-saver');
    handle.setIgnoreMouseEvents(true);
    native.makeToolWindow(handle);
    applyCaptureExclusion();
    handle.loadURL('glide://app/handle.html');
    handle.webContents.once('did-finish-load', () => updateHandle());
  }

  let handleDisplayId = null;
  let handleMode = null;
  function updateHandle(displayHint) {
    if (!handle || handle.isDestroyed()) return;
    // in click mode the pill is the way in, so it can't be switched off
    const show = (S().showHandle || clickMode()) && !(S().pauseInFullscreen && fullscreenBusy) && !hoverPaused;
    if (!show) { setHandleHot(false); if (handle.isVisible()) handle.hide(); return; }
    const candidates = edgeDisplays();
    let d = displayHint && candidates.find((x) => x.id === displayHint.id);
    if (!d) d = candidates.find((x) => x.id === handleDisplayId) || candidates.find((x) => x.id === screen.getPrimaryDisplay().id) || candidates[0];
    if (!d) return;
    const right = S().edge !== 'left';
    const b = d.bounds;
    const bounds = { x: right ? b.x + b.width - HANDLE_W : b.x, y: b.y, width: HANDLE_W, height: b.height };
    const mode = clickMode() ? 'click' : 'hover';
    if (handleDisplayId !== d.id || handleMode !== mode || JSON.stringify(handle.getBounds()) !== JSON.stringify(bounds)) {
      handle.setBounds(bounds);
      handleDisplayId = d.id;
      handleMode = mode;
      handleRest = (d.workArea.y - b.y) + d.workArea.height / 2;
      handle.webContents.send('handle:geo', { edge: right ? 'right' : 'left', height: b.height, rest: handleRest, click: mode === 'click' });
    }
    if (!handle.isVisible() && state === 'closed') handle.showInactive();
  }

  function setHandleHot(v) {
    if (v === handleHot || !handle || handle.isDestroyed()) return;
    handleHot = v;
    handle.setIgnoreMouseEvents(!v);
    handle.webContents.send('handle:hot', v);
  }

  function applyCaptureExclusion() {
    const on = !!S().hideFromCapture;
    for (const w of [win, handle]) if (w && !w.isDestroyed()) native.excludeFromCapture(w, on);
  }

  // ─────────────────────────── live glass ───────────────────────────
  let backdrop = { seq: 0, buf: null, at: 0 };
  let capturing = null;
  let liveTimer = null;

  async function captureBackdrop(display) {
    if (S().glass === 'solid') return;
    if (capturing) return capturing;
    capturing = (async () => {
      try {
        // Only the strip behind the panel, downscaled during the blit (GDI ≈ 20× cheaper than
        // desktopCapturer, which grabs every screen at full size). Glide itself is excluded.
        const g = computeGeo(display);
        const phys = screen.dipToScreenRect(null, g.win);
        const ow = Math.max(8, Math.round(g.win.width / 2));
        const oh = Math.max(8, Math.round(g.win.height / 2));
        const bits = await native.captureRegionAsync(phys.x, phys.y, phys.width, phys.height, ow, oh);
        if (!bits) return;
        const part = nativeImage.createFromBitmap(bits, { width: ow, height: oh });
        // Tiny fingerprint: average luminance (adaptive tint) + change detection.
        const tiny = part.resize({ width: 12, height: 32 }).toBitmap();
        let lum = 0;
        for (let i = 0; i < tiny.length; i += 4) lum += (0.0722 * tiny[i] + 0.7152 * tiny[i + 1] + 0.2126 * tiny[i + 2]) / 255;
        lum /= tiny.length / 4;
        const key = `${display.id}:${phys.x}:${phys.width}x${phys.height}`;
        if (backdrop.tiny && backdrop.key === key && backdrop.tiny.length === tiny.length) {
          let diff = 0;
          for (let i = 0; i < tiny.length; i++) diff += Math.abs(tiny[i] - backdrop.tiny[i]);
          // Nothing behind the panel changed: skip encode, IPC, re-blur and crossfade.
          if (diff / tiny.length < 1.2) { backdrop.at = Date.now(); return; }
        }
        backdrop = { seq: backdrop.seq + 1, buf: part.toJPEG(86), at: Date.now(), displayId: display.id, tiny, key };
        send('backdrop', { seq: backdrop.seq, lum });
      } catch (e) { log('backdrop', e); } finally { capturing = null; }
    })();
    return capturing;
  }

  // Measured: when another app (Blender, a game) saturates the GPU, our presents stall for
  // 200–500 ms — unless a DXGI desktop-duplication session is active, which makes Windows
  // compose us promptly (≈75 → ≈130 frames per open). GPU priority classes and GDI grabs don't
  // help, and desktopCapturer blocks our UI thread for ~1 s — so the helper process holds a
  // short duplication session around opens/closes instead.
  // But on an idle GPU the session itself costs frames (2026-10-16, first open after 40 s idle:
  // 54–85 frames with it, 93–118 without). So it only runs while the GPU is contended, which the
  // edge pill measures from its own frame pacing as you approach (handle:pace).
  // GLIDE_NOBOOST=1 / GLIDE_BOOST=1 force it off / on for A/B tests.
  let gpuBusyUntil = 0;
  const gpuBusy = () => Date.now() < gpuBusyUntil;
  const boost = (ms = 1400) => {
    if (process.env.GLIDE_NOBOOST === '1') return;
    if (process.env.GLIDE_BOOST === '1' || gpuBusy()) media.boost(ms);
  };
  function onHandlePace(p) {
    if (!p || !(p.median > 0)) return;
    const d = displays.find((x) => x.id === handleDisplayId) || screen.getPrimaryDisplay();
    const frame = 1000 / (d.displayFrequency || 60);
    if (p.median > frame * 1.5) {
      if (!gpuBusy()) log('gpu contended, boost on', { median: +p.median.toFixed(1), frame: +frame.toFixed(1) });
      gpuBusyUntil = Date.now() + 60000;
      if (state === 'closed') boost(); // ready before the click lands
    } else if (p.median < frame * 1.2) gpuBusyUntil = 0;
  }

  function prewarm(display) {
    if (S().glass !== 'solid') captureBackdrop(display);
    boost();
  }

  function startLive() {
    clearInterval(liveTimer);
    const live = S().glass === 'live' && S().hideFromCapture;
    liveTimer = setInterval(() => {
      if (state !== 'open') return clearInterval(liveTimer);
      const d = displays.find((x) => x.id === geo.displayId);
      if (live && d) captureBackdrop(d);
    }, 1600);
  }

  // ─────────────────────────── open / close ───────────────────────────
  function open(why, display, cursorY) {
    clearTimeout(hideTimer);
    if (state === 'open') {
      if (why === 'clipboard') { send('panel', { open: true, reason: why, tab: 'clipboard', focusSearch: true }); focusPanel(); }
      return;
    }
    display = display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    placeOn(display);
    state = 'open';
    reason = why;
    dragIn = why === 'drag';
    typing = false;
    lastInside = Date.now() + 500;
    const fg = native.foregroundWindow();
    if (fg && fg !== native.hwndOf(win)) prevForeground = fg;
    const pt = screen.getCursorScreenPoint();
    const handleY = (cursorY ?? pt.y) - display.bounds.y;
    win.setIgnoreMouseEvents(!dragIn, { forward: true });
    lastOpen = {
      open: true, reason: why, handleY, fromHandle: why === 'hover' || why === 'click' || why === 'drag',
      tab: why === 'drag' ? 'shelf' : why === 'clipboard' ? 'clipboard' : null,
      focusSearch: why === 'clipboard',
    };
    send('panel', lastOpen);
    boost(1600);
    if (S().glass !== 'solid' && (!backdrop.buf || Date.now() - backdrop.at > 400 || backdrop.displayId !== display.id)) captureBackdrop(display);
    if (!win.isVisible()) showSidebarWindow();
    win.setIgnoreMouseEvents(!dragIn, { forward: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (handle && !handle.isDestroyed()) handle.webContents.send('handle:hide', true);
    setHandleHot(false);
    prewarmed = false;
    if (why === 'hotkey' || why === 'clipboard' || why === 'tray') focusPanel();
    startLive();
  }

  function focusPanel() {
    if (!win) return;
    win.focus();
    win.webContents.focus();
  }

  function close(why, { fast = false } = {}) {
    if (state !== 'open') return;
    state = 'closed';
    pinned = false;
    dragIn = false;
    typing = false;
    dwellStart = 0;
    rearmBlocked = true;
    clearInterval(liveTimer);
    send('panel', { open: false, reason: why, fast });
    boost(900);
    todos.flushSoon(); // sidebar edits → QuickTodo before you reach for Alt+Q
    win.setIgnoreMouseEvents(true); // fully click-through, no mouse hook while closed
    if (focused) {
      if (prevForeground) native.focusWindow(prevForeground);
      focused = false;
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (state !== 'closed') return;
      if (sidebarShouldHide()) win.hide();
      if (handle && !handle.isDestroyed()) { handle.webContents.send('handle:hide', false); updateHandle(); }
    }, fast ? 200 : 300); // the close animation is ~140 ms: the pill is back to click sooner
  }

  function toggle(why) {
    if (state === 'open') close('toggle');
    else open(why);
  }

  // ─────────────────────────── edge watcher ───────────────────────────
  let panelRect = null; // the panel's live rect inside the window (reported by the renderer)
  function insidePanel(pt) {
    if (!geo) return false;
    const r = panelRect || { x: geo.panel.x, y: geo.panel.y, w: geo.panel.w, h: geo.panel.h };
    const m = 16;
    const x0 = geo.win.x + r.x - m;
    const x1 = geo.win.x + r.x + r.w + m;
    const y0 = geo.win.y + r.y - m;
    const y1 = geo.win.y + r.y + r.h + m;
    // include the strip between panel and the screen edge
    const right = geo.edge === 'right';
    const xa = right ? x0 : geo.bounds.x;
    const xb = right ? geo.bounds.x + geo.bounds.width : x1;
    return pt.x >= xa && pt.x <= xb && pt.y >= y0 && pt.y <= y1;
  }

  // Adaptive cursor polling: fast only near the trigger edge or while open — idle CPU stays ~0.
  let nearEdge = false;
  function loop() {
    try { tick(); } catch (e) { log('tick', e); }
    // near the closed edge every ms counts (the press opens the panel); while open, 24 is plenty
    setTimeout(loop, state === 'open' ? 24 : nearEdge || dwellStart ? 16 : 110);
  }

  function tick() {
    if (!win || win.isDestroyed()) return;
    const now = Date.now();
    const pt = screen.getCursorScreenPoint();
    if (state === 'closed') {
      const blocked = hoverPaused || (S().pauseInFullscreen && fullscreenBusy);
      const d = screen.getDisplayNearestPoint(pt);
      if (blocked) { dwellStart = 0; nearEdge = false; setHandleHot(false); return; }
      const right = S().edge !== 'left';
      const b = d.bounds;
      const click = clickMode();
      const dist = right ? b.x + b.width - 1 - pt.x : pt.x - b.x;
      nearEdge = dist < 160;
      const onHandleDisplay = d.id === handleDisplayId;
      const dy = pt.y - (b.y + handleRest);
      // click mode: the pill itself (it stays put), not anywhere along the edge
      const onPill = click && onHandleDisplay && dist < HIT_W && Math.abs(dy) < HIT_H / 2;
      // Handle proximity (fluid hint before reveal)
      if (handle && handle.isVisible()) {
        if (handleDisplayId !== d.id && edgeDisplays().some((x) => x.id === d.id)) updateHandle(d);
        const reach = click ? Math.hypot(dist, Math.max(0, Math.abs(dy) - PILL_REACH)) : dist;
        const near = onHandleDisplay ? Math.max(0, Math.min(1, 1 - reach / 90)) : 0;
        const q = Math.round(near * 20) / 20;
        if (q !== handleNear || q > 0) {
          handleNear = q;
          handle.webContents.send('handle:near', { near: q, y: pt.y - b.y });
        }
        // warm up while you approach, so the click opens onto a ready backdrop
        if (click && q >= 0.5 && !prewarmed) { prewarmed = true; prewarm(d); } else if (q === 0) prewarmed = false;
      }
      if (click) {
        // Clicking the pill opens on press. The pill's window must never take focus from your
        // app, and Chromium eats the mousedown of such a window (the page only ever sees the
        // mouseup), so main watches the button itself. The page's mouseup still covers taps
        // too quick for this poll.
        if (handleHot && onPill && native.isLeftDown()) {
          if (!pillPressed) {
            pillPressed = true;
            handle.webContents.send('handle:press');
            open('click', d, pt.y);
          }
          return;
        }
        pillPressed = false;
        const mouseDown = onPill && native.isMouseDown();
        // Take clicks only once the cursor is on the pill with the button up, so a scrollbar or
        // file drag passing through is never interrupted; keep taking them through a press.
        setHandleHot(onPill && (handleHot || !mouseDown));
        // dragging files onto the pill opens the Shelf
        if (onPill && mouseDown && !handleHot && S().dragOpens) {
          if (!dwellStart) dwellStart = now;
          if (now - dwellStart >= 320) open('drag', d, pt.y);
        } else dwellStart = 0;
        return;
      }
      const atEdge = outerEdge(pt, d);
      const zoneOk = S().triggerZone !== 'middle' || (pt.y > b.y + b.height * 0.22 && pt.y < b.y + b.height * 0.78);
      if (rearmBlocked) { if (!atEdge) rearmBlocked = false; return; }
      if (atEdge && zoneOk) {
        const mouseDown = native.isMouseDown();
        if (!dwellStart) {
          dwellStart = now;
          prewarm(d);
        }
        const need = mouseDown ? (S().dragOpens ? 320 : Infinity) : Math.max(0, S().hoverDelay);
        if (now - dwellStart >= need) open(mouseDown ? 'drag' : 'hover', d, pt.y);
      } else dwellStart = 0;
    } else if (state === 'open') {
      const sticky = pinned || typing || dragOut || dialogOpen || reason === 'hotkey' || reason === 'clipboard' || reason === 'tray';
      if (insidePanel(pt)) { lastInside = now; if (reason === 'drag' && !native.isMouseDown()) reason = 'hover'; return; }
      if (sticky) return;
      if (native.isMouseDown() && reason !== 'drag') { lastInside = now; return; }
      if (now - lastInside > Math.max(120, S().closeDelay)) close('leave');
    }
  }

  // ─────────────────────────── hotkeys ───────────────────────────
  function registerHotkeys() {
    globalShortcut.unregisterAll();
    hotkeyStatus = {};
    for (const [k, acc] of Object.entries(S().hotkeys || {})) {
      if (!acc) { hotkeyStatus[k] = 'off'; continue; }
      try {
        hotkeyStatus[k] = globalShortcut.register(acc, () => onHotkey(k)) ? 'ok' : 'taken';
      } catch { hotkeyStatus[k] = 'invalid'; }
    }
    send('hotkeys', hotkeyStatus);
  }

  function onHotkey(k) {
    if (k === 'toggle') toggle('hotkey');
    else if (k === 'clipboard') {
      if (state === 'open' && reason === 'clipboard') close('toggle');
      else open('clipboard');
    }
  }

  // ─────────────────────────── features ───────────────────────────
  const clip = new ClipboardHistory({
    dir: USER, native, getSettings: S, selfExe: process.execPath,
    onChange: () => { clearTimeout(clipT); clipT = setTimeout(() => send('clip', clip.summary()), 40); },
  });
  let clipT = null;

  const captures = new Captures({
    thumbsDir: path.join(USER, 'thumbs'), getSettings: S,
    onChange: () => send('captures', captureList()),
  });
  const captureList = () => ({ items: captures.items.slice(0, 300), sharpshot: captures.available(), source: S().captures.source });

  const media = new Media({ onChange: () => send('media', media.state) });

  const todos = new QuickTodo({ onChange: (st) => send('todo', st), native, log });
  // open QuickTodo itself (its own hotkey) — Glide only mirrors its lists
  function openQuickTodo() {
    const t = (S().tools || []).find((x) => x.id === 'altq' || (x.action && x.action.keys === 'Alt+Q'));
    if (t) return runTool(t.id);
    if (Date.now() - lastToolRun < 800) return;
    lastToolRun = Date.now();
    close('tool', { fast: true });
    setTimeout(() => { native.releaseModifiers(); native.sendCombo('Alt+Q'); }, 260);
  }

  let lastToolRun = 0;
  async function runTool(id) {
    const t = (S().tools || []).find((x) => x.id === id);
    if (!t) return;
    // A double-click would press a capture hotkey twice and cancel it again.
    if (Date.now() - lastToolRun < 800) return;
    lastToolRun = Date.now();
    close('tool', { fast: true });
    const a = t.action || {};
    try {
      if (a.type === 'keys' && a.keys) {
        // QuickTodo must have the sidebar's edits before it opens
        if (/^alt+q$/i.test(a.keys) && todos.pending.length) await todos.commit();
        await delay(260);
        native.releaseModifiers();
        const n = native.sendCombo(a.keys);
        log('tool', t.name, a.keys, 'SendInput →', n, 'fg:', native.processPathOfWindow(native.foregroundWindow()));
      } else if (a.type === 'open' && a.target) {
        const err = await shell.openPath(a.target);
        if (err) log('open tool', err);
      } else if (a.type === 'url' && a.target) {
        await shell.openExternal(/^[a-z]+:/i.test(a.target) ? a.target : 'https://' + a.target);
      }
    } catch (e) { log('tool', e); }
  }

  async function pasteClip(id) {
    if (!(await clip.write(id))) return;
    if (!S().clipboard.pasteOnClick) { send('toast', { text: 'Copied', icon: 'check' }); return; }
    const wasFocused = focused;
    close('paste', { fast: true });
    await delay(wasFocused ? 150 : 70);
    native.releaseModifiers();
    native.sendCombo('Ctrl+V');
  }

  // A clipboard image → Downloads, named after when you copied it. Copies the stored full-size PNG;
  // the history keeps its own copy, and an existing file is never overwritten.
  async function saveClipImage(id) {
    const it = clip.get(id);
    if (!it || it.type !== 'image' || !it.file || !fs.existsSync(it.file)) return null;
    const when = new Date(it.at);
    const p2 = (n) => String(n).padStart(2, '0');
    const base = `Clipboard ${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())} ${p2(when.getHours())}-${p2(when.getMinutes())}-${p2(when.getSeconds())}`;
    const dir = app.getPath('downloads');
    let out = path.join(dir, `${base}.png`);
    for (let k = 2; fs.existsSync(out); k++) out = path.join(dir, `${base} (${k}).png`);
    await fs.promises.copyFile(it.file, out, fs.constants.COPYFILE_EXCL);
    await fs.promises.utimes(out, when, when).catch(() => {});
    return out;
  }

  async function copyCapture(id) {
    const it = captures.get(id);
    if (!it) return false;
    if (it.kind === 'image') {
      try { await writeImageFile(it.path); return true; } catch (e) { log('copy capture', e); }
    }
    return native.writeClipboardFiles([it.path], win);
  }

  // Shelf
  const shelfList = () => data.data.shelf.filter((x) => fs.existsSync(x.path));
  function shelfAdd(paths) {
    let added = 0;
    for (const p of paths || []) {
      if (!p || data.data.shelf.some((x) => x.path.toLowerCase() === p.toLowerCase())) continue;
      try {
        const st = fs.statSync(p);
        data.data.shelf.unshift({ id: Math.random().toString(36).slice(2, 10), path: p, name: path.basename(p) || p, size: st.isDirectory() ? null : st.size, dir: st.isDirectory(), at: Date.now() });
        added++;
      } catch { /* */ }
    }
    if (added) { data.save(); send('shelf', shelfList()); }
    return added;
  }

  // ─────────────────────────── icons for drag ───────────────────────────
  const iconCache = new Map();
  async function fileIcon(p, size = 'large') {
    const key = size + '|' + p.toLowerCase();
    if (iconCache.has(key)) return iconCache.get(key);
    let img;
    try { img = await app.getFileIcon(p, { size }); } catch { img = nativeImage.createEmpty(); }
    iconCache.set(key, img);
    return img;
  }

  async function startDrag(sender, files, iconPath) {
    files = files.filter((f) => f && fs.existsSync(f));
    if (!files.length) return;
    let icon = null;
    if (iconPath) { icon = nativeImage.createFromPath(iconPath); if (!icon.isEmpty()) icon = icon.resize({ width: 96 }); }
    if (!icon || icon.isEmpty()) icon = await fileIcon(files[0]);
    if (icon.isEmpty()) icon = trayImage();
    dragOut = true;
    win.setIgnoreMouseEvents(true);
    send('drag-out', true);
    try { sender.startDrag({ file: files[0], files, icon }); } catch (e) { log('drag', e); }
    // startDrag returns once the OS drag loop ends
    setTimeout(() => {
      dragOut = false;
      send('drag-out', false);
      if (state === 'open') close('drag-out', { fast: true });
    }, 30);
  }

  // ─────────────────────────── protocol ───────────────────────────
  function allowedFile(p) {
    const lp = p.toLowerCase();
    if (captures.items.some((x) => x.path.toLowerCase() === lp)) return true;
    if (data.data.shelf.some((x) => x.path.toLowerCase() === lp)) return true;
    return false;
  }

  function registerProtocol() {
    protocol.handle('glide', async (req) => {
      const u = new URL(req.url);
      try {
        switch (u.host) {
          case 'app': {
            const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'sidebar.html';
            const file = path.normalize(path.join(DIST, rel));
            if (!file.startsWith(DIST)) return new Response('no', { status: 403 });
            return net.fetch(pathToFileURL(file).toString());
          }
          case 'backdrop':
            if (!backdrop.buf) return new Response(null, { status: 404 });
            // CORS so the renderer can pre-blur it on a canvas without tainting it
            return new Response(backdrop.buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
          case 'thumb': {
            const buf = await captures.thumb(u.pathname.slice(1));
            if (!buf) return new Response(null, { status: 404 });
            return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000' } });
          }
          case 'clip': {
            const p = clip.thumbPath(u.pathname.slice(1));
            if (!p) return new Response(null, { status: 404 });
            return net.fetch(pathToFileURL(p).toString());
          }
          case 'icon': {
            const p = u.searchParams.get('p');
            if (!p) return new Response(null, { status: 400 });
            const img = await fileIcon(p, u.searchParams.get('s') === 'small' ? 'small' : 'large');
            if (img.isEmpty()) return new Response(null, { status: 404 });
            return new Response(img.toPNG(), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' } });
          }
          case 'file': {
            const p = u.searchParams.get('p');
            if (!p || !allowedFile(p)) return new Response(null, { status: 403 });
            return net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
          }
          case 'art':
            if (!media.art) return new Response(null, { status: 404 });
            return new Response(media.art, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
          default:
            return new Response(null, { status: 404 });
        }
      } catch (e) {
        log('protocol', req.url, e);
        return new Response(null, { status: 500 });
      }
    });
  }

  // ─────────────────────────── settings ───────────────────────────
  function deepMerge(t, p) {
    for (const [k, v] of Object.entries(p)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
      else t[k] = v;
    }
  }

  function applyLogin() {
    if (!app.isPackaged) return;
    try {
      app.setLoginItemSettings({ openAtLogin: !!S().launchAtLogin, path: process.execPath, args: ['--startup'], name: 'Glide' });
    } catch (e) { log('login item', e); }
  }

  function setSettings(patch) {
    const before = JSON.parse(JSON.stringify(S()));
    deepMerge(S(), patch);
    settings.save(150);
    const changed = (k) => JSON.stringify(before[k]) !== JSON.stringify(S()[k]);
    if (changed('edge') || changed('width')) {
      const d = displays.find((x) => x.id === (geo && geo.displayId)) || screen.getPrimaryDisplay();
      placeOn(d);
      handleDisplayId = null;
      updateHandle();
      backdrop.at = 0;
      if (state === 'open') captureBackdrop(d);
    }
    if (changed('openOn')) { setHandleHot(false); dwellStart = 0; }
    if (changed('showHandle') || changed('pauseInFullscreen') || changed('openOn')) updateHandle();
    if (changed('hotkeys')) registerHotkeys();
    if (changed('launchAtLogin')) applyLogin();
    if (changed('hideFromCapture')) applyCaptureExclusion();
    if (changed('glass')) { if (state === 'open') { startLive(); if (S().glass !== 'solid') captureBackdrop(displays.find((x) => x.id === geo.displayId) || screen.getPrimaryDisplay()); } }
    if (changed('clipboard')) clip.prune();
    if (changed('captures')) captures.rewatch();
    if (changed('showMedia')) media.setMedia(!!S().showMedia);
    if (changed('theme')) nativeTheme.themeSource = S().theme === 'auto' ? 'system' : S().theme;
    broadcast('settings', S());
    return S();
  }

  // ─────────────────────────── IPC ───────────────────────────
  function wireIpc() {
    ipcMain.handle('init', () => ({
      settings: S(), geo, clip: clip.summary(), captures: captureList(), shelf: shelfList(),
      todo: todos.state, tab: data.data.tab, media: media.state, hotkeys: hotkeyStatus,
      dark: nativeTheme.shouldUseDarkColors, version: app.getVersion(), packaged: app.isPackaged,
      backdropSeq: backdrop.buf ? backdrop.seq : 0,
      hasBattery: native.hasBattery(),
      onboarded: !!data.data.onboarded,
      // the renderer may boot after we already opened (slow disk, early hotkey)
      panel: state === 'open' && lastOpen ? lastOpen : { open: false },
    }));
    ipcMain.on('ignore-mouse', (e, ignore) => {
      if (!win || state !== 'open' || dragOut) return;
      if (dragIn) return win.setIgnoreMouseEvents(false);
      win.setIgnoreMouseEvents(!!ignore, { forward: true });
    });
    ipcMain.on('panel:close', () => close('esc'));
    ipcMain.on('handle:pace', (e, p) => onHandlePace(p));
    ipcMain.on('handle:click', () => {
      if (state !== 'closed' || !clickMode()) return;
      const pt = screen.getCursorScreenPoint();
      open('click', screen.getDisplayNearestPoint(pt), pt.y);
    });
    ipcMain.on('panel:rect', (e, r) => { if (r && r.w > 0 && r.h > 0) panelRect = r; });
    ipcMain.on('panel:pin', (e, v) => { pinned = !!v; });
    ipcMain.on('panel:typing', (e, v) => { typing = !!v; if (v && !focused) focusPanel(); });
    ipcMain.on('panel:focus', () => focusPanel());
    ipcMain.on('panel:tab', (e, t) => { data.data.tab = t; data.save(); });
    ipcMain.on('drag-in', (e, v) => { if (state === 'open') { dragIn = !!v; win.setIgnoreMouseEvents(!v, { forward: true }); } });

    ipcMain.on('tool:run', (e, id) => runTool(id));
    ipcMain.on('todo:open', () => openQuickTodo());
    ipcMain.on('todo:op', (e, o) => todos.op(o));
    ipcMain.on('clip:paste', (e, id) => pasteClip(id));
    ipcMain.on('clip:copy', async (e, id) => { if (await clip.write(id)) send('toast', { text: 'Copied', icon: 'check' }); });
    ipcMain.on('clip:save', async (e, id) => {
      try { if (await saveClipImage(id)) send('toast', { text: 'Saved to Downloads', icon: 'check' }); } catch (err) { log('clip save', err); }
    });
    ipcMain.on('clip:pin', (e, id) => clip.pin(id));
    ipcMain.on('clip:remove', (e, id) => clip.remove(id));
    ipcMain.on('clip:clear', () => clip.clear());
    ipcMain.handle('clip:full', (e, id) => { const it = clip.get(id); return it ? it.text || null : null; });

    ipcMain.on('cap:copy', async (e, id) => { if (await copyCapture(id)) send('toast', { text: 'Copied', icon: 'check' }); });
    ipcMain.on('cap:open', (e, id) => { const it = captures.get(id); if (it) { shell.openPath(it.path); close('open', { fast: true }); } });
    ipcMain.on('cap:reveal', (e, id) => { const it = captures.get(id); if (it) { shell.showItemInFolder(it.path); close('open', { fast: true }); } });
    ipcMain.on('cap:sharpshot', () => {
      const exe = S().captures.sharpshotExe;
      close('open', { fast: true });
      if (exe && fs.existsSync(exe)) spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    });

    ipcMain.on('drag:start', async (e, req) => {
      try {
        if (req.kind === 'capture') {
          const it = captures.get(req.id);
          if (it) await startDrag(e.sender, [it.path], it.kind === 'image' ? path.join(USER, 'thumbs', req.id + '.jpg') : null);
        } else if (req.kind === 'shelf') {
          const items = data.data.shelf.filter((x) => req.ids.includes(x.id)).map((x) => x.path);
          await startDrag(e.sender, items);
        } else if (req.kind === 'clip') {
          const it = clip.get(req.id);
          if (it && it.type === 'image') await startDrag(e.sender, [it.file], clip.thumbPath(it.id));
          else if (it && it.type === 'files') await startDrag(e.sender, it.files);
        }
      } catch (err) { log('drag:start', err); }
    });

    ipcMain.on('shelf:add', (e, paths) => { if (shelfAdd(paths)) send('toast', { text: 'Added to Shelf', icon: 'tray' }); });
    ipcMain.on('shelf:remove', (e, id) => { data.data.shelf = data.data.shelf.filter((x) => x.id !== id); data.save(); send('shelf', shelfList()); });
    ipcMain.on('shelf:clear', () => { data.data.shelf = []; data.save(); send('shelf', []); });
    ipcMain.on('shelf:open', (e, id) => { const it = data.data.shelf.find((x) => x.id === id); if (it) { shell.openPath(it.path); close('open', { fast: true }); } });
    ipcMain.on('shelf:reveal', (e, id) => { const it = data.data.shelf.find((x) => x.id === id); if (it) { shell.showItemInFolder(it.path); close('open', { fast: true }); } });
    ipcMain.on('shelf:copy', (e, ids) => {
      const files = data.data.shelf.filter((x) => ids.includes(x.id)).map((x) => x.path);
      if (files.length && native.writeClipboardFiles(files, win)) send('toast', { text: files.length > 1 ? `Copied ${files.length} files` : 'Copied', icon: 'check' });
    });

    ipcMain.on('text:copy', async (e, text) => { await clipboard.writeText(String(text || '')); send('toast', { text: 'Copied', icon: 'check' }); });

    ipcMain.handle('settings:set', (e, patch) => setSettings(patch || {}));
    ipcMain.handle('settings:reset', () => { settings.data = mergeDefaults({}, DEFAULT_SETTINGS); return setSettings({}); });
    ipcMain.on('hotkeys:suspend', () => globalShortcut.unregisterAll());
    ipcMain.on('hotkeys:resume', () => registerHotkeys());
    ipcMain.handle('pick:folder', async () => {
      dialogOpen = true;
      try {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      } finally { dialogOpen = false; focusPanel(); }
    });
    ipcMain.handle('pick:file', async () => {
      dialogOpen = true;
      try {
        const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
        return r.canceled ? null : r.filePaths[0];
      } finally { dialogOpen = false; focusPanel(); }
    });
    ipcMain.on('media:cmd', (e, cmd) => {
      const k = { toggle: 'MediaPlayPause', next: 'MediaNextTrack', prev: 'MediaPreviousTrack' }[cmd];
      if (k) native.sendCombo(k);
    });
    ipcMain.on('open:path', (e, p) => { if (p) shell.openPath(p); });
    ipcMain.on('open:url', (e, u) => {
      const url = /^https?:\/\//i.test(u) ? u : 'https://' + String(u).replace(/^\/+/, '');
      try { if (['http:', 'https:'].includes(new URL(url).protocol)) { shell.openExternal(url); close('open', { fast: true }); } } catch { /* invalid */ }
    });
    ipcMain.on('onboarded', () => { data.data.onboarded = true; data.save(); });
    ipcMain.on('app:quit', () => app.quit());
    ipcMain.on('app:relaunch', () => { app.relaunch(); app.quit(); });
  }

  // ─────────────────────────── tray ───────────────────────────
  function trayImage() {
    const darkBar = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ?? true;
    const img = nativeImage.createFromPath(path.join(ROOT, 'assets', darkBar ? 'tray-light.png' : 'tray-dark.png'));
    return img.isEmpty() ? nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png')).resize({ width: 16 }) : img;
  }

  function buildTray() {
    tray = new Tray(trayImage());
    tray.setToolTip('Glide');
    const menu = () => Menu.buildFromTemplate([
      { label: 'Open Glide', click: () => open('tray') },
      { label: 'Pause hover reveal', type: 'checkbox', checked: hoverPaused, click: (m) => { hoverPaused = m.checked; updateHandle(); } },
      { type: 'separator' },
      { label: 'Settings…', click: () => { open('tray'); setTimeout(() => send('open-settings'), 120); } },
      { label: 'Launch at login', type: 'checkbox', checked: !!S().launchAtLogin, enabled: app.isPackaged, click: (m) => setSettings({ launchAtLogin: m.checked }) },
      { type: 'separator' },
      { label: 'Restart Glide', click: () => { app.relaunch(); app.quit(); } },
      { label: 'Quit Glide', click: () => app.quit() },
    ]);
    tray.on('click', () => toggle('tray'));
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
  }

  // ─────────────────────────── lifecycle ───────────────────────────
  app.on('second-instance', () => open('tray'));
  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    settings.flush(); data.flush();
    clip.stop(); media.stop(); captures.stop();
    globalShortcut.unregisterAll();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = S().theme === 'auto' ? 'system' : S().theme;
    nativeTheme.on('updated', () => {
      broadcast('theme', nativeTheme.shouldUseDarkColors);
      if (tray) tray.setImage(trayImage());
    });
    refreshDisplays();
    registerProtocol();
    wireIpc();
    createSidebar();
    createHandle();
    clip.start(win);
    captures.start();
    todos.start();
    media.mediaOn = !!S().showMedia;
    media.start();
    registerHotkeys();
    buildTray();
    applyLogin();
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(ev, () => {
        refreshDisplays();
        const d = displays.find((x) => geo && x.id === geo.displayId) || screen.getPrimaryDisplay();
        placeOn(d);
        handleDisplayId = null;
        updateHandle();
      });
    }
    loop();
    setInterval(() => {
      const busy = native.isFullscreenBusy();
      if (busy === fullscreenBusy) return;
      fullscreenBusy = busy;
      updateHandle();
      // Step out of the way of fullscreen games/videos entirely; come back (and repaint) after.
      if (sidebarShouldHide()) win.hide();
      else if (state === 'closed' && !win.isVisible()) showSidebarWindow();
    }, 1500);
    log('Glide started', app.getVersion(), process.argv.slice(1).join(' '));
    if (process.argv.includes('--open') || (!data.data.onboarded && app.isPackaged)) setTimeout(() => open('tray'), 1600);
    if (!app.isPackaged && process.env.GLIDE_DEV === '1') devChannel();
  });

  // Dev-only remote control (unpackaged builds started with GLIDE_DEV=1; see scripts/dev.ps1):
  // write JSON to userData/dev-cmd.json, the result lands in dev-out.json.
  function devChannel() {
    const cmdFile = path.join(USER, 'dev-cmd.json');
    const outFile = path.join(USER, 'dev-out.json');
    let busy = false;
    setInterval(async () => {
      if (busy || !fs.existsSync(cmdFile)) return;
      let req;
      try { req = JSON.parse(fs.readFileSync(cmdFile, 'utf8')); fs.unlinkSync(cmdFile); } catch { return; }
      busy = true;
      const id = req && req.id !== undefined ? req.id : null;
      const cmds = req && req.cmds ? req.cmds : req;
      const results = [];
      for (const c of [].concat(cmds)) {
        try {
          if (c.cmd === 'open') { open(c.reason || 'tray'); results.push('opened'); }
          else if (c.cmd === 'hover') { open('hover', null, c.y); results.push('hover-opened'); }
          else if (c.cmd === 'close') { close('dev'); results.push('closed'); }
          else if (c.cmd === 'wait') { await delay(c.ms || 500); results.push('waited'); }
          else if (c.cmd === 'eval') { results.push(await win.webContents.executeJavaScript(c.js)); }
          else if (c.cmd === 'evalHandle') { results.push(await handle.webContents.executeJavaScript(c.js)); }
          else if (c.cmd === 'settings') { setSettings(c.patch || {}); results.push('ok'); }
          else if (c.cmd === 'shot') {
            const img = await win.webContents.capturePage();
            fs.writeFileSync(c.file, img.toPNG());
            results.push({ file: c.file, size: img.getSize() });
          } else if (c.cmd === 'screen') {
            // what is really on screen (needs hideFromCapture off to include Glide itself)
            const d = screen.getPrimaryDisplay();
            const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
            const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }))[0];
            let img = src.thumbnail;
            if (c.crop) img = img.crop({ x: Math.round(c.crop.x * d.scaleFactor), y: Math.round(c.crop.y * d.scaleFactor), width: Math.round(c.crop.width * d.scaleFactor), height: Math.round(c.crop.height * d.scaleFactor) });
            fs.writeFileSync(c.file, img.toPNG());
            results.push({ file: c.file, size: img.getSize() });
          } else if (c.cmd === 'media') {
            media.state = c.state; if (c.art) media.art = fs.readFileSync(c.art); send('media', media.state); results.push('media set');
          } else if (c.cmd === 'keysIfFocused') {
            // only ever types into Glide itself
            if (native.foregroundWindow() === native.hwndOf(win)) { native.releaseModifiers(); native.sendCombo(c.keys); results.push('sent'); }
            else results.push('not-foreground: ' + native.processPathOfWindow(native.foregroundWindow()));
          } else if (c.cmd === 'capbench') {
            const d = screen.getPrimaryDisplay();
            const r = screen.dipToScreenRect(null, geo.win);
            const ow = Math.round(geo.win.width / 2); const oh = Math.round(geo.win.height / 2);
            let c0 = process.cpuUsage(); let t0 = Date.now();
            let bits;
            for (let i = 0; i < 10; i++) bits = native.captureRegion(r.x, r.y, r.width, r.height, ow, oh);
            const gdi = { wallMs: (Date.now() - t0) / 10, cpuMs: (process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000 / 10 };
            const img = nativeImage.createFromBitmap(bits, { width: ow, height: oh });
            fs.writeFileSync(c.file, img.toPNG());
            c0 = process.cpuUsage(); t0 = Date.now();
            for (let i = 0; i < 3; i++) await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width / 2), height: Math.round(d.size.height / 2) } });
            const dc = { wallMs: (Date.now() - t0) / 3, cpuMs: (process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000 / 3 };
            results.push({ gdi, desktopCapturer: dc, rect: r, out: [ow, oh] });
          } else if (c.cmd === 'bench') {
            const N = 2000; const t0 = process.hrtime.bigint();
            for (let i = 0; i < N; i++) { const pt = screen.getCursorScreenPoint(); const d = screen.getDisplayNearestPoint(pt); outerEdge(pt, d); }
            const t1 = process.hrtime.bigint();
            for (let i = 0; i < N; i++) native.isMouseDown();
            const t2 = process.hrtime.bigint();
            for (let i = 0; i < 200; i++) native.isFullscreenBusy();
            const t3 = process.hrtime.bigint();
            for (let i = 0; i < 200; i++) native.clipboardSequence();
            const t4 = process.hrtime.bigint();
            for (let i = 0; i < 200; i++) fs.existsSync(path.join(USER, 'dev-cmd.json'));
            const t5 = process.hrtime.bigint();
            const us = (a, b, n) => Number(b - a) / 1000 / n;
            results.push({ tickUs: us(t0, t1, N), mouseDownUs: us(t1, t2, N), fullscreenUs: us(t2, t3, 200), clipSeqUs: us(t3, t4, 200), existsUs: us(t4, t5, 200) });
          } else if (c.cmd === 'cap') {
            const d = screen.getPrimaryDisplay();
            desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 64, height: 40 } }).catch(() => {});
            results.push('cap ' + d.id);
          } else if (c.cmd === 'gpu') {
            results.push({ status: app.getGPUFeatureStatus(), info: await app.getGPUInfo('basic'), metrics: app.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage, mem: Math.round(m.memory.workingSetSize / 1024) })) });
          } else if (c.cmd === 'traceStart') {
            const { contentTracing } = require('electron');
            await contentTracing.startRecording({ included_categories: ['toplevel', 'gpu', 'viz', 'cc', 'benchmark', 'ui', 'views', 'blink', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-viz.quads'] });
            results.push('tracing');
          } else if (c.cmd === 'traceStop') {
            const { contentTracing } = require('electron');
            results.push(await contentTracing.stopRecording(c.file));
          } else if (c.cmd === 'invalidate') {
            win.webContents.invalidate(); results.push('invalidated');
          } else if (c.cmd === 'nudge') {
            const b = win.getBounds(); win.setBounds({ ...b, width: b.width + 1 }); win.setBounds(b); results.push('nudged');
          } else if (c.cmd === 'opentime') {
            const t = process.hrtime.bigint(); open('hover', null, c.y ?? 450);
            results.push(Math.round(Number(process.hrtime.bigint() - t) / 1e4) / 100);
          } else if (c.cmd === 'synccost') {
            const out = {};
            let t = process.hrtime.bigint();
            const p1 = desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 16, height: 10 } });
            out.getSourcesSyncMs = Number(process.hrtime.bigint() - t) / 1e6;
            t = process.hrtime.bigint(); await p1; out.getSourcesTotalMs = Number(process.hrtime.bigint() - t) / 1e6;
            const d = screen.getPrimaryDisplay();
            t = process.hrtime.bigint();
            const p2 = captureBackdrop(d);
            out.captureBackdropSyncMs = Number(process.hrtime.bigint() - t) / 1e6;
            await p2;
            t = process.hrtime.bigint(); open('hover', null, 450); out.openSyncMs = Number(process.hrtime.bigint() - t) / 1e6;
            results.push(out);
          } else if (c.cmd === 'film') {
            // filmstrip of an open: frames captured as fast as the compositor allows
            const t0 = Date.now(); const frames = [];
            if (c.close) close('dev'); else open(c.reason || 'hover', null, c.y ?? 450);
            while (Date.now() - t0 < (c.ms || 900)) {
              const img = await win.webContents.capturePage();
              const f = path.join(c.dir, `f${String(frames.length).padStart(2, '0')}.png`);
              fs.writeFileSync(f, img.toPNG());
              frames.push(Date.now() - t0);
            }
            results.push({ frames });
          } else if (c.cmd === 'shotHandle') {
            const img = await handle.webContents.capturePage();
            fs.writeFileSync(c.file, img.toPNG());
            results.push({ file: c.file });
          } else if (c.cmd === 'hold') {
            // open without focus and stay open (for looking at it): pinned until 'close'
            open('hover', null, c.y ?? 420); pinned = true; results.push('held');
          } else if (c.cmd === 'exstyle') {
            results.push({ sidebar: native.exStyle(win), handle: native.exStyle(handle), bounds: win.getBounds() });
          } else if (c.cmd === 'state') {
            const pt = screen.getCursorScreenPoint();
            results.push({ pt, inside: insidePanel(pt), sinceInside: Date.now() - lastInside, mouseDown: native.isMouseDown(), dragOut, dialogOpen });
            results.push({ state, reason, pinned, typing, focused, dragIn, geo, visible: win.isVisible(), handleVisible: handle.isVisible(), backdropSeq: backdrop.seq, fullscreenBusy, hotkeyStatus });
          }
        } catch (e) { results.push({ error: String(e && e.stack || e) }); }
      }
      fs.writeFileSync(outFile, JSON.stringify(id === null ? results : { id, results }, null, 1));
      busy = false;
    }, 120);
  }
}
