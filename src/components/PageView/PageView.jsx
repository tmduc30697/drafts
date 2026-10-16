import { useCallback, useRef, useState } from 'react';
import { updatePage } from '../../data/pages.js';
import { byteLength, MAX_REF_BYTES, removeReference, saveReference } from '../../data/references.js';
import { useReference } from '../../hooks/useReference.js';
import { loadJSON, saveJSON } from '../../lib/storage.js';
import Editor from './Editor.jsx';
import { insertQuote } from './editor/lineKinds.js';
import ReferencePane from './ReferencePane.jsx';
import Toolbar from './Toolbar.jsx';

const WIDTH_KEY = 'drafts:ref-width';
const clampWidth = (n) => Math.min(80, Math.max(20, n));

// Một trang. Không có tài liệu import: chỉ phần soạn thảo. Có tài liệu import: tài liệu ở cột trái (đọc),
// phần soạn thảo ghi chú ở cột phải. Tên trang sửa ở sidebar (nhấp đúp).
export default function PageView({ uid, page }) {
  const [view, setView] = useState(null);
  const onEditorReady = useCallback((v) => setView(v), []);
  const locked = !!page.locked;
  const { ref } = useReference(uid, page.id);
  const fileInput = useRef(null);
  // Độ rộng cột tài liệu (% của vùng làm việc), nhớ theo máy
  const [width, setWidth] = useState(() => clampWidth(Number(loadJSON(WIDTH_KEY, 45)) || 45));

  const importFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    if (byteLength(text) > MAX_REF_BYTES) {
      window.alert('Tài liệu quá lớn (vượt 1 MB) nên chưa import được.');
      return;
    }
    saveReference(uid, page.id, { name: file.name, text });
  };

  const removeRef = () => {
    if (window.confirm(`Gỡ tài liệu "${ref.name}" khỏi trang này? Ghi chú của bạn không bị ảnh hưởng.`)) removeReference(uid, page.id);
  };

  // Kéo thanh chia để đổi độ rộng hai cột
  const startDrag = (e) => {
    const area = e.currentTarget.parentElement;
    const rect = area.getBoundingClientRect();
    const move = (ev) => setWidth(clampWidth(((ev.clientX - rect.left) / rect.width) * 100));
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveJSON(WIDTH_KEY, clampWidth(((ev.clientX - rect.left) / rect.width) * 100));
      document.body.classList.remove('dragging-split');
    };
    document.body.classList.add('dragging-split');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        hidden
        onChange={(e) => {
          importFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {ref && (
        <>
          <div className="ref-col" style={{ '--ref-w': `${width}%` }}>
            <ReferencePane
              name={ref.name}
              text={ref.text}
              locked={locked}
              onReplace={() => fileInput.current.click()}
              onRemove={removeRef}
              onQuote={(text) => view && insertQuote(view, text)}
            />
          </div>
          <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Đổi độ rộng cột tài liệu" onPointerDown={startDrag} />
        </>
      )}
      <div className="content">
        <Toolbar
          view={view}
          title={page.title || page.preview}
          locked={locked}
          hasRef={!!ref}
          onImport={() => fileInput.current.click()}
          onToggleLock={() => updatePage(uid, page.id, { locked: !locked })}
        />
        <article className="page">
          <Editor uid={uid} pageId={page.id} preview={page.preview} onReady={onEditorReady} locked={locked} />
        </article>
      </div>
    </>
  );
}
