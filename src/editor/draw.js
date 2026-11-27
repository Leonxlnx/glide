// Shapes are plain objects in image pixels; `paint` draws one onto a 2D context.
//   { tool: 'rect' | 'ellipse', color, w, x0, y0, x1, y1 }
//   { tool: 'line' | 'arrow', color, w, x0, y0, x1, y1 }
//   { tool: 'pen' | 'marker', color, w, pts: [[x, y], …] }
//   { tool: 'text', color, size, x, y, text }
//   { tool: 'blur', w, x0, y0, x1, y1 }            (pixelates the original image)

export const FONT = "600 {size}px 'Geist Variable', 'Segoe UI Variable Text', 'Segoe UI', sans-serif";

export function box(s) {
  return { x: Math.min(s.x0, s.x1), y: Math.min(s.y0, s.y1), w: Math.abs(s.x1 - s.x0), h: Math.abs(s.y1 - s.y0) };
}

function stroke(ctx, s) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) { ctx.lineTo(pts[0][0] + 0.01, pts[0][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function pixelate(ctx, base, s) {
  const b = box(s);
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
  const w = Math.min(base.width - x, Math.ceil(b.w)), h = Math.min(base.height - y, Math.ceil(b.h));
  if (w < 2 || h < 2) return;
  const block = Math.max(6, Math.round(s.w * 2.5));
  const tw = Math.max(1, Math.ceil(w / block)), th = Math.max(1, Math.ceil(h / block));
  const tmp = new OffscreenCanvas(tw, th);
  const t = tmp.getContext('2d');
  t.drawImage(base, x, y, w, h, 0, 0, tw, th);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
  ctx.restore();
}

export function paint(ctx, s, base) {
  ctx.save();
  switch (s.tool) {
    case 'rect': {
      const b = box(s);
      stroke(ctx, s);
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(s.w * 1.5, b.w / 2, b.h / 2));
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const b = box(s);
      stroke(ctx, s);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      stroke(ctx, s);
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
      const len = Math.hypot(dx, dy) || 1;
      const head = s.tool === 'arrow' ? Math.min(len * 0.6, Math.max(12, s.w * 3.6)) : 0;
      const ux = dx / len, uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1 - ux * head * 0.7, s.y1 - uy * head * 0.7);
      ctx.stroke();
      if (head) {
        const a = Math.atan2(dy, dx), spread = 0.46;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x1 - head * Math.cos(a - spread), s.y1 - head * Math.sin(a - spread));
        ctx.lineTo(s.x1 - head * Math.cos(a + spread), s.y1 - head * Math.sin(a + spread));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'pen':
      stroke(ctx, s);
      path(ctx, s.pts);
      ctx.stroke();
      break;
    case 'marker':
      stroke(ctx, s);
      ctx.globalAlpha = 0.38;
      ctx.lineCap = 'square';
      ctx.lineWidth = s.w * 4;
      path(ctx, s.pts);
      ctx.stroke();
      break;
    case 'text': {
      ctx.font = FONT.replace('{size}', s.size);
      ctx.fillStyle = s.color;
      ctx.textBaseline = 'top';
      const lh = s.size * 1.25;
      s.text.split('\n').forEach((line, i) => ctx.fillText(line, s.x, s.y + i * lh));
      break;
    }
    case 'blur':
      pixelate(ctx, base, s);
      break;
    default:
  }
  ctx.restore();
}

/** Shift-constrained end point: squares / circles, or lines snapped to 45°. */
export function constrain(tool, x0, y0, x1, y1) {
  if (tool === 'line' || tool === 'arrow') {
    const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(x1 - x0, y1 - y0);
    return [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len];
  }
  const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return [x0 + Math.sign(x1 - x0 || 1) * d, y0 + Math.sign(y1 - y0 || 1) * d];
}
