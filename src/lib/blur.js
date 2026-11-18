// Pre-blurs a backdrop snapshot once (instead of a per-frame backdrop-filter).
// Edges are clamped before blurring so the glass never darkens toward the screen edge.
export async function blurSnapshot(url, { radius = 15, saturate = 1.9, brightness = 1.03 } = {}) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous'; // served with CORS from another glide:// host — keeps the canvas exportable
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const pad = Math.ceil(radius * 3);
  const src = new OffscreenCanvas(w + pad * 2, h + pad * 2);
  const s = src.getContext('2d');
  s.drawImage(img, pad, pad);
  // clamp: stretch the outermost pixel rows/columns into the padding
  s.drawImage(img, 0, 0, 1, h, 0, pad, pad, h);
  s.drawImage(img, w - 1, 0, 1, h, pad + w, pad, pad, h);
  s.drawImage(src, 0, pad, w + pad * 2, 1, 0, 0, w + pad * 2, pad);
  s.drawImage(src, 0, pad + h - 1, w + pad * 2, 1, 0, pad + h, w + pad * 2, pad);
  const out = new OffscreenCanvas(w, h);
  const o = out.getContext('2d');
  o.filter = `blur(${radius}px) saturate(${saturate}) brightness(${brightness})`;
  o.drawImage(src, -pad, -pad);
  const blob = await out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return URL.createObjectURL(blob);
}
