import { useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { vi } from '@blocknote/core/locales';
import '@blocknote/mantine/style.css';
import { contentRef } from '../../data/pages.js';
import { MAX_CONTENT_BYTES, saveContent } from '../../data/contents.js';
import { useDebouncedSaver } from '../../hooks/useDebouncedSaver.js';
import { useColorScheme } from '../../hooks/useColorScheme.js';

// Đọc chuỗi JSON block đã lưu; rỗng hoặc hỏng thì trả về undefined (editor tự tạo 1 đoạn trống)
function parseBlocks(json) {
  try {
    const blocks = JSON.parse(json || '[]');
    return Array.isArray(blocks) && blocks.length ? blocks : undefined;
  } catch {
    return undefined;
  }
}

// Bỏ ảnh/file nhúng dạng base64 (data:...) để không vượt giới hạn 1 MB của document
function stripDataUrls(blocks) {
  return blocks.map((b) => ({
    ...b,
    props: typeof b.props?.url === 'string' && b.props.url.startsWith('data:') ? { ...b.props, url: '' } : b.props,
    children: b.children?.length ? stripDataUrls(b.children) : b.children,
  }));
}

const byteLength = (s) => new TextEncoder().encode(s).length;

// Tải nội dung trang rồi mới dựng editor (BlockNote nhận nội dung ban đầu lúc khởi tạo)
export default function Editor({ uid, pageId, onReady }) {
  const [initial, setInitial] = useState(null); // { blocks } | { missing: true }
  // Hàm xử lý snapshot của editor đã dựng; trước khi nó gắn vào thì giữ snapshot mới nhất ở pending
  const snapshotHandler = useRef({ handle: null, pending: null });
  const started = useRef(false);

  useEffect(() => {
    return onSnapshot(
      contentRef(uid, pageId),
      (snap) => {
        // Editor đã dựng: các snapshot tiếp theo do editor xử lý
        if (started.current) {
          const h = snapshotHandler.current;
          if (h.handle) h.handle(snap);
          else h.pending = snap;
          return;
        }
        if (snap.exists()) {
          started.current = true;
          setInitial({ blocks: snap.data().blocks || '[]' });
        }
        // Không có trong cache và chưa hỏi được server (offline): chưa thể mở
        else if (snap.metadata.fromCache) setInitial({ missing: true });
        // Server xác nhận không có nội dung (trang cũ/lỗi): mở như trang trống
        else {
          started.current = true;
          setInitial({ blocks: '[]' });
        }
      },
      (err) => {
        console.error('Không tải được nội dung trang:', err);
        setInitial({ error: true });
      },
    );
  }, [uid, pageId]);

  if (!initial) return null;
  if (initial.missing) {
    return <p className="editor-note">Nội dung trang này chưa có trên máy. Cần kết nối mạng để mở lần đầu.</p>;
  }
  if (initial.error) return <p className="editor-note">Không tải được nội dung trang.</p>;
  return (
    <LoadedEditor
      uid={uid}
      pageId={pageId}
      initialJson={initial.blocks}
      snapshotHandler={snapshotHandler}
      onReady={onReady}
    />
  );
}

function LoadedEditor({ uid, pageId, initialJson, snapshotHandler, onReady }) {
  const theme = useColorScheme();
  const [tooLarge, setTooLarge] = useState(false);
  // Chuỗi JSON đã lưu/đã áp gần nhất, để nhận ra snapshot "không có gì mới"
  const lastKnown = useRef(initialJson);
  // Đang tự thay nội dung bằng bản từ server: bỏ qua onChange khi đó
  const applyingRemote = useRef(false);

  const initialContent = useMemo(() => parseBlocks(initialJson), [initialJson]);
  const editor = useCreateBlockNote({
    initialContent,
    dictionary: vi,
    // Không khai báo uploadFile => BlockNote tắt upload, chỉ cho chèn ảnh bằng link
  });

  const saver = useDebouncedSaver(() => {
    const json = JSON.stringify(stripDataUrls(editor.document));
    if (json === lastKnown.current) return;
    if (byteLength(json) > MAX_CONTENT_BYTES) {
      setTooLarge(true);
      return;
    }
    setTooLarge(false);
    lastKnown.current = json;
    saveContent(uid, pageId, json);
  });

  // Nhận bản mới từ máy khác. Chỉ áp vào editor khi KHÔNG có thay đổi chưa lưu,
  // để không ghi đè những gì đang gõ ("lưu sau thắng" khi cả hai cùng sửa).
  useEffect(() => {
    const handle = (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return; // bản ghi của chính máy này
      const json = snap.data().blocks || '[]';
      if (json === lastKnown.current || saver.isDirty()) return;
      lastKnown.current = json;
      applyingRemote.current = true;
      try {
        editor.replaceBlocks(editor.document, parseBlocks(json) || [{ type: 'paragraph' }]);
      } finally {
        applyingRemote.current = false;
      }
    };
    const h = snapshotHandler.current;
    h.handle = handle;
    // Snapshot đến trong lúc editor đang dựng
    if (h.pending) {
      handle(h.pending);
      h.pending = null;
    }
    return () => {
      h.handle = null;
    };
  }, [editor, saver, snapshotHandler]);

  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);

  return (
    <>
      {tooLarge && (
        <p className="editor-note error">Trang quá lớn (vượt 1 MB) nên chưa lưu được. Hãy bớt nội dung hoặc tách sang trang khác.</p>
      )}
      <BlockNoteView
        editor={editor}
        theme={theme}
        onChange={() => {
          if (!applyingRemote.current) saver.schedule();
        }}
      />
    </>
  );
}
