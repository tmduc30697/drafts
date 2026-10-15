import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildTree, descendantsOf } from './tree.js';
import { track } from './syncStatus.js';

// Toàn bộ dữ liệu của Drafts nằm dưới users/{uid}/
export const pagesCol = (uid) => collection(db, 'users', uid, 'pages');
export const pageRef = (uid, id) => doc(db, 'users', uid, 'pages', id);
export const contentRef = (uid, id) => doc(db, 'users', uid, 'contents', id);

// Một batch Firestore tối đa 500 thao tác: chia nhỏ khi xử lý cây lớn
async function commitInChunks(ops) {
  const CHUNK = 450;
  const commits = [];
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + CHUNK)) op(batch);
    commits.push(track(batch.commit()));
  }
  return Promise.all(commits);
}

// Order lớn nhất trong các trang con của parentId + 1 (để thêm vào cuối)
export function nextOrder(pages, parentId) {
  const siblings = buildTree(pages).childrenOf(parentId);
  return siblings.length ? siblings[siblings.length - 1].order + 1 : 1;
}

// Tạo trang mới kèm document nội dung rỗng, trả về id ngay (không chờ server, chạy được offline)
export function createPage(uid, pages, { parentId = null, title = '', icon = null, blocks = '[]' } = {}) {
  const ref = doc(pagesCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    title,
    icon,
    parentId,
    order: nextOrder(pages, parentId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    trashedAt: null,
  });
  // Tạo sẵn nội dung để mở trang offline ngay không phải chờ server
  batch.set(contentRef(uid, ref.id), { blocks, updatedAt: serverTimestamp() });
  track(batch.commit());
  return ref.id;
}

// Sửa metadata (title, icon) của một trang
export function updatePage(uid, id, fields) {
  return track(updateDoc(pageRef(uid, id), { ...fields, updatedAt: serverTimestamp() }));
}

// Đổi cha/thứ tự. `orders` là danh sách {id, order} cần ghi (đánh số lại anh em khi cần)
export function movePage(uid, id, parentId, orders) {
  return commitInChunks(
    orders.map(({ id: pid, order }) => (batch) => {
      const fields = { order, updatedAt: serverTimestamp() };
      if (pid === id) fields.parentId = parentId;
      batch.update(pageRef(uid, pid), fields);
    }),
  );
}

// Đưa trang và toàn bộ trang con chưa xóa vào thùng rác, cùng một mốc trashedAt
// (cùng mốc để khi khôi phục biết trang con nào bị xóa chung với trang cha)
export function trashPage(uid, pages, id) {
  const now = Timestamp.now();
  const targets = [id, ...descendantsOf(pages, id).filter((p) => !p.trashedAt).map((p) => p.id)];
  return commitInChunks(
    targets.map((pid) => (batch) => batch.update(pageRef(uid, pid), { trashedAt: now })),
  );
}

// Khôi phục trang và các trang con bị xóa cùng lúc với nó
export function restorePage(uid, pages, id) {
  const page = pages.find((p) => p.id === id);
  if (!page) return Promise.resolve();
  const group = descendantsOf(pages, id).filter((p) => p.trashedAt === page.trashedAt);
  // Nếu trang cha vẫn ở thùng rác hoặc đã bị xóa hẳn thì đưa trang ra cấp gốc
  const parent = page.parentId && pages.find((p) => p.id === page.parentId);
  const parentAlive = parent && !parent.trashedAt;
  const ops = [
    (batch) =>
      batch.update(pageRef(uid, id), {
        trashedAt: null,
        ...(parentAlive ? {} : { parentId: null, order: nextOrder(pages, null) }),
      }),
    ...group.map((p) => (batch) => batch.update(pageRef(uid, p.id), { trashedAt: null })),
  ];
  return commitInChunks(ops);
}

// Xóa vĩnh viễn trang, toàn bộ trang con và nội dung của chúng
export function deletePageForever(uid, pages, id) {
  const ids = [id, ...descendantsOf(pages, id).map((p) => p.id)];
  return commitInChunks(
    ids.flatMap((pid) => [
      (batch) => batch.delete(pageRef(uid, pid)),
      (batch) => batch.delete(contentRef(uid, pid)),
    ]),
  );
}
