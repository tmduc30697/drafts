// Theo dõi trạng thái ghi Firestore để hiện biểu tượng đồng bộ:
// - pending: số lần ghi đang chờ server xác nhận (hiện icon xoay),
// - lỗi: Firestore tự xếp hàng các lần ghi khi offline, nên promise chỉ reject khi
//   server từ chối thật sự (vd. sai Rules, document quá 1 MB).

let lastError = null;
let pending = 0;
const errorListeners = new Set();
const pendingListeners = new Set();

function emitError() {
  for (const fn of errorListeners) fn(lastError);
}

function emitPending() {
  for (const fn of pendingListeners) fn(pending);
}

export function subscribeSyncError(fn) {
  errorListeners.add(fn);
  fn(lastError);
  return () => errorListeners.delete(fn);
}

// Số lần ghi đang chờ server xác nhận
export function subscribeSyncPending(fn) {
  pendingListeners.add(fn);
  fn(pending);
  return () => pendingListeners.delete(fn);
}

// Ghi nhận lỗi từ nơi khác (vd. listener bị server từ chối)
export function reportSyncError(err) {
  console.error('Lỗi đồng bộ Firestore:', err);
  lastError = err;
  emitError();
}

// Bọc một lần ghi: đếm đang chờ; thành công thì xóa lỗi cũ, thất bại thì ghi nhận lỗi
export function track(promise) {
  pending++;
  emitPending();
  const done = () => {
    pending--;
    emitPending();
  };
  promise.then(
    () => {
      done();
      if (lastError) {
        lastError = null;
        emitError();
      }
    },
    (err) => {
      done();
      // 'not-found': lần ghi nhắm vào trang/tài liệu đã bị xóa ở máy khác (vd. xóa ở app khác trong lúc máy này còn lần ghi chờ
      // trong cache). Không có gì để đồng bộ nữa nên không coi là lỗi, tránh icon cảnh báo nháy mãi.
      if (err?.code === 'not-found') return;
      reportSyncError(err);
    },
  );
  return promise;
}

// Cho icon đồng bộ xoay một nhịp dù không có gì để ghi (phản hồi khi bấm ⌘S)
export function pulseSync() {
  track(new Promise((resolve) => setTimeout(resolve, 600)));
}
