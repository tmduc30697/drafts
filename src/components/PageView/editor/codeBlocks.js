import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { CopyIcon, CloseIcon } from './editorIcons.js';
import { selectBlock } from './blockSelect.js';

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
const MIN_WIDTH = 160;

// Dòng mở khối: ```js width=480 → { prefix: '```', lang: 'js', width: 480 } (width = null: rộng hết cột).
// Độ rộng ghi sau tên ngôn ngữ: các công cụ markdown khác chỉ đọc từ đầu tiên nên không bị ảnh hưởng.
function parseFence(text) {
  const m = /^(\s*(?:`{3,}|~{3,}))\s*(.*)$/.exec(text);
  if (!m) return null;
  const words = m[2].trim().split(/\s+/).filter(Boolean);
  const lang = words[0] && !words[0].includes('=') ? words[0] : '';
  const w = /(?:^|\s)width=(\d+)/.exec(m[2]);
  return { prefix: m[1], lang, width: w ? Number(w[1]) : null };
}

function fenceText({ prefix, lang, width }) {
  return prefix + lang + (width ? ` width=${width}` : '');
}

// Ghi lại dòng mở của khối chứa pos với các thay đổi (lang / width)
function updateFence(view, pos, patch) {
  const node = fencedCodeAt(view.state, pos);
  if (!node) return;
  const line = view.state.doc.lineAt(node.from);
  const fence = parseFence(line.text);
  if (!fence) return;
  const text = fenceText({ ...fence, ...patch });
  if (text !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
}

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

// Các phần tử dòng của khối code bắt đầu từ dòng đầu (begin) đến dòng cuối
function blockLineElements(begin) {
  const els = [begin];
  for (let el = begin.nextElementSibling; el && el.classList.contains('cm-codeblock'); el = el.nextElementSibling) {
    if (el.classList.contains('cm-codeblock-begin')) break;
    els.push(el);
    if (el.classList.contains('cm-codeblock-end') || el.classList.contains('cm-codeblock-last')) break;
  }
  return els;
}

// Tay nắm ở mép phải khung: kéo để đổi độ rộng khối, nhấp đúp để trả về rộng hết cột
function resizeHandle(view, wrap) {
  const handle = document.createElement('span');
  handle.className = 'cm-codeblock-resize';
  handle.title = 'Kéo để đổi độ rộng, nhấp đúp để trả về rộng hết cột';
  handle.addEventListener('dblclick', () => {
    if (view.state.readOnly) return;
    const begin = handle.closest('.cm-line');
    if (begin) for (const el of blockLineElements(begin)) el.style.removeProperty('--code-w');
    updateFence(view, view.posAtDOM(wrap), { width: null });
  });
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || view.state.readOnly) return;
    const begin = handle.closest('.cm-line');
    if (!begin) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const els = blockLineElements(begin);
    const left = begin.getBoundingClientRect().left + begin.clientLeft;
    // Rộng nhất: tới cách mép phải vùng soạn thảo 16px (màn hình hẹp: hết cột chữ)
    const column = view.contentDOM.getBoundingClientRect().right - left;
    const area = view.dom.closest('.content');
    const wide = area && window.matchMedia('(min-width: 768px)').matches;
    const max = wide ? Math.max(column, area.getBoundingClientRect().left + area.clientWidth - 16 - left) : column;
    let width = null;
    const move = (ev) => {
      const w = Math.round(Math.min(max, Math.max(MIN_WIDTH, ev.clientX - left)));
      width = Math.abs(w - column) <= 6 ? null : w; // gần mép cột chữ: hít vào, coi như rộng hết cột
      for (const el of els) el.style.setProperty('--code-w', `${width ?? column}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      handle.classList.remove('dragging');
      // Bỏ giá trị tạm lúc kéo; độ rộng thật lấy từ dòng mở (decoration gắn lại vào dòng)
      for (const el of els) el.style.removeProperty('--code-w');
      updateFence(view, view.posAtDOM(wrap), { width });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  return handle;
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
      if (view.state.readOnly) {
        select.value = this.lang;
        return;
      }
      // Chỉ đổi tên ngôn ngữ, giữ độ rộng
      updateFence(view, view.posAtDOM(wrap), { lang: select.value });
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

    const remove = button('cm-codeblock-btn', 'Xóa khối code', CloseIcon, () => {
      if (view.state.readOnly) return;
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

    wrap.append(select, spacer, copy, remove, resizeHandle(view, wrap));
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
        const fence = parseFence(first.text);
        const style = fence?.width ? `--code-w: ${fence.width}px` : null;
        const closed = lastLine.number > first.number && FENCE_CLOSE.test(lastLine.text);
        // Khối mermaid đã đóng được vẽ thành sơ đồ (mermaidBlocks.js), không trang trí ở đây
        if (closed && open && open[3].toLowerCase() === 'mermaid') return false;

        // Nền + font cho mọi dòng của khối
        for (let n = first.number; n <= lastLine.number; n++) {
          const line = doc.line(n);
          const cls = ['cm-codeblock'];
          if (n === first.number) cls.push('cm-codeblock-begin');
          if (n === lastLine.number) cls.push(closed ? 'cm-codeblock-end' : 'cm-codeblock-last');
          decos.push(Decoration.line({ class: cls.join(' '), attributes: style ? { style } : {} }).range(line.from));
        }

        // Dòng mở: thay bằng thanh tiêu đề
        if (open) {
          const raw = (fence?.lang || '').toLowerCase();
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
      this.measureHandles(view);
      // Bề rộng cột chữ cho CSS (--col-w): tính phần khối code nới ra quá cột
      this.columnObserver = new ResizeObserver(() => {
        view.dom.style.setProperty('--col-w', `${view.contentDOM.getBoundingClientRect().width}px`);
      });
      this.columnObserver.observe(view.contentDOM);
    }
    destroy() {
      this.columnObserver.disconnect();
    }
    update(u) {
      // Cây cú pháp được phân tích dần nên cũng phải dựng lại khi cây thay đổi
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        Object.assign(this, buildDecorations(u.view));
      }
      if (u.docChanged || u.geometryChanged || u.viewportChanged) this.measureHandles(u.view);
    }
    // Tay nắm đổi độ rộng nằm trong dòng đầu khối: cho cao bằng cả khối
    measureHandles(view) {
      view.requestMeasure({
        key: this,
        read: () =>
          [...view.contentDOM.querySelectorAll('.cm-codeblock-resize')].map((handle) => {
            const node = fencedCodeAt(view.state, view.posAtDOM(handle));
            if (!node) return [handle, 0];
            const top = view.lineBlockAt(node.from);
            const bottom = view.lineBlockAt(view.state.doc.lineAt(node.to).from);
            return [handle, bottom.bottom - top.top];
          }),
        write: (items) => {
          // trừ khoảng trống 4px trên và dưới khung (xem .cm-codeblock-begin / -end)
          for (const [handle, h] of items) handle.style.height = `${Math.max(0, h - 8)}px`;
        },
      });
    }
  },
  {
    decorations: (v) => v.decorations,
    // Con trỏ nhảy qua thanh tiêu đề và dòng đóng như một khối, không lọt vào giữa ```
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic || Decoration.none),
  },
);

// Bấm vào phần dòng nằm bên phải khung (khung đã thu hẹp): chọn cả khối như bảng, không đặt con trỏ vào cuối dòng code
const clickBesideBox = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0) return false;
    const line = e.target.closest?.('.cm-codeblock');
    if (!line) return false;
    const box = line.getBoundingClientRect().left + line.clientLeft + parseFloat(getComputedStyle(line, '::before').width);
    if (e.clientX <= box) return false;
    const node = fencedCodeAt(view.state, view.posAtDOM(line));
    if (!node) return false;
    e.preventDefault();
    selectBlock(view, node.from);
    return true;
  },
});

export const codeBlocks = [codeBlockPlugin, clickBesideBox];
