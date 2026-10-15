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
