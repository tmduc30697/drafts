import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase.js';
import { LogoutIcon, PlusIcon, SearchIcon, TrashIcon } from '../icons.jsx';
import Menu from '../Menu.jsx';
import PageTree from './PageTree.jsx';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export default function Sidebar({ user, tree, ctx, route, onOpenSearch, onNavigate }) {
  const [userMenu, setUserMenu] = useState(null);

  return (
    <nav className="sidebar-inner">
      <button className="sidebar-user" onClick={(e) => setUserMenu(userMenu ? null : e.currentTarget)}>
        {user.photoURL ? (
          <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar avatar-fallback">{(user.displayName || '?')[0]}</span>
        )}
        <span className="sidebar-user-name">{user.displayName || user.email}</span>
      </button>
      {userMenu && (
        <Menu
          anchor={userMenu}
          onClose={() => setUserMenu(null)}
          header={<div className="menu-header">{user.email}</div>}
          items={[{ label: 'Đăng xuất', icon: <LogoutIcon size={16} />, onClick: () => signOut(auth) }]}
        />
      )}

      <button className="sidebar-item" onClick={onOpenSearch}>
        <SearchIcon size={16} />
        <span>Tìm kiếm</span>
        <kbd className="sidebar-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <button className="sidebar-item" onClick={() => ctx.onCreate(null)}>
        <PlusIcon size={16} />
        <span>Trang mới</span>
      </button>

      <div className="sidebar-section">Trang</div>
      <div className="sidebar-tree">
        <PageTree tree={tree} ctx={ctx} />
        {tree.roots.length === 0 && <div className="tree-empty">Chưa có trang nào</div>}
      </div>

      <a
        className={`sidebar-item sidebar-trash ${route.view === 'trash' ? 'active' : ''}`}
        href="#/trash"
        onClick={onNavigate}
      >
        <TrashIcon size={16} />
        <span>Thùng rác</span>
      </a>
    </nav>
  );
}
