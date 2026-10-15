import { doc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { contentRef, nextOrder, pagesCol } from './pages.js';
import { track } from './syncStatus.js';

const metaRef = (uid) => doc(db, 'users', uid, 'meta', 'settings');

// Nội dung trang hướng dẫn ngắn cho tài khoản mới (văn bản thuần)
const GUIDE = `Chào mừng đến với Drafts: nơi ghi chú nhanh, đồng bộ giữa điện thoại và máy tính.

Soạn thảo
- Gõ như Notepad. Dòng bắt đầu bằng "- " hoặc "1. " thì Enter sẽ tự thêm "- " hoặc số tiếp theo.
- Enter ở dòng gạch đầu dòng trống để thoát danh sách.
- Gõ / để chèn khối code, ví dụ:

\`\`\`js
console.log('xin chào');
\`\`\`

Sắp xếp trang
- Bấm "+ Trang mới" ở cuối danh sách để tạo trang.
- Kéo thả trang trong sidebar để đổi thứ tự (điện thoại: nhấn giữ rồi kéo).
- Xóa trang sẽ chuyển vào Thùng rác, có thể khôi phục lại.

Mẹo
- Nhấn ⌘K (hoặc Ctrl+K) để tìm trang theo tiêu đề.
- Thêm Drafts vào màn hình chính iPhone: Safari → Chia sẻ → Thêm vào MH chính.
- Mất mạng vẫn ghi được; có mạng lại sẽ tự đồng bộ.`;

// Tạo trang "Bắt đầu" đúng một lần cho mỗi tài khoản.
// Đọc cờ trực tiếp từ server để không tạo trùng khi cache trên máy còn trống;
// offline thì bỏ qua, lần mở app sau có mạng sẽ kiểm tra lại.
export async function ensureOnboarding(uid, pages) {
  let snap;
  try {
    snap = await getDocFromServer(metaRef(uid));
  } catch {
    return null;
  }
  if (snap.exists() && snap.data().onboarded) return null;

  const ref = doc(pagesCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    title: 'Bắt đầu',
    parentId: null,
    order: nextOrder(pages),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    trashedAt: null,
  });
  batch.set(contentRef(uid, ref.id), { text: GUIDE, updatedAt: serverTimestamp() });
  batch.set(metaRef(uid), { onboarded: true }, { merge: true });
  track(batch.commit());
  return ref.id;
}
