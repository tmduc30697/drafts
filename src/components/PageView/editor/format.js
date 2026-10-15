import { EditorSelection, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// B/I/U cơ bản: **đậm**, *nghiêng*, <u>gạch chân</u>.
// Ký hiệu luôn được ẩn; con trỏ nhảy qua chúng như một ký tự. Bấm lại phím tắt để bỏ định dạng.

const hide = Decoration.replace({});
const PAIRS = [
  ['**', '**'],
  ['*', '*'],
  ['<u>', '</u>'],
  ['~~', '~~'],
  ['`', '`'],
];
const bold = Decoration.mark({ class: 'cm-bold' });
const italic = Decoration.mark({ class: 'cm-italic' });
const underline = Decoration.mark({ class: 'cm-underline' });
const strike = Decoration.mark({ class: 'cm-strike' });
const inlineCode = Decoration.mark({ class: 'cm-inline-code' });
// Các cặp ký hiệu tự nhận bằng regex: { độ dài ký hiệu mở, độ dài ký hiệu đóng }
const TAGS = [
  { deco: underline, open: 3, close: 4, re: /<u>([^<\n]+)<\/u>/g },
  { deco: strike, open: 2, close: 2, re: /~~([^~\n]+)~~/g },
];

function build(view) {
  const { state } = view;
  const items = [];
  const wrap = (from, to, open, close, deco) => {
    items.push([from, to, deco]);
    items.push([from, from + open, hide]);
    items.push([to - close, to, hide]);
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'InlineCode') {
          // Chỉ xử lý code inline dùng một dấu `
          const raw = state.sliceDoc(node.from, node.to);
          if (raw.length > 2 && raw[0] === '`' && raw[1] !== '`' && raw.endsWith('`') && raw[raw.length - 2] !== '`') {
            wrap(node.from, node.to, 1, 1, inlineCode);
          }
          return false;
        }
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
        if (node.name === 'StrongEmphasis') wrap(node.from, node.to, 2, 2, bold);
        else if (node.name === 'Emphasis') wrap(node.from, node.to, 1, 1, italic);
      },
    });
    const text = state.sliceDoc(from, to);
    for (const { deco, open, close, re } of TAGS) {
      for (const m of text.matchAll(re)) {
        const a = from + m.index;
        let code = false;
        for (let n = syntaxTree(state).resolveInner(a, 1); n; n = n.parent) {
          if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') code = true;
        }
        if (code) continue;
        wrap(a, a + m[0].length, open, close, deco);
      }
    }
  }
  items.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const builder = new RangeSetBuilder();
  for (const [a, b, d] of items) builder.add(a, b, d);
  return builder.finish();
}

// Các đoạn ký hiệu đang bị ẩn (con trỏ nhảy qua như một ký tự)
function hiddenRanges(view, p) {
  const b = new RangeSetBuilder();
  const it = view.plugin(p)?.decorations.iter();
  for (; it && it.value; it.next()) if (it.value === hide) b.add(it.from, it.to, hide);
  return b.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = build(view);
    }

    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => hiddenRanges(view, p)),
  },
);

// Phần đầu dòng không nên bọc ký hiệu: dấu danh sách / trích dẫn
const LINE_PREFIX = /^\s*(?:[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)?/;

// Các đoạn cần bọc: mỗi dòng trong vùng chọn là một đoạn riêng (định dạng inline không bắc qua nhiều dòng),
// bỏ qua dấu danh sách ở đầu dòng và khoảng trắng hai đầu
function segments(state, range) {
  const out = [];
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    let from = Math.max(range.from, line.from);
    const to = Math.min(range.to, line.to);
    from = Math.max(from, line.from + LINE_PREFIX.exec(line.text)[0].length);
    const text = state.sliceDoc(from, to);
    if (!text.trim()) continue;
    const lead = text.length - text.trimStart().length;
    let f = from + lead;
    let t = to - (text.length - text.trimEnd().length);
    // Bóc các ký hiệu định dạng ở hai đầu (vùng chọn có thể cắt giữa chừng các lớp) để lấy phần chữ trong cùng
    for (let moved = true; moved; ) {
      moved = false;
      for (const [o, c] of PAIRS) {
        if (t - f > o.length && state.sliceDoc(f, f + o.length) === o) {
          f += o.length;
          moved = true;
        }
        if (t - f > c.length && state.sliceDoc(t - c.length, t) === c) {
          t -= c.length;
          moved = true;
        }
      }
    }
    out.push({ from: f, to: t });
  }
  return out;
}

// Bọc vùng chọn bằng ký hiệu (từng dòng riêng); nếu đã được bọc hết thì bỏ ra.
// Không chọn gì thì áp cho từ đang đặt con trỏ.
export function toggleWrap(open, close) {
  return (view) => {
    const { state } = view;
    let range = state.selection.main;
    // Chưa bôi chọn: áp cho từ đang đặt con trỏ; không có từ nào thì thôi (không chèn cặp ký hiệu rỗng)
    if (range.empty) {
      const word = state.wordAt(range.from);
      if (!word) return true;
      range = word;
    }
    const segs = segments(state, range);
    if (!segs.length) return true;
    // Tìm lớp định dạng này quanh đoạn, bỏ qua các lớp khác (đậm, nghiêng, màu...) nằm giữa
    const findLayer = (seg) => {
      let f = seg.from;
      let t = seg.to;
      const peel = (inside) => {
        for (const [o, c] of PAIRS) {
          const hit = inside
            ? t - f >= o.length + c.length && state.sliceDoc(f, f + o.length) === o && state.sliceDoc(t - c.length, t) === c
            : state.sliceDoc(f - o.length, f) === o && state.sliceDoc(t, t + c.length) === c;
          if (!hit) continue;
          const layer = inside
            ? { f1: f, f2: f + o.length, t1: t - c.length, t2: t }
            : { f1: f - o.length, f2: f, t1: t, t2: t + c.length };
          if (o === open && c === close) return layer;
          // lớp khác: bóc nó ra rồi tìm tiếp
          f = inside ? layer.f2 : layer.f1;
          t = inside ? layer.t1 : layer.t2;
          return peel(inside);
        }
        return null;
      };
      return peel(true) ?? peel(false);
    };
    const layers = segs.map((seg) => findLayer(seg));
    const unwrap = layers.every(Boolean);
    const changes = [];
    segs.forEach((seg, i) => {
      if (!unwrap) {
        changes.push({ from: seg.from, insert: open }, { from: seg.to, insert: close });
      } else {
        const l = layers[i];
        changes.push({ from: l.f1, to: l.f2 }, { from: l.t1, to: l.t2 });
      }
    });
    const cs = state.changes(changes);
    view.dispatch({
      changes: cs,
      // Vùng chọn bao trọn các đoạn vừa bọc (kể cả ký hiệu) để thao tác tiếp theo vẫn nhận ra đủ từng lớp
      selection: EditorSelection.range(cs.mapPos(segs[0].from, -1), cs.mapPos(segs[segs.length - 1].to, 1)),
      userEvent: 'input.format',
    });
    return true;
  };
}

// Chèn/sửa liên kết: bôi chọn chữ (hoặc đặt con trỏ vào từ / liên kết có sẵn) rồi nhập địa chỉ
export function applyLink(view) {
  const { state } = view;
  const sel = state.selection.main;
  const LINK = /^\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)$/;
  // Đang ở trong một liên kết sẵn có: sửa địa chỉ (để trống = gỡ liên kết)
  for (let n = syntaxTree(state).resolveInner(sel.from, 1); n; n = n.parent) {
    if (n.name !== 'Link') continue;
    const m = LINK.exec(state.sliceDoc(n.from, n.to));
    if (!m) break;
    const url = window.prompt('Địa chỉ liên kết (để trống để gỡ liên kết)', m[2]);
    if (url === null) return true;
    view.dispatch({ changes: { from: n.from, to: n.to, insert: url.trim() ? `[${m[1]}](${normalizeUrl(url)})` : m[1] }, userEvent: 'input.format' });
    return true;
  }
  const range = sel.empty ? state.wordAt(sel.from) : sel;
  if (!range) return true;
  const text = state.sliceDoc(range.from, range.to);
  const url = window.prompt('Địa chỉ liên kết', /^https?:\/\//.test(text) ? text : 'https://');
  if (!url || !url.trim() || url.trim() === 'https://') return true;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: `[${text}](${normalizeUrl(url)})` }, userEvent: 'input.format' });
  return true;
}

function normalizeUrl(url) {
  const u = url.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

export const format = [
  plugin,
  keymap.of([
    { key: 'Mod-b', run: toggleWrap('**', '**') },
    { key: 'Mod-i', run: toggleWrap('*', '*') },
    { key: 'Mod-u', run: toggleWrap('<u>', '</u>') },
    { key: 'Mod-Shift-x', run: toggleWrap('~~', '~~') },
    { key: 'Mod-e', run: toggleWrap('`', '`') },
    { key: 'Mod-k', run: applyLink },
  ]),
];

export const hiddenInline = (view) => hiddenRanges(view, plugin);
