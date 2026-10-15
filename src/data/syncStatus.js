// Theo dõi lỗi ghi Firestore để hiện biểu tượng "lỗi đồng bộ".
// Firestore tự xếp hàng các lần ghi khi offline, nên promise chỉ reject khi
// server từ chối thật sự (vd. sai Rules, document quá 1 MB).

let lastError = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(lastError);
}

export function subscribeSyncError(fn) {
  listeners.add(fn);
  fn(lastError);
  return () => listeners.delete(fn);
}

// Ghi nhận lỗi từ nơi khác (vd. listener bị server từ chối)
export function reportSyncError(err) {
  console.error('Lỗi đồng bộ Firestore:', err);
  lastError = err;
  emit();
}

// Bọc một lần ghi: thành công thì xóa lỗi cũ, thất bại thì ghi nhận lỗi
export function track(promise) {
  promise.then(
    () => {
      if (lastError) {
        lastError = null;
        emit();
      }
    },
    reportSyncError,
  );
  return promise;
}
