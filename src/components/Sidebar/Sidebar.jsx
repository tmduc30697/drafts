import { useState, useSyncExternalStore } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase.js';
import { DocIcon, FolderIcon, LogoutIcon, RestoreIcon, ChevronsLeftIcon, ChevronsRightIcon } from '../icons.jsx';
import { UNTITLED } from '../../data/tree.js';
import { APP_VERSION, BUILD_TIME, checkForUpdate } from '../../lib/updates.js';
import Menu from '../Menu.jsx';
import SyncIndicator from '../SyncIndicator.jsx';
import PageList from './PageList.jsx';
import { ListDnd } from './ListDnd.jsx';

const buildTimeText = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(BUILD_TIME);

const desktopQuery = window.matchMedia('(min-width: 768px)');
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      desktopQuery.addEventListener('change', cb);
      return () => desktopQuery.removeEventListener('change', cb);
    },
    () => desktopQuery.matches,
  );
}

function Avatar({ user }) {
  return user.photoURL ? (
    <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-fallback">{(user.displayName || '?')[0]}</span>
  );
}

// Sidebar: danh sách trang + nút tạo trang, tài khoản ở dưới cùng.
// Thu gọn (desktop) thì chỉ còn một dải dọc: icon từng trang + tài khoản.
export default function Sidebar({ user, tree, ctx, collapsed, onToggle }) {
  const { list } = tree;
  const [userMenu, setUserMenu] = useState(null);
  const isDesktop = useIsDesktop();
  const rail = collapsed && isDesktop;
  const toggleUserMenu = (e) => setUserMenu(userMenu ? null : e.currentTarget);

  const menu = userMenu && (
    <Menu
      anchor={userMenu}
      onClose={() => setUserMenu(null)}
      header={
        <div className="menu-header">
          <div>{user.email}</div>
          <div className="menu-version">
            Phiên bản {APP_VERSION} · {buildTimeText}
          </div>
        </div>
      }
      items={[
        { label: 'Kiểm tra cập nhật', icon: <RestoreIcon size={16} />, onClick: () => checkForUpdate({ silent: false }) },
        { label: 'Đăng xuất', icon: <LogoutIcon size={16} />, onClick: () => signOut(auth) },
      ]}
    />
  );

  if (rail) {
    return (
      <nav className="sidebar-rail">
        <button className="icon-btn small" aria-label="Mở sidebar" title="Mở sidebar" onClick={onToggle}>
          <ChevronsRightIcon size={16} />
        </button>
        <div className="rail-pages">
          {list.map((page) => {
            const title = ctx.titleOf(page) || UNTITLED;
            return (
              <a
                key={page.id}
                className={`rail-btn ${ctx.currentId === page.id ? 'active' : ''}`}
                href={`#/p/${page.id}`}
                title={title}
                aria-label={title}
                draggable={false}
              >
                <DocIcon size={18} />
              </a>
            );
          })}
        </div>
        <button className="rail-btn rail-user" aria-label="Tài khoản" title={user.displayName || user.email} onClick={toggleUserMenu}>
          <Avatar user={user} />
        </button>
        {menu}
      </nav>
    );
  }

  return (
    <nav className="sidebar-inner">
      <div className="sidebar-head">
        <span className="desktop-only">
          <SyncIndicator />
        </span>
        <button className="icon-btn small" aria-label="Thu gọn sidebar" title="Thu gọn sidebar" onClick={onToggle}>
          <ChevronsLeftIcon size={16} />
        </button>
      </div>
      <div className="sidebar-tree">
        <ListDnd uid={user.uid} tree={tree} titleOf={ctx.titleOf} onDropInside={ctx.expand}>
          <PageList tree={tree} ctx={ctx} />
        </ListDnd>
        <button className="sidebar-item" onClick={ctx.onCreateCollection}>
          <FolderIcon size={16} />
          <span>Collection mới</span>
        </button>
      </div>

      <button className="sidebar-user" onClick={toggleUserMenu}>
        <Avatar user={user} />
        <span className="sidebar-user-name">{user.displayName || user.email}</span>
      </button>
      {menu}
    </nav>
  );
}
