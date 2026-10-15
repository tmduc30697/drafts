import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { updatePage } from '../../data/pages.js';
import { useDebouncedSaver } from '../../hooks/useDebouncedSaver.js';
import Editor from './Editor.jsx';
import EmojiPicker from './EmojiPicker.jsx';

// Một trang: icon emoji, tiêu đề lớn sửa trực tiếp, và nội dung BlockNote
export default function PageView({ uid, page, onLiveTitle }) {
  const editorRef = useRef(null);
  const onEditorReady = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  // Enter ở tiêu đề: nhảy xuống đầu nội dung
  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const first = editor.document[0];
    if (first) editor.setTextCursorPosition(first, 'start');
    editor.focus();
  };

  return (
    <article className="page">
      <header className="page-header">
        <PageIcon uid={uid} page={page} />
        <PageTitle uid={uid} page={page} onLiveTitle={onLiveTitle} onEnter={focusEditor} />
      </header>
      <Editor uid={uid} pageId={page.id} onReady={onEditorReady} />
    </article>
  );
}

function PageIcon({ uid, page }) {
  const [anchor, setAnchor] = useState(null);
  const close = useCallback(() => setAnchor(null), []);
  const select = useCallback(
    (emoji) => {
      updatePage(uid, page.id, { icon: emoji });
      setAnchor(null);
    },
    [uid, page.id],
  );
  const toggle = (e) => setAnchor(anchor ? null : e.currentTarget);

  return (
    <>
      {page.icon ? (
        <button className="page-icon" onClick={toggle} aria-label="Đổi biểu tượng">
          {page.icon}
        </button>
      ) : (
        <button className="page-add-icon" onClick={toggle}>
          ☺ Thêm biểu tượng
        </button>
      )}
      {anchor && (
        <EmojiPicker
          anchor={anchor}
          onSelect={select}
          onRemove={
            page.icon
              ? () => {
                  updatePage(uid, page.id, { icon: null });
                  setAnchor(null);
                }
              : null
          }
          onClose={close}
        />
      )}
    </>
  );
}

function PageTitle({ uid, page, onLiveTitle, onEnter }) {
  const [value, setValue] = useState(page.title);
  const ref = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const saver = useDebouncedSaver(() => {
    if (valueRef.current !== page.title) updatePage(uid, page.id, { title: valueRef.current });
  });

  // Tiêu đề đổi từ máy khác: chỉ cập nhật khi ở đây không có thay đổi chưa lưu
  useEffect(() => {
    if (!saver.isDirty() && document.activeElement !== ref.current) setValue(page.title);
  }, [page.title, saver]);

  // Rời trang thì bỏ tiêu đề tạm trong sidebar (Firestore đã có bản mới nhất)
  useEffect(() => () => onLiveTitle(page.id, null), [page.id, onLiveTitle]);

  // Textarea tự giãn chiều cao theo nội dung
  useLayoutEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Trang mới chưa có tiêu đề: đặt con trỏ vào tiêu đề luôn
  useEffect(() => {
    if (!page.title) ref.current?.focus();
    // chỉ chạy khi mở trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      placeholder="Không có tiêu đề"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, ' ');
        setValue(v);
        onLiveTitle(page.id, v);
        saver.schedule();
      }}
      onBlur={saver.flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          saver.flush();
          onEnter();
        }
      }}
    />
  );
}
