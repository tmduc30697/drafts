import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildList, isCollection, nextOrderAt } from './tree.js';
import { track } from './syncStatus.js';
import { refRef } from './references.js';

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

// Order để thêm vào cuối một cấp (null = gốc, hoặc id collection)
export function nextOrder(pages, parentId = null) {
  return nextOrderAt(buildList(pages), parentId);
}

// Tạo trang mới ở cuối gốc hoặc cuối một collection, kèm document nội dung rỗng.
// Trả về id ngay (không chờ server, chạy được offline).
export function createPage(uid, pages, { title = '', text = '', parentId = null } = {}) {
  const ref = doc(pagesCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    title,
    parentId,
    order: nextOrder(pages, parentId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Tạo sẵn nội dung để mở trang offline ngay không phải chờ server
  batch.set(contentRef(uid, ref.id), { text, updatedAt: serverTimestamp() });
  track(batch.commit());
  return ref.id;
}

// Tạo collection (nhóm trang, chỉ một cấp) ở cuối gốc. Không có nội dung. Trả về id ngay.
export function createCollection(uid, pages, { title = '' } = {}) {
  const ref = doc(pagesCol(uid));
  track(
    writeBatch(db)
      .set(ref, {
        kind: 'collection',
        title,
        parentId: null,
        order: nextOrder(pages),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      .commit(),
  );
  return ref.id;
}

// Xóa vĩnh viễn collection cùng mọi trang bên trong (nội dung và tài liệu đính kèm của từng trang)
export function deleteCollection(uid, pages, id) {
  const children = buildList(pages).childrenOf.get(id) || [];
  return commitInChunks([
    (batch) => batch.delete(pageRef(uid, id)),
    ...children.flatMap((p) => [
      (batch) => batch.delete(pageRef(uid, p.id)),
      (batch) => batch.delete(contentRef(uid, p.id)),
      (batch) => batch.delete(refRef(uid, p.id)),
    ]),
  ]);
}

// Trang nào cũng phải thuộc một collection: gom các trang đang nằm ở gốc (dữ liệu trước khi có collection)
// vào collection "Chung" (dùng lại nếu đã có), giữ nguyên thứ tự. Trả về { id collection, done: promise kết quả ghi }, không có gì để gom thì null.
export const DEFAULT_COLLECTION = 'Chung';
export function adoptRootPages(uid, pages) {
  const tree = buildList(pages);
  const roots = tree.items.filter((p) => !isCollection(p));
  if (!roots.length) return null;
  const existing = tree.items.find((p) => isCollection(p) && p.title === DEFAULT_COLLECTION);
  const id = existing ? existing.id : doc(pagesCol(uid)).id;
  const start = existing ? nextOrderAt(tree, id) : 1;
  const done = commitInChunks([
    ...(existing
      ? []
      : [
          (batch) =>
            batch.set(pageRef(uid, id), {
              kind: 'collection',
              title: DEFAULT_COLLECTION,
              parentId: null,
              order: roots[0].order, // đứng đúng chỗ trang đầu tiên được gom
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
        ]),
    ...roots.map((p, i) => (batch) => batch.update(pageRef(uid, p.id), { parentId: id, order: start + i, updatedAt: serverTimestamp() })),
  ]);
  return { id, done };
}

// Sửa metadata (vd. title) của một trang
export function updatePage(uid, id, fields) {
  return track(updateDoc(pageRef(uid, id), { ...fields, updatedAt: serverTimestamp() }));
}

// Đổi thứ tự / chuyển cấp. `orders` là danh sách { id, order, parentId? } cần ghi
// (nhiều mục khi phải đánh số lại; parentId có mặt khi mục chuyển vào / ra collection)
export function reorderPages(uid, orders) {
  return commitInChunks(
    orders.map(({ id, order, parentId }) => (batch) =>
      batch.update(pageRef(uid, id), {
        order,
        ...(parentId !== undefined ? { parentId } : {}),
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

// Xóa vĩnh viễn trang và nội dung của nó
export function deletePage(uid, id) {
  const batch = writeBatch(db);
  batch.delete(pageRef(uid, id));
  batch.delete(contentRef(uid, id));
  batch.delete(refRef(uid, id)); // tài liệu tham khảo đi kèm (nếu có)
  return track(batch.commit());
}
