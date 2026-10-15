// Kiểm tra bản mới của app (service worker) và hiện thông báo ngắn.
// UpdateSnackbar đăng ký các hàm hiển thị; nơi khác (menu) chỉ cần gọi checkForUpdate.

let ui = { toast: () => {}, showUpdate: () => {} };

export function registerUpdateUI(handlers) {
  ui = handlers;
}

// Phiên bản hiện tại: mã commit + thời điểm build (gắn lúc build trong vite.config.js)
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = new Date(__BUILD_TIME__);

// Hỏi server xem có bản mới không.
// silent = true: kiểm tra ngầm (định kỳ, khi quay lại app), không báo gì nếu không có bản mới.
export async function checkForUpdate({ silent = true } = {}) {
  const say = (msg) => !silent && ui.toast(msg);
  if (!navigator.onLine) return say('Đang offline, chưa kiểm tra được bản mới.');
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return say('Service worker chưa sẵn sàng.');
  try {
    await reg.update();
  } catch {
    return say('Không kiểm tra được bản mới.');
  }
  if (reg.waiting) {
    // Bản mới đã tải xong (có thể snackbar đã bị tắt trước đó): hiện lại
    ui.showUpdate();
  } else if (reg.installing) {
    // Đang tải bản mới; tải xong snackbar "Có bản mới" sẽ tự hiện
    say('Đang tải bản mới…');
  } else {
    say('Đang dùng bản mới nhất.');
  }
}
