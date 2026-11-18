// Renders Glide's icons with canvas and writes PNG + multi-size ICO.  Run: electron scripts/make-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');

const draw = `
function squircle(ctx, x, y, w, h, r) {
  // superellipse-ish continuous corners
  const k = 0.62;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.bezierCurveTo(x + w - r * (1 - k), y, x + w, y + r * (1 - k), x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.bezierCurveTo(x + w, y + h - r * (1 - k), x + w - r * (1 - k), y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.bezierCurveTo(x + r * (1 - k), y + h, x, y + h - r * (1 - k), x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.bezierCurveTo(x, y + r * (1 - k), x + r * (1 - k), y, x + r, y);
  ctx.closePath();
}
function appIcon(S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const m = S * 0.04;
  const s = S - m * 2;
  // body
  squircle(ctx, m, m, s, s, s * 0.3);
  const g = ctx.createLinearGradient(0, m, S, S - m);
  g.addColorStop(0, '#6ad6ff'); g.addColorStop(0.45, '#1a8cff'); g.addColorStop(1, '#5b4ff0');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // soft light bloom
  const rg = ctx.createRadialGradient(S * 0.25, S * 0.12, 0, S * 0.25, S * 0.12, S * 0.75);
  rg.addColorStop(0, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
  // glass panel on the right
  const px = S * 0.5, py = S * 0.2, pw = S * 0.3, ph = S * 0.6;
  ctx.shadowColor = 'rgba(20,20,80,0.35)'; ctx.shadowBlur = S * 0.06; ctx.shadowOffsetY = S * 0.02;
  squircle(ctx, px, py, pw, ph, pw * 0.38);
  const pg = ctx.createLinearGradient(px, py, px + pw, py + ph);
  pg.addColorStop(0, 'rgba(255,255,255,0.98)'); pg.addColorStop(1, 'rgba(235,240,255,0.86)');
  ctx.fillStyle = pg; ctx.fill();
  ctx.shadowColor = 'transparent';
  // content lines on the panel
  ctx.fillStyle = 'rgba(40,90,220,0.55)';
  const lw = pw * 0.56, lh = Math.max(1, S * 0.035);
  for (let i = 0; i < 3; i++) {
    const ly = py + ph * 0.24 + i * ph * 0.19;
    squircle(ctx, px + pw * 0.22, ly, i === 2 ? lw * 0.65 : lw, lh, lh / 2);
    ctx.fill();
  }
  // handle pill on the left, the "glide" hint
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  squircle(ctx, S * 0.3, S * 0.36, S * 0.06, S * 0.28, S * 0.03); ctx.fill();
  ctx.restore();
  // rim
  squircle(ctx, m + 0.5, m + 0.5, s - 1, s - 1, s * 0.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, S / 128); ctx.stroke();
  return c.toDataURL('image/png');
}
function trayIcon(S, color) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const u = S / 16;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4 * u;
  squircle(ctx, 1.2 * u, 2.2 * u, 13.6 * u, 11.6 * u, 3.4 * u); ctx.stroke();
  squircle(ctx, 8.6 * u, 4.4 * u, 4.2 * u, 7.2 * u, 1.6 * u); ctx.fill();
  return c.toDataURL('image/png');
}
`;

function ico(pngs) {
  const n = pngs.length;
  const header = Buffer.alloc(6 + 16 * n);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(n, 4);
  let off = header.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(buf.length, e + 8); header.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<html><body></body></html>');
  await w.webContents.executeJavaScript(draw + ';0');
  const png = async (expr) => Buffer.from((await w.webContents.executeJavaScript(expr)).split(',')[1], 'base64');
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icons = [];
  for (const s of sizes) icons.push({ size: s, buf: await png(`appIcon(${s})`) });
  fs.writeFileSync(path.join(OUT, 'icon.png'), await png('appIcon(512)'));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(icons));
  fs.writeFileSync(path.join(OUT, 'tray-light.png'), await png(`trayIcon(16, '#ffffff')`));
  fs.writeFileSync(path.join(OUT, 'tray-light@2x.png'), await png(`trayIcon(32, '#ffffff')`));
  fs.writeFileSync(path.join(OUT, 'tray-dark.png'), await png(`trayIcon(16, '#1c1c1e')`));
  fs.writeFileSync(path.join(OUT, 'tray-dark@2x.png'), await png(`trayIcon(32, '#1c1c1e')`));
  console.log('icons written to', OUT);
  app.quit();
});
