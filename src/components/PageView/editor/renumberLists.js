import { EditorState, Transaction } from '@codemirror/state';

// Tự đánh lại số cho danh sách "1. 2. 3." sau mỗi lần sửa (xóa/chèn dòng giữa danh sách).
// Mục đầu tiên giữ nguyên số của nó, các mục sau tăng dần. Chạy trong cùng transaction
// nên Cmd+Z hoàn tác cả thao tác lẫn phần đánh số lại.

const ITEM = /^(\s*)(\d+)([.)])(\s)/;
const FENCE = /^\s*```/;

// Các dòng nằm trong khối code (```) — không đánh số lại trong đó
function fencedLines(doc) {
  const inside = new Set();
  let open = false;
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (FENCE.test(text)) {
      inside.add(n);
      open = !open;
    } else if (open) {
      inside.add(n);
    }
  }
  return inside;
}

// Đánh số lại một đoạn (các dòng liền nhau, không có dòng trống) từ dòng `first` đến `last`
function renumberRegion(doc, first, last, fenced, changes) {
  const counters = new Map(); // độ thụt lề -> số vừa dùng
  // Kết thúc các danh sách ở mức thụt lề >= level
  const endFrom = (level) => {
    for (const key of [...counters.keys()]) if (key >= level) counters.delete(key);
  };
  for (let n = first; n <= last; n++) {
    if (fenced.has(n)) {
      counters.clear();
      continue;
    }
    const line = doc.line(n);
    const indent = line.text.match(/^\s*/)[0].length;
    // Lùi ra ngoài thì các danh sách con (thụt sâu hơn) kết thúc
    endFrom(indent + 1);

    const m = ITEM.exec(line.text);
    if (!m) {
      // Dòng thường hoặc gạch đầu dòng "-" cắt ngang danh sách số ở cùng mức trở vào trong
      endFrom(indent);
      continue;
    }
    const current = Number(m[2]);
    const expected = counters.has(indent) ? counters.get(indent) + 1 : current;
    counters.set(indent, expected);
    if (current !== expected) {
      const from = line.from + m[1].length;
      changes.push({ from, to: from + m[2].length, insert: String(expected) });
    }
  }
}

export const renumberLists = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(Transaction.remote)) return tr;
  const doc = tr.newDoc;

  // Các dòng bị ảnh hưởng (kèm dòng ngay sau, vì xóa dòng làm các dòng dưới "dồn lên")
  const touched = new Set();
  tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
    const a = doc.lineAt(fromB).number;
    const b = Math.min(doc.lineAt(toB).number + 1, doc.lines);
    for (let n = a; n <= b; n++) touched.add(n);
  });
  // Không có danh sách số nào gần chỗ sửa thì bỏ qua cho nhẹ
  if (![...touched].some((n) => ITEM.test(doc.line(n).text))) return tr;

  const fenced = fencedLines(doc);
  const changes = [];
  const done = new Set();
  for (const n of [...touched].sort((x, y) => x - y)) {
    if (done.has(n) || !doc.line(n).text.trim()) continue;
    // Mở rộng ra cả đoạn chứa dòng này (dừng ở dòng trống)
    let first = n;
    let last = n;
    while (first > 1 && doc.line(first - 1).text.trim()) first--;
    while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
    for (let k = first; k <= last; k++) done.add(k);
    renumberRegion(doc, first, last, fenced, changes);
  }
  if (!changes.length) return tr;
  return [tr, { changes, sequential: true }];
});
