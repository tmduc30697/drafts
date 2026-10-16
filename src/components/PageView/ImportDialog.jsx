import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadJSON, saveJSON } from '../../lib/storage.js';
import { PASTED_NAME } from '../../data/references.js';

const TAB_KEY = 'drafts:import-tab';
const ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';

// Hộp thoại nạp tài liệu để đọc bên cạnh: chọn / kéo thả file, hoặc dán markdown.
// onSubmit({ name, text }) được gọi khi đã có nội dung.
export default function ImportDialog({ onSubmit, onClose }) {
  const [tab, setTab] = useState(() => (loadJSON(TAB_KEY, 'file') === 'paste' ? 'paste' : 'file'));
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const textarea = useRef(null);

  const switchTab = (t) => {
    setTab(t);
    saveJSON(TAB_KEY, t);
  };

  useEffect(() => {
    if (tab === 'paste') textarea.current?.focus();
  }, [tab]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const submitFile = async (file) => {
    if (!file) return;
    onSubmit({ name: file.name, text: await file.text() });
  };

  const submitPaste = () => {
    if (!text.trim()) return;
    onSubmit({ name: PASTED_NAME, text });
  };

  return createPortal(
    <div className="mermaid-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mermaid-dialog import-dialog" role="dialog" aria-modal="true" aria-label="Nạp tài liệu">
        <div className="mermaid-dialog-head">
          <span>Nạp tài liệu để đọc bên cạnh</span>
        </div>

        <div className="import-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => switchTab('file')}>
            Tải file
          </button>
          <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'active' : ''} onClick={() => switchTab('paste')}>
            Dán markdown
          </button>
        </div>

        {tab === 'file' ? (
          <button
            type="button"
            className={`import-drop ${dragging ? 'dragging' : ''}`}
            onClick={() => fileInput.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              submitFile(e.dataTransfer.files[0]);
            }}
          >
            <span>Bấm để chọn file hoặc kéo thả file vào đây</span>
            <span className="muted">.md, .markdown, .txt (tối đa 1 MB)</span>
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => submitFile(e.target.files[0])} />
          </button>
        ) : (
          <textarea
            ref={textarea}
            className="mermaid-input import-text"
            placeholder="Dán nội dung markdown vào đây…"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitPaste();
              }
            }}
          />
        )}

        <div className="mermaid-dialog-foot">
          <button type="button" className="btn" onClick={onClose}>
            Hủy
          </button>
          {tab === 'paste' && (
            <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={submitPaste}>
              Nạp
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
