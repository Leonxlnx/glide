// QuickTodo (the Alt+Q tool), synced both ways.
//
// QuickTodo → Glide: every save lands in todos.json, which is watched.
// Glide → QuickTodo: QuickTodo reads todos.json only at startup and keeps its lists in memory,
// so an edit made in the sidebar is shown at once (optimistically) and then committed:
//   1. ask QuickTodo to save what it has (WM_ENDSESSION, FALSE) and quit cleanly (WM_QUIT),
//   2. apply the sidebar's edits to the freshly saved file (atomic write, .bak like QuickTodo),
//   3. start QuickTodo again with --hidden, so it loads the merged lists and owns Alt+Q again.
// It never commits while QuickTodo is the active window, so nothing typed there is lost.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

class QuickTodo {
  constructor({ onChange, native, log = () => {} }) {
    this.dir = path.join(process.env.APPDATA || '', 'QuickTodo');
    this.file = path.join(this.dir, 'todos.json');
    this.onChange = onChange;
    this.native = native;
    this.log = log;
    this.disk = { found: false, lists: [], current: 0 };
    this.pending = []; // sidebar edits not yet in QuickTodo
    this.state = this.disk;
    this.readTimer = null;
    this.commitTimer = null;
    this.watcher = null;
    this.exe = null;
  }

  start() {
    this.read();
    this.watch();
  }

  watch() {
    try {
      this.watcher = fs.watch(this.dir, (ev, name) => {
        if (!name || name.toLowerCase() === 'todos.json') { clearTimeout(this.readTimer); this.readTimer = setTimeout(() => this.read(), 120); }
      });
      this.watcher.on('error', () => { this.watcher = null; setTimeout(() => this.watch(), 5000); });
    } catch {
      setTimeout(() => { this.read(); this.watch(); }, 15000); // QuickTodo never ran yet
    }
  }

  readRaw() {
    const raw = fs.readFileSync(this.file, 'utf8');
    return JSON.parse(raw.replace(/^﻿/, ''));
  }

  read(attempt = 0) {
    let d;
    try { d = this.readRaw(); } catch (e) {
      if (e.code === 'ENOENT') { this.disk = { found: false, lists: [], current: 0 }; this.emit(); return; }
      if (attempt < 4) setTimeout(() => this.read(attempt + 1), 150); // caught mid-write
      return;
    }
    this.disk = { found: true, ...normalize(d) };
    this.emit();
  }

  emit() {
    const view = this.pending.length ? { found: this.disk.found, ...normalize(applyOps(structuredClone(this.disk), this.pending)) } : this.disk;
    const same = JSON.stringify(view) === JSON.stringify(this.state);
    this.state = view;
    if (!same) this.onChange(view);
  }

  /** A sidebar edit: { kind: 'add'|'toggle'|'delete', list, listName, text, done } */
  op(o) {
    if (!o || !this.disk.found || typeof o.text !== 'string' || !o.text.trim()) return;
    if (!['add', 'toggle', 'delete'].includes(o.kind)) return;
    this.pending.push({ kind: o.kind, list: o.list | 0, listName: String(o.listName || ''), text: o.kind === 'add' ? o.text.trim() : o.text, done: !!o.done });
    this.emit();
    this.scheduleCommit(900);
  }

  scheduleCommit(ms) {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), ms);
  }

  /** Commit soon (e.g. the panel just closed — you're likely about to press Alt+Q). */
  flushSoon() { if (this.pending.length) this.scheduleCommit(350); }

  /** Resolves once every edit so far is in QuickTodo (and it's running again, if it was). */
  commit() {
    clearTimeout(this.commitTimer);
    if (this.running) return this.running.then(() => this.commit());
    if (!this.pending.length) return Promise.resolve();
    this.running = this.doCommit().finally(() => { this.running = null; });
    return this.running;
  }

  async doCommit() {
    let ops = [];
    try {
      const qt = this.native.findQuickTodo();
      if (qt && qt.foreground && qt.visible) { this.scheduleCommit(1200); return; } // you're in QuickTodo right now
      // whatever you're working in keeps focus — a freshly started QuickTodo may grab it, invisibly
      const fgBefore = this.native.foregroundWindow();
      const keepFocus = fgBefore && (!qt || this.native.windowPid(fgBefore) !== qt.pid) ? fgBefore : null;
      if (qt) {
        this.exe = qt.exe || this.exe;
        this.native.flushQuickTodo(qt); // its in-memory lists → disk
        this.native.quitQuickTodo(qt);
        for (let i = 0; i < 60 && alive(qt.pid); i++) await delay(50);
        if (alive(qt.pid)) { try { process.kill(qt.pid); } catch { /* gone */ } for (let i = 0; i < 20 && alive(qt.pid); i++) await delay(50); }
      }
      ops = this.pending.splice(0);
      const d = this.readRaw();
      applyOps(d, ops);
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch { /* first save */ }
      const tmp = this.file + '.glide.tmp';
      fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
      fs.renameSync(tmp, this.file);
      this.disk = { found: true, ...normalize(d) };
      this.emit();
      if (qt && this.exe) {
        const child = spawn(this.exe, ['--hidden'], { cwd: path.dirname(this.exe), detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        // ready once its message window exists (Alt+Q is registered right after)
        let fresh = null;
        for (let i = 0; i < 60 && !(fresh = this.native.findQuickTodo()); i++) await delay(50);
        // it may take focus a moment after its window exists: hand it back whenever it does
        for (let i = 0; i < 16; i++) {
          const now = this.native.findQuickTodo();
          if (now && now.foreground && !now.visible && keepFocus) { this.native.forceForeground(keepFocus); this.log('quicktodo: handed focus back'); }
          await delay(60);
        }
      }
      this.log('quicktodo: committed', ops.length, 'edit(s)', qt ? '(restarted QuickTodo)' : '(QuickTodo not running)');
    } catch (e) {
      this.log('quicktodo: commit failed', e && e.message);
      if (ops.length) this.pending.unshift(...ops);
      this.scheduleCommit(3000);
    }
  }

  stop() {
    clearTimeout(this.readTimer);
    try { this.watcher && this.watcher.close(); } catch { /* ignore */ }
  }
}

function normalize(d) {
  const lists = (Array.isArray(d && d.lists) ? d.lists : []).map((l) => ({
    name: String((l && l.name) || 'List'),
    items: (Array.isArray(l && l.items) ? l.items : [])
      .filter((it) => it && typeof it.text === 'string' && it.text.trim())
      .map((it) => ({ text: it.text, done: !!it.done })),
  }));
  const current = Math.max(0, Math.min(lists.length - 1, Number(d && d.current) || 0));
  return { lists, current };
}

// Applies sidebar edits to QuickTodo's own data shape (unknown fields are kept untouched).
function applyOps(d, ops) {
  if (!d || !Array.isArray(d.lists)) return d;
  for (const o of ops) {
    let l = d.lists[o.list];
    if (!l || (o.listName && l.name !== o.listName)) l = d.lists.find((x) => x && x.name === o.listName) || l;
    if (!l) continue;
    if (!Array.isArray(l.items)) l.items = [];
    if (o.kind === 'add') {
      l.items.unshift({ text: o.text, done: false }); // QuickTodo adds at the top too
    } else if (o.kind === 'toggle') {
      const it = l.items.find((x) => x && x.text === o.text && !!x.done === !o.done);
      if (it) it.done = o.done;
      // QuickTodo keeps open items above done ones
      l.items = [...l.items.filter((x) => !x.done), ...l.items.filter((x) => x.done)];
    } else if (o.kind === 'delete') {
      const i = l.items.findIndex((x) => x && x.text === o.text && !!x.done === o.done);
      if (i >= 0) l.items.splice(i, 1);
    }
  }
  return d;
}

module.exports = { QuickTodo };
