import { useEffect, useState } from 'react';
import { applyLink, toggleWrap } from './editor/format.js';
import { activeKind, applyKind, insertCodeBlock, insertHorizontalRule, KINDS } from './editor/lineKinds.js';
import { BulletListIcon, CodeBlockIcon, DocIcon, DownloadIcon, HrIcon, InlineCodeIcon, LinkIcon, LockIcon, MermaidIcon, NumberedListIcon, QuoteIcon, UnlockIcon } from '../icons.jsx';
import { insertMermaidBlock } from './editor/mermaidBlocks.js';
import { openMermaidDialog } from './editor/mermaidDialog.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT = isMac ? '⇧' : 'Shift+';

const kind = (id) => KINDS.find((k) => k.id === id);

// Thanh công cụ định dạng phía trên trang (kiểu Slack):
// B I U S | liên kết | danh sách số, gạch đầu dòng | trích dẫn | code, khối code, Mermaid
// Tên file tải về: lấy từ tên trang, bỏ ký tự không hợp lệ trong tên file
const fileName = (title) => `${(title || 'Không có tiêu đề').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 100) || 'Drafts'}.md`;

function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Toolbar({ view, title, locked, hasRef, onImport, onToggleLock }) {
  const [active, setActive] = useState(null);

  // Theo dõi con trỏ để tô sáng kiểu dòng hiện tại
  useEffect(() => {
    if (!view) return undefined;
    const sync = () => setActive(activeKind(view.state));
    sync();
    document.addEventListener('selectionchange', sync);
    view.dom.addEventListener('keyup', sync);
    return () => {
      document.removeEventListener('selectionchange', sync);
      view.dom.removeEventListener('keyup', sync);
    };
  }, [view]);

  // Khoảng trống cuối trang để cuộn dòng cuối lên sát dưới thanh công cụ (như Sublime Text).
  // Không suy ra bằng công thức: đo vị trí thật của dòng cuối và mức cuộn tối đa, rồi chỉnh khoảng trống
  // cho đến khi khi cuộn hết cỡ thì đỉnh dòng cuối đúng bằng đáy thanh công cụ.
  useEffect(() => {
    if (!view) return undefined;
    const content = view.dom.closest('.content');
    const toolbar = content?.querySelector('.doc-toolbar');
    if (!content || !toolbar) return undefined;
    let raf = 0;
    // Mỗi bước: đo, chỉnh khoảng trống, nhờ CodeMirror đo lại (gutter giữ chiều cao cũ nếu không) rồi đo tiếp
    const step = (count) => {
      const last = view.lineBlockAt(view.state.doc.length);
      const docTop = view.documentTop - content.getBoundingClientRect().top + content.scrollTop;
      const wanted = docTop + last.top - toolbar.offsetHeight; // mức cuộn tối đa mong muốn
      const actual = content.scrollHeight - content.clientHeight;
      const diff = wanted - actual;
      if (Math.abs(diff) < 0.5 || count >= 8) return;
      const pad = Math.max(0, (parseFloat(view.dom.style.getPropertyValue('--end-pad')) || 0) + diff);
      view.dom.style.setProperty('--end-pad', `${pad}px`);
      view.requestMeasure();
      raf = requestAnimationFrame(() => requestAnimationFrame(() => step(count + 1)));
    };
    const update = () => {
      cancelAnimationFrame(raf);
      step(0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(content);
    ro.observe(toolbar);
    ro.observe(view.contentDOM);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [view]);

  if (!view) return <div className="doc-toolbar" />;

  const lockLabel = locked ? 'Mở khóa trang (cho phép sửa và xóa)' : 'Khóa trang (không cho sửa và xóa)';

  const run = (fn) => () => {
    fn(view);
    view.focus();
  };
  const wrap = (open, close) => run(toggleWrap(open, close));
  // Mở popup dán code Mermaid, chèn sơ đồ tại chỗ con trỏ lúc bấm nút
  const addMermaid = () => {
    const pos = view.state.selection.main.head;
    openMermaidDialog({
      onSubmit: (code) => insertMermaidBlock(view, pos, code),
      onClose: () => view.focus(),
    });
  };
  const line = (id) => () => applyKind(view, kind(id));

  return (
    <div className={`doc-toolbar ${locked ? 'locked' : ''}`} role="toolbar" aria-label="Định dạng">
      <Btn label={`In đậm (${MOD}B)`} onClick={wrap('**', '**')}>
        <b>B</b>
      </Btn>
      <Btn label={`In nghiêng (${MOD}I)`} onClick={wrap('*', '*')}>
        <i>I</i>
      </Btn>
      <Btn label={`Gạch chân (${MOD}U)`} onClick={wrap('<u>', '</u>')}>
        <u>U</u>
      </Btn>
      <Btn label={`Gạch ngang (${MOD}${SHIFT}X)`} onClick={wrap('~~', '~~')}>
        <s>S</s>
      </Btn>
      <span className="doc-toolbar-sep" />
      <Btn label={`Liên kết (${MOD}K)`} onClick={run(applyLink)}>
        <LinkIcon size={17} />
      </Btn>
      <span className="doc-toolbar-sep" />
      <Btn label="Danh sách số" active={active === 'number'} onClick={line('number')}>
        <NumberedListIcon size={17} />
      </Btn>
      <Btn label="Danh sách gạch đầu dòng" active={active === 'bullet'} onClick={line('bullet')}>
        <BulletListIcon size={17} />
      </Btn>
      <span className="doc-toolbar-sep" />
      <Btn label="Trích dẫn" active={active === 'quote'} onClick={line('quote')}>
        <QuoteIcon size={17} />
      </Btn>
      <Btn label="Đường kẻ ngang" onClick={run(insertHorizontalRule)}>
        <HrIcon size={17} />
      </Btn>
      <span className="doc-toolbar-sep" />
      <Btn label={`Code (${MOD}E)`} onClick={wrap('`', '`')}>
        <InlineCodeIcon size={17} />
      </Btn>
      <Btn label="Khối code" onClick={run(insertCodeBlock)}>
        <CodeBlockIcon size={17} />
      </Btn>
      <Btn label="Sơ đồ Mermaid" onClick={addMermaid}>
        <MermaidIcon size={17} />
      </Btn>
      <span className="doc-toolbar-spacer" />
      {!hasRef && (
        <Btn label="Nhập tài liệu markdown để đọc bên cạnh" onClick={onImport}>
          <DocIcon size={17} />
        </Btn>
      )}
      <Btn label="Tải trang về (.md)" keep onClick={() => downloadText(view.state.doc.toString(), fileName(title))}>
        <DownloadIcon size={17} />
      </Btn>
      <Btn label={lockLabel} active={locked} locked onClick={onToggleLock}>
        {locked ? <LockIcon size={17} /> : <UnlockIcon size={17} />}
      </Btn>
    </div>
  );
}

function Btn({ label, active, locked, keep, onClick, children }) {
  return (
    <button
      type="button"
      className={`doc-btn ${active ? 'active' : ''} ${locked ? 'lock-btn' : ''} ${keep ? 'keep' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      // Không lấy focus khỏi editor để giữ vùng chọn
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
