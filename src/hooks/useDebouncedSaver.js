import { useCallback, useEffect, useMemo, useRef } from 'react';
import { registerFlush } from '../lib/flushRegistry.js';

// Lưu sau khi ngừng thay đổi `delay` ms, và lưu ngay khi:
// - component unmount (rời trang),
// - app bị ẩn (chuyển app, khóa màn hình, đóng tab).
// Mục đích: không ghi Firestore theo từng phím gõ (gói miễn phí giới hạn 20k lượt ghi/ngày).
export function useDebouncedSaver(save, delay = 1500) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef(null);
  const dirty = useRef(false);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    saveRef.current();
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    const unregister = registerFlush(flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      unregister();
      flush();
    };
  }, [flush]);

  // isDirty: còn thay đổi chưa lưu hay không
  const isDirty = useCallback(() => dirty.current, []);
  return useMemo(() => ({ schedule, flush, isDirty }), [schedule, flush, isDirty]);
}
