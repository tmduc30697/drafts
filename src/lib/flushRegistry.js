// Danh sách các hàm "lưu ngay" đang hoạt động (tiêu đề, nội dung trang...).
// Dùng khi cần ép lưu hết trước khi tải lại app (vd. cập nhật bản mới).
const flushers = new Set();

export function registerFlush(fn) {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export function flushAll() {
  for (const fn of flushers) fn();
}
