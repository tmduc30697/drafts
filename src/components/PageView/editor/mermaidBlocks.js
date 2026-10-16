import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { renderMermaid } from './mermaid.js';
import { openMermaidDialog } from './mermaidDialog.js';
import { EditIcon, CloseIcon } from './editorIcons.js';
import { selectBlock } from './blockSelect.js';

// Khối ```mermaid ... ``` (đã đóng) được thay bằng sơ đồ đã render.
// Bấm vào sơ đồ hoặc nút Sửa để mở popup sửa code; nút Xóa để bỏ cả khối.

const OPEN = /^\s*(`{3,}|~{3,})\s*mermaid\s*$/i;
const CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

// Tìm các khối mermaid hoàn chỉnh trong văn bản: [{ from, to, code }]
function findMermaidBlocks(state) {
  const { doc } = state;
  const blocks = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const first = doc.lineAt(node.from);
      const last = doc.lineAt(node.to);
      if (OPEN.test(first.text) && last.number > first.number && CLOSE.test(last.text)) {
        const code = first.number + 1 < last.number ? doc.sliceString(doc.line(first.number + 1).from, doc.line(last.number - 1).to) : '';
        blocks.push({ from: first.from, to: last.to, code });
      }
      return false;
    },
  });
  return blocks;
}

// Khối mermaid đang chứa vị trí pos (tính lại tại thời điểm bấm, vì vị trí có thể đã đổi)
function blockAt(state, pos) {
  return findMermaidBlocks(state).find((b) => pos >= b.from && pos <= b.to) || null;
}

function toolButton(label, icon, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-codeblock-btn';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = icon;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

class MermaidWidget extends WidgetType {
  constructor(code) {
    super();
    this.code = code;
  }

  eq(other) {
    return other.code === this.code;
  }

  get estimatedHeight() {
    return 200;
  }

  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-mermaid';

    const edit = () => {
      const block = blockAt(view.state, view.posAtDOM(wrap));
      if (!block) return;
      // Bấm vào sơ đồ: chọn khối này (tô như dòng đang chọn)
      selectBlock(view, block.from);
      if (view.state.readOnly) return;
      openMermaidDialog({
        code: block.code,
        submitLabel: 'Lưu',
        onSubmit: (code) => {
          // Vị trí có thể đã đổi trong lúc mở popup (vd. đồng bộ từ máy khác): tìm lại
          const current = blockAt(view.state, Math.min(block.from, view.state.doc.length));
          if (!current) return;
          view.dispatch({ changes: { from: current.from, to: current.to, insert: '```mermaid\n' + code + '\n```' } });
        },
        onClose: () => view.focus(),
      });
    };
    const remove = () => {
      if (view.state.readOnly) return;
      const block = blockAt(view.state, view.posAtDOM(wrap));
      if (!block) return;
      const { doc } = view.state;
      // Xóa cả khối kèm một dấu xuống dòng để không để lại dòng trống
      const to = block.to < doc.length ? block.to + 1 : block.to;
      const from = to === block.to && block.from > 0 ? block.from - 1 : block.from;
      view.dispatch({ changes: { from, to }, selection: { anchor: from } });
      view.focus();
    };

    const toolbar = document.createElement('div');
    toolbar.className = 'cm-mermaid-toolbar';
    const label = document.createElement('span');
    label.className = 'cm-mermaid-label';
    label.textContent = 'Mermaid';
    const spacer = document.createElement('span');
    spacer.className = 'cm-codeblock-spacer';
    toolbar.append(label, spacer, toolButton('Sửa sơ đồ', EditIcon, edit), toolButton('Xóa sơ đồ', CloseIcon, remove));

    const diagram = document.createElement('div');
    diagram.className = 'cm-mermaid-diagram';
    diagram.textContent = 'Đang vẽ sơ đồ…';
    diagram.title = 'Bấm để sửa';
    diagram.addEventListener('click', edit);

    renderMermaid(this.code).then((result) => {
      if (result.svg) diagram.innerHTML = result.svg;
      else {
        diagram.textContent = '';
        const err = document.createElement('div');
        err.className = 'mermaid-error';
        err.textContent = `Lỗi cú pháp Mermaid: ${result.error}`;
        const pre = document.createElement('pre');
        pre.className = 'cm-mermaid-source';
        pre.textContent = this.code;
        diagram.append(err, pre);
      }
      view.requestMeasure(); // chiều cao thay đổi sau khi render
    });

    wrap.append(toolbar, diagram);

    // Chiều cao sơ đồ còn đổi sau khi vẽ (font tải xong, svg co giãn...): đo lại để số hàng và các dòng bên dưới không lệch
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => view.requestMeasure());
      this.observer.observe(wrap);
    }
    return wrap;
  }

  destroy() {
    this.observer?.disconnect();
  }

  // Nút/sơ đồ tự xử lý chuột, editor không can thiệp
  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state) {
  const ranges = findMermaidBlocks(state).map((b) =>
    Decoration.replace({ widget: new MermaidWidget(b.code), block: true }).range(b.from, b.to),
  );
  return Decoration.set(ranges);
}

// Dùng StateField (không phải ViewPlugin) vì widget thay thế nhiều dòng liền
export const mermaidBlocks = StateField.define({
  create: buildDecorations,
  update(decos, tr) {
    // Cây cú pháp được phân tích dần nên cũng dựng lại khi cây thay đổi
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return buildDecorations(tr.state);
    return decos;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    // Con trỏ nhảy qua cả sơ đồ, không lọt vào bên trong khối
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

// Chèn khối mermaid mới tại vị trí pos (dùng cho nút Mermaid trên thanh công cụ)
export function insertMermaidBlock(view, pos, code) {
  const { state } = view;
  pos = Math.min(pos, state.doc.length);
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos).trim() ? '\n' : '';
  const after = state.sliceDoc(pos, line.to).trim() || line.to === state.doc.length ? '\n' : '';
  const insert = before + '```mermaid\n' + code + '\n```' + after;
  view.dispatch({ changes: { from: pos, to: pos, insert }, selection: { anchor: pos + insert.length } });
}
