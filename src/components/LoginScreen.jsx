import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
import Logo from './Logo.jsx';

// Chuyển mã lỗi Firebase thành câu dễ hiểu
function describeError(err) {
  switch (err?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // người dùng tự đóng, không cần báo
    case 'auth/popup-blocked':
      return 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.';
    case 'auth/network-request-failed':
      return 'Không có kết nối mạng. Cần mạng cho lần đăng nhập đầu tiên.';
    case 'auth/unauthorized-domain':
      return 'Tên miền này chưa được thêm vào Authorized domains trong Firebase.';
    default:
      return `Đăng nhập thất bại (${err?.code || err?.message || 'không rõ lỗi'}).`;
  }
}

// Ứng dụng đã cài lên màn hình chính iPhone (chế độ standalone)
const isStandaloneIOS = window.navigator.standalone === true;

export default function LoginScreen() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);

  // Gọi signInWithPopup NGAY trong sự kiện click, không await gì trước đó,
  // để Safari coi đây là thao tác của người dùng và không chặn popup.
  const handleClick = () => {
    setError(null);
    setPending(true);
    setSlow(false);
    // Popup có thể không mở/không trả về trên PWA iOS: sau 12 giây mở khóa nút và gợi ý
    const timer = setTimeout(() => setSlow(true), 12000);
    signInWithPopup(auth, googleProvider)
      .catch((err) => setError(describeError(err)))
      .finally(() => {
        clearTimeout(timer);
        setPending(false);
        setSlow(false);
      });
  };

  return (
    <div className="center-screen login">
      <Logo size={72} />
      <h1 className="login-title">Drafts</h1>
      <button className="btn login-btn" onClick={handleClick} disabled={pending && !slow}>
        <GoogleIcon />
        {pending && !slow ? 'Đang mở cửa sổ đăng nhập…' : 'Đăng nhập bằng Google'}
      </button>
      {slow && (
        <p className="login-note">
          Cửa sổ đăng nhập không phản hồi?{' '}
          {isStandaloneIOS
            ? 'Hãy đóng hẳn app rồi mở lại và bấm lại nút. Nếu vẫn không được, mở trang này trong Safari để đăng nhập.'
            : 'Hãy kiểm tra trình duyệt có đang chặn popup không rồi bấm lại.'}
        </p>
      )}
      {error && <p className="login-error">{error}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
