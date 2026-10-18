import { useCallback, useRef, useState } from 'react';
import { updatePage } from '../../data/pages.js';
import { byteLength, MAX_REF_BYTES, refDisplayName, saveReference } from '../../data/references.js';
import { useReference } from '../../hooks/useReference.js';
import { useDebouncedSaver } from '../../hooks/useDebouncedSaver.js';
import { loadJSON, saveJSON } from '../../lib/storage.js';
import Editor from './Editor.jsx';
import ImportDialog from './ImportDialog.jsx';
import { insertQuote } from './editor/lineKinds.js';
import ReferencePane from './ReferencePane.jsx';
import Toolbar from './Toolbar.jsx';
import { DocIcon, EditIcon } from '../icons.jsx';

const WIDTH_KEY = 'drafts:ref-width';
const FOLD_KEY = 'drafts:ref-fold'; // cột đang thu gọn: null | 'doc' | 'notes'
const clampWidth = (n) => Math.min(80, Math.max(20, n));

// Một trang. Không có tài liệu import: chỉ phần soạn thảo. Có tài liệu import: tài liệu ở cột trái (đọc),
// phần soạn thảo ghi chú ở cột phải. Tên trang sửa ở sidebar (nhấp đúp).
export default function PageView({ uid, page, displayTitle }) {
  const [view, setView] = useState(null);
  const onEditorReady = useCallback((v) => setView(v), []);
  const locked = !!page.locked;
  const { ref } = useReference(uid, page.id);
  const [importing, setImporting] = useState(false);
  // Thu gọn một trong hai cột (tài liệu / ghi chú) để cột kia chiếm hết chỗ; nhớ theo máy
  const [fold, setFoldState] = useState(() => {
    const v = loadJSON(FOLD_KEY, null);
    return v === 'doc' || v === 'notes' ? v : null;
  });
  const setFold = (v) => {
    setFoldState(v);
    saveJSON(FOLD_KEY, v);
  };
  // Độ rộng cột tài liệu (% của vùng làm việc), nhớ theo máy
  const [width, setWidth] = useState(() => clampWidth(Number(loadJSON(WIDTH_KEY, 45)) || 45));

  // Nạp tài liệu (từ file hoặc văn bản dán) để đọc ở cột bên cạnh
  const importReference = ({ name, text }) => {
    if (byteLength(text) > MAX_REF_BYTES) {
      window.alert('Tài liệu quá lớn (vượt 1 MB) nên chưa import được.');
      return;
    }
    setImporting(false);
    saveReference(uid, page.id, { name, text });
  };

  // Sửa trực tiếp tài liệu ở cột trái: tự lưu sau 1.5 giây ngừng gõ (và khi rời trang / ẩn app)
  const refText = useRef(null);
  const refSaver = useDebouncedSaver(() => {
    const text = refText.current;
    if (text == null || !ref) return;
    if (byteLength(text) > MAX_REF_BYTES) {
      window.alert('Tài liệu quá lớn (vượt 1 MB) nên chưa lưu được thay đổi mới nhất.');
      return;
    }
    saveReference(uid, page.id, { name: ref.name, text });
  });
  const onRefChange = (text) => {
    refText.current = text;
    refSaver.schedule();
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
      {importing && <ImportDialog onSubmit={importReference} onClose={() => setImporting(false)} />}
      {ref && (
        <>
          {/* Cột thu gọn chỉ bị ẩn (không gỡ) để giữ vị trí cuộn và editor */}
          <div
            className={`ref-col ${fold === 'doc' ? 'folded' : ''} ${fold === 'notes' ? 'full' : ''}`}
            style={{ '--ref-w': `${width}%` }}
          >
            <ReferencePane
              name={refDisplayName(ref.name)}
              text={ref.text}
              locked={locked}
              onReplace={() => setImporting(true)}
              onQuote={(text) => view && insertQuote(view, text)}
              onChange={onRefChange}
              isSaving={refSaver.isDirty}
              onFoldDoc={() => setFold('doc')}
            />
          </div>
          {fold === 'doc' && <FoldStrip label="Tài liệu" icon={<DocIcon size={16} />} onOpen={() => setFold(null)} />}
          {!fold && (
            <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Đổi độ rộng cột tài liệu" onPointerDown={startDrag} />
          )}
        </>
      )}
      {ref && fold === 'notes' && <FoldStrip label="Ghi chú" icon={<EditIcon size={16} />} onOpen={() => setFold(null)} />}
      <div className={`content ${ref && fold === 'notes' ? 'folded' : ''}`}>
        <Toolbar
          view={view}
          title={displayTitle}
          locked={locked}
          hasRef={!!ref}
          onFold={ref ? () => setFold('notes') : undefined}
          onImport={() => setImporting(true)}
          onToggleLock={() => updatePage(uid, page.id, { locked: !locked })}
        />
        <article className="page">
          <Editor uid={uid} pageId={page.id} preview={page.preview} onReady={onEditorReady} locked={locked} />
        </article>
      </div>
    </>
  );
}

// Dải hẹp thay cho cột đang thu gọn: bấm để mở lại
function FoldStrip({ label, icon, onOpen }) {
  return (
    <button type="button" className="fold-strip" title={`Mở ${label.toLowerCase()}`} aria-label={`Mở ${label.toLowerCase()}`} onClick={onOpen}>
      {icon}
      <span className="fold-strip-label">{label}</span>
    </button>
  );
}
