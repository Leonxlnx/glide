// Markup editor: opens an image in its own window (rectangles, arrows, pen, text, blur…).
// Copy (or Esc) puts the edited PNG on the clipboard and closes the window.
const { BrowserWindow, screen, nativeImage, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const BAR_H = 56; // toolbar height in the editor page
const MIN_W = 780;
const MIN_H = 460;

class Editor {
  constructor({ webPreferences, writePng, log }) {
    this.webPreferences = webPreferences;
    this.writePng = writePng;
    this.log = log || (() => {});
    this.jobs = new Map(); // webContents id → { file, name, win }
    this.win = null;

    ipcMain.handle('editor:init', (e) => {
      const job = this.jobs.get(e.sender.id);
      if (!job) return null;
      return { name: job.name, bytes: fs.readFileSync(job.file) };
    });
    ipcMain.handle('editor:copy', async (e, bytes) => {
      const job = this.jobs.get(e.sender.id);
      if (!job) return false;
      try {
        await this.writePng(Buffer.from(bytes));
      } catch (err) {
        this.log('editor copy', err);
        return false;
      }
      job.win.close();
      return true;
    });
    ipcMain.on('editor:close', (e) => { const job = this.jobs.get(e.sender.id); if (job) job.win.close(); });
  }

  /** Open `file` (any image Chromium can decode) in the editor, on the screen under the cursor. */
  open(file, name) {
    if (!file || !fs.existsSync(file)) return false;
    if (this.win && !this.win.isDestroyed()) this.win.close();

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const size = nativeImage.createFromPath(file).getSize();
    // Screenshots are in physical pixels: show them 1:1 at most, scaled down to fit.
    const iw = (size.width || 1280) / display.scaleFactor;
    const ih = (size.height || 720) / display.scaleFactor;
    const fit = Math.min(1, (wa.width * 0.86 - 32) / iw, (wa.height * 0.86 - BAR_H - 32) / ih);
    const width = Math.min(wa.width, Math.max(MIN_W, Math.round(iw * fit) + 32));
    const height = Math.min(wa.height, Math.max(MIN_H, Math.round(ih * fit) + BAR_H + 32));

    const win = new BrowserWindow({
      x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height,
      minWidth: MIN_W, minHeight: MIN_H, frame: false, show: false, backgroundColor: '#141417',
      title: 'Glide Editor', webPreferences: this.webPreferences,
    });
    const id = win.webContents.id;
    this.jobs.set(id, { file, name: name || path.basename(file), win });
    this.win = win;
    win.on('closed', () => { this.jobs.delete(id); if (this.win === win) this.win = null; });
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    win.loadURL('glide://app/editor.html');
    return true;
  }
}

module.exports = { Editor };
