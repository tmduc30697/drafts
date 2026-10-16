import { useEffect, useState } from 'react';
import { subscribeSyncError, subscribeSyncPending } from '../data/syncStatus.js';
import { CloudOffIcon, SyncIcon } from './icons.jsx';
import { Popover } from './Menu.jsx';

// Offline / lỗi đồng bộ: icon mây gạch chéo. Đang ghi lên Firebase: icon đồng bộ xoay. Bình thường không hiện gì
export default function SyncIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const unsubscribe = subscribeSyncError(setError);
    // Giữ icon xoay ít nhất 600ms để lần ghi nhanh không chỉ nháy một cái
    let since = 0;
    let timer = null;
    const unsubscribePending = subscribeSyncPending((n) => {
      clearTimeout(timer);
      if (n > 0) {
        if (!since) since = Date.now();
        setSyncing(true);
      } else if (since) {
        timer = setTimeout(() => {
          since = 0;
          setSyncing(false);
        }, Math.max(0, 600 - (Date.now() - since)));
      }
    });
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      unsubscribe();
      unsubscribePending();
      clearTimeout(timer);
    };
  }, []);

  if (online && !error) {
    if (!syncing) return null;
    return (
      <span className="sync-indicator syncing" title="Đang đồng bộ lên Firebase…" aria-label="Đang đồng bộ">
        <SyncIcon size={16} />
      </span>
    );
  }
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
