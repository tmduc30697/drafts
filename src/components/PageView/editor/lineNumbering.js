import { RangeSet, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
  gutterWidgetClass,
  lineNumberMarkers,
  lineNumbers,
  lineNumberWidgetMarker,
  ViewPlugin,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { findTables } from './tables.js';
import { toggleHeadingFoldAt } from './headings.js';

// Số dòng theo cách hiển thị: mỗi khối đặc biệt (bảng, sơ đồ Mermaid, khối code) tính là một dòng.
// Khối chiếm dòng 3–6 của văn bản thì hiện số 3 (căn giữa theo chiều cao khối), dòng ngay sau khối là 4.
// Con trỏ nằm trong khối thì cả khối được tô như dòng đang chọn.

class NumberMarker extends GutterMarker {
  constructor(text) {
    super();
    this.text = text;
  }

  eq(other) {
    return other.text === this.text;
  }

  toDOM() {
    return document.createTextNode(this.text);
  }
}

// Số của khối code: đặt ở dòng đầu khối; centerBlockNumbers dịch nó xuống giữa chiều cao cả khối
class CodeNumberMarker extends GutterMarker {
  constructor(text, first, last) {
    super();
    this.text = text;
    this.first = first;
    this.last = last;
  }

  eq(other) {
    return other.text === this.text && other.first === this.first && other.last === this.last;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-block-number';
    span.textContent = this.text;
    span.dataset.first = this.first;
    span.dataset.last = this.last;
    return span;
  }
}

// Tô số / ô số của khối như dòng đang chọn
class ActiveMarker extends GutterMarker {
  constructor() {
    super();
    this.elementClass = 'cm-activeLineGutter';
  }
}
const active = new ActiveMarker();

// Marker rỗng cho các dòng bên trong khối code (có toDOM nên gutter bỏ số mặc định của dòng đó)
class EmptyMarker extends GutterMarker {
  toDOM() {
    return document.createTextNode('');
  }
}
const empty = new EmptyMarker();

const activeBlockLine = Decoration.line({ class: 'cm-activeBlockLine' });

// Các khối nhiều dòng: [{ first, last, code }] (số dòng trong văn bản), sắp theo thứ tự
function findBlocks(state) {
  const { doc } = state;
  const blocks = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      blocks.push({ first: doc.lineAt(node.from).number, last: doc.lineAt(node.to).number, code: true });
      return false;
    },
  });
  for (const t of findTables(state)) blocks.push({ first: doc.lineAt(t.from).number, last: doc.lineAt(t.to).number, code: false });
  return blocks.filter((b) => b.last > b.first).sort((a, b) => a.first - b.first);
}

// Số hiển thị của dòng n (dòng bên trong khối dùng số của dòng đầu khối)
function visualNumber(blocks, n) {
  let hidden = 0;
  for (const b of blocks) {
    if (b.last < n) hidden += b.last - b.first;
    else if (b.first <= n) return b.first - hidden;
    else break;
  }
  return n - hidden;
}

function build(state) {
  const blocks = findBlocks(state);
  const ranges = [];
  for (const b of blocks) {
    const first = state.doc.line(b.first);
    if (b.code) ranges.push(new CodeNumberMarker(String(visualNumber(blocks, b.first)), b.first, b.last).range(first.from));
    for (let n = b.first + 1; n <= b.last; n++) ranges.push(empty.range(state.doc.line(n).from));
  }
  return { blocks, markers: RangeSet.of(ranges) };
}

const blockField = StateField.define({
  create: build,
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return build(tr.state);
    return value;
  },
});

// Khối nhiều dòng (bảng, Mermaid, khối code) chứa vị trí pos: { first, last, code } (số dòng), không có thì null
export function blockAt(state, pos) {
  const n = state.doc.lineAt(pos).number;
  return state.field(blockField).blocks.find((b) => b.first <= n && n <= b.last) || null;
}

// Khối code đang chứa con trỏ (bảng / Mermaid là widget, xử lý riêng)
function activeCodeBlock(state) {
  const n = state.doc.lineAt(state.selection.main.head).number;
  return state.field(blockField).blocks.find((b) => b.code && b.first <= n && n <= b.last) || null;
}

function blockLines(state, b) {
  const lines = [];
  for (let n = b.first; n <= b.last; n++) lines.push(state.doc.line(n).from);
  return lines;
}

// Chiều cao dòng chỉ biết sau khi CodeMirror đo (và đổi khi dòng code dài xuống dòng): căn lại sau mỗi lần đo
const centerBlockNumbers = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.schedule(view);
    }

    update(u) {
      if (u.docChanged || u.geometryChanged || u.viewportChanged) this.schedule(u.view);
    }

    schedule(view) {
      view.requestMeasure({
        key: this,
        read: () => {
          const { doc } = view.state;
          return [...view.dom.querySelectorAll('.cm-block-number')].map((span) => {
            const first = Number(span.dataset.first);
            const last = Number(span.dataset.last);
            if (last > doc.lines) return [span, 0];
            const top = view.lineBlockAt(doc.line(first).from);
            const bottom = view.lineBlockAt(doc.line(last).from);
            return [span, (bottom.bottom - top.top - top.height) / 2];
          });
        },
        write: (items) => {
          for (const [span, offset] of items) span.style.top = `${offset}px`;
        },
      });
    }
  },
);

export const lineNumbering = [
  centerBlockNumbers,
  blockField,
  lineNumberMarkers.compute([blockField], (state) => state.field(blockField).markers),
  // Bảng / sơ đồ Mermaid là widget thay cả khối: gutter hỏi số qua đây
  lineNumberWidgetMarker.of(
    (view, widget, block) =>
      new NumberMarker(String(visualNumber(view.state.field(blockField).blocks, view.state.doc.lineAt(block.from).number))),
  ),
  gutterWidgetClass.of((view, widget, block) => {
    const { head } = view.state.selection.main;
    return head >= block.from && head <= block.to ? active : null;
  }),
  // Con trỏ trong khối code: tô ô số của mọi dòng trong khối và nền kéo dài của các dòng đó
  gutterLineClass.compute(['selection', blockField], (state) => {
    const b = activeCodeBlock(state);
    return b ? RangeSet.of(blockLines(state, b).map((pos) => active.range(pos))) : RangeSet.empty;
  }),
  EditorView.decorations.compute(['selection', blockField], (state) => {
    const b = activeCodeBlock(state);
    return b ? Decoration.set(blockLines(state, b).map((pos) => activeBlockLine.range(pos))) : Decoration.none;
  }),
  lineNumbers({
    // Số lớn hơn số dòng thật chỉ dùng để đo độ rộng gutter: giữ nguyên
    formatNumber: (n, state) => String(n > state.doc.lines ? n : visualNumber(state.field(blockField).blocks, n)),
    // Bấm vào số hàng của một tiêu đề: gập / mở phần nội dung của tiêu đề đó
    domEventHandlers: {
      mousedown: (view, line, event) => {
        if (event.button !== 0 || !toggleHeadingFoldAt(view, line.from)) return false;
        event.preventDefault();
        return true;
      },
    },
  }),
];
