import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// Hyperlink: [chữ](url) hiện thành chữ có gạch chân (ẩn phần [ ]( ) ), URL trần cũng bấm được.
// Cú pháp luôn được ẩn. Bấm vào liên kết mở tab mới.

const BARE_URL = /https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/g;
const hide = Decoration.replace({});

function linkMark(url) {
  return Decoration.mark({ class: 'cm-link', attributes: { 'data-href': url } });
}

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'InlineCode') return true;
  }
  return false;
}

function build(view) {
  const { state } = view;
  const items = [];
  for (const { from, to } of view.visibleRanges) {
    const covered = [];
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') return false;
        if (node.name !== 'Link') return;
        const text = state.sliceDoc(node.from, node.to);
        const m = /^\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)$/.exec(text);
        if (!m || !m[1]) return false;
        covered.push([node.from, node.to]);
        items.push([node.from, node.from + 1, hide]);
        items.push([node.from + 1, node.from + 1 + m[1].length, linkMark(m[2])]);
        items.push([node.from + 1 + m[1].length, node.to, hide]);
        return false;
      },
    });
    const text = state.sliceDoc(from, to);
    for (const m of text.matchAll(BARE_URL)) {
      const a = from + m.index;
      const b = a + m[0].length;
      if (covered.some(([x, y]) => a < y && b > x) || inCode(state, a)) continue;
      items.push([a, b, linkMark(m[0])]);
    }
  }
  items.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const builder = new RangeSetBuilder();
  for (const [a, b, deco] of items) builder.add(a, b, deco);
  return builder.finish();
}

// Các đoạn ký hiệu đang bị ẩn (con trỏ nhảy qua như một ký tự)
function hiddenRanges(view, p) {
  const b = new RangeSetBuilder();
  const it = view.plugin(p)?.decorations.iter();
  for (; it && it.value; it.next()) if (it.value === hide) b.add(it.from, it.to, hide);
  return b.finish();
}

const linkPlugin = ViewPlugin.fromClass(
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

const openLink = EditorView.domEventHandlers({
  mousedown(e, view) {
    const el = e.target instanceof Element ? e.target.closest('.cm-link') : null;
    if (!el || !view.state.selection.main.empty) return false;
    let href = el.getAttribute('data-href');
    if (!href) return false;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) href = 'https://' + href;
    if (!/^(https?|mailto|tel):/i.test(href)) return false;
    window.open(href, '_blank', 'noopener,noreferrer');
    e.preventDefault();
    return true;
  },
});

// Dán một địa chỉ web lên đoạn chữ đang bôi chọn: biến đoạn đó thành liên kết [chữ](địa chỉ)
const pasteLink = EditorView.domEventHandlers({
  paste(e, view) {
    const { state } = view;
    const sel = state.selection.main;
    if (state.readOnly || state.selection.ranges.length !== 1 || sel.empty) return false;
    const url = (e.clipboardData?.getData('text/plain') || '').trim();
    if (!/^(https?:\/\/|www\.)\S+$/i.test(url)) return false;
    const text = state.sliceDoc(sel.from, sel.to);
    if (/\n/.test(text) || /^(https?:\/\/|www\.)\S+$/i.test(text.trim()) || inCode(state, sel.from)) return false;
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    e.preventDefault();
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${text}](${href})` }, userEvent: 'input.paste' });
    return true;
  },
});

export const links = [linkPlugin, openLink, pasteLink];

export const hiddenLinks = (view) => hiddenRanges(view, linkPlugin);
