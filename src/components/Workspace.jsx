import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePages } from '../hooks/usePages.js';
import { goHome, goToPage, useHashRoute } from '../hooks/useHashRoute.js';
import { buildList, UNTITLED } from '../data/tree.js';
import { createPage, trashPage } from '../data/pages.js';
import { ensureOnboarding } from '../data/onboarding.js';
import { loadJSON, saveJSON } from '../lib/storage.js';
import { MenuIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';
import Menu from './Menu.jsx';
import Sidebar from './Sidebar/Sidebar.jsx';
import TrashView from './TrashView.jsx';
import SearchDialog from './SearchDialog.jsx';
import SyncIndicator from './SyncIndicator.jsx';

// Editor tách thành chunk riêng để màn hình đăng nhập và sidebar hiện nhanh
const PageView = lazy(() => import('./PageView/PageView.jsx'));

// Khung làm việc sau khi đăng nhập: sidebar + vùng nội dung
export default function Workspace({ user }) {
  const uid = user.uid;
  const { pages, loaded } = usePages(uid);
  const { list, byId } = useMemo(() => buildList(pages), [pages]);
  const route = useHashRoute();
  const currentId = route.view === 'page' ? route.id : null;
  const currentPage = currentId ? byId.get(currentId) : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Tiêu đề đang gõ (chưa lưu) để sidebar cập nhật ngay, không chờ debounce
  const [liveTitles, setLiveTitles] = useState({});

  // Ghi nhớ trang mở gần nhất trên máy này
  const lastKey = `drafts:last:${uid}`;
  useEffect(() => {
    if (currentPage) saveJSON(lastKey, currentPage.id);
  }, [currentPage, lastKey]);

  // Vào app (không có trang trong URL): mở trang gần nhất, không có thì trang đầu tiên
  useEffect(() => {
    if (route.view !== 'home' || !loaded) return;
    const last = loadJSON(lastKey, null);
    const target = (last && byId.get(last)) || list[0];
    if (target) goToPage(target.id, { replace: true });
  }, [route.view, loaded, list, byId, lastKey]);

  // Tài khoản mới: tạo trang "Bắt đầu" (kiểm tra một lần mỗi phiên, sau khi đã có danh sách trang)
  const onboardingChecked = useRef(false);
  useEffect(() => {
    if (!loaded || onboardingChecked.current) return;
    onboardingChecked.current = true;
    ensureOnboarding(uid, pages).then((id) => {
      if (id && window.location.hash.replace(/^#\/?/, '') === '') goToPage(id, { replace: true });
    });
  }, [loaded, uid, pages]);

  const ctx = useMemo(
    () => ({
      currentId,
      titleOf: (p) => liveTitles[p.id] ?? p.title,
      onCreate: () => {
        const id = createPage(uid, pages);
        setDrawerOpen(false);
        goToPage(id);
      },
      onTrash: (id) => {
        // Đang mở trang bị xóa thì chuyển sang trang kế bên (dưới, không có thì trên).
        // Chọn ngay tại đây vì danh sách chưa kịp cập nhật.
        trashPage(uid, id);
        if (id !== currentId) return;
        const i = list.findIndex((p) => p.id === id);
        const next = list[i + 1] || list[i - 1];
        saveJSON(lastKey, null);
        if (next) goToPage(next.id, { replace: true });
        else goHome();
      },
      onNavigate: () => setDrawerOpen(false),
    }),
    [currentId, liveTitles, uid, pages, list, lastKey],
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
          list={list}
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
          ) : route.view === 'home' && list.length === 0 ? (
            <div className="center-screen">
              <p className="muted">Chưa có trang nào.</p>
              <button className="btn" onClick={ctx.onCreate}>
                <PlusIcon size={16} /> Tạo trang
              </button>
            </div>
          ) : null}
        </div>
      </main>
      {searchOpen && <SearchDialog list={list} titleOf={ctx.titleOf} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function omit(obj, key) {
  const { [key]: _, ...rest } = obj;
  return rest;
}

// Thanh trên cùng: nút mở drawer (điện thoại), tên trang hiện tại, menu trang
function Topbar({ title, ctx, currentPage, onOpenDrawer, onOpenSearch }) {
  const [menu, setMenu] = useState(null);
  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" aria-label="Mở danh sách trang" onClick={onOpenDrawer}>
        <MenuIcon />
      </button>
      <div className="breadcrumb">
        {title && <span className="crumb">{title}</span>}
        {currentPage && (
          <span className="crumb">
            {ctx.titleOf(currentPage) || UNTITLED}
          </span>
        )}
      </div>
      <div className="topbar-actions">
        <SyncIndicator />
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
            { label: 'Chuyển vào thùng rác', icon: <TrashIcon size={16} />, danger: true, onClick: () => ctx.onTrash(currentPage.id) },
          ]}
        />
      )}
    </header>
  );
}
