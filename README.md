# Drafts

Ứng dụng ghi chú kiểu Notion, chạy dạng PWA (cài lên màn hình chính iPhone hoặc dùng trên máy tính), đồng bộ qua Firebase.

Bản chạy thật: https://tmduc30697.github.io/drafts/

## Tính năng

- Đăng nhập bắt buộc bằng Google. Đã đăng nhập thì lần sau vào thẳng, kể cả khi offline.
- Sidebar là danh sách trang phẳng: nút "+ Trang mới" ở cuối danh sách, kéo thả để đổi thứ tự (trên điện thoại: nhấn giữ rồi kéo). Nhấp đúp tên trang để đổi tên. Có nút « / » để thu gọn sidebar thành dải icon.
- Trang là văn bản thuần như Notepad (editor [CodeMirror](https://codemirror.net/)) có số hàng ở lề trái, thanh công cụ ở đầu trang:
  - **B I U S**: in đậm, nghiêng, gạch chân, gạch ngang (Cmd/Ctrl+B, I, U, Shift+X). Ký hiệu markdown được ẩn đi.
  - **Liên kết** (Cmd/Ctrl+K), **danh sách số**, **gạch đầu dòng**, **trích dẫn**, **code inline** (Cmd/Ctrl+E).
  - **Khối code** kiểu Notion: thanh tiêu đề có dropdown chọn ngôn ngữ, nút sao chép và xóa khối; có tô màu cú pháp.
  - **Mermaid**: mở popup dán code Mermaid (có xem trước); sơ đồ hiện ngay trong trang, bấm vào sơ đồ để sửa. Thư viện Mermaid chỉ tải khi trang có sơ đồ.
  - Dòng bắt đầu bằng `- ` hoặc `1. ` thì Enter tự thêm `- ` hoặc số tiếp theo; Enter ở dòng trống để thoát danh sách. Danh sách số tự đánh lại khi xóa/chèn dòng.
- **Đọc tài liệu và ghi chú song song:** bấm nút import (icon tài liệu) trên thanh công cụ để nhập một file markdown (`.md`, `.markdown`, `.txt`, tối đa 1 MB). Bôi chữ trong tài liệu rồi bấm nút dấu trích dẫn nổi lên để chép đoạn đó sang ghi chú dạng `> ...`. Tài liệu hiện ở cột trái bằng cùng trình soạn thảo ở chế độ chỉ đọc (số hàng đều từng dòng như bên phải, định dạng đậm/nghiêng/link/code/Mermaid), phần ghi chú của bạn ở cột phải; kéo thanh giữa để đổi độ rộng. Gắn theo từng trang, đồng bộ giữa các máy; gỡ bằng dấu X ở đầu cột tài liệu. Trang không import thì chỉ có phần soạn thảo như bình thường. Trên điện thoại tài liệu nằm ở trên, ghi chú ở dưới.
- Tự lưu sau 1.5 giây ngừng gõ, và lưu ngay khi rời trang hoặc ẩn app.
- Xóa trang bằng dấu X cạnh tên trang: có hỏi xác nhận, xóa là xóa vĩnh viễn (không có thùng rác).
- Dùng được khi offline. Có mạng lại thì tự đồng bộ. Chỉ khi offline hoặc lỗi đồng bộ mới hiện biểu tượng đám mây gạch chéo.
- Khi có bản mới, app hiện snackbar "Có bản mới — Cập nhật" và chỉ tải lại khi bạn bấm.

## Chạy local

Cần Node.js 22 trở lên.

```bash
npm install
npm run dev        # http://localhost:5173/drafts/
npm run build      # build ra thư mục dist/
npm run preview    # chạy thử bản build (có service worker)
```

Để đăng nhập được ở local, thêm `localhost` vào **Authorized domains** của Firebase Auth (thường đã có sẵn).

## Cấu hình Firebase

Config nằm ở `src/firebaseConfig.js`. Các giá trị này không phải bí mật: dữ liệu được bảo vệ bằng Firestore Rules.

Thiết lập trong Firebase Console:

1. **Authentication → Sign-in method:** bật **Google**.
2. **Authentication → Settings → Authorized domains:** thêm `tmduc30697.github.io`.
3. **Firestore Database:** tạo database, rồi đặt Rules:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

App chạy được trên gói Spark miễn phí: không dùng Cloud Functions, không dùng Storage.

### Dữ liệu

| Đường dẫn | Nội dung |
| --- | --- |
| `users/{uid}/pages/{pageId}` | Metadata: `title, parentId (luôn null, dành cho phân cấp sau này), order, createdAt, updatedAt`. Sidebar chỉ nghe collection này. |
| `users/{uid}/contents/{pageId}` | `text` (văn bản thuần, khối code viết dạng Markdown ` ``` `) và `updatedAt`. Chỉ tải khi mở trang. Trang cũ dạng `blocks` (JSON BlockNote) được tự chuyển sang văn bản khi mở. |
| `users/{uid}/meta/settings` | `onboarded: true` khi đã tạo trang "Bắt đầu". |

Ghi chú:

- Mỗi document tối đa 1 MB: trang vượt quá sẽ không lưu và hiện cảnh báo.
- Gói miễn phí có 20k lượt ghi/ngày, nên app không ghi theo từng phím gõ mà gom lại sau 1.5 giây.
- Hai máy cùng sửa một trang thì bản lưu sau thắng. Nhưng khi editor đang có thay đổi chưa lưu, bản từ máy khác không được ghi đè lên.
- Trang mở gần nhất lưu riêng trên từng máy (localStorage).

## Deploy

Mỗi lần push lên `main`, GitHub Actions (`.github/workflows/deploy.yml`) build rồi đẩy `dist/` lên GitHub Pages.

Thiết lập một lần: **GitHub repo → Settings → Pages → Source:** chọn **GitHub Actions**.

Vite dùng `base: '/drafts/'` cho khớp với đường dẫn trên GitHub Pages. App điều hướng bằng hash (`#/p/<id>`) nên GitHub Pages không cần cấu hình rewrite.

## Icon

Icon PWA được sinh từ `public/logo.svg`:

```bash
npm run icons
```

Cấu hình nằm ở `pwa-assets.config.js`.

## Cấu trúc thư mục

```
.github/workflows/deploy.yml   Build và deploy lên GitHub Pages
public/                        logo.svg và các icon PWA đã sinh
src/
  main.jsx, App.jsx            Entry; chặn màn hình khi chưa đăng nhập; snackbar cập nhật
  firebaseConfig.js            Config Firebase
  firebase.js                  Khởi tạo Auth và Firestore (cache offline nhiều tab)
  data/
    pages.js                   Tạo/sửa/đổi thứ tự trang (writeBatch), thùng rác
    contents.js                Lưu/đọc nội dung trang (văn bản thuần)
    legacyBlocks.js            Chuyển nội dung dạng block cũ sang văn bản
    tree.js                    Hàm thuần: sắp xếp danh sách, tính thứ tự khi kéo thả, chuẩn hóa chữ để tìm kiếm
    onboarding.js              Trang "Bắt đầu" cho tài khoản mới
    syncStatus.js              Theo dõi lỗi đồng bộ
  hooks/                       useAuth, usePages, useHashRoute, useDebouncedSaver, useColorScheme
  lib/                         localStorage an toàn, danh sách hàm "lưu ngay"
  components/
    LoginScreen.jsx            Màn hình đăng nhập Google
    Workspace.jsx              Khung chính: sidebar, thanh trên, nội dung
    Sidebar/                   Sidebar, danh sách trang, kéo thả (dnd-kit)
    PageView/                  Tiêu đề, editor văn bản (CodeMirror: danh sách, menu /, khối code)
    SyncIndicator.jsx          Biểu tượng offline/lỗi đồng bộ
    UpdateSnackbar.jsx         Báo có bản mới
  styles/                      CSS (giao diện sáng)
```
