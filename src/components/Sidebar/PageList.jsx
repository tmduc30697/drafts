import { useEffect, useRef, useState } from 'react';
import { CloseIcon, DocIcon, LockIcon } from '../icons.jsx';
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
  const [editing, setEditing] = useState(false);

  const finish = (value) => {
    setEditing(false);
    ctx.onRename(page, value.trim());
  };

  return (
    <div
      ref={dnd.setRef}
      {...(editing ? {} : dnd.dragProps)}
      className={['tree-row', active && 'active', dnd.isDragging && 'dragging', dnd.dropPos && `drop-${dnd.dropPos}`]
        .filter(Boolean)
        .join(' ')}
    >
      {editing ? (
        <div className="tree-link">
          <span className="tree-icon">
            <DocIcon size={16} />
          </span>
          <TitleInput initial={title} onDone={finish} onCancel={() => setEditing(false)} />
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
function TitleInput({ initial, onDone, onCancel }) {
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
      placeholder={UNTITLED}
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
