// Các hàm thuần xử lý cây trang (không gọi Firestore)

const ROOT = '__root__';

function byOrder(a, b) {
  return a.order - b.order || a.createdAt - b.createdAt;
}

// Nhóm trang theo cha. Chỉ tính trang chưa xóa;
// trang có cha không tồn tại hoặc đã vào thùng rác thì coi như trang gốc.
export function buildTree(pages) {
  const alive = pages.filter((p) => !p.trashedAt);
  const ids = new Set(alive.map((p) => p.id));
  const children = new Map();
  for (const p of alive) {
    const key = p.parentId && ids.has(p.parentId) ? p.parentId : ROOT;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(p);
  }
  for (const list of children.values()) list.sort(byOrder);
  const byId = new Map(alive.map((p) => [p.id, p]));
  return {
    byId,
    roots: children.get(ROOT) || [],
    childrenOf: (id) => children.get(id ?? ROOT) || [],
    // Cha thực tế trong cây (null nếu là trang gốc)
    parentOf: (id) => {
      const p = byId.get(id);
      return p?.parentId && ids.has(p.parentId) ? p.parentId : null;
    },
  };
}

// Tất cả con cháu của một trang (tính cả trang đã ở thùng rác), không gồm chính nó
export function descendantsOf(pages, id) {
  const children = new Map();
  for (const p of pages) {
    if (!p.parentId) continue;
    if (!children.has(p.parentId)) children.set(p.parentId, []);
    children.get(p.parentId).push(p);
  }
  const result = [];
  const stack = [...(children.get(id) || [])];
  while (stack.length) {
    const p = stack.pop();
    result.push(p);
    stack.push(...(children.get(p.id) || []));
  }
  return result;
}

// Chuỗi tổ tiên từ gốc đến trang (gồm cả trang), dùng cho breadcrumb và kết quả tìm kiếm
export function pathOf(byId, id) {
  const path = [];
  const seen = new Set();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return path;
}

// Giá trị order nằm giữa hai trang lân cận (null = không có lân cận phía đó)
export function orderBetween(before, after) {
  if (before == null && after == null) return 1;
  if (before == null) return after - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

// id có phải là chính ancestorId hoặc con cháu của nó không (dùng để chặn kéo trang vào trong chính nó)
export function isSelfOrDescendant(tree, ancestorId, id) {
  for (let cur = id; cur; cur = tree.parentOf(cur)) {
    if (cur === ancestorId) return true;
  }
  return false;
}

// Tính kết quả khi thả trang `activeId` vào trang `targetId`:
// pos = 'before' | 'after' | 'inside'. Trả về { parentId, orders: [{ id, order }] } hoặc null nếu không hợp lệ.
export function computeMove(tree, activeId, targetId, pos, isExpanded) {
  if (isSelfOrDescendant(tree, activeId, targetId)) return null;

  let parentId;
  let index; // vị trí chèn trong danh sách anh em (đã bỏ trang đang kéo)
  const targetChildren = tree.childrenOf(targetId).filter((p) => p.id !== activeId);

  if (pos === 'inside') {
    parentId = targetId;
    index = targetChildren.length;
  } else if (pos === 'after' && isExpanded(targetId) && targetChildren.length) {
    // Thả ngay dưới một trang đang mở rộng = thành trang con đầu tiên của nó
    parentId = targetId;
    index = 0;
  } else {
    parentId = tree.parentOf(targetId);
    const siblings = tree.childrenOf(parentId).filter((p) => p.id !== activeId);
    index = siblings.findIndex((p) => p.id === targetId) + (pos === 'after' ? 1 : 0);
  }

  const siblings = tree.childrenOf(parentId).filter((p) => p.id !== activeId);
  const prev = siblings[index - 1];
  const next = siblings[index];
  const order = orderBetween(prev?.order, next?.order);

  // Khoảng cách giữa hai order quá sát (chia đôi nhiều lần) hoặc trùng nhau: đánh số lại cả nhóm
  const tooClose = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
  if (tooClose(prev?.order, order) || tooClose(order, next?.order)) {
    const ordered = [...siblings.slice(0, index).map((p) => p.id), activeId, ...siblings.slice(index).map((p) => p.id)];
    return { parentId, orders: ordered.map((id, i) => ({ id, order: i + 1 })) };
  }
  return { parentId, orders: [{ id: activeId, order }] };
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
