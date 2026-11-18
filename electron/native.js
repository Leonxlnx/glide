// Thin Win32 bridge (koffi). Everything here is synchronous and cheap.
const koffi = require('koffi');
const path = require('path');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const shell32 = koffi.load('shell32.dll');
const versionDll = koffi.load('version.dll');

const HWND = koffi.pointer('HWND', koffi.opaque());
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
koffi.struct('POINT', { x: 'long', y: 'long' });
koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
koffi.struct('SYSTEM_POWER_STATUS', {
  ACLineStatus: 'uint8_t', BatteryFlag: 'uint8_t', BatteryLifePercent: 'uint8_t', SystemStatusFlag: 'uint8_t',
  BatteryLifeTime: 'uint32_t', BatteryFullLifeTime: 'uint32_t',
});

const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long', dy: 'long', mouseData: 'uint32_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t',
});
const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t',
});
const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', { uMsg: 'uint32_t', wParamL: 'uint16_t', wParamH: 'uint16_t' });
const INPUT = koffi.struct('INPUT', {
  type: 'uint32_t',
  u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
});

const fn = {
  SendInput: user32.func('uint32_t __stdcall SendInput(uint32_t n, INPUT *inputs, int cb)'),
  GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
  SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(HWND h)'),
  IsWindow: user32.func('bool __stdcall IsWindow(HWND h)'),
  GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND h, _Out_ uint32_t *pid)'),
  GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vk)'),
  SetWindowDisplayAffinity: user32.func('bool __stdcall SetWindowDisplayAffinity(HWND h, uint32_t a)'),
  AddClipboardFormatListener: user32.func('bool __stdcall AddClipboardFormatListener(HWND h)'),
  RemoveClipboardFormatListener: user32.func('bool __stdcall RemoveClipboardFormatListener(HWND h)'),
  RegisterClipboardFormatW: user32.func('uint32_t __stdcall RegisterClipboardFormatW(str16 name)'),
  IsClipboardFormatAvailable: user32.func('bool __stdcall IsClipboardFormatAvailable(uint32_t f)'),
  OpenClipboard: user32.func('bool __stdcall OpenClipboard(HWND h)'),
  CloseClipboard: user32.func('bool __stdcall CloseClipboard()'),
  EmptyClipboard: user32.func('bool __stdcall EmptyClipboard()'),
  GetClipboardData: user32.func('HANDLE __stdcall GetClipboardData(uint32_t f)'),
  SetClipboardData: user32.func('HANDLE __stdcall SetClipboardData(uint32_t f, HANDLE h)'),
  GetClipboardSequenceNumber: user32.func('uint32_t __stdcall GetClipboardSequenceNumber()'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(HWND h, _Out_ RECT *r)'),
  GetShellWindow: user32.func('HWND __stdcall GetShellWindow()'),
  GetDesktopWindow: user32.func('HWND __stdcall GetDesktopWindow()'),
  GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND h, _Out_ uint16_t *buf, int max)'),
  FindWindowW: user32.func('HWND __stdcall FindWindowW(str16 cls, str16 title)'),
  FindWindowExW: user32.func('HWND __stdcall FindWindowExW(HWND parent, HWND after, str16 cls, str16 title)'),
  IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND h)'),
  AttachThreadInput: user32.func('bool __stdcall AttachThreadInput(uint32_t a, uint32_t b, bool attach)'),
  BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(HWND h)'),
  GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
  SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(HWND h, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'),
  PostThreadMessageW: user32.func('bool __stdcall PostThreadMessageW(uint32_t tid, uint32_t msg, uintptr_t w, intptr_t l)'),
  GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND h, int i)'),
  SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(HWND h, int i, intptr_t v)'),
  OpenProcess: kernel32.func('HANDLE __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
  CloseHandle: kernel32.func('bool __stdcall CloseHandle(HANDLE h)'),
  QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(HANDLE h, uint32_t flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)'),
  GlobalAlloc: kernel32.func('HANDLE __stdcall GlobalAlloc(uint32_t flags, size_t bytes)'),
  GlobalLock: kernel32.func('void * __stdcall GlobalLock(HANDLE h)'),
  GlobalUnlock: kernel32.func('bool __stdcall GlobalUnlock(HANDLE h)'),
  GlobalFree: kernel32.func('HANDLE __stdcall GlobalFree(HANDLE h)'),
  RtlMoveMemory: kernel32.func('void __stdcall RtlMoveMemory(void *dst, const void *src, size_t n)'),
  DragQueryFileW: shell32.func('uint32_t __stdcall DragQueryFileW(HANDLE h, uint32_t i, _Out_ uint16_t *buf, uint32_t n)'),
  SHQueryUserNotificationState: shell32.func('int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t *state)'),
  GetSystemPowerStatus: kernel32.func('bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *s)'),
  GetFileVersionInfoSizeW: versionDll.func('uint32_t __stdcall GetFileVersionInfoSizeW(str16 file, _Out_ uint32_t *handle)'),
  GetFileVersionInfoW: versionDll.func('bool __stdcall GetFileVersionInfoW(str16 file, uint32_t handle, uint32_t len, _Out_ uint8_t *data)'),
  VerQueryValueW: versionDll.func('bool __stdcall VerQueryValueW(const uint8_t *block, str16 sub, _Out_ void **buf, _Out_ uint32_t *len)'),
};

// ───────────────────────────── keyboard ─────────────────────────────
const VK = {
  BACKSPACE: 0x08, TAB: 0x09, ENTER: 0x0d, RETURN: 0x0d, SHIFT: 0x10, CONTROL: 0x11, CTRL: 0x11, ALT: 0x12,
  PAUSE: 0x13, CAPSLOCK: 0x14, ESC: 0x1b, ESCAPE: 0x1b, SPACE: 0x20, PAGEUP: 0x21, PAGEDOWN: 0x22, END: 0x23,
  HOME: 0x24, LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28, PRINTSCREEN: 0x2c, INSERT: 0x2d, DELETE: 0x2e,
  SUPER: 0x5b, WIN: 0x5b, META: 0x5b, CMD: 0x5b, COMMAND: 0x5b,
  PLUS: 0xbb, '=': 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0, ';': 0xba, '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde,
  MEDIAPLAYPAUSE: 0xb3, MEDIANEXTTRACK: 0xb0, MEDIAPREVIOUSTRACK: 0xb1, MEDIASTOP: 0xb2,
  VOLUMEUP: 0xaf, VOLUMEDOWN: 0xae, VOLUMEMUTE: 0xad,
};
const EXTENDED = new Set([0x5b, 0x5c, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x2c,
  0xb3, 0xb0, 0xb1, 0xb2, 0xaf, 0xae, 0xad]);
const MODIFIERS = new Set([0x10, 0x11, 0x12, 0x5b]);

function vkFor(token) {
  const t = token.trim();
  const up = t.toUpperCase();
  if (up === 'COMMANDORCONTROL' || up === 'CMDORCTRL') return VK.CONTROL;
  if (up === 'OPTION' || up === 'ALTGR') return VK.ALT;
  if (VK[up] !== undefined) return VK[up];
  if (VK[t] !== undefined) return VK[t];
  if (/^[A-Z0-9]$/.test(up)) return up.charCodeAt(0);
  const f = /^F(\d{1,2})$/.exec(up);
  if (f) return 0x6f + Number(f[1]);
  throw new Error('Unknown key: ' + token);
}

function keyEvent(vk, down) {
  let flags = down ? 0 : 0x2;
  if (EXTENDED.has(vk)) flags |= 0x1;
  return { type: 1, u: { ki: { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
}

/** Press an accelerator like "Win+Shift+D" or "Alt+Q". */
function sendCombo(accel) {
  const parts = accel.split('+').filter(Boolean).map(vkFor);
  const mods = parts.filter((k) => MODIFIERS.has(k));
  const keys = parts.filter((k) => !MODIFIERS.has(k));
  const events = [];
  for (const m of mods) events.push(keyEvent(m, true));
  for (const k of keys) events.push(keyEvent(k, true));
  for (const k of keys.slice().reverse()) events.push(keyEvent(k, false));
  // A throwaway key between Win down/up keeps the Start menu from opening.
  if (mods.includes(VK.WIN) && keys.length === 0) { events.push(keyEvent(0xe8, true)); events.push(keyEvent(0xe8, false)); }
  for (const m of mods.slice().reverse()) events.push(keyEvent(m, false));
  return fn.SendInput(events.length, events, koffi.sizeof(INPUT));
}

/** Release modifiers the user might still be holding (after a global hotkey). */
function releaseModifiers() {
  const events = [];
  for (const vk of [0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]) {
    if (fn.GetAsyncKeyState(vk) & 0x8000) events.push(keyEvent(vk, false));
  }
  if (events.length) fn.SendInput(events.length, events, koffi.sizeof(INPUT));
}

function isMouseDown() {
  return (fn.GetAsyncKeyState(0x01) & 0x8000) !== 0 || (fn.GetAsyncKeyState(0x02) & 0x8000) !== 0;
}

function isLeftDown() {
  return (fn.GetAsyncKeyState(0x01) & 0x8000) !== 0;
}

// ───────────────────────────── windows ─────────────────────────────
function hwndOf(win) {
  const b = win.getNativeWindowHandle();
  return b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0));
}

function excludeFromCapture(win, on = true) {
  try { return fn.SetWindowDisplayAffinity(hwndOf(win), on ? 0x11 : 0); } catch { return false; }
}

/** Tool-window style keeps overlay windows out of Alt+Tab and Task View. */
function makeToolWindow(win) {
  try {
    const h = hwndOf(win);
    const GWL_EXSTYLE = -20;
    const ex = BigInt(fn.GetWindowLongPtrW(h, GWL_EXSTYLE));
    fn.SetWindowLongPtrW(h, GWL_EXSTYLE, (ex | 0x80n) & ~0x40000n); // +TOOLWINDOW, -APPWINDOW
  } catch { /* ignore */ }
}

function exStyle(win) {
  try { return '0x' + BigInt(fn.GetWindowLongPtrW(hwndOf(win), -20)).toString(16); } catch (e) { return String(e); }
}

/**
 * QuickTodo (optional companion, Alt+Q): its hidden message window is titled "QuickTodoMsg".
 * Returns its process, UI thread and top-level windows, or null when it isn't running.
 */
function findQuickTodo() {
  const msg = fn.FindWindowW(null, 'QuickTodoMsg');
  if (!msg) return null;
  const pidOut = [0];
  const tid = fn.GetWindowThreadProcessId(msg, pidOut);
  const pid = pidOut[0];
  if (!pid) return null;
  const windows = [];
  let visible = false;
  let h = null;
  for (let i = 0; i < 20000; i++) {
    h = fn.FindWindowExW(null, h, null, null);
    if (!h) break;
    const p = [0];
    fn.GetWindowThreadProcessId(h, p);
    if (p[0] !== pid) continue;
    windows.push(h);
    if (fn.IsWindowVisible(h)) visible = true;
  }
  const fg = fn.GetForegroundWindow();
  const fgPid = [0];
  if (fg) fn.GetWindowThreadProcessId(fg, fgPid);
  return { pid, tid, windows, visible, foreground: fgPid[0] === pid, exe: processPath(pid) };
}

/** Ask QuickTodo to write its in-memory lists now (it saves on WM_ENDSESSION; FALSE = not ending). */
function flushQuickTodo(qt) {
  const r = [0];
  for (const h of qt.windows) { try { fn.SendMessageTimeoutW(h, 0x16 /* WM_ENDSESSION */, 0, 0, 0x2 /* ABORTIFHUNG */, 1500, r); } catch { /* ignore */ } }
}

/** End QuickTodo's message loop: WinForms tears its windows (and tray icon) down and exits. */
function quitQuickTodo(qt) {
  try { return fn.PostThreadMessageW(qt.tid, 0x12 /* WM_QUIT */, 0, 0); } catch { return false; }
}

function windowPid(h) {
  if (!h) return 0;
  const p = [0];
  fn.GetWindowThreadProcessId(h, p);
  return p[0];
}

/** Give focus back to a window even when Glide isn't the foreground app (attach to the current one). */
function forceForeground(h) {
  if (!h || !fn.IsWindow(h)) return false;
  const same = () => { const f = fn.GetForegroundWindow(); return !!f && koffi.address(f) === koffi.address(h); };
  if (same()) return true;
  const fg = fn.GetForegroundWindow();
  const fgTid = fg ? fn.GetWindowThreadProcessId(fg, [0]) : 0;
  const me = fn.GetCurrentThreadId();
  const attached = !!fgTid && fgTid !== me && fn.AttachThreadInput(me, fgTid, true);
  try { fn.BringWindowToTop(h); fn.SetForegroundWindow(h); } finally { if (attached) fn.AttachThreadInput(me, fgTid, false); }
  return same();
}

function foregroundWindow() {
  const h = fn.GetForegroundWindow();
  return h ? BigInt(h) : 0n;
}

function focusWindow(h) {
  if (!h || !fn.IsWindow(h)) return false;
  return fn.SetForegroundWindow(h);
}

function windowClass(h) {
  const buf = Buffer.alloc(512);
  const n = fn.GetClassNameW(h, buf, 256);
  return buf.toString('utf16le', 0, n * 2);
}

function processPathOfWindow(h) {
  if (!h) return null;
  const pid = [0];
  fn.GetWindowThreadProcessId(h, pid);
  if (!pid[0]) return null;
  return processPath(pid[0]);
}

function processPath(pid) {
  const hp = fn.OpenProcess(0x1000, false, pid);
  if (!hp) return null;
  try {
    const buf = Buffer.alloc(2048);
    const size = [1024];
    if (!fn.QueryFullProcessImageNameW(hp, 0, buf, size)) return null;
    return buf.toString('utf16le', 0, size[0] * 2);
  } finally { fn.CloseHandle(hp); }
}

/** True when a fullscreen app / game / presentation owns the screen. */
function isFullscreenBusy() {
  const s = [0];
  if (fn.SHQueryUserNotificationState(s) !== 0) return false;
  return s[0] === 2 || s[0] === 3 || s[0] === 4; // BUSY, D3D_FULL_SCREEN, PRESENTATION_MODE
}

function hasBattery() {
  try {
    const s = {};
    if (!fn.GetSystemPowerStatus(s)) return false;
    return s.BatteryFlag !== 128 && s.BatteryFlag !== 255;
  } catch { return false; }
}

// ───────────────────────────── screen region (GDI) ─────────────────────────────
const gdi32 = koffi.load('gdi32.dll');
const g = {
  GetDC: user32.func('HANDLE __stdcall GetDC(HWND h)'),
  ReleaseDC: user32.func('int __stdcall ReleaseDC(HWND h, HANDLE dc)'),
  CreateCompatibleDC: gdi32.func('HANDLE __stdcall CreateCompatibleDC(HANDLE dc)'),
  CreateCompatibleBitmap: gdi32.func('HANDLE __stdcall CreateCompatibleBitmap(HANDLE dc, int w, int h)'),
  SelectObject: gdi32.func('HANDLE __stdcall SelectObject(HANDLE dc, HANDLE obj)'),
  DeleteObject: gdi32.func('bool __stdcall DeleteObject(HANDLE obj)'),
  DeleteDC: gdi32.func('bool __stdcall DeleteDC(HANDLE dc)'),
  SetStretchBltMode: gdi32.func('int __stdcall SetStretchBltMode(HANDLE dc, int mode)'),
  StretchBlt: gdi32.func('bool __stdcall StretchBlt(HANDLE dst, int x, int y, int w, int h, HANDLE src, int sx, int sy, int sw, int sh, uint32_t rop)'),
  GetDIBits: gdi32.func('int __stdcall GetDIBits(HANDLE dc, HANDLE bmp, uint32_t start, uint32_t lines, _Out_ uint8_t *bits, _Inout_ uint8_t *bmi, uint32_t usage)'),
};

/**
 * Grabs a screen region (physical px) scaled to outW×outH. Returns top-down BGRA with opaque alpha.
 * Windows marked WDA_EXCLUDEFROMCAPTURE (Glide itself) are not included; neither is the cursor.
 */
function captureRegion(x, y, w, h, outW, outH) {
  const screen = g.GetDC(null);
  const mem = g.CreateCompatibleDC(screen);
  const bmp = g.CreateCompatibleBitmap(screen, outW, outH);
  const old = g.SelectObject(mem, bmp);
  try {
    g.SetStretchBltMode(mem, 4); // HALFTONE
    if (!g.StretchBlt(mem, 0, 0, outW, outH, screen, x, y, w, h, 0x00cc0020)) return null;
    const bmi = Buffer.alloc(44);
    bmi.writeUInt32LE(40, 0); bmi.writeInt32LE(outW, 4); bmi.writeInt32LE(-outH, 8);
    bmi.writeUInt16LE(1, 12); bmi.writeUInt16LE(32, 14);
    const bits = Buffer.alloc(outW * outH * 4);
    g.SelectObject(mem, old);
    if (!g.GetDIBits(mem, bmp, 0, outH, bits, bmi, 0)) return null;
    for (let i = 3; i < bits.length; i += 4) bits[i] = 255;
    return bits;
  } finally {
    g.SelectObject(mem, old);
    g.DeleteObject(bmp);
    g.DeleteDC(mem);
    g.ReleaseDC(null, screen);
  }
}

/** Same as captureRegion, but the blit runs on a worker thread so the main thread never stalls. */
function captureRegionAsync(x, y, w, h, outW, outH) {
  return new Promise((resolve) => {
    const screen = g.GetDC(null);
    const mem = g.CreateCompatibleDC(screen);
    const bmp = g.CreateCompatibleBitmap(screen, outW, outH);
    const old = g.SelectObject(mem, bmp);
    g.SetStretchBltMode(mem, 4);
    const done = (bits) => {
      g.SelectObject(mem, old);
      g.DeleteObject(bmp);
      g.DeleteDC(mem);
      g.ReleaseDC(null, screen);
      resolve(bits);
    };
    g.StretchBlt.async(mem, 0, 0, outW, outH, screen, x, y, w, h, 0x00cc0020, (err, ok) => {
      if (err || !ok) return done(null);
      const bmi = Buffer.alloc(44);
      bmi.writeUInt32LE(40, 0); bmi.writeInt32LE(outW, 4); bmi.writeInt32LE(-outH, 8);
      bmi.writeUInt16LE(1, 12); bmi.writeUInt16LE(32, 14);
      const bits = Buffer.alloc(outW * outH * 4);
      g.SelectObject(mem, old);
      if (!g.GetDIBits(mem, bmp, 0, outH, bits, bmi, 0)) return done(null);
      for (let i = 3; i < bits.length; i += 4) bits[i] = 255;
      done(bits);
    });
  });
}

// ───────────────────────────── version info ─────────────────────────────
const descCache = new Map();
function fileDescription(file) {
  if (!file) return null;
  if (descCache.has(file)) return descCache.get(file);
  let out = null;
  try {
    const h = [0];
    const size = fn.GetFileVersionInfoSizeW(file, h);
    if (size) {
      const block = Buffer.alloc(size);
      if (fn.GetFileVersionInfoW(file, 0, size, block)) {
        const base = koffi.address(block);
        const p = [null]; const len = [0];
        const langs = [];
        if (fn.VerQueryValueW(block, '\\VarFileInfo\\Translation', p, len) && len[0] >= 4) {
          const off = Number(BigInt(p[0]) - base);
          for (let i = 0; i + 4 <= len[0]; i += 4) {
            const lang = block.readUInt16LE(off + i).toString(16).padStart(4, '0');
            const cp = block.readUInt16LE(off + i + 2).toString(16).padStart(4, '0');
            langs.push(lang + cp);
          }
        }
        langs.push('040904b0', '040904e4', '04090000');
        for (const l of langs) {
          for (const key of ['FileDescription', 'ProductName']) {
            const q = [null]; const ql = [0];
            if (fn.VerQueryValueW(block, `\\StringFileInfo\\${l}\\${key}`, q, ql) && ql[0] > 1) {
              const off = Number(BigInt(q[0]) - base);
              const s = block.toString('utf16le', off, off + (ql[0] - 1) * 2).replace(/\0+$/, '').trim();
              if (s) { out = s; break; }
            }
          }
          if (out) break;
        }
      }
    }
  } catch { /* ignore */ }
  if (!out) {
    const base = path.basename(file, path.extname(file));
    out = base.charAt(0).toUpperCase() + base.slice(1);
  }
  descCache.set(file, out);
  return out;
}

// ───────────────────────────── clipboard ─────────────────────────────
const CF_HDROP = 15;
const fmtCache = new Map();
function fmt(name) {
  if (!fmtCache.has(name)) fmtCache.set(name, fn.RegisterClipboardFormatW(name));
  return fmtCache.get(name);
}

function listenClipboard(win) { return fn.AddClipboardFormatListener(hwndOf(win)); }
function unlistenClipboard(win) { try { fn.RemoveClipboardFormatListener(hwndOf(win)); } catch { /* */ } }
function clipboardSequence() { return fn.GetClipboardSequenceNumber(); }

/** Password managers & friends flag their copies so history tools skip them. */
function clipboardIsSensitive() {
  try {
    if (fn.IsClipboardFormatAvailable(fmt('ExcludeClipboardContentFromMonitorProcessing'))) return true;
    if (fn.IsClipboardFormatAvailable(fmt('Clipboard Viewer Ignore'))) return true;
    const f = fmt('CanIncludeInClipboardHistory');
    if (fn.IsClipboardFormatAvailable(f)) {
      // value 0 means "do not keep in history"
      if (fn.OpenClipboard(null)) {
        try {
          const h = fn.GetClipboardData(f);
          if (h) {
            const p = fn.GlobalLock(h);
            if (p) { const v = koffi.decode(p, 'uint32_t'); fn.GlobalUnlock(h); if (v === 0) return true; }
          }
        } finally { fn.CloseClipboard(); }
      }
    }
  } catch { /* ignore */ }
  return false;
}

function hasFileDrop() { return fn.IsClipboardFormatAvailable(CF_HDROP); }

function readClipboardFiles() {
  if (!fn.IsClipboardFormatAvailable(CF_HDROP)) return [];
  const files = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    if (fn.OpenClipboard(null)) break;
    if (attempt === 4) return [];
    const until = Date.now() + 15; while (Date.now() < until) { /* spin briefly */ }
  }
  try {
    const h = fn.GetClipboardData(CF_HDROP);
    if (!h) return [];
    const count = fn.DragQueryFileW(h, 0xffffffff, null, 0);
    for (let i = 0; i < count && i < 500; i++) {
      const buf = Buffer.alloc(4096);
      const n = fn.DragQueryFileW(h, i, buf, 2048);
      files.push(buf.toString('utf16le', 0, n * 2));
    }
  } finally { fn.CloseClipboard(); }
  return files;
}

function globalFromBuffer(buf) {
  const h = fn.GlobalAlloc(0x0002, buf.length); // GMEM_MOVEABLE
  if (!h) return null;
  const p = fn.GlobalLock(h);
  fn.RtlMoveMemory(p, buf, buf.length);
  fn.GlobalUnlock(h);
  return h;
}

/** Put real files on the clipboard (Explorer/Discord/Slack can paste them). */
function writeClipboardFiles(files, ownerWin) {
  const list = Buffer.from(files.join('\0') + '\0\0', 'utf16le');
  const header = Buffer.alloc(20);
  header.writeUInt32LE(20, 0); // pFiles
  header.writeInt32LE(1, 16); // fWide
  const drop = Buffer.concat([header, list]);
  const effect = Buffer.alloc(4); effect.writeUInt32LE(1, 0); // DROPEFFECT_COPY
  let opened = false;
  for (let attempt = 0; attempt < 8 && !opened; attempt++) {
    opened = fn.OpenClipboard(ownerWin ? hwndOf(ownerWin) : null);
    if (!opened) { const until = Date.now() + 15; while (Date.now() < until) { /* */ } }
  }
  if (!opened) return false;
  try {
    fn.EmptyClipboard();
    const h1 = globalFromBuffer(drop);
    if (!h1 || !fn.SetClipboardData(CF_HDROP, h1)) { if (h1) fn.GlobalFree(h1); return false; }
    const h2 = globalFromBuffer(effect);
    if (h2 && !fn.SetClipboardData(fmt('Preferred DropEffect'), h2)) fn.GlobalFree(h2);
    return true;
  } finally { fn.CloseClipboard(); }
}

module.exports = {
  findQuickTodo, flushQuickTodo, quitQuickTodo, windowPid, forceForeground,
  exStyle,
  sendCombo, releaseModifiers, isMouseDown, isLeftDown, hwndOf, excludeFromCapture, makeToolWindow, foregroundWindow, focusWindow,
  processPathOfWindow, processPath, isFullscreenBusy, hasBattery, fileDescription, windowClass, captureRegion, captureRegionAsync,
  listenClipboard, unlistenClipboard, clipboardSequence, clipboardIsSensitive, hasFileDrop,
  readClipboardFiles, writeClipboardFiles, raw: fn,
};
