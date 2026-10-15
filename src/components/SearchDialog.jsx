import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { goToPage } from '../hooks/useHashRoute.js';
import { normalizeText, pathOf, UNTITLED } from '../data/tree.js';
import { DocIcon, SearchIcon } from './icons.jsx';

const MAX_RESULTS = 50;

// Hộp tìm trang theo tiêu đề, chạy hoàn toàn trên dữ liệu đã có trong máy (không tốn lượt đọc)
export default function SearchDialog({ tree, titleOf, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = normalizeText(query.trim());
    const all = [...tree.byId.values()];
    const matched = q
      ? all.filter((p) => normalizeText(titleOf(p)).includes(q))
      : // Chưa gõ gì: hiện các trang sửa gần đây
        all.sort((a, b) => b.updatedAt - a.updatedAt);
    return matched.slice(0, MAX_RESULTS);
  }, [query, tree, titleOf]);

  useEffect(() => setSelected(0), [query]);

  // Giữ mục đang chọn trong vùng nhìn thấy khi dùng phím mũi tên
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const open = (page) => {
    onClose();
    goToPage(page.id);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && results[selected]) {
      e.preventDefault();
      open(results[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return createPortal(
    <div className="search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-dialog" role="dialog" aria-label="Tìm kiếm">
        <div className="search-input-row">
          <SearchIcon size={18} />
          <input
            autoFocus
            className="search-input"
            placeholder="Tìm theo tiêu đề…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="go"
          />
          <button className="link-btn mobile-only" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="search-section">{query.trim() ? 'Kết quả' : 'Gần đây'}</div>
        <ul className="search-results" ref={listRef}>
          {results.map((p, i) => {
            const parents = pathOf(tree.byId, p.id).slice(0, -1);
            return (
              <li key={p.id}>
                <button
                  className={`search-result ${i === selected ? 'selected' : ''}`}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => open(p)}
                >
                  <span className="tree-icon">{p.icon || <DocIcon size={16} />}</span>
                  <span className={`search-title ${titleOf(p) ? '' : 'untitled'}`}>{titleOf(p) || UNTITLED}</span>
                  {parents.length > 0 && (
                    <span className="search-path">{parents.map((a) => titleOf(a) || UNTITLED).join(' / ')}</span>
                  )}
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="search-empty">Không tìm thấy trang nào.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
