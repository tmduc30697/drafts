# Drafts

Ứng dụng ghi chú kiểu Notion, chạy dạng PWA (cài lên màn hình chính iPhone hoặc dùng trên máy tính), đồng bộ qua Firebase.

Bản chạy thật: https://tmduc30697.github.io/drafts/

## Tính năng

- Đăng nhập bắt buộc bằng Google. Đã đăng nhập thì lần sau vào thẳng, kể cả khi offline.
- Sidebar là danh sách trang phẳng: nút "+ Trang mới" ở cuối danh sách, kéo thả để đổi thứ tự (trên điện thoại: nhấn giữ rồi kéo).
- Trang gồm tiêu đề lớn và trình soạn thảo block [BlockNote](https://www.blocknotejs.org/): gõ `/` để chèn block, kéo thả block.
- Tự lưu sau 1.5 giây ngừng gõ, và lưu ngay khi rời trang hoặc ẩn app.
- Thùng rác: khôi phục hoặc xóa vĩnh viễn.
- Tìm trang theo tiêu đề bằng `⌘K` / `Ctrl+K`, hoặc nút kính lúp trên điện thoại.
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
| `users/{uid}/pages/{pageId}` | Metadata: `title, parentId (luôn null, dành cho phân cấp sau này), order, createdAt, updatedAt, trashedAt`. Sidebar chỉ nghe collection này. |
| `users/{uid}/contents/{pageId}` | `blocks` (chuỗi JSON của BlockNote) và `updatedAt`. Chỉ tải khi mở trang. |
| `users/{uid}/meta/settings` | `onboarded: true` khi đã tạo trang "Bắt đầu". |

Ghi chú:

- Mỗi document tối đa 1 MB, nên app tắt upload ảnh (vẫn chèn ảnh bằng link được) và bỏ ảnh base64 trước khi lưu.
- Gói miễn phí có 20k lượt ghi/ngày, nên app không ghi theo từng phím gõ mà gom lại sau 1.5 giây.
- Hai máy cùng sửa một trang thì bản lưu sau thắng. Nhưng khi editor đang có thay đổi chưa lưu, bản từ máy khác không được ghi đè lên.
- Trang mở gần nhất lưu riêng trên từng máy (localStorage).

## Deploy

Mỗi lần push lên `main`, GitHub Actions (`.github/workflows/deploy.yml`) build rồi đẩy `dist/` lên GitHub Pages.

Thiết lập một lần: **GitHub repo → Settings → Pages → Source:** chọn **GitHub Actions**.

Vite dùng `base: '/drafts/'` cho khớp với đường dẫn trên GitHub Pages. App điều hướng bằng hash (`#/p/<id>`, `#/trash`) nên GitHub Pages không cần cấu hình rewrite.

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
    contents.js                Lưu nội dung trang
    tree.js                    Hàm thuần: sắp xếp danh sách, tính thứ tự khi kéo thả, chuẩn hóa chữ để tìm kiếm
    onboarding.js              Trang "Bắt đầu" cho tài khoản mới
    syncStatus.js              Theo dõi lỗi đồng bộ
  hooks/                       useAuth, usePages, useHashRoute, useDebouncedSaver, useColorScheme
  lib/                         localStorage an toàn, danh sách hàm "lưu ngay"
  components/
    LoginScreen.jsx            Màn hình đăng nhập Google
    Workspace.jsx              Khung chính: sidebar, thanh trên, nội dung
    Sidebar/                   Sidebar, danh sách trang, kéo thả (dnd-kit)
    PageView/                  Tiêu đề, editor BlockNote
    TrashView.jsx              Thùng rác
    SearchDialog.jsx           Tìm kiếm
    SyncIndicator.jsx          Biểu tượng offline/lỗi đồng bộ
    UpdateSnackbar.jsx         Báo có bản mới
  styles/                      CSS (biến màu sáng/tối theo hệ thống)
```
