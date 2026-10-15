import { useState } from 'react';
import { ChevronIcon, DocIcon, MoreIcon, PlusIcon, TrashIcon } from '../icons.jsx';
import Menu from '../Menu.jsx';
import { useTreeRowDnd } from './TreeDnd.jsx';
import { UNTITLED } from '../../data/tree.js';

// Cây trang lồng nhau trong sidebar
export default function PageTree({ tree, parentId = null, depth = 0, ctx }) {
  const items = tree.childrenOf(parentId);
  if (!items.length) {
    // Trang đang mở rộng nhưng chưa có trang con
    return depth > 0 ? (
      <div className="tree-empty" style={{ paddingLeft: 12 + depth * 16 + 22 }}>
        Không có trang con
      </div>
    ) : null;
  }
  return items.map((page) => (
    <TreeNode key={page.id} page={page} tree={tree} depth={depth} ctx={ctx} />
  ));
}

function TreeNode({ page, tree, depth, ctx }) {
  const expanded = ctx.expanded.has(page.id);
  const hasChildren = tree.childrenOf(page.id).length > 0;
  return (
    <>
      <TreeRow page={page} depth={depth} expanded={expanded} hasChildren={hasChildren} ctx={ctx} />
      {expanded && <PageTree tree={tree} parentId={page.id} depth={depth + 1} ctx={ctx} />}
    </>
  );
}

export function TreeRow({ page, depth, expanded, hasChildren, ctx }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const active = ctx.currentId === page.id;
  const title = ctx.titleOf(page);
  const dnd = useTreeRowDnd(page.id);

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
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      <button
        /* Trang lá: chevron mờ hơn nhưng vẫn bấm được để thấy "Không có trang con" */
        className={`tree-toggle ${hasChildren ? '' : 'leaf'}`}
        onClick={() => ctx.toggle(page.id)}
        aria-label={expanded ? 'Thu gọn' : 'Mở rộng'}
      >
        <ChevronIcon size={14} className={expanded ? 'rot90' : ''} />
      </button>
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
        <button className="icon-btn small" aria-label="Thêm trang con" onClick={() => ctx.onCreate(page.id)}>
          <PlusIcon size={16} />
        </button>
      </div>
      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Thêm trang con', icon: <PlusIcon size={16} />, onClick: () => ctx.onCreate(page.id) },
            { label: 'Chuyển vào thùng rác', icon: <TrashIcon size={16} />, danger: true, onClick: () => ctx.onTrash(page.id) },
          ]}
        />
      )}
    </div>
  );
}
