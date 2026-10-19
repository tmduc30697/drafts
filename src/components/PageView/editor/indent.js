import { indentUnit, syntaxTree } from '@codemirror/language';
import { blockSelectEffects } from './blockSelect.js';
import { fenceText, parseFence } from './codeBlocks.js';

// Thụt lề trái / phải (nút trên thanh công cụ, ⌘] / ⌘[, Tab / Shift+Tab).
// Dòng chữ: thêm / bớt một nấc (2 dấu cách) ở đầu dòng.
// Khối code và sơ đồ Mermaid: dịch cả khối như một khối. Số nấc ghi ở dòng mở (```js indent=1) chứ không thêm dấu cách,
// vì thụt dấu cách vào dòng ``` từ 4 cách trở lên thì markdown không còn coi là khối code nữa; nội dung code giữ nguyên.

const MAX_INDENT = 8;

function fencedAt(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'FencedCode') return n;
  }
  return null;
}

// Các dòng đang được chọn (chọn đến đầu dòng kế tiếp thì không tính dòng đó)
function selectedLines(state) {
  const lines = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    const lastPos = r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to;
    const last = state.doc.lineAt(lastPos).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      lines.push(state.doc.line(n));
    }
  }
  return lines;
}

// Các dòng đang chọn đều là nội dung (không phải dòng ```) của cùng một khối code
function onlyCodeContent(state, lines) {
  let block = null;
  for (const line of lines) {
    const node = fencedAt(state, line.from);
    if (!node || (block && block.from !== node.from)) return false;
    block = node;
    const first = state.doc.lineAt(node.from);
    const last = state.doc.lineAt(node.to);
    const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
    if (line.number === first.number || (closed && line.number === last.number)) return false;
  }
  return !!block;
}

// dir = 1: thụt phải, -1: thụt trái
function shift(view, dir) {
  const { state } = view;
  if (state.readOnly) return false;
  const unit = state.facet(indentUnit);
  const lines = selectedLines(state);
  const multi = lines.length > 1;
  const changes = [];
  const blocks = new Set(); // vị trí dòng mở của các khối cần dịch
  for (const line of lines) {
    const node = fencedAt(state, line.from);
    if (node) {
      blocks.add(state.doc.lineAt(node.from).from);
      continue;
    }
    if (dir > 0) {
      if (multi && !line.text.trim()) continue; // không thêm dấu cách vào dòng trống giữa đoạn chọn
      changes.push({ from: line.from, insert: unit });
    } else {
      const m = new RegExp(`^(?:\\t| {1,${unit.length}})`).exec(line.text);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length });
    }
  }
  for (const from of blocks) {
    const line = state.doc.lineAt(from);
    const fence = parseFence(line.text);
    if (!fence) continue;
    const indent = Math.max(0, Math.min(MAX_INDENT, fence.indent + dir));
    if (indent === fence.indent) continue;
    // Chỉ thay phần khác nhau ở cuối dòng để con trỏ ở đầu khối (khối đang được chọn) đứng yên
    const text = fenceText({ ...fence, indent });
    let same = 0;
    while (same < line.text.length && line.text[same] === text[same]) same++;
    changes.push({ from: line.from + same, to: line.to, insert: text.slice(same) });
  }
  if (!changes.length) return true;
  const set = state.changes(changes);
  view.dispatch({
    changes: set,
    selection: state.selection.map(set, 1),
    effects: blockSelectEffects(state), // đang chọn cả khối thì vẫn giữ chọn để bấm tiếp
    userEvent: dir > 0 ? 'input.indent' : 'input.dedent', // không dùng "delete": blockSelect chặn xóa khi đang chọn cả khối
    scrollIntoView: true,
  });
  return true;
}

export const indentRight = (view) => shift(view, 1);
export const indentLeft = (view) => shift(view, -1);

// Tab / Shift+Tab: đang gõ trong khối code thì thụt lề code như bình thường (trả false để rơi xuống lệnh mặc định),
// còn lại giống nút thụt lề
const tabShift = (dir) => (view) => !onlyCodeContent(view.state, selectedLines(view.state)) && shift(view, dir);

export const indentKeymap = [
  { key: 'Mod-]', run: indentRight, preventDefault: true },
  { key: 'Mod-[', run: indentLeft, preventDefault: true },
  { key: 'Tab', run: tabShift(1), shift: tabShift(-1) },
];
