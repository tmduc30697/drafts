import { useMemo } from 'react';
import { deletePageForever, restorePage } from '../data/pages.js';
import { descendantsOf, UNTITLED } from '../data/tree.js';
import { DocIcon, RestoreIcon, TrashIcon } from './icons.jsx';

const dateFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

// Danh sách trang trong thùng rác. Trang con bị xóa cùng lúc với trang cha
// được gộp vào trang cha (chỉ hiện trang cha, kèm số trang con).
export default function TrashView({ uid, pages }) {
  const items = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    return pages
      .filter((p) => {
        if (!p.trashedAt) return false;
        const parent = p.parentId && byId.get(p.parentId);
        return !parent || parent.trashedAt !== p.trashedAt;
      })
      .map((p) => ({ page: p, childCount: descendantsOf(pages, p.id).filter((c) => c.trashedAt === p.trashedAt).length }))
      .sort((a, b) => b.page.trashedAt - a.page.trashedAt);
  }, [pages]);

  const remove = (page) => {
    if (window.confirm(`Xóa vĩnh viễn "${page.title || UNTITLED}" và các trang con? Không thể hoàn tác.`)) {
      deletePageForever(uid, pages, page.id);
    }
  };

  return (
    <div className="trash">
      <h1 className="trash-title">Thùng rác</h1>
      {items.length === 0 ? (
        <p className="muted">Thùng rác trống.</p>
      ) : (
        <ul className="trash-list">
          {items.map(({ page, childCount }) => (
            <li key={page.id} className="trash-item">
              <span className="tree-icon">{page.icon || <DocIcon size={16} />}</span>
              <div className="trash-info">
                <div className={`trash-name ${page.title ? '' : 'untitled'}`}>{page.title || UNTITLED}</div>
                <div className="trash-meta">
                  Xóa lúc {dateFmt.format(page.trashedAt)}
                  {childCount > 0 && ` · kèm ${childCount} trang con`}
                </div>
              </div>
              <button className="icon-btn" aria-label="Khôi phục" title="Khôi phục" onClick={() => restorePage(uid, pages, page.id)}>
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
