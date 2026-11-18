// Recent captures: SharpShot Studio's library (live) or any folder.
const { nativeImage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const VID = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi']);

function kindOf(file) {
  const e = path.extname(file).toLowerCase();
  if (IMG.has(e)) return 'image';
  if (VID.has(e)) return 'video';
  return null;
}

function idFor(p) { return crypto.createHash('sha1').update(p.toLowerCase()).digest('hex').slice(0, 16); }

class Captures {
  constructor({ thumbsDir, getSettings, onChange }) {
    this.thumbsDir = thumbsDir;
    fs.mkdirSync(thumbsDir, { recursive: true });
    this.getSettings = getSettings;
    this.onChange = onChange;
    this.items = [];
    this.byId = new Map();
    this.watchers = [];
    this.pending = new Map();
  }

  libraryFile() { return path.join(app.getPath('appData'), 'sharpshot-studio', 'library.json'); }

  start() { this.rewatch(); }

  rewatch() {
    for (const w of this.watchers) { try { w.close(); } catch { /* */ } }
    this.watchers = [];
    const s = this.getSettings().captures;
    const kick = () => { clearTimeout(this.t); this.t = setTimeout(() => this.reload(), 300); };
    try {
      if (s.source === 'folder' && s.folder) {
        this.watchers.push(fs.watch(s.folder, { recursive: true }, kick));
      } else {
        const dir = path.dirname(this.libraryFile());
        if (fs.existsSync(dir)) this.watchers.push(fs.watch(dir, (ev, f) => { if (!f || f.startsWith('library')) kick(); }));
      }
    } catch (e) { console.error('[captures] watch', e.message); }
    this.reload();
  }

  available() { return fs.existsSync(this.libraryFile()); }

  reload() {
    const s = this.getSettings().captures;
    let list = [];
    try {
      if (s.source === 'folder' && s.folder) list = this.scanFolder(s.folder);
      else list = this.readLibrary();
    } catch (e) { console.error('[captures] reload', e.message); }
    list.sort((a, b) => b.at - a.at);
    this.items = list.slice(0, 400);
    this.byId = new Map(this.items.map((x) => [x.id, x]));
    this.onChange();
  }

  readLibrary() {
    const raw = JSON.parse(fs.readFileSync(this.libraryFile(), 'utf8'));
    const out = [];
    for (const it of raw.items || []) {
      if (!it.path || (it.kind !== 'image' && it.kind !== 'video')) continue;
      if (!fs.existsSync(it.path)) continue;
      const dims = /(\d{2,5})x(\d{2,5})\.\w+$/.exec(it.name || '');
      out.push({
        id: idFor(it.path), path: it.path, name: it.name || path.basename(it.path), kind: it.kind,
        origin: it.origin, at: Date.parse(it.createdAt) || 0, bytes: it.byteLength || 0,
        w: dims ? Number(dims[1]) : undefined, h: dims ? Number(dims[2]) : undefined,
      });
    }
    return out;
  }

  scanFolder(root) {
    const out = [];
    const walk = (dir, depth) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
        const kind = kindOf(p);
        if (!kind) continue;
        try {
          const st = fs.statSync(p);
          out.push({ id: idFor(p), path: p, name: e.name, kind, at: st.mtimeMs, bytes: st.size });
        } catch { /* */ }
      }
    };
    walk(root, 0);
    return out;
  }

  get(id) { return this.byId.get(id); }

  /** Shell thumbnail (works for images and videos), cached on disk. */
  async thumb(id) {
    const it = this.byId.get(id);
    if (!it) return null;
    const cache = path.join(this.thumbsDir, id + '.jpg');
    try { return await fs.promises.readFile(cache); } catch { /* miss */ }
    if (this.pending.has(id)) return this.pending.get(id);
    const job = (async () => {
      let img = null;
      try { img = await nativeImage.createThumbnailFromPath(it.path, { width: 480, height: 480 }); } catch { /* */ }
      if ((!img || img.isEmpty()) && it.kind === 'image') {
        const full = nativeImage.createFromPath(it.path);
        if (!full.isEmpty()) img = full.resize({ width: 480, quality: 'good' });
      }
      if (!img || img.isEmpty()) return null;
      const buf = img.toJPEG(84);
      fs.promises.writeFile(cache, buf).catch(() => {});
      return buf;
    })();
    this.pending.set(id, job);
    try { return await job; } finally { this.pending.delete(id); }
  }

  stop() { for (const w of this.watchers) { try { w.close(); } catch { /* */ } } }
}

module.exports = { Captures, kindOf };
