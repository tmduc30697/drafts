import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';

// Khung làm việc sau khi đăng nhập (sẽ thêm sidebar và trang ở các bước sau)
export default function Workspace({ user }) {
  return (
    <div className="center-screen">
      <p>Xin chào {user.displayName}</p>
      <button className="btn" onClick={() => signOut(auth)}>Đăng xuất</button>
    </div>
  );
}
