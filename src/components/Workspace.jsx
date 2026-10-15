import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePages } from '../hooks/usePages.js';
import { goHome, goToPage, useHashRoute } from '../hooks/useHashRoute.js';
import { buildTree, pathOf, UNTITLED } from '../data/tree.js';
import { createPage, trashPage } from '../data/pages.js';
import { loadJSON, saveJSON } from '../lib/storage.js';
import { MenuIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';
import Menu from './Menu.jsx';
import Sidebar from './Sidebar/Sidebar.jsx';
import TrashView from './TrashView.jsx';
import SearchDialog from './SearchDialog.jsx';

// BlockNote khá nặng: tách thành chunk riêng để màn hình đăng nhập và sidebar hiện nhanh
const PageView = lazy(() => import('./PageView/PageView.jsx'));

// Khung làm việc sau khi đăng nhập: sidebar + vùng nội dung
export default function Workspace({ user }) {
  const uid = user.uid;
  const { pages, loaded } = usePages(uid);
  const tree = useMemo(() => buildTree(pages), [pages]);
  const route = useHashRoute();
  const currentId = route.view === 'page' ? route.id : null;
  const currentPage = currentId ? tree.byId.get(currentId) : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Tiêu đề đang gõ (chưa lưu) để sidebar cập nhật ngay, không chờ debounce
  const [liveTitles, setLiveTitles] = useState({});

  // Trạng thái mở rộng của cây, lưu riêng trên từng máy
  const expandedKey = `drafts:expanded:${uid}`;
  const [expanded, setExpanded] = useState(() => new Set(loadJSON(expandedKey, [])));
  const updateExpanded = useCallback(
    (fn) =>
      setExpanded((prev) => {
        const next = fn(new Set(prev));
        saveJSON(expandedKey, [...next]);
        return next;
      }),
    [expandedKey],
  );

  // Mở trang thì tự mở rộng các trang tổ tiên để thấy nó trong sidebar
  useEffect(() => {
    if (!currentPage) return;
    const ancestors = pathOf(tree.byId, currentPage.id).slice(0, -1);
    if (ancestors.some((p) => !expanded.has(p.id))) {
      updateExpanded((s) => {
        ancestors.forEach((p) => s.add(p.id));
        return s;
      });
    }
  }, [currentPage, tree, expanded, updateExpanded]);

  // Ghi nhớ trang mở gần nhất trên máy này
  const lastKey = `drafts:last:${uid}`;
  useEffect(() => {
    if (currentPage) saveJSON(lastKey, currentPage.id);
  }, [currentPage, lastKey]);

  // Vào app (không có trang trong URL): mở trang gần nhất, không có thì trang đầu tiên
  useEffect(() => {
    if (route.view !== 'home' || !loaded) return;
    const last = loadJSON(lastKey, null);
    const target = (last && tree.byId.get(last)) || tree.roots[0];
    if (target) goToPage(target.id, { replace: true });
  }, [route.view, loaded, tree, lastKey]);

  const ctx = useMemo(
    () => ({
      currentId,
      expanded,
      titleOf: (p) => liveTitles[p.id] ?? p.title,
      toggle: (id) =>
        updateExpanded((s) => {
          s.has(id) ? s.delete(id) : s.add(id);
          return s;
        }),
      expand: (id) => updateExpanded((s) => s.add(id)),
      onCreate: (parentId) => {
        const id = createPage(uid, pages, { parentId });
        if (parentId) updateExpanded((s) => s.add(parentId));
        setDrawerOpen(false);
        goToPage(id);
      },
      onTrash: (id) => {
        // Đang mở trang bị xóa (hoặc trang con của nó) thì quay về trang khác
        const inTrashed = currentId && pathOf(tree.byId, currentId).some((p) => p.id === id);
        trashPage(uid, pages, id);
        if (inTrashed) goHome();
      },
      onNavigate: () => setDrawerOpen(false),
    }),
    [currentId, expanded, liveTitles, updateExpanded, uid, pages, tree],
  );

  // Cmd/Ctrl+K mở tìm kiếm (bắt ở pha capture để thắng phím tắt của editor)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const setLiveTitle = useCallback((id, title) => {
    setLiveTitles((m) => (title == null ? omit(m, id) : { ...m, [id]: title }));
  }, []);

  return (
    <div className={`app ${drawerOpen ? 'drawer-open' : ''}`}>
      <aside className="sidebar">
        <Sidebar
          user={user}
          tree={tree}
          ctx={ctx}
          route={route}
          onOpenSearch={() => {
            setDrawerOpen(false);
            setSearchOpen(true);
          }}
          onNavigate={ctx.onNavigate}
        />
      </aside>
      <div className="backdrop" onClick={() => setDrawerOpen(false)} />

      <main className="main">
        <Topbar
          path={currentPage ? pathOf(tree.byId, currentPage.id) : []}
          title={route.view === 'trash' ? 'Thùng rác' : null}
          ctx={ctx}
          currentPage={currentPage}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <div className="content">
          {!loaded ? null : currentPage ? (
            <Suspense fallback={null}>
              <PageView key={currentPage.id} uid={uid} page={currentPage} onLiveTitle={setLiveTitle} />
            </Suspense>
          ) : route.view === 'trash' ? (
            <TrashView uid={uid} pages={pages} />
          ) : route.view === 'page' ? (
            <div className="center-screen muted">Trang không tồn tại hoặc đã ở trong thùng rác.</div>
          ) : route.view === 'home' && tree.roots.length === 0 ? (
            <div className="center-screen">
              <p className="muted">Chưa có trang nào.</p>
              <button className="btn" onClick={() => ctx.onCreate(null)}>
                <PlusIcon size={16} /> Tạo trang
              </button>
            </div>
          ) : null}
        </div>
      </main>
      {searchOpen && <SearchDialog tree={tree} titleOf={ctx.titleOf} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function omit(obj, key) {
  const { [key]: _, ...rest } = obj;
  return rest;
}

// Thanh trên cùng: nút mở drawer (điện thoại), breadcrumb, menu trang
function Topbar({ path, title, ctx, currentPage, onOpenDrawer, onOpenSearch }) {
  const [menu, setMenu] = useState(null);
  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" aria-label="Mở danh sách trang" onClick={onOpenDrawer}>
        <MenuIcon />
      </button>
      <div className="breadcrumb">
        {title && <span className="crumb">{title}</span>}
        {path.map((p, i) => (
          <span key={p.id} className="crumb-wrap">
            {i > 0 && <span className="crumb-sep">/</span>}
            <a className="crumb" href={`#/p/${p.id}`}>
              {p.icon && <span className="crumb-icon">{p.icon}</span>}
              {ctx.titleOf(p) || UNTITLED}
            </a>
          </span>
        ))}
      </div>
      <div className="topbar-actions">
        <button className="icon-btn mobile-only" aria-label="Tìm kiếm" onClick={onOpenSearch}>
          <SearchIcon />
        </button>
        {currentPage && (
          <button className="icon-btn" aria-label="Tùy chọn trang" onClick={(e) => setMenu(menu ? null : e.currentTarget)}>
            <MoreIcon />
          </button>
        )}
      </div>
      {menu && currentPage && (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Thêm trang con', icon: <PlusIcon size={16} />, onClick: () => ctx.onCreate(currentPage.id) },
            { label: 'Chuyển vào thùng rác', icon: <TrashIcon size={16} />, danger: true, onClick: () => ctx.onTrash(currentPage.id) },
          ]}
        />
      )}
    </header>
  );
}
