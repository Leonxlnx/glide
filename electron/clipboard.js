// Clipboard history: event-driven (WM_CLIPBOARDUPDATE) with a polling safety net.
const { clipboard, nativeImage, ClipboardItem } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JsonFile } = require('./store');

const WM_CLIPBOARDUPDATE = 0x031d;
const MAX_TEXT = 1_000_000;
const DAY = 86_400_000;
const IMAGE_FILE = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i;

function uid() { return crypto.randomBytes(8).toString('hex'); }

/** Write a PNG (or any image file) to the clipboard as an image. */
async function writeImageFile(file) {
  let buf = fs.readFileSync(file);
  if (!/\.png$/i.test(file)) {
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) throw new Error('unreadable image');
    buf = img.toPNG();
  }
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buf], { type: 'image/png' }) })]);
}

function classifyText(t) {
  const s = t.trim();
  if (/^(https?:\/\/|www\.)[^\s]+$/i.test(s)) return 'link';
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return 'color';
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab)\([^)]{3,60}\)$/i.test(s)) return 'color';
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) return 'email';
  if (/^([A-Za-z]:\\|\\\\)[^\n]+$/.test(s)) return 'path';
  const lines = s.split('\n');
  if (lines.length > 1) {
    const codey = lines.filter((l) => /[{};=<>()]|^\s{2,}\S|^\s*(const|let|var|function|def|class|import|return|if|for|public|private|#include)\b/.test(l)).length;
    if (codey / lines.length > 0.45) return 'code';
  }
  return 'text';
}

class ClipboardHistory {
  constructor({ dir, native, getSettings, onChange, selfExe }) {
    this.dir = dir;
    this.imgDir = path.join(dir, 'clips');
    fs.mkdirSync(this.imgDir, { recursive: true });
    this.native = native;
    this.getSettings = getSettings;
    this.onChange = onChange;
    this.selfExe = (selfExe || '').toLowerCase();
    this.store = new JsonFile(path.join(dir, 'clipboard.json'), { items: [] });
    this.lastSeq = -1; // capture whatever is already on the clipboard at launch
    this.firstSeq = native.clipboardSequence();
    this.selfWrite = null;
    this.timer = null;
    this.paused = false;
  }

  get items() { return this.store.data.items; }

  start(win) {
    this.win = win;
    let ok = false;
    try {
      win.hookWindowMessage(WM_CLIPBOARDUPDATE, () => this.schedule());
      ok = this.native.listenClipboard(win);
    } catch (e) { console.error('[clip] listener failed', e.message); }
    // Safety net: cheap sequence-number poll catches anything the listener misses.
    this.poll = setInterval(() => {
      if (this.native.clipboardSequence() !== this.lastSeq) this.schedule();
    }, ok ? 2500 : 700);
    this.prune();
    this.pruneTimer = setInterval(() => this.prune(), 3_600_000);
    this.schedule();
  }

  stop() {
    clearInterval(this.poll);
    clearInterval(this.pruneTimer);
    if (this.win) this.native.unlistenClipboard(this.win);
    this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (this.busy) { this.again = true; return; }
      this.busy = true;
      try { await this.capture(); } catch (e) { console.error('[clip] capture', e); }
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(); }
    }, 90);
  }

  async capture() {
    const seq = this.native.clipboardSequence();
    if (seq === this.lastSeq) return;
    this.lastSeq = seq;
    const s = this.getSettings().clipboard;
    if (!s.enabled || this.paused) return;

    if (this.selfWrite && Date.now() < this.selfWrite.until) {
      this.bump(this.selfWrite.id);
      this.selfWrite = null;
      return;
    }
    if (s.skipSensitive && this.native.clipboardIsSensitive()) return;

    // At launch we can't know who copied what's already there.
    const source = seq === this.firstSeq ? null : this.sourceApp();
    const item = { id: uid(), at: Date.now(), source, pinned: false };

    const files = this.native.hasFileDrop() ? this.native.readClipboardFiles() : [];
    let entries = [];
    try { entries = await clipboard.read(); } catch { if (!files.length) return; }
    const types = new Set(entries.flatMap((e) => e.types));
    // The Snipping Tool, Explorer and browsers put an image and the file it came from on the
    // clipboard together (the Snipping Tool adds a {GUID}.png temp file a moment after the
    // bitmap). That copy is an image: keep it as one, so it dedupes and shows its picture.
    const imageFiles = files.length === 1 && IMAGE_FILE.test(files[0]) && types.has('image/png');
    if (files.length && !imageFiles) {
      item.type = 'files';
      item.files = files;
      item.sig = 'f:' + files.join('|');
    } else {
      const text = !imageFiles && types.has('text/plain') ? await clipboard.readText().catch(() => '') : '';
      if (text && text.trim()) {
        item.text = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
        item.type = classifyText(item.text);
        item.sig = 't:' + crypto.createHash('sha1').update(item.text).digest('hex');
      } else if (types.has('image/png')) {
        const entry = entries.find((e) => e.types.includes('image/png'));
        const png = Buffer.from(await (await entry.getType('image/png')).arrayBuffer());
        const img = nativeImage.createFromBuffer(png);
        if (img.isEmpty()) return;
        const size = img.getSize();
        item.type = 'image';
        item.sig = 'i:' + crypto.createHash('sha1').update(img.toBitmap()).digest('hex');
        const dupe = this.items.find((x) => x.sig === item.sig);
        if (dupe) { this.bump(dupe.id, source); return; }
        item.w = size.width; item.h = size.height;
        const file = path.join(this.imgDir, item.id + '.png');
        fs.writeFileSync(file, png);
        const thumb = size.width > 640 ? img.resize({ width: 640, quality: 'best' }) : img;
        fs.writeFileSync(path.join(this.imgDir, item.id + '.thumb.png'), thumb.toPNG());
        item.file = file;
      } else return;
    }

    const dupe = this.items.find((x) => x.sig === item.sig);
    if (dupe) { this.bump(dupe.id, source); return; }
    this.items.unshift(item);
    this.trim();
    this.commit();
  }

  sourceApp() {
    try {
      const h = this.native.foregroundWindow();
      const exe = this.native.processPathOfWindow(h);
      if (!exe) return null;
      if (this.selfExe && exe.toLowerCase() === this.selfExe) return null;
      return { exe, name: this.native.fileDescription(exe) };
    } catch { return null; }
  }

  bump(id, source) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [it] = this.items.splice(i, 1);
    it.at = Date.now();
    if (source) it.source = source;
    this.items.unshift(it);
    this.commit();
  }

  /** Oldest time an unpinned item may have (settings.clipboard.days; 0 keeps everything). */
  cutoff() {
    const days = this.getSettings().clipboard.days;
    return days > 0 ? Date.now() - days * DAY : 0;
  }

  /** Enforce the count limit and the age window. Returns whether anything was dropped. */
  trim() {
    const limit = Math.max(20, this.getSettings().clipboard.limit || 300);
    const cut = this.cutoff();
    let unpinned = 0;
    const keep = [];
    for (const it of this.items) {
      if (it.pinned || (unpinned < limit && it.at >= cut)) { keep.push(it); if (!it.pinned) unpinned++; } else this.dropFiles(it);
    }
    const dropped = keep.length !== this.items.length;
    this.store.data.items = keep;
    return dropped;
  }

  /** Ages out old history (at launch, hourly, on settings change) and sweeps stray images. */
  prune() {
    if (this.trim()) this.commit();
    const cut = this.cutoff();
    if (cut) this.sweepImages(cut);
  }

  // Images no item points to any more (left by an older build or a lost save). Only once the
  // history was really read from disk, and only files older than the window.
  sweepImages(cut) {
    if (!this.store.loaded) return;
    const keep = new Set(this.items.filter((x) => x.type === 'image').map((x) => x.id));
    let names = [];
    try { names = fs.readdirSync(this.imgDir); } catch { return; }
    for (const n of names) {
      if (keep.has(n.split('.')[0])) continue;
      const f = path.join(this.imgDir, n);
      try { if (fs.statSync(f).mtimeMs < cut) fs.unlinkSync(f); } catch { /* */ }
    }
  }

  dropFiles(it) {
    if (it.type !== 'image') return;
    for (const f of [it.file, path.join(this.imgDir, it.id + '.thumb.png')]) { try { fs.unlinkSync(f); } catch { /* */ } }
  }

  commit() { this.store.save(); this.onChange(); }

  /** Lightweight list for the renderer. */
  summary() {
    return this.items.map((it) => ({
      id: it.id, type: it.type, at: it.at, pinned: it.pinned,
      source: it.source ? { name: it.source.name, exe: it.source.exe } : null,
      text: it.text ? it.text.slice(0, 600) : undefined,
      length: it.text ? it.text.length : undefined,
      lines: it.text ? Math.min(999, it.text.split('\n').length) : undefined,
      files: it.files, w: it.w, h: it.h,
    }));
  }

  get(id) { return this.items.find((x) => x.id === id); }

  /** Put an item back on the system clipboard. */
  async write(id) {
    const it = this.get(id);
    if (!it) return false;
    this.selfWrite = { id, until: Date.now() + 1500 };
    try {
      if (it.type === 'files') {
        const ok = this.native.writeClipboardFiles(it.files.filter((f) => fs.existsSync(f)), this.win);
        if (!ok) await clipboard.writeText(it.files.join('\r\n'));
      } else if (it.type === 'image') {
        await writeImageFile(it.file);
      } else {
        await clipboard.writeText(it.text);
      }
      return true;
    } catch (e) {
      console.error('[clip] write', e);
      return false;
    }
  }

  remove(id) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.dropFiles(this.items[i]);
    this.items.splice(i, 1);
    this.commit();
  }

  pin(id) {
    const it = this.get(id);
    if (!it) return;
    it.pinned = !it.pinned;
    this.commit();
  }

  clear() {
    for (const it of this.items) if (!it.pinned) this.dropFiles(it);
    this.store.data.items = this.items.filter((x) => x.pinned);
    this.commit();
  }

  thumbPath(id) {
    const it = this.get(id);
    if (!it || it.type !== 'image') return null;
    const t = path.join(this.imgDir, id + '.thumb.png');
    return fs.existsSync(t) ? t : it.file;
  }
}

module.exports = { ClipboardHistory, classifyText, writeImageFile };
