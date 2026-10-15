import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { CopyIcon, TrashIcon } from './editorIcons.js';

// Khối code kiểu Notion. Trong văn bản vẫn lưu dạng Markdown:
//   ```python
//   print('hi')
//   ```
// nhưng khi hiển thị: dòng mở ``` được thay bằng thanh tiêu đề (chọn ngôn ngữ, sao chép, xóa),
// dòng đóng ``` được ẩn đi; cả khối có nền xám, font monospace.

// Danh sách ngôn ngữ trong dropdown: [mã viết sau ```, tên hiển thị]. '' = Plain text (không tô màu)
export const CODE_LANGUAGES = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['markdown', 'Markdown'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
];

// Tên viết tắt hay gặp trong bản cũ -> mã chuẩn để dropdown chọn đúng
const ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', yml: 'yaml', 'c++': 'cpp', cs: 'csharp' };

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

// Tìm khối code (node FencedCode) chứa vị trí pos
function fencedCodeAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'FencedCode') return node;
  }
  return null;
}

// Con trỏ có đang nằm trong khối code không
export function inCodeBlock(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'FencedCode') return true;
  }
  return false;
}

function button(className, label, icon, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = icon;
  b.addEventListener('mousedown', (e) => e.preventDefault()); // không làm editor mất con trỏ
  b.addEventListener('click', onClick);
  return b;
}

// Thanh tiêu đề của khối code (thay cho dòng ```lang)
class CodeHeaderWidget extends WidgetType {
  constructor(lang) {
    super();
    this.lang = lang;
  }

  eq(other) {
    return other.lang === this.lang;
  }

  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-codeblock-header';

    // Dropdown chọn ngôn ngữ: đổi thì sửa phần chữ sau ``` ở dòng mở
    const select = document.createElement('select');
    select.className = 'cm-codeblock-lang';
    select.setAttribute('aria-label', 'Ngôn ngữ của khối code');
    const known = CODE_LANGUAGES.some(([id]) => id === this.lang);
    const options = known ? CODE_LANGUAGES : [...CODE_LANGUAGES, [this.lang, this.lang]];
    for (const [id, name] of options) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      if (id === this.lang) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const line = view.state.doc.lineAt(view.posAtDOM(wrap));
      const m = FENCE_OPEN.exec(line.text);
      if (!m) return;
      const from = line.from + m[1].length + m[2].length;
      view.dispatch({ changes: { from, to: line.to, insert: select.value } });
      view.focus();
    });

    const copy = button('cm-codeblock-btn', 'Sao chép code', CopyIcon, () => {
      const node = fencedCodeAt(view.state, view.posAtDOM(wrap));
      if (!node) return;
      const { doc } = view.state;
      const first = doc.lineAt(node.from).number + 1;
      let last = doc.lineAt(node.to).number;
      if (!FENCE_CLOSE.test(doc.line(last).text) || last < first) last += 1; // khối chưa đóng
      const lines = [];
      for (let n = first; n < last && n <= doc.lines; n++) lines.push(doc.line(n).text);
      navigator.clipboard?.writeText(lines.join('\n'));
      copy.classList.add('done');
      setTimeout(() => copy.classList.remove('done'), 1200);
    });

    const remove = button('cm-codeblock-btn', 'Xóa khối code', TrashIcon, () => {
      const node = fencedCodeAt(view.state, view.posAtDOM(wrap));
      if (!node) return;
      const { doc } = view.state;
      const start = doc.lineAt(node.from);
      const end = doc.lineAt(node.to);
      // Xóa cả các dòng của khối, kèm một dấu xuống dòng để không để lại dòng trống
      const to = end.to < doc.length ? end.to + 1 : end.to;
      const from = to === end.to && start.from > 0 ? start.from - 1 : start.from;
      view.dispatch({ changes: { from, to }, selection: { anchor: from } });
      view.focus();
    });

    const spacer = document.createElement('span');
    spacer.className = 'cm-codeblock-spacer';

    wrap.append(select, spacer, copy, remove);
    return wrap;
  }

  // Để dropdown/nút tự xử lý chuột và bàn phím, editor không can thiệp
  ignoreEvent() {
    return true;
  }
}

function buildDecorations(view) {
  const { doc } = view.state;
  const decos = [];
  const atomic = [];
  const seen = new Set();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return;
        if (seen.has(node.from)) return false;
        seen.add(node.from);

        const first = doc.lineAt(node.from);
        const lastLine = doc.lineAt(node.to);
        const open = FENCE_OPEN.exec(first.text);
        const closed = lastLine.number > first.number && FENCE_CLOSE.test(lastLine.text);
        // Khối mermaid đã đóng được vẽ thành sơ đồ (mermaidBlocks.js), không trang trí ở đây
        if (closed && open && open[3].toLowerCase() === 'mermaid') return false;

        // Nền + font cho mọi dòng của khối
        for (let n = first.number; n <= lastLine.number; n++) {
          const line = doc.line(n);
          const cls = ['cm-codeblock'];
          if (n === first.number) cls.push('cm-codeblock-begin');
          if (n === lastLine.number) cls.push(closed ? 'cm-codeblock-end' : 'cm-codeblock-last');
          decos.push(Decoration.line({ class: cls.join(' ') }).range(line.from));
        }

        // Dòng mở: thay bằng thanh tiêu đề
        if (open) {
          const raw = open[3].toLowerCase();
          const lang = ALIASES[raw] || raw;
          const header = Decoration.replace({ widget: new CodeHeaderWidget(lang) });
          decos.push(header.range(first.from, first.to));
          atomic.push(header.range(first.from, first.to));
        }
        // Dòng đóng: ẩn đi
        if (closed && lastLine.length) {
          const hidden = Decoration.replace({});
          decos.push(hidden.range(lastLine.from, lastLine.to));
          atomic.push(hidden.range(lastLine.from, lastLine.to));
        }
        return false;
      },
    });
  }
  return { decorations: Decoration.set(decos, true), atomic: Decoration.set(atomic, true) };
}

const codeBlockPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      Object.assign(this, buildDecorations(view));
    }
    update(u) {
      // Cây cú pháp được phân tích dần nên cũng phải dựng lại khi cây thay đổi
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        Object.assign(this, buildDecorations(u.view));
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Con trỏ nhảy qua thanh tiêu đề và dòng đóng như một khối, không lọt vào giữa ```
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic || Decoration.none),
  },
);

export const codeBlocks = [codeBlockPlugin];
