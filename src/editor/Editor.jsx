import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  Rectangle, Circle, ArrowUpRight, LineSegment, PencilSimple, Highlighter, TextT, GridFour,
  ArrowCounterClockwise, ArrowClockwise, Copy, X,
} from '@phosphor-icons/react';
import { paint, constrain, box } from './draw';

const TOOLS = [
  { id: 'rect', key: 'r', label: 'Rectangle', Icon: Rectangle },
  { id: 'ellipse', key: 'e', label: 'Ellipse', Icon: Circle },
  { id: 'arrow', key: 'a', label: 'Arrow', Icon: ArrowUpRight },
  { id: 'line', key: 'l', label: 'Line', Icon: LineSegment },
  { id: 'pen', key: 'p', label: 'Pen', Icon: PencilSimple },
  { id: 'marker', key: 'h', label: 'Highlighter', Icon: Highlighter },
  { id: 'text', key: 't', label: 'Text', Icon: TextT },
  { id: 'blur', key: 'b', label: 'Blur', Icon: GridFour },
];
const COLORS = [
  { v: '#ff3b30', n: 'Red' }, { v: '#ff9500', n: 'Orange' }, { v: '#ffcc00', n: 'Yellow' }, { v: '#34c759', n: 'Green' },
  { v: '#0a84ff', n: 'Blue' }, { v: '#af52de', n: 'Purple' }, { v: '#ffffff', n: 'White' }, { v: '#111114', n: 'Black' },
];
// On-screen sizes (CSS px); shapes store them in image pixels so they look the same at any zoom.
const SIZES = [{ stroke: 2, text: 16, n: 'Small' }, { stroke: 4, text: 22, n: 'Medium' }, { stroke: 7, text: 32, n: 'Large' }];

const glide = window.glide;

function history(state, a) {
  switch (a.type) {
    case 'add': return { shapes: [...state.shapes, a.shape], redo: [] };
    case 'undo': return state.shapes.length ? { shapes: state.shapes.slice(0, -1), redo: [...state.redo, state.shapes.at(-1)] } : state;
    case 'redo': return state.redo.length ? { shapes: [...state.shapes, state.redo.at(-1)], redo: state.redo.slice(0, -1) } : state;
    default: return state;
  }
}

export default function Editor() {
  const [base, setBase] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [tool, setTool] = useState('rect');
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [{ shapes, redo }, dispatch] = useReducer(history, { shapes: [], redo: [] });
  const [text, setTextState] = useState(null); // { id, x, y, value } in image pixels
  const textRef = useRef(null);
  const setText = (t) => { textRef.current = t; setTextState(t); };
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const canvas = useRef(null);
  const stage = useRef(null);
  const draft = useRef(null);
  const raf = useRef(0);
  const api = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const r = await glide.invoke('editor:init');
        if (!r) throw new Error('Nothing to edit.');
        setName(r.name);
        setBase(await createImageBitmap(new Blob([r.bytes])));
      } catch (e) { setError(String(e?.message || e)); }
    })();
  }, []);

  useLayoutEffect(() => {
    if (!base || !stage.current) return undefined;
    const fit = () => {
      const r = stage.current.getBoundingClientRect();
      // 1 image pixel = 1 screen pixel at most; smaller when the window is smaller.
      setScale(Math.min((r.width - 32) / base.width, (r.height - 32) / base.height, 1 / (window.devicePixelRatio || 1)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [base]);

  const render = () => {
    const c = canvas.current;
    if (!c || !base) return;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    for (const s of shapes) paint(ctx, s, base);
    const d = draft.current;
    if (d) {
      paint(ctx, d, base);
      if (d.tool === 'blur') {
        const b = box(d);
        ctx.save();
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
      }
    }
  };
  useEffect(render, [base, shapes]); // eslint-disable-line react-hooks/exhaustive-deps
  const schedule = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(render); };

  const toImg = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [(e.clientX - r.left) * (base.width / r.width), (e.clientY - r.top) * (base.height / r.height)];
  };

  const textShape = (t) => (t && t.value.trim()
    ? { tool: 'text', color: COLORS[color].v, size: SIZES[size].text / scale, x: t.x, y: t.y, text: t.value.replace(/\s+$/, '') }
    : null);
  const commitText = () => {
    const s = textShape(textRef.current);
    setText(null);
    if (s) dispatch({ type: 'add', shape: s });
  };

  const onDown = (e) => {
    if (e.button !== 0 || !base) return;
    const [x, y] = toImg(e);
    if (tool === 'text') {
      e.preventDefault();
      commitText();
      setText({ id: Date.now(), x, y, value: '' });
      return;
    }
    if (textRef.current) commitText();
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = SIZES[size].stroke / scale;
    const c = COLORS[color].v;
    draft.current = tool === 'pen' || tool === 'marker'
      ? { tool, color: c, w, pts: [[x, y]] }
      : { tool, color: c, w, x0: x, y0: y, x1: x, y1: y };
    schedule();
  };

  const onMove = (e) => {
    const d = draft.current;
    if (!d) return;
    if (d.pts) {
      const evs = e.nativeEvent.getCoalescedEvents?.() || [e];
      for (const ev of evs.length ? evs : [e]) d.pts.push(toImg(ev));
    } else {
      let [x, y] = toImg(e);
      if (e.shiftKey && d.tool !== 'blur') [x, y] = constrain(d.tool, d.x0, d.y0, x, y);
      d.x1 = x; d.y1 = y;
    }
    schedule();
  };

  const onUp = () => {
    const d = draft.current;
    draft.current = null;
    if (!d) return;
    const tiny = !d.pts && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 3 / scale;
    if (tiny) schedule();
    else dispatch({ type: 'add', shape: d });
  };

  const copy = async () => {
    if (busy || !base) return;
    setBusy(true);
    try {
      const pending = textShape(textRef.current);
      const all = pending ? [...shapes, pending] : shapes;
      const out = new OffscreenCanvas(base.width, base.height);
      const ctx = out.getContext('2d');
      ctx.drawImage(base, 0, 0);
      for (const s of all) paint(ctx, s, base);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const ok = await glide.invoke('editor:copy', new Uint8Array(await blob.arrayBuffer()));
      if (!ok) setError('Could not copy the image.');
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  api.current = { copy, undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }) };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === 'escape' || k === 'enter' || (mod && k === 'c')) { e.preventDefault(); api.current.copy(); return; }
      if (mod && k === 'z') { e.preventDefault(); api.current[e.shiftKey ? 'redo' : 'undo'](); return; }
      if (mod && k === 'y') { e.preventDefault(); api.current.redo(); return; }
      if (mod || e.altKey) return;
      const t = TOOLS.find((x) => x.key === k);
      if (t) { setTool(t.id); return; }
      if (/^[1-8]$/.test(e.key)) { setColor(Number(e.key) - 1); return; }
      if (e.key === '[') setSize((s) => Math.max(0, s - 1));
      else if (e.key === ']') setSize((s) => Math.min(SIZES.length - 1, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shown = base ? { width: base.width * scale, height: base.height * scale } : null;

  return (
    <div className="ed">
      <header className="bar">
        <div className="group">
          {TOOLS.map((t) => (
            <button key={t.id} className={'tb' + (tool === t.id ? ' on' : '')} title={`${t.label} (${t.key.toUpperCase()})`} onClick={() => setTool(t.id)}>
              <t.Icon size={17} weight={tool === t.id ? 'fill' : 'bold'} />
              <kbd>{t.key.toUpperCase()}</kbd>
            </button>
          ))}
        </div>
        <div className="group colors">
          {COLORS.map((c, i) => (
            <button key={c.v} className={'sw' + (color === i ? ' on' : '')} style={{ '--c': c.v }} title={`${c.n} (${i + 1})`} onClick={() => setColor(i)} />
          ))}
        </div>
        <button className="tb size" title={`Size: ${SIZES[size].n} ([ / ])`} onClick={() => setSize((s) => (s + 1) % SIZES.length)}>
          <span className="dot" style={{ width: 4 + size * 4, height: 4 + size * 4, background: COLORS[color].v }} />
        </button>
        <div className="name" title={name}>{name}</div>
        <button className="tb" title="Undo (Ctrl+Z)" disabled={!shapes.length} onClick={() => dispatch({ type: 'undo' })}><ArrowCounterClockwise size={17} weight="bold" /></button>
        <button className="tb" title="Redo (Ctrl+Shift+Z)" disabled={!redo.length} onClick={() => dispatch({ type: 'redo' })}><ArrowClockwise size={17} weight="bold" /></button>
        <button className="copy" title="Copy to clipboard and close (Esc, Enter or Ctrl+C)" disabled={!base || busy} onClick={copy}>
          <Copy size={15} weight="bold" />{busy ? 'Copying…' : 'Copy'}<kbd>Esc</kbd>
        </button>
        <button className="tb" title="Close without copying" onClick={() => glide.send('editor:close')}><X size={17} weight="bold" /></button>
      </header>

      <main className="stage" ref={stage}>
        {error && <div className="error">{error}</div>}
        {base && (
          <div className="sheet" style={shown}>
            <canvas
              ref={canvas} width={base.width} height={base.height} style={shown}
              className={tool === 'text' ? 'text' : ''}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            />
            {text && (
              <textarea
                key={text.id} autoFocus spellCheck={false} value={text.value}
                style={{ left: text.x * scale, top: text.y * scale, fontSize: SIZES[size].text, color: COLORS[color].v }}
                onChange={(e) => setText({ ...text, value: e.target.value })}
                onBlur={() => { if (textRef.current?.id === text.id) commitText(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); setText(null); }
                  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
