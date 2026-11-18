// Long-lived helper process: "now playing" (WinRT SMTC) + the off-thread presentation boost.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Media {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.state = null;
    this.art = null;
    this.proc = null;
    this.restarts = 0;
  }

  /** Keep a desktop-duplication session alive for `ms` (done in the helper, off our UI thread). */
  boost(ms = 1400) {
    if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed && !this.useScript) {
      try { this.proc.stdin.write(`boost ${ms}\n`); } catch { /* helper restarting */ }
    }
  }

  setMedia(on) {
    this.mediaOn = on;
    if (!on) { this.state = null; this.art = null; this.onChange(); }
    if (this.proc && this.proc.stdin && !this.useScript) { try { this.proc.stdin.write(on ? 'media on\n' : 'media off\n'); } catch { /* */ } }
    else if (on) this.start();
  }

  start() {
    if (this.proc) return;
    this.stopped = false;
    // Prefer the tiny compiled helper (~25 MB, also does the presentation boost);
    // fall back to Windows PowerShell (~85 MB, media only).
    const exe = path.join(__dirname, 'helper', 'glide-media.exe').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    if (fs.existsSync(exe) && !this.useScript) {
      this.proc = spawn(exe, this.mediaOn === false ? ['--no-media'] : [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      this.proc.stdin.on('error', () => {});
    } else {
      if (this.mediaOn === false) return;
      const script = fs.readFileSync(path.join(__dirname, 'media.ps1'), 'utf8');
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      this.proc = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      });
    }
    this.proc.on('error', () => { this.useScript = true; });
    let buf = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('{')) this.ingest(line);
      }
    });
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.stopped) return;
      this.restarts++;
      setTimeout(() => this.start(), Math.min(60000, 2000 * this.restarts));
    });
  }

  ingest(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.boost || msg.cmd) return; // helper diagnostics
    if (msg.error) { this.useScript = true; return; }
    if (this.mediaOn === false) return;
    const s = msg.session;
    if (!s || !s.title) { this.state = null; this.art = null; this.onChange(); return; }
    if (s.artChanged) this.art = s.art ? Buffer.from(s.art, 'base64') : null;
    const app = String(s.app || '');
    this.state = {
      app: prettyApp(app), appId: app,
      title: s.title, artist: s.artist || '', album: s.album || '',
      playing: s.status === 4, canPrev: !!s.canPrev, canNext: !!s.canNext,
      position: s.position || 0, duration: s.duration || 0, updated: s.updated || Date.now(),
      hasArt: !!this.art, artKey: this.art ? (s.title + s.artist).length + ':' + this.art.length : null,
    };
    this.onChange();
  }

  stop() { this.stopped = true; try { this.proc && this.proc.kill(); } catch { /* */ } }
}

function prettyApp(id) {
  const s = id.toLowerCase();
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('chrome')) return 'Chrome';
  if (s.includes('msedge')) return 'Edge';
  if (s.includes('firefox')) return 'Firefox';
  if (s.includes('zunemusic') || s.includes('media.player')) return 'Media Player';
  if (s.includes('apple') && s.includes('music')) return 'Apple Music';
  if (s.includes('vlc')) return 'VLC';
  if (s.includes('discord')) return 'Discord';
  const base = id.split(/[\\/!]/).pop().replace(/\.exe$/i, '').replace(/_.*$/, '');
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Media';
}

module.exports = { Media };
