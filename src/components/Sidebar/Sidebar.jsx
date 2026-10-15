import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase.js';
import { LogoutIcon, PlusIcon, RestoreIcon } from '../icons.jsx';
import { APP_VERSION, BUILD_TIME, checkForUpdate } from '../../lib/updates.js';
import Menu from '../Menu.jsx';
import PageList from './PageList.jsx';
import { ListDnd } from './ListDnd.jsx';

const buildTimeText = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(BUILD_TIME);

// Sidebar: danh sách trang + nút tạo trang, tài khoản ở dưới cùng
export default function Sidebar({ user, list, ctx }) {
  const [userMenu, setUserMenu] = useState(null);

  return (
    <nav className="sidebar-inner">
      <div className="sidebar-section">Trang</div>
      <div className="sidebar-tree">
        <ListDnd uid={user.uid} list={list} titleOf={ctx.titleOf}>
          <PageList list={list} ctx={ctx} />
        </ListDnd>
        <button className="sidebar-item" onClick={ctx.onCreate}>
          <PlusIcon size={16} />
          <span>Trang mới</span>
        </button>
      </div>

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
      )}
    </nav>
  );
}
