import { useState } from 'react';
import { DocIcon, MoreIcon, TrashIcon } from '../icons.jsx';
import Menu from '../Menu.jsx';
import { UNTITLED } from '../../data/tree.js';
import { useListRowDnd } from './ListDnd.jsx';

// Danh sách trang phẳng trong sidebar
export default function PageList({ list, ctx }) {
  return list.map((page) => <PageRow key={page.id} page={page} ctx={ctx} />);
}

function PageRow({ page, ctx }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const active = ctx.currentId === page.id;
  const title = ctx.titleOf(page);
  const dnd = useListRowDnd(page.id);

  return (
    <div
      ref={dnd.setRef}
      {...dnd.dragProps}
      className={[
        'tree-row',
        active && 'active',
        menuAnchor && 'menu-open',
        dnd.isDragging && 'dragging',
        dnd.dropPos && `drop-${dnd.dropPos}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <a className="tree-link" href={`#/p/${page.id}`} onClick={ctx.onNavigate} draggable={false}>
        <span className="tree-icon">{page.icon || <DocIcon size={16} />}</span>
        <span className={`tree-title ${title ? '' : 'untitled'}`}>{title || UNTITLED}</span>
      </a>
      <div className="tree-actions">
        <button
          className="icon-btn small"
          aria-label="Tùy chọn"
          onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
        >
          <MoreIcon size={16} />
        </button>
      </div>
      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Chuyển vào thùng rác', icon: <TrashIcon size={16} />, danger: true, onClick: () => ctx.onTrash(page.id) },
          ]}
        />
      )}
    </div>
  );
}
