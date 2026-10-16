// Các hàm thuần xử lý danh sách trang (không gọi Firestore).
// Hai cấp: ở gốc chỉ có collection, trang nằm trong collection (không lồng collection).
// Trang nằm ở gốc chỉ còn ở dữ liệu cũ (trước khi có collection); app tự gom chúng vào collection (adoptRootPages).
// Mỗi cấp sắp xếp theo `order` riêng.

function byOrder(a, b) {
  return a.order - b.order || a.createdAt - b.createdAt;
}

export const isCollection = (p) => p.kind === 'collection';

// items: các mục ở gốc (trang + collection) theo thứ tự
// childrenOf: id collection -> các trang bên trong theo thứ tự
// list: tất cả trang (không gồm collection) theo đúng thứ tự hiển thị — dùng để chọn trang kế bên, trang đầu tiên...
// byId: tra cứu cả trang lẫn collection
export function buildList(pages) {
  // Trang có trashedAt là trang đã vào thùng rác ở bản cũ (đã bỏ thùng rác): ẩn đi
  const visible = pages.filter((p) => !p.trashedAt);
  const byId = new Map(visible.map((p) => [p.id, p]));
  const childrenOf = new Map();
  const items = [];
  for (const p of visible) {
    const parent = !isCollection(p) && p.parentId ? byId.get(p.parentId) : null;
    // Collection cha không còn (hoặc cha không phải collection): coi như trang ở gốc
    if (parent && isCollection(parent)) {
      if (!childrenOf.has(parent.id)) childrenOf.set(parent.id, []);
      childrenOf.get(parent.id).push(p);
    } else items.push(p);
  }
  items.sort(byOrder);
  for (const children of childrenOf.values()) children.sort(byOrder);
  const list = items.flatMap((p) => (isCollection(p) ? childrenOf.get(p.id) || [] : [p]));
  return { items, childrenOf, list, byId };
}

// Cấp chứa mục p: id collection cha, null = gốc
export function levelOf(tree, p) {
  if (isCollection(p)) return null;
  const parent = p.parentId ? tree.byId.get(p.parentId) : null;
  return parent && isCollection(parent) ? parent.id : null;
}

// Các mục cùng cấp (gốc hoặc trong một collection)
export function siblingsAt(tree, parentId) {
  return parentId ? tree.childrenOf.get(parentId) || [] : tree.items;
}

// Order cho mục mới thêm vào cuối một cấp
export function nextOrderAt(tree, parentId) {
  const siblings = siblingsAt(tree, parentId);
  return siblings.length ? siblings[siblings.length - 1].order + 1 : 1;
}

// Giá trị order nằm giữa hai mục lân cận (null = không có lân cận phía đó)
export function orderBetween(before, after) {
  if (before == null && after == null) return 1;
  if (before == null) return after - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

// Tính vị trí mới khi thả mục `activeId` vào chỗ `drop`:
//   { id, pos: 'before' | 'after' } — cạnh mục id (cùng cấp với nó),
//   { id, pos: 'inside' } — vào cuối collection id.
// Trả về danh sách { id, order, parentId? } cần ghi, hoặc null nếu không hợp lệ / không đổi gì.
export function computeMove(tree, activeId, drop) {
  const active = tree.byId.get(activeId);
  const target = tree.byId.get(drop.id);
  if (!active || !target || activeId === drop.id) return null;

  let parentId;
  let index;
  if (drop.pos === 'inside') {
    if (!isCollection(target) || isCollection(active)) return null;
    parentId = target.id;
    index = Infinity;
  } else {
    parentId = levelOf(tree, target);
    // Collection không vào được trong collection: thả cạnh trang con thì đặt cạnh collection chứa nó
    if (isCollection(active) && parentId) return computeMove(tree, activeId, { id: parentId, pos: drop.pos });
    // Trang phải thuộc một collection: không thả ra gốc
    if (!isCollection(active) && !parentId) return null;
  }

  const others = siblingsAt(tree, parentId).filter((p) => p.id !== activeId);
  if (index !== Infinity) index = others.findIndex((p) => p.id === target.id) + (drop.pos === 'after' ? 1 : 0);
  else index = others.length;
  const prev = others[index - 1];
  const next = others[index];
  const order = orderBetween(prev?.order, next?.order);
  const moved = levelOf(tree, active) !== parentId;
  const withParent = (o) => (moved ? { ...o, parentId } : o);

  // Khoảng cách giữa hai order quá sát (chia đôi nhiều lần) hoặc trùng nhau: đánh số lại cả cấp
  const tooClose = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
  if (tooClose(prev?.order, order) || tooClose(order, next?.order)) {
    const ordered = [...others.slice(0, index).map((p) => p.id), activeId, ...others.slice(index).map((p) => p.id)];
    return ordered.map((id, i) => (id === activeId ? withParent({ id, order: i + 1 }) : { id, order: i + 1 }));
  }
  return [withParent({ id: activeId, order })];
}

export const UNTITLED = 'Không có tiêu đề';
export const UNTITLED_COLLECTION = 'Collection không tên';
