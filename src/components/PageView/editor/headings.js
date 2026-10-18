import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutterLineClass, keymap } from '@codemirror/view';
import { codeFolding, foldEffect, foldKeymap, foldService, foldedRanges, syntaxTree, unfoldEffect } from '@codemirror/language';
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

// Thu gọn / mở rộng theo tiêu đề: nội dung dưới một tiêu đề, cho đến tiêu đề kế tiếp cùng cấp hoặc cấp cao hơn (hoặc hết trang),
// được gập lại thành dấu "…". Bấm vào số hàng của tiêu đề để gập / mở.
function headingLevel(state, line) {
  const m = HEADING.exec(line.text);
  return m && !inCode(state, line.from) ? m[1].length : 0;
}

const headingFoldRange = (state, line) => {
  const level = headingLevel(state, line);
  if (!level) return null;
  let end = line.to; // cuối dòng có chữ cuối cùng thuộc phần này (bỏ các dòng trống ở cuối)
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n);
    const l = headingLevel(state, next);
    if (l && l <= level) break;
    if (next.text.trim()) end = next.to;
  }
  return end > line.to ? { from: line.to, to: end } : null;
};

const headingFold = foldService.of((state, lineStart) => headingFoldRange(state, state.doc.lineAt(lineStart)));

// Bấm vào số hàng của một tiêu đề để gập / mở phần của nó. Trả về true nếu dòng đó là tiêu đề có nội dung bên dưới.
export function toggleHeadingFoldAt(view, pos) {
  const line = view.state.doc.lineAt(pos);
  const range = headingFoldRange(view.state, line);
  if (!range) return false;
  let hit = null;
  foldedRanges(view.state).between(range.from, range.from, (from, to) => {
    if (from === range.from) hit = { from, to };
  });
  if (hit) view.dispatch({ effects: unfoldEffect.of(hit) });
  else view.dispatch({ effects: foldEffect.of(range), selection: { anchor: line.to } });
  return true;
}

// Số hàng của tiêu đề có thể bấm: đánh dấu bằng class để đổi con trỏ chuột
class FoldableMarker extends GutterMarker {
  elementClass = 'cm-foldable-ln';
}
const foldableMarker = new FoldableMarker();
const foldableNumbers = gutterLineClass.compute(['doc'], (state) => {
  const b = new RangeSetBuilder();
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (headingFoldRange(state, line)) b.add(line.from, line.from, foldableMarker);
  }
  return b.finish();
});

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
      // Mũi tên thu gọn chỉ cho tiêu đề có nội dung bên dưới
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
      const foldChanged = u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)));
      if (u.docChanged || u.viewportChanged || foldChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) Object.assign(this, build(u.view));
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) => [
      EditorView.atomicRanges.of((view) => view.plugin(p)?.hidden ?? Decoration.none),
    ],
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

// Chỗ gập hiển thị là dấu "…" (bấm để mở rộng lại)
const foldPlaceholder = codeFolding({
  placeholderDOM(view, onclick) {
    const el = document.createElement('span');
    el.className = 'cm-fold-placeholder';
    el.textContent = '…';
    el.title = 'Mở rộng';
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', onclick);
    return el;
  },
});

export const headings = [
  plugin,
  headingFold,
  foldableNumbers,
  foldPlaceholder,
  keymap.of(foldKeymap),
  keymap.of([
    { key: 'Backspace', run: backspaceInHeading },
    // Như Google Docs / Notion: ⌘⌥1 / 2 / 3 (bấm lại để bỏ)
    { key: 'Mod-Alt-1', run: (view) => (applyKind(view, kind('h1')), true) },
    { key: 'Mod-Alt-2', run: (view) => (applyKind(view, kind('h2')), true) },
    { key: 'Mod-Alt-3', run: (view) => (applyKind(view, kind('h3')), true) },
  ]),
];
