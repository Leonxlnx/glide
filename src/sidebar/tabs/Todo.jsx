import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { app } from '../state';
import { useStore } from '../../lib/store';
import { glide } from '../../lib/bridge';
import { Glass, Keys, Tip, SNAPPY, HEIGHT, useAfterClose } from '../ui';
import { Icon } from '../icons';

// QuickTodo (the Alt+Q tool), synced both ways: edits here land in QuickTodo, and anything
// added there shows up here the moment it saves.
export default function TodoTab() {
  const todo = useStore(app, (s) => s.todo);
  const keys = useStore(app, (s) => {
    const t = (s.settings.tools || []).find((x) => x.id === 'altq' || (x.action && x.action.keys === 'Alt+Q'));
    return (t && t.action && t.action.keys) || 'Alt+Q';
  });
  const [pick, setPick] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [text, setText] = useState('');
  const input = useRef(null);
  useAfterClose(() => { setPick(null); setShowDone(false); setText(''); });

  if (!todo.found || !todo.lists.length) {
    return (
      <div className="empty">
        <div className="empty-icon gl"><Icon name="todo" size={24} /></div>
        <h3>No QuickTodo lists yet</h3>
        <p>This section mirrors QuickTodo. If it's installed, press <Keys accel={keys} /> once and your lists show up here, synced both ways. Otherwise you can hide it in Settings.</p>
      </div>
    );
  }

  const idx = Math.min(todo.lists.length - 1, pick ?? todo.current);
  const list = todo.lists[idx];
  const keyed = withKeys(list.items);
  const openItems = keyed.filter((x) => !x.it.done);
  const doneItems = keyed.filter((x) => x.it.done);
  const op = (kind, it) => glide.send('todo:op', { kind, list: idx, listName: list.name, text: it.text, done: kind === 'toggle' ? !it.done : it.done });
  const add = () => {
    const t = text.trim();
    if (!t) return;
    glide.send('todo:op', { kind: 'add', list: idx, listName: list.name, text: t });
    setText('');
  };

  return (
    <>
      <div className="todo-head">
        <div className="todo-lists" role="tablist">
          {todo.lists.map((l, i) => {
            const n = l.items.filter((it) => !it.done).length;
            return (
              <button key={i} role="tab" aria-selected={i === idx} className={'todo-list' + (i === idx ? ' on' : '')} onClick={() => setPick(i)}>
                {i === idx && <motion.span layoutId="todo-pill" className="todo-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                <span className="nm">{l.name}</span>
                {n > 0 && <span className="n">{n}</span>}
              </button>
            );
          })}
        </div>
        <Tip content={<span className="tip-row">Open QuickTodo <Keys accel={keys} /></span>}>
          <Glass className="icon-btn sm" press={0.88} onClick={() => glide.send('todo:open')} aria-label="Open QuickTodo">
            <Icon name="open" size={14} />
          </Glass>
        </Tip>
      </div>

      <Glass as="div" className="search todo-add" press={1}>
        <Icon name="plus" size={14} />
        <input
          ref={input} value={text} placeholder={`Add to ${list.name}`} spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            else if (e.key === 'Escape' && text) { e.stopPropagation(); setText(''); }
          }}
        />
        <AnimatePresence>
          {text.trim() && (
            <motion.button className="x add" onClick={add} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SNAPPY} aria-label="Add">
              <Icon name="check" size={11} />
            </motion.button>
          )}
        </AnimatePresence>
      </Glass>

      <div className="scroll">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={SNAPPY}>
            {openItems.length === 0 && <div className="todo-clear">All clear in {list.name}</div>}
            <div className="stack">
              <AnimatePresence initial={false}>
                {openItems.map(({ it, key }) => <Row key={key} it={it} onToggle={() => op('toggle', it)} onDelete={() => op('delete', it)} />)}
              </AnimatePresence>
            </div>
            {doneItems.length > 0 && (
              <button className="todo-done-toggle" onClick={() => setShowDone((v) => !v)}>
                <span>{doneItems.length} done</span>
                <motion.span className="chev" animate={{ rotate: showDone ? 180 : 0 }} transition={SNAPPY}><Icon name="chevDown" size={11} /></motion.span>
              </button>
            )}
            <AnimatePresence initial={false}>
              {showDone && doneItems.length > 0 && (
                <motion.div className="stack" style={{ overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={HEIGHT}>
                  <AnimatePresence initial={false}>
                    {doneItems.map(({ it, key }) => <Row key={key} it={it} onToggle={() => op('toggle', it)} onDelete={() => op('delete', it)} />)}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

// stable keys even with duplicate texts (indices shift when something is added on top)
function withKeys(items) {
  const seen = new Map();
  return items.map((it) => {
    const base = (it.done ? 'd:' : 'o:') + it.text;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return { it, key: base + '#' + n };
  });
}

function Row({ it, onToggle, onDelete }) {
  return (
    <motion.div
      className={'todo' + (it.done ? ' done' : '')}
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ height: HEIGHT, opacity: { duration: 0.16 } }}
    >
      <button className="todo-hit" onClick={onToggle} aria-label={it.done ? 'Mark as not done' : 'Mark as done'}>
        <motion.span className="ring" whileTap={{ scale: 0.8 }} transition={SNAPPY}>
          {it.done && <Icon name="check" size={10} weight="bold" />}
        </motion.span>
        <span className="tx">{it.text}</span>
      </button>
      <button className="todo-del" onClick={onDelete} aria-label="Delete"><Icon name="close" size={11} /></button>
    </motion.div>
  );
}
