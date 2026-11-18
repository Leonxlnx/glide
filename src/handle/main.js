// The edge handle: a tiny liquid pill that wakes up as the cursor approaches.
// Hover mode: it follows the cursor along the edge. Click mode: it stays put, leans a little
// towards the cursor and is the button that opens Glide (main makes the window clickable only
// while the cursor is on it).
const pill = document.getElementById('pill');
const g = window.glide;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Spring {
  constructor(v, k = 260, c = 26) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const f = -this.k * (this.v - this.t) - this.c * this.vel;
    this.vel += f * dt;
    this.v += this.vel * dt;
  }
  get settled() { return Math.abs(this.v - this.t) < 0.02 && Math.abs(this.vel) < 0.02; }
}

let edge = 'right';
let rest = window.innerHeight / 2;
const y = new Spring(rest, 180, 22);
const near = new Spring(0, 300, 30);
const vis = new Spring(1, 260, 28);
const hot = new Spring(0, 420, 30); // cursor is on the pill (click mode)
const press = new Spring(0, 700, 34);
let click = false;
let hidden = false;
let raf = 0;
let last = 0;
// Frame pacing while the pill animates on approach: the cheapest honest signal of whether the GPU
// is contended right now. Main turns its compositor boost on only then.
let pace = [];
let paceSent = false;
function sendPace() {
  if (paceSent || pace.length < 6) return;
  const s = pace.slice(3).sort((a, b) => a - b); // the first frames after a pause are always slow
  paceSent = true;
  g.send('handle:pace', { median: s[s.length >> 1], n: s.length });
}

Object.assign(pill.style, {
  position: 'absolute', top: '0', borderRadius: '99px', willChange: 'transform, opacity, height, width',
  background: 'rgba(255,255,255,0.9)',
  boxShadow: '0 0 0 0.5px rgba(0,0,0,0.3), 0 1px 6px rgba(0,0,0,0.3)',
});

function render() {
  const n = clamp(near.v, 0, 1);
  const k = clamp(hot.v, 0, 1.2);
  const p = clamp(press.v, 0, 1.2);
  const speed = Math.min(1, Math.abs(y.vel) / 1400);
  const w = 4 + n * 2.5 + k * 1.5 + p * 2;
  const h = 58 + n * 34 + speed * 46 - p * 8; // stretches with velocity, squashes when pressed
  const op = clamp(0.38 + n * 0.55 + k * 0.07, 0, 1) * clamp(vis.v, 0, 1);
  const inset = 3 + n * 2;
  pill.style.width = w + 'px';
  pill.style.height = h + 'px';
  pill.style.opacity = op.toFixed(3);
  const x = edge === 'right' ? window.innerWidth - inset - w : inset;
  pill.style.transform = `translate(${x}px, ${y.v - h / 2}px) scaleX(${1 + (1 - vis.v) * 0.6})`;
}

function loop(t) {
  if (last && near.t > 0 && !hidden && !paceSent) {
    pace.push(t - last);
    if (pace.length >= 12) sendPace();
  }
  const dt = Math.min(0.032, last ? (t - last) / 1000 : 0.016);
  last = t;
  y.step(dt); near.step(dt); vis.step(dt); hot.step(dt); press.step(dt);
  render();
  if (y.settled && near.settled && vis.settled && hot.settled && press.settled) { sendPace(); raf = 0; last = 0; return; }
  raf = requestAnimationFrame(loop);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

render();
if (g) {
  g.on('handle:geo', (p) => {
    edge = p.edge;
    rest = p.rest;
    click = !!p.click;
    y.v = y.t = rest;
    kick();
  });
  g.on('handle:near', (p) => {
    if (p.near <= 0) { pace = []; paceSent = false; } // next approach measures afresh
    near.t = p.near;
    const h = window.innerHeight;
    if (p.near <= 0.02) y.t = rest;
    else if (click) y.t = rest + clamp((p.y - rest) * 0.12, -10, 10); // a lean, not a follow
    else y.t = clamp(p.y, 60, h - 60);
    kick();
  });
  g.on('handle:hot', (v) => {
    hot.t = v ? 1 : 0;
    document.body.style.cursor = v ? 'pointer' : '';
    kick();
  });
  g.on('handle:hide', (v) => {
    hidden = v;
    vis.t = v ? 0 : 1;
    if (!v) { near.v = near.t = 0; hot.v = hot.t = 0; press.v = press.t = 0; y.t = rest; }
    kick();
  });
  // Main opens on the press itself (it polls the button: this window can't take focus, so
  // Chromium never hands it the mousedown) and tells us, for the squash.
  g.on('handle:press', () => {
    press.vel = 40; // a quick squash; the pill then springs away as the panel takes over
    kick();
  });
  // The mouseup does arrive: it catches taps too quick for main's poll. Main only lets clicks
  // through while the cursor is on the pill, so any release here is one.
  window.addEventListener('mouseup', (e) => {
    if (!click || hidden || e.button !== 0) return;
    g.send('handle:click');
  });
}
