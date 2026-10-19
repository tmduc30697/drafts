import { syntaxTree } from '@codemirror/language';
import { isMermaidFence } from './codeBlocks.js';


// Đổi kiểu cho các dòng đang chọn: tiêu đề, danh sách gạch đầu dòng, danh sách số, việc cần làm, trích dẫn.

// Tiền tố của từng kiểu; `test` nhận ra dòng đã có kiểu đó
export const KINDS = [
  { id: 'bullet', label: 'Danh sách gạch đầu dòng', test: /^\s*[-*+]\s(?!\[[ xX]\]\s)/, prefix: () => '- ' },
  { id: 'number', label: 'Danh sách số', test: /^\s*\d+[.)]\s/, prefix: (i) => `${i + 1}. ` },
  { id: 'todo', label: 'Việc cần làm', test: /^\s*[-*+]\s\[[ xX]\]\s/, prefix: () => '- [ ] ' },
  { id: 'quote', label: 'Trích dẫn', test: /^\s*>\s?/, prefix: () => '> ' },
  { id: 'h1', label: 'Tiêu đề 1', test: /^# /, prefix: () => '# ' },
  { id: 'h2', label: 'Tiêu đề 2', test: /^## /, prefix: () => '## ' },
  { id: 'h3', label: 'Tiêu đề 3', test: /^### /, prefix: () => '### ' },
];

// Bỏ tiền tố tiêu đề/danh sách/trích dẫn hiện có, giữ lại phần thụt lề
const ANY_PREFIX = /^(\s*)(?:#{1,6} |[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)/;

// Các dòng đang được chọn (bỏ dòng trống nếu còn dòng có chữ)
function selectedLines(state) {
  const lines = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    // Chọn đến đầu dòng kế tiếp (vd. bôi cả dòng) thì không tính dòng đó
    const lastPos = r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to;
    const last = state.doc.lineAt(lastPos).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      lines.push(state.doc.line(n));
    }
  }
  const filled = lines.filter((l) => l.text.trim());
  return filled.length ? filled : lines;
}

export function activeKind(state) {
  const lines = selectedLines(state);
  if (!lines.length) return null;
  return KINDS.find((k) => lines.every((l) => k.test.test(l.text)))?.id ?? null;
}

// Áp dụng một kiểu cho các dòng đang chọn; đã đúng kiểu đó rồi thì gỡ bỏ
export function applyKind(view, kind) {
  const { state } = view;
  const lines = selectedLines(state);
  const remove = activeKind(state) === kind.id;
  const changes = lines.map((line, i) => {
    const m = ANY_PREFIX.exec(line.text);
    const indent = m ? m[1] : /^\s*/.exec(line.text)[0];
    const insert = remove ? indent : indent + kind.prefix(i);
    return { from: line.from, to: line.from + (m ? m[0].length : indent.length), insert };
  });
  const spec = { changes, userEvent: 'input.format' };
  // Con trỏ (chưa bôi chọn) nằm sau tiền tố vừa chèn ("- ", "1. ", "> "), không phải trước nó
  if (state.selection.main.empty) spec.selection = state.selection.map(state.changes(changes), 1);
  view.dispatch(spec);
  view.focus();
}

// Khối code (không phải Mermaid) đang chứa vị trí pos: { first, last, closed } hoặc null
function codeBlockAt(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name !== 'FencedCode') continue;
    const first = state.doc.lineAt(n.from);
    const last = state.doc.lineAt(n.to);
    if (isMermaidFence(first.text)) return null;
    const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
    return { first, last, closed };
  }
  return null;
}

// Khối code: con trỏ đang nằm trong một khối code thì gỡ khối đó (bỏ hai dòng ```, giữ nguyên nội dung bên trong);
// bôi chọn các dòng thì bọc chúng lại; không chọn gì thì thêm khối trống ngay dưới dòng hiện tại
export function insertCodeBlock(view) {
  const { state } = view;
  const sel = state.selection.main;
  const block = codeBlockAt(state, sel.head);
  if (block) {
    const { first, last, closed } = block;
    const total = state.doc.length;
    let changes;
    if (!closed) {
      changes = [{ from: first.from, to: Math.min(first.to + 1, total) }];
    } else if (!state.sliceDoc(first.to, last.from).trim()) {
      // Khối trống (không có chữ bên trong): xóa luôn cả khối
      changes = [{ from: first.from, to: Math.min(last.to + 1, total) }];
    } else {
      changes = [
        { from: first.from, to: first.to + 1 },
        { from: last.from - 1, to: last.to },
      ];
    }
    view.dispatch({ changes, userEvent: 'delete' });
    return;
  }
  if (!sel.empty) {
    const first = state.doc.lineAt(sel.from);
    const lastPos = state.doc.lineAt(sel.to).from === sel.to && sel.to > sel.from ? sel.to - 1 : sel.to;
    const last = state.doc.lineAt(lastPos);
    view.dispatch({
      changes: [
        { from: first.from, insert: '```\n' },
        { from: last.to, insert: '\n```' },
      ],
      userEvent: 'input.format',
    });
    return;
  }
  const line = state.doc.lineAt(sel.from);
  const empty = !line.text.trim();
  const from = empty ? line.from : line.to;
  const to = empty ? line.to : line.to;
  const insert = (empty ? '' : '\n') + '```\n\n```' + (to === state.doc.length ? '\n' : '');
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + (empty ? 0 : 1) + 4 },
    userEvent: 'input.format',
  });
}

// Chèn đường kẻ ngang (---) ngay dưới dòng hiện tại; dòng đang trống thì dùng luôn dòng đó. Con trỏ xuống dòng kế.
export function insertHorizontalRule(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = !line.text.trim();
  const hasNext = line.to < state.doc.length;
  // Có dòng kế thì con trỏ nhảy xuống đó; ở cuối trang thì thêm một dòng trống mới sau đường kẻ
  const insert = (empty ? '' : '\n') + '---' + (hasNext ? '' : '\n');
  const from = empty ? line.from : line.to;
  const to = empty ? line.to : line.to;
  const end = from + insert.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: hasNext ? end + 1 : end },
    userEvent: 'input.format',
  });
}

// Chèn đoạn trích dẫn (từ tài liệu bên cạnh) vào ghi chú: ngay dưới dòng đang đặt con trỏ, rồi đặt con trỏ ở dòng trống kế để gõ tiếp.
// Chưa từng bấm vào ghi chú (con trỏ mặc định ở đầu trang) thì thêm vào cuối.
export function insertQuote(view, text) {
  const { state } = view;
  if (state.readOnly) return false;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const quote = lines.map((l) => `> ${l}`).join('\n');
  const untouched = !view.hasFocus && state.selection.main.head === 0 && state.doc.length > 0;
  const line = state.doc.lineAt(untouched ? state.doc.length : state.selection.main.head);
  const empty = !line.text.trim();
  const insert = (empty ? '' : '\n') + quote + '\n';
  const from = empty ? line.from : line.to;
  view.dispatch({
    changes: { from, to: line.to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  view.focus();
  return true;
}
