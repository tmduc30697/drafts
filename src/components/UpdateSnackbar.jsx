import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flushAll } from '../lib/flushRegistry.js';
import { checkForUpdate, registerUpdateUI } from '../lib/updates.js';

// Kiểm tra bản mới định kỳ (chỉ tải lại file sw.js nhỏ nên rất nhẹ)
const CHECK_INTERVAL = 10 * 60 * 1000;

// Có bản mới thì hiện snackbar; chỉ cập nhật (reload) khi người dùng bấm.
// Ngoài ra hiện các thông báo ngắn (vd. kết quả "Kiểm tra cập nhật").
export default function UpdateSnackbar() {
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => checkForUpdate(), CHECK_INTERVAL);
    },
  });

  useEffect(() => {
    registerUpdateUI({ toast: setToast, showUpdate: () => setNeedRefresh(true) });
  }, [setNeedRefresh]);

  // Thông báo ngắn tự ẩn sau 3 giây
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Quay lại app (từ nền trên điện thoại, hoặc focus lại cửa sổ trên máy tính) thì kiểm tra bản mới
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && checkForUpdate();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (needRefresh) {
    const update = () => {
      setUpdating(true);
      // Lưu hết thay đổi đang chờ, đợi chút để Firestore ghi vào cache trên máy rồi mới tải lại
      flushAll();
      setTimeout(() => updateServiceWorker(true), 400);
    };
    return (
      <div className="snackbar" role="status">
        <span>Có bản mới</span>
        <button className="snackbar-action" onClick={update} disabled={updating}>
          Cập nhật
        </button>
        <button className="snackbar-close" onClick={() => setNeedRefresh(false)} aria-label="Để sau">
          ×
        </button>
      </div>
    );
  }

  return toast ? (
    <div className="snackbar snackbar-toast" role="status">
      {toast}
    </div>
  ) : null;
}
