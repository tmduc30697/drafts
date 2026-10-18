import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePages } from '../hooks/usePages.js';
import { goHome, goToPage, useHashRoute } from '../hooks/useHashRoute.js';
import { buildList, isCollection, levelOf, UNTITLED, UNTITLED_COLLECTION } from '../data/tree.js';
import { adoptRootPages, createCollection, createPage, deleteCollection, deletePage, updatePage } from '../data/pages.js';
import { ensureOnboarding } from '../data/onboarding.js';
import { loadJSON, saveJSON } from '../lib/storage.js';
import { flushAll } from '../lib/flushRegistry.js';
import { pulseSync } from '../data/syncStatus.js';
import { ChevronsRightIcon, FolderIcon } from './icons.jsx';
import Sidebar from './Sidebar/Sidebar.jsx';
import SyncIndicator from './SyncIndicator.jsx';

// Editor tách thành chunk riêng để màn hình đăng nhập và sidebar hiện nhanh
const PageView = lazy(() => import('./PageView/PageView.jsx'));

const SIDEBAR_DEFAULT = 260;
const clampSidebar = (w) => Math.min(480, Math.max(180, Number.isFinite(w) ? Math.round(w) : SIDEBAR_DEFAULT));

// Khung làm việc sau khi đăng nhập: sidebar + vùng nội dung
export default function Workspace({ user }) {
  const uid = user.uid;
  const { pages, loaded } = usePages(uid);
  const tree = useMemo(() => buildList(pages), [pages]);
  const { list, byId } = tree;
  const route = useHashRoute();
  const currentId = route.view === 'page' ? route.id : null;
  // Collection không có nội dung: không mở như một trang
  const currentPage = currentId && byId.get(currentId) && !isCollection(byId.get(currentId)) ? byId.get(currentId) : null;

  // Collection đang mở trong sidebar (nhớ theo máy)
  const expandedKey = `drafts:expanded:${uid}`;
  const [expanded, setExpanded] = useState(() => new Set(loadJSON(expandedKey, [])));
  const setExpandedSaved = useCallback(
    (fn) =>
      setExpanded((prev) => {
        const next = fn(new Set(prev));
        saveJSON(expandedKey, [...next]);
        return next;
      }),
    [expandedKey],
  );
  // Đang mở trang nằm trong collection: tự mở collection đó để thấy trang trong sidebar
  const currentParent = currentPage ? levelOf(tree, currentPage) : null;
  // (chỉ khi chuyển sang collection khác, để vẫn đóng được collection đang chứa trang hiện tại)
  useEffect(() => {
    if (currentParent) setExpandedSaved((s) => s.add(currentParent));
  }, [currentParent, setExpandedSaved]);
  // Collection vừa tạo: sidebar cho đặt tên ngay
  const [renameId, setRenameId] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Thu gọn sidebar (desktop), nhớ theo máy
  const collapsedKey = 'drafts:sidebar-collapsed';
  const [collapsed, setCollapsed] = useState(() => loadJSON(collapsedKey, false));
  const toggleSidebar = () => {
    // Điện thoại: mở/đóng drawer; desktop: thu gọn/mở rộng
    if (window.matchMedia('(max-width: 767px)').matches) {
      setDrawerOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      saveJSON(collapsedKey, !c);
      return !c;
    });
  };

  // Độ rộng sidebar (desktop): kéo mép phải để đổi, nhấp đúp để trả về mặc định; nhớ theo máy
  const widthKey = 'drafts:sidebar-width';
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebar(Number(loadJSON(widthKey, SIDEBAR_DEFAULT))));
  const startResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const app = e.currentTarget.parentElement;
    const left = app.getBoundingClientRect().left;
    let width = sidebarWidth;
    // Lúc kéo chỉ đổi biến CSS (không render lại cả app mỗi lần di chuột); thả ra mới lưu vào state
    const move = (ev) => {
      width = clampSidebar(ev.clientX - left);
      app.style.setProperty('--sidebar-width', `${width}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging-split');
      setSidebarWidth(width);
      saveJSON(widthKey, width);
    };
    document.body.classList.add('dragging-split');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resetWidth = () => {
    setSidebarWidth(SIDEBAR_DEFAULT);
    saveJSON(widthKey, SIDEBAR_DEFAULT);
  };

  // ⌘S / Ctrl+S: lưu ngay lên Firebase thay vì mở hộp thoại tải trang của trình duyệt.
  // Icon đồng bộ xoay theo lần ghi; không có gì cần lưu thì vẫn xoay một nhịp để biết đã nhận lệnh.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      flushAll();
      pulseSync();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

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

  // Trang nào cũng phải thuộc một collection: trang còn nằm ở gốc (dữ liệu cũ, hoặc tạo từ bản app cũ trên máy khác)
  // được gom vào collection "Chung". Chờ lần gom trước ghi xong (hết trang ở gốc) mới gom tiếp, tránh tạo trùng.
  // Trạng thái gom: 'idle' | 'running' | 'failed'. Nếu lần ghi bị server từ chối (vd. trang còn trong cache nhưng đã bị xóa ở máy khác)
  // thì KHÔNG thử lại trong phiên này: nếu không, app sẽ tự hoàn tác rồi thử mãi, icon đồng bộ xoay và nháy không dừng.
  const adoptState = useRef('idle');
  const rootPages = tree.items.filter((p) => !isCollection(p)).length;
  useEffect(() => {
    if (!loaded || !rootPages || adoptState.current !== 'idle') return;
    adoptState.current = 'running';
    const result = adoptRootPages(uid, pages);
    if (!result) {
      adoptState.current = 'idle';
      return;
    }
    setExpandedSaved((s) => s.add(result.id));
    result.done.then(
      () => {
        adoptState.current = 'idle';
      },
      () => {
        adoptState.current = 'failed';
      },
    );
  }, [loaded, rootPages, uid, pages, setExpandedSaved]);

  // Tài khoản mới: tạo trang "Bắt đầu" (kiểm tra một lần mỗi phiên, sau khi đã có danh sách trang)
  const onboardingChecked = useRef(false);
  useEffect(() => {
    if (!loaded || onboardingChecked.current) return;
    onboardingChecked.current = true;
    ensureOnboarding(uid, pages).then((id) => {
      if (id && window.location.hash.replace(/^#\/?/, '') === '') goToPage(id, { replace: true });
    });
  }, [loaded, uid, pages]);

  // Trang chưa đặt tên được gọi là "Page 1", "Page 2", ... theo thứ tự tạo (chỉ đếm các trang chưa có tên)
  const pageLabels = useMemo(() => {
    const untitled = list.filter((p) => !isCollection(p) && !p.title).sort((a, b) => a.createdAt - b.createdAt);
    return new Map(untitled.map((p, i) => [p.id, `Page ${i + 1}`]));
  }, [list]);

  const ctx = useMemo(
    () => ({
      currentId,
      titleOf: (p) => p.title || pageLabels.get(p.id) || '',
      onRename: (page, title) => {
        if (page.locked) return;
        if (title !== page.title) updatePage(uid, page.id, { title });
      },
      // Trang mới ở cuối collection parentId (trang nào cũng thuộc một collection); collection đó được mở ra
      onCreate: (parentId) => {
        const id = createPage(uid, pages, { parentId });
        setExpandedSaved((s) => s.add(parentId));
        setDrawerOpen(false);
        goToPage(id);
      },
      onCreateCollection: () => {
        const id = createCollection(uid, pages);
        setExpandedSaved((s) => s.add(id));
        setRenameId(id);
      },
      onDeleteCollection: (collection) => {
        const children = tree.childrenOf.get(collection.id) || [];
        const name = collection.title || UNTITLED_COLLECTION;
        const note = children.length ? ` ${children.length} trang bên trong cũng sẽ bị xóa vĩnh viễn.` : '';
        if (!window.confirm(`Xóa collection "${name}"?${note}`)) return;
        deleteCollection(uid, pages, collection.id);
        // Đang mở một trang trong collection này: chuyển sang trang đầu tiên còn lại
        if (children.some((p) => p.id === currentId)) {
          const next = list.find((p) => levelOf(tree, p) !== collection.id);
          saveJSON(lastKey, null);
          if (next) goToPage(next.id, { replace: true });
          else goHome();
        }
      },
      expanded,
      toggleExpanded: (id) => setExpandedSaved((s) => (s.delete(id) ? s : s.add(id))),
      expand: (id) => setExpandedSaved((s) => s.add(id)),
      renameId,
      clearRename: () => setRenameId(null),
      onDelete: (page) => {
        if (page.locked) return;
        // Xóa hẳn (không có thùng rác) nên hỏi lại trước
        const title = page.title || pageLabels.get(page.id);
        if (!window.confirm(`Xóa "${title || UNTITLED}"? Trang sẽ bị xóa vĩnh viễn.`)) return;
        const id = page.id;
        // Đang mở trang bị xóa thì chuyển sang trang kế bên (dưới, không có thì trên).
        // Chọn ngay tại đây vì danh sách chưa kịp cập nhật.
        deletePage(uid, id);
        if (id !== currentId) return;
        const i = list.findIndex((p) => p.id === id);
        const next = list[i + 1] || list[i - 1];
        saveJSON(lastKey, null);
        if (next) goToPage(next.id, { replace: true });
        else goHome();
      },
      onNavigate: () => setDrawerOpen(false),
    }),
    [currentId, uid, pages, list, tree, lastKey, expanded, setExpandedSaved, renameId, pageLabels],
  );

  return (
    <div
      className={`app ${drawerOpen ? 'drawer-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
    >
      <aside className="sidebar">
        <Sidebar user={user} tree={tree} ctx={ctx} collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Đổi độ rộng sidebar"
        title="Kéo để đổi độ rộng, nhấp đúp để trả về mặc định"
        onPointerDown={startResize}
        onDoubleClick={resetWidth}
      />
      <div className="backdrop" onClick={() => setDrawerOpen(false)} />

      <main className="main">
        <Topbar onToggleSidebar={toggleSidebar} />
        <div className="workarea">
          {!loaded ? (
            <div className="content" />
          ) : currentPage ? (
            <Suspense fallback={<div className="content" />}>
              <PageView key={currentPage.id} uid={uid} page={currentPage} displayTitle={currentPage.title || pageLabels.get(currentPage.id)} />
            </Suspense>
          ) : route.view === 'page' ? (
            <div className="content">
              <div className="center-screen muted">Trang không tồn tại hoặc đã bị xóa.</div>
            </div>
          ) : route.view === 'home' && list.length === 0 ? (
            <div className="content">
              <div className="center-screen">
                <p className="muted">Chưa có trang nào. Tạo collection rồi bấm ＋ trên collection để thêm trang.</p>
                <button className="btn" onClick={ctx.onCreateCollection}>
                  <FolderIcon size={16} /> Collection mới
                </button>
              </div>
            </div>
          ) : (
            <div className="content" />
          )}
        </div>
      </main>
    </div>
  );
}

// Thanh trên cùng: chỉ hiện trên điện thoại (nút mở drawer). Desktop không có thanh này.
function Topbar({ onToggleSidebar }) {
  return (
    <header className="topbar">
      <button className="icon-btn" aria-label="Mở danh sách trang" onClick={onToggleSidebar}>
        <ChevronsRightIcon />
      </button>
      <div className="breadcrumb" />
      <div className="topbar-actions">
        <SyncIndicator />
      </div>
    </header>
  );
}
