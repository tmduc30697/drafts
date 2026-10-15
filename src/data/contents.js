import { serverTimestamp, setDoc } from 'firebase/firestore';
import { contentRef } from './pages.js';
import { track } from './syncStatus.js';
import { blocksToText } from './legacyBlocks.js';

// Firestore giới hạn 1 MB/document; chừa khoảng trống cho các trường khác
export const MAX_CONTENT_BYTES = 1_000_000 - 10_000;

// Lấy văn bản từ document nội dung (hỗ trợ cả dạng block cũ)
export function contentText(data) {
  if (!data) return '';
  if (typeof data.text === 'string') return data.text;
  if (typeof data.blocks === 'string') return blocksToText(data.blocks);
  return '';
}

// Ghi nội dung trang (văn bản thuần). Ghi đè cả document nên trường `blocks` cũ cũng được bỏ.
// Không await: offline thì Firestore tự xếp hàng và gửi khi có mạng.
export function saveContent(uid, id, text) {
  return track(setDoc(contentRef(uid, id), { text, updatedAt: serverTimestamp() }));
}
