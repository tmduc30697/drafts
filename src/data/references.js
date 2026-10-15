import { doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { track } from './syncStatus.js';

// Tài liệu tham khảo (file markdown import vào) gắn với một trang: users/{uid}/refs/{pageId}
// Hiển thị ở cột trái để đọc, phần ghi chú của trang nằm ở cột phải.
export const refRef = (uid, id) => doc(db, 'users', uid, 'refs', id);

// Firestore giới hạn 1 MB/document; chừa chỗ cho tên file và các trường khác
export const MAX_REF_BYTES = 1_000_000 - 10_000;

export const byteLength = (s) => new TextEncoder().encode(s).length;

export function saveReference(uid, id, { name, text }) {
  return track(setDoc(refRef(uid, id), { name, text, updatedAt: serverTimestamp() }));
}

export function removeReference(uid, id) {
  return track(deleteDoc(refRef(uid, id)));
}
