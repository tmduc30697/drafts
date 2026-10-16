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

// Vài từ đầu của nội dung (bỏ ký hiệu markdown) để làm tên tạm cho trang chưa đặt tên
export function contentPreview(text) {
  for (const raw of text.split('\n')) {
    // Bỏ qua: dòng rào khối code, dòng bảng trống / gạch phân cách, chú thích HTML (vd. kích thước bảng)
    if (/^\s*(```|~~~|<!--)/.test(raw) || /^\s*\|[\s|:-]*$/.test(raw)) continue;
    const line = raw
      .replace(/\|/g, ' ') // ô trong bảng
      .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)*/, '')
      .replace(/[*_`~]+/g, '')
      .trim();
    if (!line) continue;
    const words = line.split(/\s+/).slice(0, 8).join(' ');
    return words.length > 60 ? `${words.slice(0, 60).trimEnd()}…` : words;
  }
  return '';
}

// Ghi nội dung trang (văn bản thuần). Ghi đè cả document nên trường `blocks` cũ cũng được bỏ.
// Không await: offline thì Firestore tự xếp hàng và gửi khi có mạng.
export function saveContent(uid, id, text) {
  return track(setDoc(contentRef(uid, id), { text, updatedAt: serverTimestamp() }));
}
