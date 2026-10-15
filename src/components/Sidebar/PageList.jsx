import { DocIcon, TrashIcon } from '../icons.jsx';
import { UNTITLED } from '../../data/tree.js';
import { useListRowDnd } from './ListDnd.jsx';

// Danh sách trang phẳng trong sidebar
export default function PageList({ list, ctx }) {
  return list.map((page) => <PageRow key={page.id} page={page} ctx={ctx} />);
}

function PageRow({ page, ctx }) {
  const active = ctx.currentId === page.id;
  const title = ctx.titleOf(page);
  const dnd = useListRowDnd(page.id);

  return (
    <div
      ref={dnd.setRef}
      {...dnd.dragProps}
      className={['tree-row', active && 'active', dnd.isDragging && 'dragging', dnd.dropPos && `drop-${dnd.dropPos}`]
        .filter(Boolean)
        .join(' ')}
    >
      <a className="tree-link" href={`#/p/${page.id}`} onClick={ctx.onNavigate} draggable={false}>
        <span className="tree-icon">
          <DocIcon size={16} />
        </span>
        <span className={`tree-title ${title ? '' : 'untitled'}`}>{title || UNTITLED}</span>
      </a>
      <div className="tree-actions">
        <button className="icon-btn small danger" aria-label="Xóa trang" title="Xóa trang" onClick={() => ctx.onDelete(page)}>
          <TrashIcon size={15} />
        </button>
      </div>
    </div>
  );
}
