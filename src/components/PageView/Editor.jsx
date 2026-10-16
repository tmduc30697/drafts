import { useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { contentRef, updatePage } from '../../data/pages.js';
import { contentPreview, contentText, MAX_CONTENT_BYTES, saveContent } from '../../data/contents.js';
import { useDebouncedSaver } from '../../hooks/useDebouncedSaver.js';
import { editorExtensions, setLocked } from './editor/setup.js';
import { blockAt } from './editor/lineNumbering.js';
import { selectBlock } from './editor/blockSelect.js';

const byteLength = (s) => new TextEncoder().encode(s).length;

// Tải nội dung trang rồi mới dựng editor
export default function Editor({ uid, pageId, preview, onReady, locked = false }) {
  const [initial, setInitial] = useState(null); // { text } | { missing: true } | { error: true }
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
          setInitial({ text: contentText(snap.data()) });
        }
        // Không có trong cache và chưa hỏi được server (offline): chưa thể mở
        else if (snap.metadata.fromCache) setInitial({ missing: true });
        // Server xác nhận không có nội dung: mở như trang trống
        else {
          started.current = true;
          setInitial({ text: '' });
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
      preview={preview}
      initialText={initial.text}
      snapshotHandler={snapshotHandler}
      onReady={onReady}
      locked={locked}
    />
  );
}

function LoadedEditor({ uid, pageId, preview, initialText, snapshotHandler, onReady, locked }) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const [tooLarge, setTooLarge] = useState(false);
  // Văn bản đã lưu/đã áp gần nhất, để nhận ra snapshot "không có gì mới"
  const lastKnown = useRef(initialText);
  // Vài từ đầu đã ghi vào metadata trang (sidebar dùng làm tên khi chưa đặt tên)
  const lastPreview = useRef(preview);
  const syncPreview = (text) => {
    const next = contentPreview(text);
    if (next === lastPreview.current) return;
    lastPreview.current = next;
    updatePage(uid, pageId, { preview: next });
  };

  const saver = useDebouncedSaver(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    if (text === lastKnown.current) return;
    if (byteLength(text) > MAX_CONTENT_BYTES) {
      setTooLarge(true);
      return;
    }
    setTooLarge(false);
    lastKnown.current = text;
    saveContent(uid, pageId, text);
    syncPreview(text);
  });

  // Trang tạo trước khi có tính năng này: bổ sung khi mở
  useEffect(() => {
    if (!locked) syncPreview(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dựng CodeMirror một lần cho mỗi trang (component được key theo pageId)
  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialText,
        extensions: editorExtensions({
          locked,
          onDocChange: (u) => {
            // Bỏ qua thay đổi do áp bản từ máy khác
            if (!u.transactions.some((tr) => tr.annotation(Transaction.remote))) saver.schedule();
          },
        }),
      }),
    });
    viewRef.current = view;
    onReady?.(view);
    return () => {
      onReady?.(null);
      view.destroy();
    };
    // initialText chỉ dùng lúc dựng; saver/onReady ổn định
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bấm vào vùng trống bên phải cột chữ (ngoài editor): chọn dòng / khối nằm ngang chỗ bấm, như bấm vào cuối dòng đó
  useEffect(() => {
    const view = viewRef.current;
    const area = view?.dom.closest('.content');
    if (!area) return undefined;
    const onDown = (e) => {
      if (e.button !== 0 || view.dom.contains(e.target) || e.target.closest('.doc-toolbar')) return;
      const box = view.contentDOM.getBoundingClientRect();
      if (e.clientX <= box.right || e.clientY < box.top) return;
      const pos = view.posAtCoords({ x: box.right - 2, y: e.clientY });
      if (pos == null) return;
      e.preventDefault();
      // Ngang bảng / Mermaid / khối code: chọn cả khối (không hiện con trỏ trong khối)
      const block = blockAt(view.state, pos);
      if (block) {
        selectBlock(view, view.state.doc.line(block.first).from);
        return;
      }
      view.focus();
      view.dispatch({ selection: { anchor: pos } });
    };
    area.addEventListener('mousedown', onDown);
    return () => area.removeEventListener('mousedown', onDown);
  }, []);

  // Khóa/mở khóa trang khi đang mở
  useEffect(() => {
    if (viewRef.current) setLocked(viewRef.current, locked);
  }, [locked]);

  // Nhận bản mới từ máy khác. Chỉ áp vào editor khi KHÔNG có thay đổi chưa lưu,
  // để không ghi đè những gì đang gõ ("lưu sau thắng" khi cả hai cùng sửa).
  useEffect(() => {
    const handle = (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return; // bản ghi của chính máy này
      const text = contentText(snap.data());
      const view = viewRef.current;
      if (!view || text === lastKnown.current || saver.isDirty()) return;
      lastKnown.current = text;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
      });
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
  }, [saver, snapshotHandler]);

  return (
    <>
      {tooLarge && (
        <p className="editor-note error">Trang quá lớn (vượt 1 MB) nên chưa lưu được. Hãy bớt nội dung hoặc tách sang trang khác.</p>
      )}
      <div ref={host} className="text-editor" />
    </>
  );
}
