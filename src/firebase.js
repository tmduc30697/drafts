import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';

// Config còn placeholder thì app hiện màn hình nhắc cấu hình thay vì lỗi khó hiểu
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('THAY_');

export const app = initializeApp(firebaseConfig);

// Auth mặc định lưu phiên trong IndexedDB nên mở lại app (kể cả offline) vẫn đăng nhập
export const auth = getAuth(app);
auth.languageCode = 'vi';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Cache cục bộ bền vững, dùng chung giữa nhiều tab: offline vẫn đọc/sửa được, có mạng tự đồng bộ
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
