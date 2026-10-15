import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildList } from './tree.js';
import { track } from './syncStatus.js';

// Toàn bộ dữ liệu của Drafts nằm dưới users/{uid}/
export const pagesCol = (uid) => collection(db, 'users', uid, 'pages');
export const pageRef = (uid, id) => doc(db, 'users', uid, 'pages', id);
export const contentRef = (uid, id) => doc(db, 'users', uid, 'contents', id);

// Một batch Firestore tối đa 500 thao tác: chia nhỏ khi đánh số lại danh sách dài
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

// Order lớn nhất trong danh sách + 1 (để thêm vào cuối)
export function nextOrder(pages) {
  const { list } = buildList(pages);
  return list.length ? list[list.length - 1].order + 1 : 1;
}

// Tạo trang mới ở cuối danh sách kèm document nội dung rỗng.
// Trả về id ngay (không chờ server, chạy được offline).
export function createPage(uid, pages, { title = '', icon = null, blocks = '[]' } = {}) {
  const ref = doc(pagesCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    title,
    icon,
    parentId: null, // danh sách phẳng, chưa dùng phân cấp
    order: nextOrder(pages),
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

// Đổi thứ tự. `orders` là danh sách { id, order } cần ghi (nhiều trang khi phải đánh số lại)
export function reorderPages(uid, orders) {
  return commitInChunks(
    orders.map(({ id, order }) => (batch) => batch.update(pageRef(uid, id), { order, updatedAt: serverTimestamp() })),
  );
}

// Đưa trang vào thùng rác
export function trashPage(uid, id) {
  return track(updateDoc(pageRef(uid, id), { trashedAt: Timestamp.now() }));
}

// Khôi phục trang về đúng vị trí cũ trong danh sách
export function restorePage(uid, id) {
  return track(updateDoc(pageRef(uid, id), { trashedAt: null }));
}

// Xóa vĩnh viễn trang và nội dung của nó
export function deletePageForever(uid, id) {
  const batch = writeBatch(db);
  batch.delete(pageRef(uid, id));
  batch.delete(contentRef(uid, id));
  return track(batch.commit());
}
