// Các hàm thuần xử lý danh sách trang (không gọi Firestore).
// Danh sách phẳng, không phân cấp cha/con; sắp xếp theo `order`.

function byOrder(a, b) {
  return a.order - b.order || a.createdAt - b.createdAt;
}

// Danh sách trang chưa xóa, đã sắp xếp, kèm tra cứu theo id
export function buildList(pages) {
  const list = pages.filter((p) => !p.trashedAt).sort(byOrder);
  return { list, byId: new Map(list.map((p) => [p.id, p])) };
}

// Giá trị order nằm giữa hai trang lân cận (null = không có lân cận phía đó)
export function orderBetween(before, after) {
  if (before == null && after == null) return 1;
  if (before == null) return after - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

// Tính thứ tự mới khi thả trang `activeId` vào trước/sau trang `targetId` (pos = 'before' | 'after').
// Trả về danh sách { id, order } cần ghi, hoặc null nếu không đổi gì.
export function computeMove(list, activeId, targetId, pos) {
  if (activeId === targetId) return null;
  const others = list.filter((p) => p.id !== activeId);
  const index = others.findIndex((p) => p.id === targetId) + (pos === 'after' ? 1 : 0);
  const prev = others[index - 1];
  const next = others[index];
  const order = orderBetween(prev?.order, next?.order);

  // Khoảng cách giữa hai order quá sát (chia đôi nhiều lần) hoặc trùng nhau: đánh số lại cả danh sách
  const tooClose = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
  if (tooClose(prev?.order, order) || tooClose(order, next?.order)) {
    const ordered = [...others.slice(0, index).map((p) => p.id), activeId, ...others.slice(index).map((p) => p.id)];
    return ordered.map((id, i) => ({ id, order: i + 1 }));
  }
  return [{ id: activeId, order }];
}

// Bỏ dấu tiếng Việt + chữ thường để tìm kiếm không phân biệt dấu
export function normalizeText(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export const UNTITLED = 'Không có tiêu đề';
