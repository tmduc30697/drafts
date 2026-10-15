import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { pagesCol } from '../data/pages.js';

const toMillis = (t) => (t ? t.toMillis() : null);

// Nghe toàn bộ metadata trang của user (gồm cả trang trong thùng rác).
// Chỉ là metadata nên nhẹ; nội dung trang tải riêng khi mở.
export function usePages(uid) {
  const [state, setState] = useState({ pages: [], loaded: false, fromCache: true });

  useEffect(() => {
    return onSnapshot(
      pagesCol(uid),
      { includeMetadataChanges: true },
      (snap) => {
        const pages = snap.docs.map((d) => {
          // 'estimate': serverTimestamp chưa được server xác nhận vẫn có giá trị tạm
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            title: data.title || '',
            icon: data.icon || null,
            parentId: data.parentId || null,
            order: typeof data.order === 'number' ? data.order : 0,
            createdAt: toMillis(data.createdAt) || 0,
            updatedAt: toMillis(data.updatedAt) || 0,
            trashedAt: toMillis(data.trashedAt),
          };
        });
        setState({ pages, loaded: true, fromCache: snap.metadata.fromCache });
      },
      (err) => {
        console.error('Không nghe được danh sách trang:', err);
        setState((s) => ({ ...s, loaded: true }));
      },
    );
  }, [uid]);

  return state;
}
