import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// Việc cần làm ("- [ ] ") hiện thành ô tích bấm được, trích dẫn ("> ") hiện thành thanh dọc bên trái.
// Ký hiệu markdown được ẩn; nội dung vẫn lưu dạng chữ thường.

const TODO = /^(\s*)- \[([ xX])\] /;
const QUOTE = /^(\s*)>[ ]?/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  toDOM(view) {
    const box = document.createElement('span');
    box.className = `cm-todo-box ${this.checked ? 'checked' : ''}`;
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(this.checked));
    box.innerHTML = this.checked
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : '';
    // Bấm để đổi trạng thái: sửa ký tự trong "[ ]" / "[x]"
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      const start = view.posAtDOM(box);
      const line = view.state.doc.lineAt(start);
      const m = TODO.exec(line.text);
      if (!m) return;
      const at = line.from + m[1].length + 3;
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.checked ? ' ' : 'x' }, userEvent: 'input.format' });
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

const hide = Decoration.replace({});
const todoLine = Decoration.line({ class: 'cm-todo-line' });
const todoDoneLine = Decoration.line({ class: 'cm-todo-line cm-todo-done' });
// Thanh dọc của khối trích dẫn: dòng đầu/cuối của khối được co bớt hai đầu để không dính vào dòng bên cạnh
const hrLine = Decoration.line({ class: 'cm-hr-line' });
const quoteLines = {};
for (const first of [false, true]) {
  for (const last of [false, true]) {
    quoteLines[`${first}${last}`] = Decoration.line({ class: `cm-quote-line${first ? ' cm-quote-first' : ''}${last ? ' cm-quote-last' : ''}` });
  }
}
const widgets = { false: Decoration.replace({ widget: new CheckboxWidget(false) }), true: Decoration.replace({ widget: new CheckboxWidget(true) }) };

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true;
  }
  return false;
}

function build(view) {
  const { state } = view;
  const builder = new RangeSetBuilder();
  const hidden = new RangeSetBuilder();
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.from <= last) continue;
      last = line.from;
      const isHr = HR.test(line.text);
      const todo = !isHr && TODO.exec(line.text);
      const quote = !isHr && !todo && QUOTE.exec(line.text);
      if (!isHr && !todo && !quote) continue;
      if (inCode(state, line.from)) continue;
      if (isHr) {
        // Đường kẻ ngang: ẩn ký hiệu "---", vẽ đường bằng nền của dòng
        builder.add(line.from, line.from, hrLine);
        if (line.to > line.from) {
          builder.add(line.from, line.to, hide);
          hidden.add(line.from, line.to, hide);
        }
        continue;
      }
      if (todo) {
        const checked = todo[2] !== ' ';
        const start = line.from + todo[1].length;
        builder.add(line.from, line.from, checked ? todoDoneLine : todoLine);
        const w = widgets[checked];
        builder.add(start, line.from + todo[0].length, w);
        hidden.add(start, line.from + todo[0].length, w);
      } else {
        const prev = line.number > 1 && QUOTE.test(state.doc.line(line.number - 1).text);
        const next = line.number < state.doc.lines && QUOTE.test(state.doc.line(line.number + 1).text);
        builder.add(line.from, line.from, quoteLines[`${!prev}${!next}`]);
        const start = line.from + quote[1].length;
        builder.add(start, line.from + quote[0].length, hide);
        hidden.add(start, line.from + quote[0].length, hide);
      }
    }
  }
  return { decorations: builder.finish(), hidden: hidden.finish() };
}

export const blockStyles = ViewPlugin.fromClass(
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
