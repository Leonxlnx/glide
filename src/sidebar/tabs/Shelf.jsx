import { motion, AnimatePresence } from 'motion/react';
import { app } from '../state';
import { useStore } from '../../lib/store';
import { glide } from '../../lib/bridge';
import { bytes, ago } from '../../lib/format';
import { SNAPPY, BOUNCE } from '../ui';
import { Icon } from '../icons';

export default function ShelfTab() {
  const shelf = useStore(app, (s) => s.shelf);
  const dragIn = useStore(app, (s) => s.dragIn);
  if (!shelf.length) {
    return (
      <div className={'drop big' + (dragIn ? ' over' : '')}>
        <motion.div className="empty-icon gl" animate={{ y: dragIn ? -6 : 0, scale: dragIn ? 1.08 : 1 }} transition={BOUNCE}>
          <Icon name="shelf" size={24} />
        </motion.div>
        <h3>Drop files here</h3>
        <p>Park files while you switch apps, then drag them back out anywhere. Dragging a file to the screen edge opens Glide right here.</p>
      </div>
    );
  }
  const ids = shelf.map((x) => x.id);
  return (
    <>
      <div className="bar">
        <motion.div
          className="pill-btn primary" draggable whileTap={{ scale: 0.94 }} transition={SNAPPY} style={{ cursor: 'grab' }}
          onDragStart={(e) => { e.preventDefault(); glide.send('drag:start', { kind: 'shelf', ids }); }}
          title="Drag every file at once"
        >
          <Icon name="grab" size={14} weight="fill" /> Drag {shelf.length > 1 ? `all ${shelf.length}` : 'out'}
        </motion.div>
        <div style={{ display: 'flex' }}>
          <button className="pill-btn" onClick={() => glide.send('shelf:copy', ids)}><Icon name="copy" size={14} /> Copy</button>
          <button className="pill-btn danger" onClick={() => glide.send('shelf:clear')}>Clear</button>
        </div>
      </div>
      <div className="scroll">
        <div className="stack">
          <AnimatePresence initial={false}>
            {shelf.map((f) => (
              <motion.div
                key={f.id} layout="position" className="item"
                initial={{ opacity: 0, x: 30, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.96, transition: { duration: 0.16 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                draggable
                onDragStart={(e) => { e.preventDefault(); glide.send('drag:start', { kind: 'shelf', ids: [f.id] }); }}
                onDoubleClick={() => glide.send('shelf:open', f.id)}
                title={`${f.path}\nDrag out · double-click to open`}
              >
                <span className="lead bare"><img className="app" src={`glide://icon/?p=${encodeURIComponent(f.path)}`} alt="" /></span>
                <div className="body">
                  <div className="title one strong">{f.name}</div>
                  <div className="meta"><span>{f.dir ? 'Folder' : bytes(f.size)}</span><i className="dot" /><span>{ago(f.at)}</span></div>
                </div>
                <div className="acts" onClick={(e) => e.stopPropagation()}>
                  <button className="act" title="Copy" onClick={() => glide.send('shelf:copy', [f.id])}><Icon name="copy" size={14} /></button>
                  <button className="act" title="Show in folder" onClick={() => glide.send('shelf:reveal', f.id)}><Icon name="folderOpen" size={14} /></button>
                  <button className="act danger" title="Remove" onClick={() => glide.send('shelf:remove', f.id)}><Icon name="close" size={14} /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className={'drop' + (dragIn ? ' over' : '')} style={{ marginTop: 10 }}><Icon name="shelf" size={15} /> Drop more files</div>
      </div>
    </>
  );
}
