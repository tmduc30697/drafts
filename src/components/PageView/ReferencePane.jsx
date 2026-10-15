import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { CloseIcon, DocIcon, QuoteIcon } from '../icons.jsx';
import { editorExtensions } from './editor/setup.js';

// Dòng tiêu đề markdown ("# ...") đậm lên; giữ nguyên chiều cao dòng để số hàng đều như bên ghi chú
const headingLine = Decoration.line({ class: 'cm-md-heading' });
const headings = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(u) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }

    build(view) {
      const ranges = [];
      let inFence = false;
      for (let n = 1; n <= view.state.doc.lines; n++) {
        const line = view.state.doc.line(n);
        if (/^\s*(```|~~~)/.test(line.text)) inFence = !inFence;
        else if (!inFence && /^#{1,6}\s/.test(line.text)) ranges.push(headingLine.range(line.from));
      }
      return Decoration.set(ranges);
    }
  },
  { decorations: (v) => v.decorations },
);

// Cột trái: tài liệu markdown được import, chỉ để đọc. Dùng cùng trình soạn thảo với phần ghi chú (chế độ chỉ đọc)
// nên lề số hàng, định dạng và chiều cao dòng giống hệt bên phải.
export default function ReferencePane({ name, text, locked, onReplace, onRemove, onQuote }) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const pane = useRef(null);
  // Đoạn đang bôi chọn trong tài liệu + vị trí nút "Trích dẫn" nổi bên dưới nó
  const [pick, setPick] = useState(null);

  // Dựng editor chỉ đọc một lần; nội dung đổi (thay tài liệu) thì thay toàn bộ văn bản
  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [editorExtensions({ onDocChange() {}, locked: true }), headings],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // text chỉ dùng lúc dựng; các lần đổi sau xử lý ở effect bên dưới
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  }, [text]);

  // Theo dõi vùng bôi chọn để hiện nút trích dẫn; chỉ khi bôi trong nội dung tài liệu
  useEffect(() => {
    if (locked) {
      setPick(null);
      return undefined;
    }
    const update = () => {
      const sel = window.getSelection();
      const root = viewRef.current?.contentDOM;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !root || !(root.contains(sel.anchorNode) || root.contains(sel.focusNode))) {
        setPick(null);
        return;
      }
      const picked = sel.toString();
      if (!picked.trim()) {
        setPick(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const box = pane.current.getBoundingClientRect();
      setPick({
        text: picked,
        top: Math.min(rect.bottom - box.top + 6, box.height - 40),
        left: Math.max(8, Math.min(rect.right - box.left - 20, box.width - 40)),
      });
    };
    document.addEventListener('selectionchange', update);
    const scroller = host.current?.querySelector('.cm-scroller') ?? host.current;
    const sc = host.current?.parentElement;
    sc?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      sc?.removeEventListener('scroll', update);
      void scroller;
    };
  }, [locked]);

  const quote = () => {
    if (!pick) return;
    const picked = pick.text;
    // Bỏ vùng bôi chọn trong tài liệu trước, để sau đó ghi chú nhận focus và con trỏ mà không bị xóa mất
    window.getSelection()?.removeAllRanges();
    setPick(null);
    onQuote(picked);
  };

  return (
    <section ref={pane} className="ref-pane" aria-label="Tài liệu tham khảo">
      <header className="ref-head">
        <span className="ref-name" title={name}>
          {name}
        </span>
        <button className="icon-btn small" title="Thay bằng tài liệu khác" aria-label="Thay tài liệu" disabled={locked} onClick={onReplace}>
          <DocIcon size={15} />
        </button>
        <button className="icon-btn small" title="Gỡ tài liệu" aria-label="Gỡ tài liệu" disabled={locked} onClick={onRemove}>
          <CloseIcon size={15} />
        </button>
      </header>
      <div className="ref-scroll">
        <div ref={host} className="text-editor ref-editor" />
      </div>
      {pick && (
        <button
          className="ref-quote-btn"
          style={{ top: pick.top, left: pick.left }}
          title="Trích dẫn đoạn này sang ghi chú"
          aria-label="Trích dẫn sang ghi chú"
          // Không làm mất vùng bôi chọn khi bấm
          onMouseDown={(e) => e.preventDefault()}
          onClick={quote}
        >
          <QuoteIcon size={16} />
        </button>
      )}
    </section>
  );
}
