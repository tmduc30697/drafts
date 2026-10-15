import { useEffect, useState } from 'react';
import { subscribeSyncError } from '../data/syncStatus.js';
import { CloudOffIcon } from './icons.jsx';
import { Popover } from './Menu.jsx';

// Chỉ hiện khi đang offline hoặc có lỗi đồng bộ; bình thường không hiện gì
export default function SyncIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const unsubscribe = subscribeSyncError(setError);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      unsubscribe();
    };
  }, []);

  if (online && !error) return null;
  const message = !online
    ? 'Đang offline. Thay đổi được lưu trên máy và sẽ tự đồng bộ khi có mạng.'
    : `Lỗi đồng bộ: ${error.code || error.message}`;
  // Bấm vào để xem giải thích (điện thoại không có tooltip khi rê chuột)
  return (
    <>
      <button
        className={`sync-indicator ${error && online ? 'error' : ''}`}
        title={message}
        aria-label={message}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <CloudOffIcon size={18} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} className="sync-popover">
          {message}
        </Popover>
      )}
    </>
  );
}
