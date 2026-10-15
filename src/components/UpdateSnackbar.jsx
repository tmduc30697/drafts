import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flushAll } from '../lib/flushRegistry.js';

// App PWA có thể mở liên tục nhiều ngày: kiểm tra bản mới mỗi giờ
const CHECK_INTERVAL = 60 * 60 * 1000;

// Có bản mới thì hiện snackbar; chỉ cập nhật (reload) khi người dùng bấm
export default function UpdateSnackbar() {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) registration.update();
      }, CHECK_INTERVAL);
    },
  });

  // Mở lại app từ nền cũng kiểm tra bản mới
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        navigator.serviceWorker?.getRegistration().then((r) => r?.update());
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!needRefresh) return null;

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
