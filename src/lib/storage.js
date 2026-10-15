// localStorage có thể bị chặn (chế độ riêng tư...), nên mọi truy cập đều bọc try/catch

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bỏ qua: chỉ là tiện ích trên từng máy
  }
}
