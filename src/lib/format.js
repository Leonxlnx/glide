export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts); const n = new Date(now);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(n) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}

export function bytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function clock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function basename(p) { return String(p).split(/[\\/]/).filter(Boolean).pop() || p; }

export function prettyKeys(acc) {
  if (!acc) return [];
  return acc.split('+').map((k) => ({
    super: 'Win', meta: 'Win', cmd: 'Win', command: 'Win', commandorcontrol: 'Ctrl', control: 'Ctrl', ctrl: 'Ctrl',
    alt: 'Alt', option: 'Alt', shift: 'Shift', space: 'Space', return: 'Enter', escape: 'Esc',
  }[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : k)));
}

export function hostOf(url) {
  try { return new URL(/^https?:/i.test(url) ? url : 'https://' + url).host.replace(/^www\./, ''); } catch { return url; }
}
