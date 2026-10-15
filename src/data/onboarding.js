import { doc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { contentRef, nextOrder, pagesCol } from './pages.js';
import { track } from './syncStatus.js';

const metaRef = (uid) => doc(db, 'users', uid, 'meta', 'settings');

const text = (t) => [{ type: 'text', text: t, styles: {} }];
const p = (t) => ({ type: 'paragraph', content: text(t) });
const h = (t) => ({ type: 'heading', props: { level: 3 }, content: text(t) });
const li = (t) => ({ type: 'bulletListItem', content: text(t) });
const todo = (t) => ({ type: 'checkListItem', props: { checked: false }, content: text(t) });

// Nội dung trang hướng dẫn ngắn cho tài khoản mới
const GUIDE = [
  p('Chào mừng đến với Drafts: nơi ghi chú nhanh, đồng bộ giữa điện thoại và máy tính.'),
  h('Soạn thảo'),
  li('Gõ / để chèn tiêu đề, danh sách, checklist, bảng, trích dẫn, code…'),
  li('Kéo tay nắm ⋮⋮ bên trái mỗi block để sắp xếp lại.'),
  li('Bôi đen chữ để in đậm, in nghiêng hoặc chèn link.'),
  h('Sắp xếp trang'),
  li('Bấm "+ Trang mới" ở cuối danh sách để tạo trang.'),
  li('Kéo thả trang trong sidebar để đổi thứ tự (điện thoại: nhấn giữ rồi kéo).'),
  li('Xóa trang sẽ chuyển vào Thùng rác, có thể khôi phục lại.'),
  h('Thử ngay'),
  todo('Nhấn ⌘K (hoặc Ctrl+K) để tìm trang theo tiêu đề.'),
  todo('Thêm Drafts vào màn hình chính iPhone: Safari → Chia sẻ → Thêm vào MH chính.'),
  todo('Tắt mạng rồi ghi thử: có mạng lại sẽ tự đồng bộ.'),
];

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
    icon: '👋',
    parentId: null,
    order: nextOrder(pages),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    trashedAt: null,
  });
  batch.set(contentRef(uid, ref.id), { blocks: JSON.stringify(GUIDE), updatedAt: serverTimestamp() });
  batch.set(metaRef(uid), { onboarded: true }, { merge: true });
  track(batch.commit());
  return ref.id;
}
