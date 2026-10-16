import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, CloseIcon, DocIcon, FolderIcon, LockIcon, PlusIcon } from '../icons.jsx';
import { isCollection, UNTITLED, UNTITLED_COLLECTION } from '../../data/tree.js';
import { useListRowDnd } from './ListDnd.jsx';

// Danh sách trong sidebar: trang và collection ở gốc; trang trong collection hiện thụt vào khi mở collection
export default function PageList({ tree, ctx }) {
  return tree.items.map((item) =>
    isCollection(item) ? (
      <CollectionGroup key={item.id} collection={item} pages={tree.childrenOf.get(item.id) || []} ctx={ctx} />
    ) : (
      <PageRow key={item.id} page={item} ctx={ctx} />
    ),
  );
}

function rowClass(base, dnd, extra = []) {
  return [base, dnd.isDragging && 'dragging', dnd.dropPos && `drop-${dnd.dropPos}`, ...extra].filter(Boolean).join(' ');
}

function CollectionGroup({ collection, pages, ctx }) {
  const open = ctx.expanded.has(collection.id);
  const dnd = useListRowDnd(collection.id);
  // Collection vừa tạo: vào ngay chế độ đặt tên
  const [editing, setEditing] = useState(() => ctx.renameId === collection.id);
  const title = collection.title;

  const finish = (value) => {
    setEditing(false);
    ctx.clearRename();
    ctx.onRename(collection, value.trim());
  };

  // Bọc cả nhóm: hàng collection dính ở đầu vùng cuộn trong lúc còn thấy trang của nó (position: sticky trong nhóm)
  return (
    <div className="tree-group">
      <div ref={dnd.setRef} {...(editing ? {} : dnd.dragProps)} className={rowClass('tree-row tree-collection', dnd)}>
        {editing ? (
          <div className="tree-link">
            <span className="tree-icon">
              <FolderIcon size={16} />
            </span>
            <TitleInput
              initial={title}
              placeholder={UNTITLED_COLLECTION}
              onDone={finish}
              onCancel={() => {
                setEditing(false);
                ctx.clearRename();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="tree-link"
            aria-expanded={open}
            onClick={() => ctx.toggleExpanded(collection.id)}
            onDoubleClick={(e) => {
              e.preventDefault();
              setEditing(true);
            }}
            title="Bấm để mở / đóng, nhấp đúp để đổi tên"
          >
            <span className={`tree-chevron ${open ? 'open' : ''}`}>
              <ChevronRightIcon size={14} />
            </span>
            <span className="tree-icon">
              <FolderIcon size={16} />
            </span>
            <span className={`tree-title ${title ? '' : 'untitled'}`}>{title || UNTITLED_COLLECTION}</span>
            {!open && pages.length > 0 && <span className="tree-count">{pages.length}</span>}
          </button>
        )}
        <div className="tree-actions">
          <button
            className="icon-btn small"
            aria-label="Trang mới trong collection"
            title="Trang mới trong collection"
            onClick={() => ctx.onCreate(collection.id)}
          >
            <PlusIcon size={15} />
          </button>
          <button
            className="icon-btn small"
            aria-label="Xóa collection"
            title="Xóa collection (các trang bên trong được đưa ra ngoài)"
            onClick={() => ctx.onDeleteCollection(collection)}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      </div>
      {open &&
        (pages.length ? (
          pages.map((page) => <PageRow key={page.id} page={page} ctx={ctx} nested />)
        ) : (
          <div className="tree-empty">Chưa có trang. Kéo trang vào đây hoặc bấm ＋</div>
        ))}
    </div>
  );
}

function PageRow({ page, ctx, nested = false }) {
  const active = ctx.currentId === page.id;
  const title = ctx.titleOf(page);
  const dnd = useListRowDnd(page.id);
  const [editing, setEditing] = useState(false);

  const finish = (value) => {
    setEditing(false);
    ctx.onRename(page, value.trim());
  };

  return (
    <div
      ref={dnd.setRef}
      {...(editing ? {} : dnd.dragProps)}
      className={rowClass('tree-row', dnd, [active && 'active', nested && 'nested'])}
    >
      {editing ? (
        <div className="tree-link">
          <span className="tree-icon">
            <DocIcon size={16} />
          </span>
          <TitleInput initial={page.title} placeholder={UNTITLED} onDone={finish} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <a
          className="tree-link"
          href={`#/p/${page.id}`}
          onClick={ctx.onNavigate}
          onDoubleClick={(e) => {
            e.preventDefault();
            if (!page.locked) setEditing(true);
          }}
          title={page.locked ? 'Trang đã khóa' : 'Nhấp đúp để đổi tên'}
          draggable={false}
        >
          <span className="tree-icon">
            <DocIcon size={16} />
          </span>
          <span className={`tree-title ${title ? '' : 'untitled'}`}>{title || UNTITLED}</span>
        </a>
      )}
      {page.locked ? (
        <span className="tree-lock" title="Trang đã khóa: không sửa, không xóa được">
          <LockIcon size={13} />
        </span>
      ) : (
        <div className="tree-actions">
          <button className="icon-btn small" aria-label="Xóa trang" title="Xóa trang" onClick={() => ctx.onDelete(page)}>
            <CloseIcon size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// Ô đổi tên: Enter/rời ô để lưu, Esc để hủy
function TitleInput({ initial, placeholder, onDone, onCancel }) {
  const ref = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="tree-rename"
      defaultValue={initial}
      placeholder={placeholder}
      onBlur={(e) => {
        if (!cancelled.current) onDone(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          onCancel();
        }
      }}
    />
  );
}
