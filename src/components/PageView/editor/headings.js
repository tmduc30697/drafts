import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { applyKind, KINDS } from './lineKinds.js';

// Tiêu đề markdown "# ", "## ", "### ": chữ to và đậm theo cấp, ký hiệu # được ẩn (con trỏ nhảy qua như một ký tự).
// Nội dung vẫn lưu dạng chữ thường.

const HEADING = /^(#{1,3}) /;
const lineDeco = [1, 2, 3].map((n) => Decoration.line({ class: `cm-heading cm-h${n}` }));
const hide = Decoration.replace({});

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true;
  }
  return false;
}

function build(view) {
  const { state } = view;
  const decos = new RangeSetBuilder();
  const hidden = new RangeSetBuilder();
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.from <= last) continue;
      last = line.from;
      const m = HEADING.exec(line.text);
      if (!m || inCode(state, line.from)) continue;
      decos.add(line.from, line.from, lineDeco[m[1].length - 1]);
      decos.add(line.from, line.from + m[0].length, hide);
      hidden.add(line.from, line.from + m[0].length, hide);
    }
  }
  return { decorations: decos.finish(), hidden: hidden.finish() };
}

const plugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      Object.assign(this, build(view));
    }

    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) Object.assign(this, build(u.view));
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.hidden ?? Decoration.none),
  },
);

// Backspace ngay sau ký hiệu # (đầu chữ của tiêu đề) hoạt động như ở đầu một dòng bình thường, không âm thầm làm mất kiểu tiêu đề:
// - dòng phía trên trống: xóa dòng trống đó, tiêu đề được kéo lên và vẫn là tiêu đề;
// - dòng phía trên có chữ: nối chữ của tiêu đề vào cuối dòng đó (bỏ ký hiệu # vì không còn ở đầu dòng);
// - tiêu đề ở dòng đầu tiên của trang: bỏ kiểu tiêu đề, giữ chữ.
function backspaceInHeading(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const m = HEADING.exec(line.text);
  if (!m || sel.head !== line.from + m[0].length || inCode(state, line.from)) return false;
  let change;
  if (line.number === 1) {
    change = { from: line.from, to: line.from + m[0].length };
  } else {
    const prev = state.doc.line(line.number - 1);
    change = prev.text.trim() ? { from: prev.to, to: line.from + m[0].length } : { from: prev.from, to: line.from };
  }
  view.dispatch({ changes: change, userEvent: 'delete' });
  return true;
}

const kind = (id) => KINDS.find((k) => k.id === id);

export const headings = [
  plugin,
  keymap.of([
    { key: 'Backspace', run: backspaceInHeading },
    // Như Google Docs / Notion: ⌘⌥1 / 2 / 3 (bấm lại để bỏ)
    { key: 'Mod-Alt-1', run: (view) => (applyKind(view, kind('h1')), true) },
    { key: 'Mod-Alt-2', run: (view) => (applyKind(view, kind('h2')), true) },
    { key: 'Mod-Alt-3', run: (view) => (applyKind(view, kind('h3')), true) },
  ]),
];
