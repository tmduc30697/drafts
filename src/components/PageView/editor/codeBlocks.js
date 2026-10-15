import { syntaxTree } from '@codemirror/language';
import { Decoration, ViewPlugin } from '@codemirror/view';

// Tô nền cho các dòng thuộc khối code (```...```) để nhìn ra "khối" giữa văn bản thuần.
// Dòng đầu/cuối (dấu ```) có class riêng để bo góc và làm mờ.
function buildDecorations(view) {
  const { doc } = view.state;
  const lines = new Map(); // line.from -> class
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return;
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        for (let n = first; n <= last; n++) {
          const cls = ['cm-codeblock'];
          if (n === first) cls.push('cm-codeblock-begin');
          if (n === last) cls.push('cm-codeblock-end');
          lines.set(doc.line(n).from, cls.join(' '));
        }
        return false; // không cần duyệt vào trong khối code
      },
    });
  }
  return Decoration.set(
    [...lines].map(([pos, cls]) => Decoration.line({ class: cls }).range(pos)),
    true,
  );
}

export const codeBlockBackground = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(u) {
      // Cây cú pháp được phân tích dần nên cũng phải dựng lại khi cây thay đổi
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Con trỏ có đang nằm trong khối code không
export function inCodeBlock(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'FencedCode') return true;
  }
  return false;
}
