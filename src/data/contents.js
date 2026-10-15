import { serverTimestamp, setDoc } from 'firebase/firestore';
import { contentRef } from './pages.js';
import { track } from './syncStatus.js';

// Firestore giới hạn 1 MB/document; chừa khoảng trống cho các trường khác
export const MAX_CONTENT_BYTES = 1_000_000 - 10_000;

// Ghi nội dung trang (chuỗi JSON các block của BlockNote).
// Không await: offline thì Firestore tự xếp hàng và gửi khi có mạng.
export function saveContent(uid, id, blocks) {
  return track(setDoc(contentRef(uid, id), { blocks, updatedAt: serverTimestamp() }));
}
