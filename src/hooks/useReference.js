import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { refRef } from '../data/references.js';
import { reportSyncError } from '../data/syncStatus.js';

// Nghe tài liệu tham khảo của một trang. ref = null khi trang không có tài liệu.
export function useReference(uid, pageId) {
  const [state, setState] = useState({ loaded: false, ref: null });

  useEffect(() => {
    setState({ loaded: false, ref: null });
    return onSnapshot(
      refRef(uid, pageId),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setState({ loaded: true, ref: d && typeof d.text === 'string' ? { name: d.name || 'Tài liệu', text: d.text } : null });
      },
      (err) => {
        reportSyncError(err);
        setState({ loaded: true, ref: null });
      },
    );
  }, [uid, pageId]);

  return state;
}
