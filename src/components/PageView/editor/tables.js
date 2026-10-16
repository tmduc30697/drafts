import { StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { redo, undo } from '@codemirror/commands';
import { CloseIcon } from './editorIcons.js';
import { selectBlock } from './blockSelect.js';

// Bảng markdown (GFM) hiện thành bảng sửa trực tiếp như Notion: bấm vào ô để gõ, không bao giờ hiện chữ gốc.
// Nội dung vẫn lưu dạng chữ thường:
//   | Cột 1 | Cột 2 |
//   | --- | :---: |
//   | a | b |
// Trong ô: Tab / Shift+Tab sang ô kế / ô trước, Enter xuống ô bên dưới (hàng cuối thì thêm hàng),
// mũi tên lên/xuống chuyển hàng, Esc thoát ra khỏi bảng.
// Rê chuột: thanh "+" ở dưới / bên phải để thêm hàng / cột; tay nắm ở đầu hàng / đầu cột mở menu chèn, xóa.

const ROW = /^\s*\|.*\|\s*$/;
const DELIM = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
// Kích thước cột / hàng người dùng kéo chỉnh (px, 0 = tự động) lưu ở dòng chú thích ngay trên bảng
// (markdown không có chỗ lưu; chú thích HTML không hiện khi mở file ở nơi khác):
//   <!-- table cols=160,0,240 rows=0,60 -->
const SIZES = /^\s*<!--\s*table\b(.*?)-->\s*$/;
const MIN_COL = 40;
const MIN_ROW = 24;

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true;
  }
  return false;
}

// Tách một dòng "| a | b |" thành các ô (đã bỏ khoảng trắng hai đầu, "\|" là dấu | trong ô)
function splitRow(text) {
  const cells = [];
  let cur = '';
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      if (started) cells.push(cur.trim());
      started = true;
      cur = '';
    } else cur += ch;
  }
  return cells;
}

// Văn bản markdown → { align: ['', 'center', ...], rows: [[ô tiêu đề...], [ô...], ...], widths: [px...], heights: [px...] }
function parseTable(source) {
  const lines = source.split('\n');
  const sizes = SIZES.exec(lines[0]);
  if (sizes) lines.shift();
  const head = splitRow(lines[0]);
  const width = head.length;
  const align = splitRow(lines[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
  const fit = (cells, n, empty) => Array.from({ length: n }, (_, i) => cells[i] ?? empty);
  const rows = [head, ...lines.slice(2).map((l) => fit(splitRow(l), width, ''))];
  const nums = (key) => {
    const m = sizes && new RegExp(`\\b${key}=([\\d,]*)`).exec(sizes[1]);
    return m ? m[1].split(',').map((x) => Number(x) || 0) : [];
  };
  return { align: fit(align, width, ''), rows, widths: fit(nums('cols'), width, 0), heights: fit(nums('rows'), rows.length, 0) };
}

function serialize({ align, rows, widths = [], heights = [] }) {
  const cell = (t) => t.replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
  const line = (cells) => '| ' + cells.map(cell).join(' | ') + ' |';
  const delim = '| ' + align.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : '---')).join(' | ') + ' |';
  const table = [line(rows[0]), delim, ...rows.slice(1).map(line)];
  // Chỉ ghi dòng kích thước khi có cột / hàng đã chỉnh
  const attrs = [];
  if (widths.some(Boolean)) attrs.push(`cols=${widths.map((w) => w || 0).join(',')}`);
  if (heights.some(Boolean)) attrs.push(`rows=${heights.map((h) => h || 0).join(',')}`);
  if (attrs.length) table.unshift(`<!-- table ${attrs.join(' ')} -->`);
  return table.join('\n');
}

// Các bảng hoàn chỉnh ([dòng kích thước] + dòng tiêu đề + dòng gạch phân cách + các hàng): [{ from, to }]
export function findTables(state) {
  const { doc } = state;
  const tables = [];
  for (let n = 1; n < doc.lines; n++) {
    const head = doc.line(n);
    if (!ROW.test(head.text) || !DELIM.test(doc.line(n + 1).text)) continue;
    if (inCode(state, head.from)) continue;
    let last = n + 1;
    while (last < doc.lines && ROW.test(doc.line(last + 1).text)) last++;
    const above = n > 1 ? doc.line(n - 1) : null;
    const from = above && SIZES.test(above.text) ? above.from : head.from;
    tables.push({ from, to: doc.line(last).to });
    n = last;
  }
  return tables;
}

function tableAt(state, pos) {
  return findTables(state).find((t) => pos >= t.from && pos <= t.to) || null;
}

// Ghi bảng mới vào văn bản: chỉ thay đoạn khác nhau (để hoàn tác gộp theo từng lần gõ và đồng bộ nhẹ)
function writeTable(view, table, source, userEvent) {
  const old = view.state.sliceDoc(table.from, table.to);
  if (old === source) return;
  let a = 0;
  while (a < old.length && a < source.length && old[a] === source[a]) a++;
  let b = 0;
  while (b < old.length - a && b < source.length - a && old[old.length - 1 - b] === source[source.length - 1 - b]) b++;
  view.dispatch({
    changes: { from: table.from + a, to: table.to - b, insert: source.slice(a, source.length - b) },
    userEvent,
  });
}

const svg = (body) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${body}</svg>`;
const DOTS_V = svg('<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>');
const DOTS_H = svg('<circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/>');

function button(className, label, html, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = html;
  b.addEventListener('mousedown', (e) => e.preventDefault()); // không lấy focus khỏi ô đang gõ
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

// Menu nổi (cùng kiểu với menu của app) gắn dưới phần tử neo; đóng khi bấm ra ngoài hoặc nhấn Esc
function openMenu(anchor, items, onClose) {
  const menu = document.createElement('div');
  menu.className = 'popover menu';
  const close = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    menu.remove();
    onClose();
  };
  const onDown = (e) => !menu.contains(e.target) && !anchor.contains(e.target) && close();
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  for (const item of items) {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.append(sep);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-item ${item.danger ? 'danger' : ''}`;
    b.textContent = item.label;
    b.disabled = !!item.disabled;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      close();
      item.onClick();
    });
    menu.append(b);
  }
  menu.style.top = '-9999px';
  document.body.append(menu);
  const a = anchor.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  let top = a.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, a.top - height - 4);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, Math.min(a.left, window.innerWidth - width - 8))}px`;
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
}

// Đặt con trỏ trong ô (cuối chữ, hoặc chọn hết chữ)
function focusCell(td, selectAll = false) {
  td.focus();
  const range = document.createRange();
  range.selectNodeContents(td);
  if (!selectAll) range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Con trỏ đang ở dòng đầu/cuối của ô (để mũi tên lên/xuống chuyển hàng)
function caretAtEdge(td, dir) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return true;
  const caret = sel.getRangeAt(0).getBoundingClientRect();
  const box = td.getBoundingClientRect();
  if (!caret.height) return true; // ô trống
  return dir < 0 ? caret.top - box.top < caret.height : box.bottom - caret.bottom < caret.height;
}

// Cố định độ rộng một ô (ô cùng cột đều đặt như nhau thì cột rộng đúng bằng đó)
function setWidth(td, px) {
  td.style.width = td.style.minWidth = td.style.maxWidth = `${px}px`;
}

function cellAt(wrap, r, c) {
  return wrap.querySelector(`[data-r="${r}"][data-c="${c}"]`);
}

class TableWidget extends WidgetType {
  constructor(source, readOnly) {
    super();
    this.source = source;
    this.readOnly = readOnly;
  }

  eq(other) {
    return other.source === this.source && other.readOnly === this.readOnly;
  }

  get estimatedHeight() {
    return 34 * (this.source.split('\n').length + 1);
  }

  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table';
    wrap.cmView = view;
    // Ô đang gõ: [hàng, cột]
    wrap.active = [0, 0];
    // Bấm vào vùng trống của khối (bên phải / quanh bảng, ngoài các ô): chọn bảng như chọn một dòng
    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('th, td, button, .cm-table-resize')) return;
      e.preventDefault();
      const table = tableAt(view.state, view.posAtDOM(wrap));
      if (table) selectBlock(view, table.from);
    });
    wrap.addEventListener('focusin', (e) => {
      const td = e.target.closest?.('th, td');
      if (!td) return;
      wrap.active = [Number(td.dataset.r), Number(td.dataset.c)];
      // Đưa con trỏ của editor về bảng để dòng đang chọn (tô số dòng) là bảng chứ không phải dòng cũ
      const table = tableAt(view.state, view.posAtDOM(wrap));
      if (table && view.state.selection.main.head !== table.from) view.dispatch({ selection: { anchor: table.from } });
    });
    this.render(wrap);
    return wrap;
  }

  // Cập nhật tại chỗ thay vì dựng lại, để không mất con trỏ trong ô đang gõ
  updateDOM(dom) {
    if (dom.source === this.source && dom.readOnly === this.readOnly) return true;
    // Thay đổi đến từ bên ngoài (hoàn tác, máy khác...): vẽ lại, giữ ô đang gõ nếu còn
    const focused = dom.contains(document.activeElement) ? [...dom.active] : null;
    this.render(dom);
    if (focused) {
      const [r, c] = focused;
      const td = cellAt(dom, Math.min(r, dom.data.rows.length - 1), Math.min(c, dom.data.align.length - 1));
      if (td) focusCell(td);
    }
    return true;
  }

  render(wrap) {
    const view = wrap.cmView;
    const data = parseTable(this.source);
    wrap.source = this.source;
    wrap.readOnly = this.readOnly;
    wrap.data = data;
    wrap.textContent = '';

    // Sửa dữ liệu bảng rồi ghi lại vào văn bản.
    // Gõ chữ dùng 'input.type' để lịch sử gộp nhiều lần gõ liền nhau thành một bước hoàn tác.
    const commit = (mutate, userEvent = 'input.table') => {
      const table = tableAt(view.state, view.posAtDOM(wrap));
      if (!table) return null;
      const cur = wrap.data;
      const next = { align: [...cur.align], rows: cur.rows.map((r) => [...r]), widths: [...cur.widths], heights: [...cur.heights] };
      mutate(next);
      const source = serialize(next);
      wrap.source = source; // để updateDOM nhận ra đây là thay đổi của chính mình
      wrap.data = next;
      writeTable(view, table, source, userEvent);
      return next;
    };
    // Đổi số hàng/cột: ghi lại, dựng lại bảng rồi đặt con trỏ vào ô [hàng, cột]
    const rebuild = (mutate, focusAt) => {
      if (!commit(mutate)) return;
      this.source = wrap.source;
      this.render(wrap);
      if (!focusAt) return;
      const td = cellAt(wrap, ...focusAt);
      if (td) focusCell(td);
    };

    const insertRow = (at, col = 0) =>
      rebuild(
        (d) => {
          d.rows.splice(at, 0, d.align.map(() => ''));
          d.heights.splice(at, 0, 0);
        },
        [at, col],
      );
    const insertCol = (at, row = 0) =>
      rebuild(
        (d) => {
          d.align.splice(at, 0, '');
          d.widths.splice(at, 0, 0);
          d.rows.forEach((r) => r.splice(at, 0, ''));
        },
        [row, at],
      );
    const deleteRow = (r) =>
      rebuild((d) => {
        d.rows.splice(r, 1);
        d.heights.splice(r, 1);
      });
    const deleteCol = (c) =>
      rebuild((d) => {
        d.align.splice(c, 1);
        d.widths.splice(c, 1);
        d.rows.forEach((row) => row.splice(c, 1));
      });
    const setAlign = (c, a) => rebuild((d) => (d.align[c] = a));
    const removeTable = () => {
      const table = tableAt(view.state, view.posAtDOM(wrap));
      if (!table) return;
      const { doc } = view.state;
      const to = table.to < doc.length ? table.to + 1 : table.to;
      const from = to === table.to && table.from > 0 ? table.from - 1 : table.from;
      view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete' });
      view.focus();
    };
    // Ra khỏi bảng: đặt con trỏ của editor ngay trước/sau bảng
    const leave = (dir) => {
      const table = tableAt(view.state, view.posAtDOM(wrap));
      if (!table) return;
      const { doc } = view.state;
      const anchor = dir < 0 ? (table.from > 0 ? table.from - 1 : null) : table.to < doc.length ? table.to + 1 : null;
      if (anchor == null) {
        // Bảng ở đầu/cuối trang: thêm một dòng trống để có chỗ gõ tiếp
        const at = dir < 0 ? table.from : table.to;
        view.dispatch({ changes: { from: at, insert: '\n' }, selection: { anchor: dir < 0 ? at : at + 1 } });
      } else view.dispatch({ selection: { anchor } });
      view.focus();
    };

    const width = data.align.length;
    const rowCount = data.rows.length;
    const table = document.createElement('table');
    data.rows.forEach((cells, r) => {
      const tr = document.createElement('tr');
      if (data.heights[r]) tr.style.height = `${data.heights[r]}px`;
      cells.forEach((text, c) => {
        const td = document.createElement(r === 0 ? 'th' : 'td');
        td.dataset.r = r;
        td.dataset.c = c;
        td.textContent = text;
        if (data.align[c]) td.style.textAlign = data.align[c];
        if (data.widths[c]) setWidth(td, data.widths[c]);
        if (!this.readOnly) {
          td.contentEditable = 'true';
          td.spellcheck = false;
        }
        td.addEventListener('input', () =>
          commit((d) => {
            d.rows[r][c] = td.textContent;
          }, 'input.type'),
        );
        // Dán: chỉ lấy chữ thường, gộp thành một dòng (ô markdown không xuống dòng được)
        td.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ');
          document.execCommand('insertText', false, text);
        });
        td.addEventListener('keydown', (e) => {
          if (e.isComposing) return;
          const mod = e.metaKey || e.ctrlKey;
          const go = (rr, cc, all) => {
            const next = cellAt(wrap, rr, cc);
            if (next) focusCell(next, all);
          };
          if (mod && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            (e.shiftKey ? redo : undo)(view);
          } else if (mod && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo(view);
          } else if (mod && ['b', 'i', 'u', 'e', 'k'].includes(e.key.toLowerCase())) {
            e.preventDefault(); // định dạng trong ô chưa hỗ trợ: chặn định dạng HTML của trình duyệt
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const i = r * width + c + (e.shiftKey ? -1 : 1);
            if (i < 0) leave(-1);
            else if (i >= rowCount * width) insertRow(rowCount);
            else go(Math.floor(i / width), i % width, true);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (r === rowCount - 1) insertRow(rowCount, c);
            else go(r + 1, c);
          } else if (e.key === 'ArrowUp' && caretAtEdge(td, -1)) {
            e.preventDefault();
            if (r === 0) leave(-1);
            else go(r - 1, c);
          } else if (e.key === 'ArrowDown' && caretAtEdge(td, 1)) {
            e.preventDefault();
            if (r === rowCount - 1) leave(1);
            else go(r + 1, c);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            leave(1);
          }
        });
        tr.append(td);
      });
      (r === 0 ? table.createTHead() : table.tBodies[0] || table.createTBody()).append(tr);
    });

    const grid = document.createElement('div');
    grid.className = 'cm-table-grid';

    // Kéo đường viền giữa các cột / hàng để đổi kích thước; nhấp đúp để trả về tự động
    const colResizers = data.align.map((_, c) => resizer('col', c));
    const rowResizers = data.rows.map((_, r) => resizer('row', r));
    function resizer(kind, i) {
      const el = document.createElement('div');
      el.className = `cm-table-resize cm-table-resize-${kind}`;
      el.title = 'Kéo để đổi kích thước, nhấp đúp để trả về tự động';
      el.addEventListener('dblclick', () =>
        rebuild((d) => {
          (kind === 'col' ? d.widths : d.heights)[i] = 0;
        }),
      );
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        wrap.classList.add('resizing');
        const tr = table.rows[i];
        const start = kind === 'col' ? table.rows[0].cells[i].getBoundingClientRect().width : tr.getBoundingClientRect().height;
        const origin = kind === 'col' ? e.clientX : e.clientY;
        let size = start;
        const move = (ev) => {
          const delta = (kind === 'col' ? ev.clientX : ev.clientY) - origin;
          size = Math.round(Math.max(kind === 'col' ? MIN_COL : MIN_ROW, start + delta));
          if (kind === 'col') for (const row of table.rows) setWidth(row.cells[i], size);
          else tr.style.height = `${size}px`;
          layoutResizers();
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          wrap.classList.remove('resizing');
          if (size !== start) {
            commit((d) => {
              (kind === 'col' ? d.widths : d.heights)[i] = size;
            });
          }
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
      return el;
    }
    // Đặt vạch kéo lên đúng đường viền (toạ độ trong lưới, nên cuộn ngang không làm lệch)
    function layoutResizers() {
      const g = grid.getBoundingClientRect();
      const t = table.getBoundingClientRect();
      colResizers.forEach((el, c) => {
        const cell = table.rows[0].cells[c].getBoundingClientRect();
        el.style.left = `${cell.right - g.left}px`;
        el.style.top = `${t.top - g.top}px`;
        el.style.height = `${t.height}px`;
      });
      rowResizers.forEach((el, r) => {
        const row = table.rows[r].getBoundingClientRect();
        el.style.top = `${row.bottom - g.top}px`;
        el.style.left = `${t.left - g.left}px`;
        el.style.width = `${t.width}px`;
      });
    }
    grid.addEventListener('mouseenter', layoutResizers);
    // Gõ làm ô cao / rộng thêm: vạch kéo phải đi theo
    table.addEventListener('input', layoutResizers);
    grid.append(
      table,
      // Cạnh trên bên phải bảng: xóa cả bảng
      button('cm-table-remove', 'Xóa bảng', CloseIcon, removeTable),
      ...colResizers,
      ...rowResizers,
    );
    const scroller = document.createElement('div');
    scroller.className = 'cm-table-scroll';
    scroller.append(grid);

    // Tay nắm hàng / cột: hiện ở hàng / cột đang rê chuột, bấm để mở menu
    let hover = null; // [hàng, cột]
    let menuOpen = false;
    const rowHandle = button('cm-table-handle cm-table-handle-row', 'Tùy chọn hàng', DOTS_V, (b) => {
      const [r] = hover;
      menuOpen = true;
      wrap.classList.add('menu-open');
      openMenu(
        b,
        [
          { label: 'Chèn hàng phía trên', onClick: () => insertRow(r) },
          { label: 'Chèn hàng phía dưới', onClick: () => insertRow(r + 1) },
          { label: 'Xóa hàng', danger: true, disabled: rowCount <= 2, onClick: () => deleteRow(r) },
          '-',
          { label: 'Xóa bảng', danger: true, onClick: removeTable },
        ],
        () => {
          menuOpen = false;
          wrap.classList.remove('menu-open');
        },
      );
    });
    const colHandle = button('cm-table-handle cm-table-handle-col', 'Tùy chọn cột', DOTS_H, (b) => {
      const [, c] = hover;
      menuOpen = true;
      wrap.classList.add('menu-open');
      openMenu(
        b,
        [
          { label: 'Chèn cột bên trái', onClick: () => insertCol(c) },
          { label: 'Chèn cột bên phải', onClick: () => insertCol(c + 1) },
          '-',
          { label: 'Căn trái', onClick: () => setAlign(c, '') },
          { label: 'Căn giữa', onClick: () => setAlign(c, 'center') },
          { label: 'Căn phải', onClick: () => setAlign(c, 'right') },
          '-',
          { label: 'Xóa cột', danger: true, disabled: width <= 1, onClick: () => deleteCol(c) },
          { label: 'Xóa bảng', danger: true, onClick: removeTable },
        ],
        () => {
          menuOpen = false;
          wrap.classList.remove('menu-open');
        },
      );
    });

    // Đặt tay nắm lên mép trái của hàng và mép trên của cột đang rê chuột
    const placeHandles = (td) => {
      // Gốc toạ độ của phần tử absolute là mép trong viền (wrap có viền trong suốt phía trên)
      const outer = wrap.getBoundingClientRect();
      const box = { top: outer.top + wrap.clientTop, left: outer.left + wrap.clientLeft };
      const cell = td.getBoundingClientRect();
      const row = td.parentElement.getBoundingClientRect();
      const head = table.rows[0].cells[Number(td.dataset.c)].getBoundingClientRect();
      rowHandle.style.top = `${row.top - box.top + row.height / 2}px`;
      rowHandle.style.left = `${row.left - box.left}px`;
      colHandle.style.left = `${cell.left - box.left + cell.width / 2}px`;
      colHandle.style.top = `${head.top - box.top}px`;
    };
    table.addEventListener('mouseover', (e) => {
      if (menuOpen) return;
      const td = e.target.closest('th, td');
      if (!td) return;
      hover = [Number(td.dataset.r), Number(td.dataset.c)];
      placeHandles(td);
      wrap.classList.add('hovering');
    });
    wrap.addEventListener('mouseleave', () => !menuOpen && wrap.classList.remove('hovering'));
    scroller.addEventListener('scroll', () => wrap.classList.remove('hovering'));

    wrap.append(scroller, rowHandle, colHandle);
  }

  destroy(dom) {
    dom.cmView = null;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state) {
  const readOnly = state.readOnly;
  return Decoration.set(
    findTables(state).map((t) =>
      Decoration.replace({ widget: new TableWidget(state.sliceDoc(t.from, t.to), readOnly), block: true }).range(t.from, t.to),
    ),
  );
}

// StateField (không phải ViewPlugin) vì widget thay thế nhiều dòng liền
const tableField = StateField.define({
  create: buildDecorations,
  update(decos, tr) {
    if (tr.docChanged || tr.startState.readOnly !== tr.state.readOnly || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildDecorations(tr.state);
    }
    return decos;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    // Con trỏ của editor nhảy qua cả bảng; muốn sửa thì bấm vào ô
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

// Chèn bảng 3 cột × 2 hàng ngay dưới dòng hiện tại (dòng đang trống thì dùng luôn dòng đó), rồi đặt con trỏ vào ô đầu tiên.
// Markdown cần dòng trống ngăn bảng với đoạn chữ trước/sau (không thì dòng chữ sau bị coi là một hàng của bảng).
export function insertTable(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = !line.text.trim();
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const body = serialize({ align: ['', '', ''], rows: [['', '', ''], ['', '', ''], ['', '', '']] });
  const prevText = line.number > 1 ? state.doc.line(line.number - 1).text.trim() : '';
  const before = !empty ? '\n\n' : prevText ? '\n' : '';
  // Luôn có một dòng trống sau bảng để gõ tiếp
  const after = !next ? '\n' : next.text.trim() ? '\n' : '';
  const from = empty ? line.from : line.to;
  const start = from + before.length;
  view.dispatch({
    changes: { from, to: line.to, insert: before + body + after },
    selection: { anchor: start + body.length + 1 },
    userEvent: 'input.format',
  });
  // Widget được vẽ sau khi cập nhật: tìm bảng vừa chèn rồi đặt con trỏ vào ô tiêu đề đầu tiên
  requestAnimationFrame(() => {
    for (const wrap of view.contentDOM.querySelectorAll('.cm-table')) {
      if (view.posAtDOM(wrap) !== start) continue;
      const td = cellAt(wrap, 0, 0);
      if (td) focusCell(td);
    }
  });
}

// Bảng / sơ đồ Mermaid chứa con trỏ của editor (vd. đang gõ trong ô) được tô nền như dòng đang chọn
const activeBlock = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.sync(view);
    }

    update(u) {
      if (u.selectionSet || u.docChanged || u.viewportChanged) this.sync(u.view);
    }

    sync(view) {
      // Đọc DOM sau khi CodeMirror vẽ xong (widget mới chưa có trong DOM lúc update)
      view.requestMeasure({
        read: () => {
          const { head } = view.state.selection.main;
          for (const wrap of view.contentDOM.querySelectorAll('.cm-table, .cm-mermaid')) {
            const block = view.lineBlockAt(view.posAtDOM(wrap));
            wrap.classList.toggle('cm-activeBlock', head >= block.from && head <= block.to);
          }
        },
      });
    }
  },
);

export const tables = [tableField, activeBlock];
