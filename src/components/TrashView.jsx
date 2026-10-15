import { useMemo } from 'react';
import { deletePageForever, restorePage } from '../data/pages.js';
import { UNTITLED } from '../data/tree.js';
import { DocIcon, RestoreIcon, TrashIcon } from './icons.jsx';

const dateFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

// Danh sách trang trong thùng rác, xóa gần nhất lên đầu
export default function TrashView({ uid, pages }) {
  const items = useMemo(
    () => pages.filter((p) => p.trashedAt).sort((a, b) => b.trashedAt - a.trashedAt),
    [pages],
  );

  const remove = (page) => {
    if (window.confirm(`Xóa vĩnh viễn "${page.title || UNTITLED}"? Không thể hoàn tác.`)) {
      deletePageForever(uid, page.id);
    }
  };

  return (
    <div className="trash">
      <h1 className="trash-title">Thùng rác</h1>
      {items.length === 0 ? (
        <p className="muted">Thùng rác trống.</p>
      ) : (
        <ul className="trash-list">
          {items.map((page) => (
            <li key={page.id} className="trash-item">
              <span className="tree-icon"><DocIcon size={16} /></span>
              <div className="trash-info">
                <div className={`trash-name ${page.title ? '' : 'untitled'}`}>{page.title || UNTITLED}</div>
                <div className="trash-meta">Xóa lúc {dateFmt.format(page.trashedAt)}</div>
              </div>
              <button className="icon-btn" aria-label="Khôi phục" title="Khôi phục" onClick={() => restorePage(uid, page.id)}>
                <RestoreIcon size={17} />
              </button>
              <button className="icon-btn danger" aria-label="Xóa vĩnh viễn" title="Xóa vĩnh viễn" onClick={() => remove(page)}>
                <TrashIcon size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
